import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LoadingSpinner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export function MessagesPage() {
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [targetTenant, setTargetTenant] = useState('')

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

  const sendMessage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('platform_messages').insert({
        from_admin_id: userId,
        to_tenant_id: targetTenant || null,
        subject, body,
      } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin-messages'] })
      toast.success(targetTenant ? 'Message envoye' : 'Message envoye a tous les tenants')
      setSubject(''); setBody(''); setTargetTenant('')
    },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-immo-text-primary">Messagerie</h1>

      {/* Compose */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Nouveau message</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px] text-immo-text-muted">Destinataire</Label>
            <select value={targetTenant} onChange={e => setTargetTenant(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
              <option value="">Tous les tenants</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><Label className="text-[11px] text-immo-text-muted">Sujet *</Label><Input value={subject} onChange={e => setSubject(e.target.value)} className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary" /></div>
          <div>
            <Label className="text-[11px] text-immo-text-muted">Message *</Label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary" />
          </div>
          <Button onClick={() => sendMessage.mutate()} disabled={!subject || !body || sendMessage.isPending} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
            <Send className="mr-1.5 h-4 w-4" /> Envoyer
          </Button>
        </div>
      </div>

      {/* History */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
        <div className="border-b border-immo-border-default px-5 py-4">
          <h3 className="text-sm font-semibold text-immo-text-primary">Messages envoyes ({messages.length})</h3>
        </div>
        <div className="divide-y divide-immo-border-default">
          {messages.map(m => (
            <div key={m.id as string} className="px-5 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-immo-text-primary">{m.subject as string}</p>
                <span className="text-[11px] text-immo-text-muted">{format(new Date(m.created_at as string), 'dd/MM/yyyy HH:mm')}</span>
              </div>
              <p className="mt-1 text-xs text-immo-text-muted">
                → {(m.tenants as { name: string } | null)?.name ?? 'Tous les tenants'}
              </p>
            </div>
          ))}
          {messages.length === 0 && <div className="py-8 text-center text-sm text-immo-text-muted">Aucun message</div>}
        </div>
      </div>
    </div>
  )
}
