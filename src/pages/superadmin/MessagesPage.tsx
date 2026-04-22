import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, FileText, Megaphone, Bell, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card, LoadingSpinner, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

/* ═══ Templates ═══ */
const MESSAGE_TEMPLATES = [
  { id: 'welcome', label: 'Bienvenue', subject: 'Bienvenue sur IMMO PRO-X !', body: 'Cher partenaire,\n\nNous sommes ravis de vous accueillir sur IMMO PRO-X. Votre compte est maintenant actif.\n\nN\'hesitez pas a nous contacter via le support integre pour toute question.\n\nCordialement,\nL\'equipe IMMO PRO-X' },
  { id: 'payment_reminder', label: 'Relance paiement', subject: 'Rappel : facture en attente', body: 'Bonjour,\n\nNous vous informons que votre facture est en attente de paiement. Merci de regulariser votre situation pour continuer a beneficier de tous nos services.\n\nCordialement' },
  { id: 'trial_ending', label: 'Fin d\'essai', subject: 'Votre periode d\'essai se termine bientot', body: 'Bonjour,\n\nVotre periode d\'essai se termine dans quelques jours. Pour continuer a utiliser IMMO PRO-X sans interruption, veuillez choisir un plan adapte a vos besoins.\n\nNous restons a votre disposition.' },
  { id: 'maintenance', label: 'Maintenance', subject: 'Maintenance prevue', body: 'Information : une maintenance est prevue prochainement. L\'application sera temporairement indisponible pendant cette periode.\n\nMerci de votre comprehension.' },
  { id: 'new_feature', label: 'Nouvelle fonctionnalite', subject: 'Decouvrez les nouveautes !', body: 'Bonjour,\n\nNous avons le plaisir de vous annoncer de nouvelles fonctionnalites sur IMMO PRO-X :\n\n- [Fonctionnalite 1]\n- [Fonctionnalite 2]\n- [Fonctionnalite 3]\n\nDecouvrez-les des maintenant !' },
]

type TabKey = 'compose' | 'history' | 'banner'

