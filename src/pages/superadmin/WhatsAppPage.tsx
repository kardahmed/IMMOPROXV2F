import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Settings, Send, Users, TrendingUp, AlertTriangle, Check, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, DataTable, KPICard, LoadingSpinner, PageHeader, StatusBadge } from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDistanceToNow } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale'
import toast from 'react-hot-toast'

export function WhatsAppPage() {
  const qc = useQueryClient()
  const [showToken, setShowToken] = useState(false)
  const [editToken, setEditToken] = useState('')
  const [editPhoneId, setEditPhoneId] = useState('')
  const [editWabaId, setEditWabaId] = useState('')
  const [tab, setTab] = useState<'config' | 'tenants' | 'messages' | 'templates'>('config')

  // Fetch WhatsApp config
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['wa-config'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_config').select('*').limit(1).single()
      return data as Record<string, unknown> | null
    },
  })

  // Fetch tenant accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['wa-accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_accounts').select('*, tenants(name)').order('created_at', { ascending: false })
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  // Fetch recent messages
  const { data: messages = [] } = useQuery({
    queryKey: ['wa-messages'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_messages').select('*, tenants(name), clients(full_name)').order('created_at', { ascending: false }).limit(50)
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  // Fetch templates
  const { data: templates = [] } = useQuery({
    queryKey: ['wa-templates'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_templates').select('*').order('created_at')
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  // Save config
  const saveConfig = useMutation({
    mutationFn: async () => {
      if (config?.id) {
        await supabase.from('whatsapp_config').update({
          access_token: editToken || config.access_token,
          phone_number_id: editPhoneId || config.phone_number_id,
          waba_id: editWabaId || config.waba_id,
          updated_at: new Date().toISOString(),
        } as never).eq('id', config.id as string)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-config'] })
      toast.success('Configuration WhatsApp sauvegardée')
      setEditToken('')
    },
  })

  // Toggle tenant WhatsApp
  const toggleTenant = useMutation({
    mutationFn: async ({ tenantId, active }: { tenantId: string; active: boolean }) => {
      const { data: existing } = await supabase.from('whatsapp_accounts').select('id').eq('tenant_id', tenantId).single()
      if (existing) {
        await supabase.from('whatsapp_accounts').update({ is_active: active } as never).eq('tenant_id', tenantId)
      } else {
        await supabase.from('whatsapp_accounts').insert({ tenant_id: tenantId, is_active: true, plan: 'starter', monthly_quota: 500 } as never)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-accounts'] })
      toast.success('Mis à jour')
    },
  })

  // Fetch all tenants for activation
  const { data: allTenants = [] } = useQuery({
    queryKey: ['all-tenants-wa'],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('id, name, plan' as never).order('name')
      return (data ?? []) as unknown as Array<{ id: string; name: string; plan: string }>
    },
  })

  // KPIs
  const totalAccounts = accounts.filter(a => a.is_active).length
  const totalMessages = messages.length
  const failedMessages = messages.filter(m => m.status === 'failed').length
  const totalSent = accounts.reduce((s, a) => s + ((a.messages_sent as number) ?? 0), 0)

  if (loadingConfig) return <LoadingSpinner size="lg" className="h-96" />

  const TABS = [
    { key: 'config' as const, label: 'Configuration', icon: Settings },
    { key: 'tenants' as const, label: 'Tenants', icon: Users },
    { key: 'messages' as const, label: 'Messages', icon: Send },
    { key: 'templates' as const, label: 'Templates', icon: MessageCircle },
  ]

  type TenantRow = { id: string; name: string; plan: string }
  const tenantColumns: Column<TenantRow>[] = [
    { key: 'name', header: 'Tenant', render: (tenant) => <span className="text-sm text-immo-text-primary">{tenant.name}</span> },
    { key: 'plan', header: 'Plan', render: (tenant) => {
      const account = accounts.find(a => a.tenant_id === tenant.id)
      return <span className="text-xs text-immo-text-muted">{(account?.plan as string) ?? '-'}</span>
    } },
    { key: 'status', header: 'Statut WA', render: (tenant) => {
      const account = accounts.find(a => a.tenant_id === tenant.id)
      const isActive = account ? (account.is_active as boolean) : false
      return <StatusBadge label={isActive ? 'Actif' : 'Inactif'} type={isActive ? 'green' : 'muted'} />
    } },
    { key: 'messages', header: 'Messages', align: 'right', render: (tenant) => {
      const account = accounts.find(a => a.tenant_id === tenant.id)
      const sent = (account?.messages_sent as number) ?? 0
      return <span className="text-sm font-mono text-immo-text-primary">{sent}</span>
    } },
    { key: 'quota', header: 'Quota', align: 'right', render: (tenant) => {
      const account = accounts.find(a => a.tenant_id === tenant.id)
      const sent = (account?.messages_sent as number) ?? 0
      const quota = (account?.monthly_quota as number) ?? 0
      return <span className="text-xs text-immo-text-muted">{quota > 0 ? `${sent}/${quota}` : '-'}</span>
    } },
    { key: 'actions', header: 'Actions', align: 'right', render: (tenant) => {
      const account = accounts.find(a => a.tenant_id === tenant.id)
      const isActive = account ? (account.is_active as boolean) : false
      return (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => toggleTenant.mutate({ tenantId: tenant.id, active: !isActive })}
          className={`h-7 text-[11px] ${isActive ? 'border border-immo-status-red/30 text-immo-status-red hover:bg-immo-status-red/10' : 'border border-green-500/30 text-green-500 hover:bg-green-500/10'}`}
        >
          {isActive ? 'Desactiver' : 'Activer'}
        </Button>
      )
    } },
  ]

  type Row = Record<string, unknown>
  const templateColumns: Column<Row>[] = [
    { key: 'name', header: 'Nom', render: (tpl) => (
      <div>
        <p className="text-sm font-mono text-immo-text-primary">{tpl.name as string}</p>
        <p className="mt-0.5 text-[10px] text-immo-text-muted line-clamp-1">{tpl.body_text as string}</p>
      </div>
    ) },
    { key: 'category', header: 'Categorie', render: (tpl) => <span className="text-xs text-immo-text-muted">{tpl.category as string}</span> },
    { key: 'language', header: 'Langue', render: (tpl) => <span className="text-xs text-immo-text-muted">{tpl.language as string}</span> },
    { key: 'variables', header: 'Variables', align: 'right', render: (tpl) => <span className="text-xs text-immo-text-muted">{tpl.variables_count as number}</span> },
    { key: 'status', header: 'Statut', render: (tpl) => (
      <StatusBadge
        label={tpl.status === 'approved' ? 'Approuve' : tpl.status === 'rejected' ? 'Rejete' : 'En attente'}
        type={tpl.status === 'approved' ? 'green' : tpl.status === 'rejected' ? 'red' : 'orange'}
      />
    ) },
  ]

  type MsgRow = Record<string, unknown>
  const messageColumns: Column<MsgRow>[] = [
    { key: 'tenant', header: 'Tenant', render: (m) => <span className="text-xs text-immo-text-primary">{(m.tenants as { name: string } | null)?.name ?? '-'}</span> },
    { key: 'client', header: 'Client', render: (m) => <span className="text-xs text-immo-text-secondary">{(m.clients as { full_name: string } | null)?.full_name ?? '-'}</span> },
    { key: 'template', header: 'Template', render: (m) => <span className="text-xs font-mono text-immo-text-muted">{m.template_name as string}</span> },
    { key: 'to', header: 'Destinataire', render: (m) => <span className="text-xs font-mono text-immo-text-muted">{m.to_phone as string}</span> },
    { key: 'status', header: 'Statut', render: (m) => (
      <StatusBadge
        label={m.status === 'sent' ? 'Envoye' : m.status === 'delivered' ? 'Livre' : m.status === 'read' ? 'Lu' : 'Echec'}
        type={m.status === 'failed' ? 'red' : m.status === 'read' ? 'green' : 'orange'}
      />
    ) },
    { key: 'date', header: 'Date', render: (m) => <span className="text-[10px] text-immo-text-muted">{formatDistanceToNow(new Date(m.created_at as string), { addSuffix: true, locale: frLocale })}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Business"
        subtitle="Gestion de l'integration WhatsApp Cloud API"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard label="Tenants actifs" value={totalAccounts} accent="green" icon={<Users className="h-4 w-4 text-green-500" />} />
        <KPICard label="Messages envoyes" value={totalSent} accent="blue" icon={<Send className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Messages recents" value={totalMessages} accent="green" icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Echecs" value={failedMessages} accent={failedMessages > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-immo-border-default">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${tab === t.key ? 'border-green-500 text-green-600' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Config tab */}
      {tab === 'config' && config && (
        <Card className="space-y-4 p-6">
          <h3 className="text-sm font-semibold text-immo-text-primary">Meta Cloud API</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-immo-text-muted">WABA ID</label>
              <Input defaultValue={config.waba_id as string} onChange={e => setEditWabaId(e.target.value)} className="text-sm font-mono" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-immo-text-muted">Phone Number ID</label>
              <Input defaultValue={config.phone_number_id as string} onChange={e => setEditPhoneId(e.target.value)} className="text-sm font-mono" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-immo-text-muted">Numero affiche</label>
              <Input value={config.display_phone as string ?? ''} disabled className="text-sm bg-immo-bg-primary" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-immo-text-muted">Access Token</label>
              <div className="flex gap-2">
                <Input
                  type={showToken ? 'text' : 'password'}
                  defaultValue={config.access_token as string}
                  onChange={e => setEditToken(e.target.value)}
                  className="text-sm font-mono flex-1"
                />
                <Button size="sm" variant="ghost" onClick={() => setShowToken(!showToken)} className="border border-immo-border-default">
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-immo-status-orange">Le token temporaire expire en 24h. Utilisez un System User Token permanent.</p>
            </div>
          </div>
          <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending} className="bg-green-500 text-white hover:bg-green-600">
            <Check className="mr-1.5 h-4 w-4" /> Enregistrer
          </Button>
        </Card>
      )}

      {/* Tenants tab */}
      {tab === 'tenants' && (
        <DataTable
          columns={tenantColumns}
          data={allTenants}
          rowKey={(t) => t.id}
          emptyIcon={<Users className="h-10 w-10" />}
          emptyMessage="Aucun tenant"
        />
      )}

      {/* Messages tab */}
      {tab === 'messages' && (
        <DataTable
          columns={messageColumns}
          data={messages}
          rowKey={(m) => m.id as string}
          emptyIcon={<Send className="h-10 w-10" />}
          emptyMessage="Aucun message envoye"
          emptyDescription="Les messages WhatsApp envoyes par les tenants apparaitront ici."
        />
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <DataTable
          columns={templateColumns}
          data={templates}
          rowKey={(t) => t.id as string}
          emptyIcon={<MessageCircle className="h-10 w-10" />}
          emptyMessage="Aucun template"
          emptyDescription="Les templates WhatsApp Business apparaitront ici apres approbation par Meta."
        />
      )}
    </div>
  )
}
