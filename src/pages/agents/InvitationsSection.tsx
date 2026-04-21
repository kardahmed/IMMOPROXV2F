import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MailCheck, RotateCw, X, Clock, CheckCircle2, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/common'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

type Invitation = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export function InvitationsSection() {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ['invitations', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('invitations')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
      return (data ?? []) as Invitation[]
    },
    enabled: !!tenantId,
  })

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invitations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] })
      toast.success('Invitation annulee')
    },
  })

  const resend = useMutation({
    mutationFn: async (inv: Invitation) => {
      // Extend expiration by 7 more days
      const newExpires = new Date(Date.now() + 7 * 86400000).toISOString()
      const { error: upErr } = await supabase.from('invitations')
        .update({ expires_at: newExpires } as never).eq('id', inv.id)
      if (upErr) throw upErr

      const link = `${window.location.origin}/accept-invite?token=${inv.token}`
      await supabase.functions.invoke('send-email', {
        body: {
          to: inv.email,
          subject: 'Rappel — Invitation IMMO PRO-X',
          body: `<p>Bonjour ${inv.first_name ?? ''},</p><p>Voici un rappel de votre invitation a rejoindre IMMO PRO-X en tant que <strong>${inv.role}</strong>.</p><p><a href="${link}" style="background:#0579DA;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">Accepter l'invitation</a></p><p style="color:#8898AA;font-size:12px">Ce lien expire le ${new Date(newExpires).toLocaleDateString('fr-FR')}.</p>`,
          tenant_id: tenantId,
        },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] })
      toast.success('Invitation renvoyee')
    },
  })

  if (isLoading) return <LoadingSpinner size="md" className="h-32" />

  const pending = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) > new Date())
  const accepted = invitations.filter(i => i.accepted_at)
  const expired = invitations.filter(i => !i.accepted_at && new Date(i.expires_at) <= new Date())

  return (
    <div className="space-y-5">
      {pending.length === 0 && accepted.length === 0 && expired.length === 0 ? (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-10 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-immo-text-muted" />
          <p className="mt-3 text-sm text-immo-text-muted">Aucune invitation envoyee</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && <InvitationList title={`En attente (${pending.length})`} items={pending} accent="orange"
            onCancel={id => cancel.mutate(id)} onResend={inv => resend.mutate(inv)} />}
          {expired.length > 0 && <InvitationList title={`Expirees (${expired.length})`} items={expired} accent="red"
            onCancel={id => cancel.mutate(id)} onResend={inv => resend.mutate(inv)} />}
          {accepted.length > 0 && <InvitationList title={`Acceptees (${accepted.length})`} items={accepted} accent="green" />}
        </>
      )}
    </div>
  )
}

function InvitationList({ title, items, accent, onCancel, onResend }: {
  title: string
  items: Invitation[]
  accent: 'orange' | 'green' | 'red'
  onCancel?: (id: string) => void
  onResend?: (inv: Invitation) => void
}) {
  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/accept-invite?token=${token}`)
    toast.success('Lien copie')
  }

  const color = accent === 'green' ? 'text-immo-accent-green' : accent === 'red' ? 'text-immo-status-red' : 'text-immo-status-orange'

  return (
    <div>
      <h3 className={`mb-2 text-xs font-bold uppercase tracking-wide ${color}`}>{title}</h3>
      <div className="space-y-2">
        {items.map(inv => {
          const Icon = inv.accepted_at ? CheckCircle2 : new Date(inv.expires_at) <= new Date() ? X : Clock
          return (
            <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-immo-border-default bg-immo-bg-card p-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                accent === 'green' ? 'bg-immo-accent-green/15' :
                accent === 'red' ? 'bg-immo-status-red/15' : 'bg-immo-status-orange/15'
              }`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-immo-text-primary">
                  {inv.first_name} {inv.last_name} <span className="ml-2 rounded bg-immo-bg-primary px-1.5 py-0.5 text-[10px] font-normal text-immo-text-muted">{inv.role}</span>
                </p>
                <p className="truncate text-xs text-immo-text-muted">
                  {inv.email} ·
                  {inv.accepted_at
                    ? ` Accepte le ${format(new Date(inv.accepted_at), 'dd/MM/yyyy')}`
                    : new Date(inv.expires_at) <= new Date()
                      ? ` Expiree depuis ${format(new Date(inv.expires_at), 'dd/MM/yyyy')}`
                      : ` Expire le ${format(new Date(inv.expires_at), 'dd/MM/yyyy')}`}
                </p>
              </div>
              {!inv.accepted_at && (
                <div className="flex items-center gap-1">
                  <button onClick={() => copyLink(inv.token)}
                    title="Copier le lien"
                    className="rounded-md p-2 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {onResend && (
                    <Button size="sm" variant="ghost" onClick={() => onResend(inv)}
                      className="h-8 border border-immo-accent-green/30 text-[11px] text-immo-accent-green hover:bg-immo-accent-green/10">
                      <RotateCw className="mr-1 h-3 w-3" /> Renvoyer
                    </Button>
                  )}
                  {onCancel && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (window.confirm('Annuler cette invitation ?')) onCancel(inv.id)
                    }}
                      className="h-8 border border-immo-status-red/30 text-[11px] text-immo-status-red hover:bg-immo-status-red/10">
                      <X className="mr-1 h-3 w-3" /> Annuler
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