export function MessagesPage() {
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()
  const [tab, setTab] = useState<TabKey>('compose')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [targetTenant, setTargetTenant] = useState('')

  // Banner state
  const [bannerText, setBannerText] = useState('')
  const [bannerType, setBannerType] = useState<'info' | 'warning' | 'success'>('info')

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['super-admin-messages'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_messages').select('*, tenants(name)').order('created_at', { ascending: false }).limit(50)
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  const { data: tenants = [] } = useQuery({
    queryKey: ['all-tenants-msg'],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('id, name').order('name')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })

  // Fetch current banner from platform_settings
  const { data: platformSettings } = useQuery({
    queryKey: ['platform-settings-banner'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('*').limit(1).single()
      return data as Record<string, unknown> | null
    },
  })

  const sendMessage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('platform_messages').insert({
        from_admin_id: userId,
        to_tenant_id: targetTenant && targetTenant.length > 0 ? targetTenant : null,
        subject, body,
      } as never)
      if (error) throw error

      // Log
      await supabase.from('super_admin_logs').insert({
        super_admin_id: userId,
        tenant_id: targetTenant || null,
        action: 'send_message',
        details: { subject, broadcast: !targetTenant },
      } as never)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin-messages'] })
      toast.success(targetTenant ? 'Message envoye' : 'Message envoye a tous les tenants')
      setSubject(''); setBody(''); setTargetTenant('')
    },
  })

  const saveBanner = useMutation({
    mutationFn: async () => {
      if (!platformSettings) return
      const { error } = await supabase.from('platform_settings').update({
        announcement_banner: bannerText || null,
        announcement_type: bannerType,
      } as never).eq('id', (platformSettings as { id: string }).id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings-banner'] })
      toast.success(bannerText ? 'Banniere activee' : 'Banniere desactivee')
    },
  })

  function applyTemplate(templateId: string) {
    const tpl = MESSAGE_TEMPLATES.find(t => t.id === templateId)
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body) }
  }

  // Init banner from settings
  useState(() => {
    if (platformSettings) {
      setBannerText(((platformSettings as Record<string, unknown>).announcement_banner as string) ?? '')
      setBannerType(((platformSettings as Record<string, unknown>).announcement_type as 'info' | 'warning' | 'success') ?? 'info')
    }
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  const TABS: Array<{ key: TabKey; label: string; icon: typeof Send }> = [
    { key: 'compose', label: 'Composer', icon: Send },
    { key: 'history', label: `Historique (${messages.length})`, icon: FileText },
    { key: 'banner', label: 'Banniere', icon: Megaphone },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messagerie & Communication"
        subtitle="Envoyez des messages et gerez la banniere globale"
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-immo-border-default">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${tab === t.key ? 'border-[#7C3AED] text-[#7C3AED]' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Compose tab */}
      {tab === 'compose' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Compose form */}
          <Card className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Nouveau message</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-[11px] text-immo-text-muted">Destinataire</Label>
                <select value={targetTenant} onChange={e => setTargetTenant(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
                  <option value="">Tous les tenants (broadcast)</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[11px] text-immo-text-muted">Sujet *</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} variant="immo" />
              </div>
              <div>
                <Label className="text-[11px] text-immo-text-muted">Message *</Label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} className="mt-1 w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary" />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={() => sendMessage.mutate()} disabled={!subject || !body || sendMessage.isPending} variant="purple">
                  {sendMessage.isPending ? <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Envoyer
                </Button>
                {!targetTenant && <span className="text-[10px] text-immo-status-orange">⚠ Broadcast a tous les tenants</span>}
              </div>
            </div>
          </Card>

          {/* Templates sidebar */}
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Templates rapides</h3>
            <div className="space-y-2">
              {MESSAGE_TEMPLATES.map(tpl => (
                <button key={tpl.id} onClick={() => applyTemplate(tpl.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-immo-border-default px-3 py-2.5 text-left transition-colors hover:bg-[#7C3AED]/5 hover:border-[#7C3AED]/30">
                  <FileText className="h-4 w-4 shrink-0 text-[#7C3AED]" />
                  <div>
                    <p className="text-xs font-medium text-immo-text-primary">{tpl.label}</p>
                    <p className="text-[10px] text-immo-text-muted">{tpl.subject}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <Card noPadding>
          <div className="divide-y divide-immo-border-default">
            {messages.map(m => {
              const isRead = m.read as boolean
              return (
                <div key={m.id as string} className="px-5 py-3 hover:bg-immo-bg-card-hover">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-immo-text-primary">{m.subject as string}</p>
                      {isRead ? <Eye className="h-3 w-3 text-immo-accent-green" /> : <EyeOff className="h-3 w-3 text-immo-text-muted" />}
                    </div>
                    <span className="text-[11px] text-immo-text-muted">{format(new Date(m.created_at as string), 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-immo-text-muted">→ {(m.tenants as { name: string } | null)?.name ?? 'Tous les tenants'}</span>
                    <StatusBadge label={isRead ? 'Lu' : 'Non lu'} type={isRead ? 'green' : 'muted'} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-immo-text-secondary">{(m.body as string).slice(0, 150)}...</p>
                </div>
              )
            })}
            {messages.length === 0 && <div className="py-8 text-center text-sm text-immo-text-muted">Aucun message</div>}
          </div>
        </Card>
      )}

      {/* Banner tab */}
      {tab === 'banner' && (
        <div className="max-w-3xl space-y-5">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-[#7C3AED]" />
              <h3 className="text-sm font-semibold text-immo-text-primary">Banniere d'annonce globale</h3>
            </div>
            <p className="mb-4 text-[11px] text-immo-text-muted">
              Cette banniere s'affiche en haut de l'application pour tous les tenants. Laissez vide pour la desactiver.
            </p>

            <div className="space-y-3">
              <div>
                <Label className="text-[11px] text-immo-text-muted">Type</Label>
                <select value={bannerType} onChange={e => setBannerType(e.target.value as 'info' | 'warning' | 'success')}
                  className="mt-1 h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
                  <option value="info">Information (bleu)</option>
                  <option value="warning">Avertissement (orange)</option>
                  <option value="success">Succes (vert)</option>
                </select>
              </div>

              <div>
                <Label className="text-[11px] text-immo-text-muted">Texte de la banniere</Label>
                <Input value={bannerText} onChange={e => setBannerText(e.target.value)} placeholder="Ex: Maintenance prevue le 15 avril de 2h a 4h" variant="immo" />
              </div>

              {/* Preview */}
              {bannerText && (
                <div>
                  <p className="mb-1 text-[10px] font-medium text-immo-text-muted">Apercu</p>
                  <div className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
                    bannerType === 'warning' ? 'bg-immo-status-orange/10 text-immo-status-orange border border-immo-status-orange/30' :
                    bannerType === 'success' ? 'bg-immo-accent-green/10 text-immo-accent-green border border-immo-accent-green/30' :
                    'bg-immo-accent-blue/10 text-immo-accent-blue border border-immo-accent-blue/30'
                  }`}>
                    <Bell className="h-4 w-4 shrink-0" />
                    {bannerText}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={() => saveBanner.mutate()} disabled={saveBanner.isPending} variant="purple">
                  {bannerText ? 'Activer la banniere' : 'Desactiver la banniere'}
                </Button>
                {bannerText && (
                  <Button onClick={() => { setBannerText(''); saveBanner.mutate() }} className="border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover">
                    Desactiver
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
