import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Eye, Lock, Bell, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { SectionHeader, Field, SaveButton, inputClass } from './shared'

/* ═══ Reservations ═══ */
export function ReservationsSection() {
  const { t } = useTranslation()
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId!).single()
      return data as Record<string, unknown> | null
    },
    enabled: !!tenantId,
  })

  const [duration, setDuration] = useState('30')
  const [minDeposit, setMinDeposit] = useState('0')

  useEffect(() => {
    if (settings) {
      setDuration(String(settings.reservation_duration_days ?? 30))
      setMinDeposit(String(settings.min_deposit_amount ?? 0))
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      if (settings) {
        await supabase.from('tenant_settings').update({ reservation_duration_days: Number(duration), min_deposit_amount: Number(minDeposit) } as never).eq('tenant_id', tenantId!)
      } else {
        await supabase.from('tenant_settings').insert({ tenant_id: tenantId, reservation_duration_days: Number(duration), min_deposit_amount: Number(minDeposit) } as never)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-settings'] }); toast.success(t('success.saved')) },
  })

  return (
    <div className="space-y-5">
      <SectionHeader title={t('tab.reservation')} subtitle={t('field.duration')} />
      <div className="grid grid-cols-2 gap-4">
        <Field label={`${t('field.duration')} (jours)`}><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} className={inputClass} /></Field>
        <Field label={`${t('field.deposit')} min (DA)`}><Input type="number" value={minDeposit} onChange={e => setMinDeposit(e.target.value)} placeholder="0" className={inputClass} /></Field>
      </div>
      <SaveButton onClick={() => save.mutate()} loading={save.isPending} />
    </div>
  )
}

/* ═══ Templates ═══ */
export function TemplatesSection() {
  const { t } = useTranslation()
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'contrat_vente' | 'echeancier' | 'bon_reservation'>('contrat_vente')

  const { data: templates = [] } = useQuery({
    queryKey: ['doc-templates', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('document_templates').select('*').eq('tenant_id', tenantId!)
      return (data ?? []) as Array<{ id: string; type: string; content: string }>
    },
    enabled: !!tenantId,
  })

  const current = templates.find(tp => tp.type === activeTab)
  const [content, setContent] = useState('')

  useEffect(() => { setContent(current?.content ?? '') }, [current, activeTab])

  const save = useMutation({
    mutationFn: async () => {
      if (current) {
        await supabase.from('document_templates').update({ content } as never).eq('id', current.id)
      } else {
        await supabase.from('document_templates').insert({ tenant_id: tenantId, type: activeTab, content } as never)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['doc-templates'] }); toast.success(t('success.saved')) },
  })

  const TAB_LABELS = { contrat_vente: 'Contrat de Vente', echeancier: 'Echeancier', bon_reservation: 'Bon de Reservation' }
  const VARS = ['[Nom Client]', '[Telephone]', '[NIN]', '[Bien]', '[Code Bien]', '[Projet]', '[Prix]', '[Date]', '[Agent]', '[Agence]']

  return (
    <div className="space-y-5">
      <SectionHeader title={t('tab.documents')} subtitle="Templates" />
      <div className="flex gap-1 rounded-lg border border-immo-border-default p-0.5">
        {(Object.entries(TAB_LABELS) as [typeof activeTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${activeTab === key ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] text-immo-text-muted">Variables :</span>
        {VARS.map(v => (
          <button key={v} onClick={() => setContent(c => c + ' ' + v)} className="rounded bg-immo-accent-blue-bg px-1.5 py-0.5 text-[10px] text-immo-accent-blue hover:bg-immo-accent-blue/20">{v}</button>
        ))}
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} rows={15} placeholder="..." className={`w-full resize-none rounded-xl border p-4 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-immo-accent-green ${inputClass}`} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setContent('')} className="text-xs text-immo-text-muted hover:text-immo-status-red"><RotateCcw className="me-1 h-3.5 w-3.5" /> {t('action.reset')}</Button>
        <div className="flex-1" />
        <Button variant="ghost" className="border border-immo-border-default text-xs text-immo-text-secondary"><Eye className="me-1 h-3.5 w-3.5" /> {t('action.view')}</Button>
        <SaveButton onClick={() => save.mutate()} loading={save.isPending} />
      </div>
    </div>
  )
}

/* ═══ Notifications ═══ */
export function NotificationsSection() {
  const { t } = useTranslation()
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId!).single()
      return data as Record<string, unknown> | null
    },
    enabled: !!tenantId,
  })

  const NOTIFS = [
    { key: 'notif_agent_inactive', label: 'Agent inactif', emailKey: 'email_agent_inactive' },
    { key: 'notif_payment_late', label: t('status.late'), emailKey: 'email_payment_late' },
    { key: 'notif_payment_due', label: "Rappel echeance", emailKey: 'email_payment_due' },
    { key: 'notif_reservation_expired', label: t('status.expired'), emailKey: 'email_reservation_expired' },
    { key: 'notif_reservation_expiry', label: "Reservation bientot expiree", emailKey: 'email_reservation_expiry' },
    { key: 'notif_new_client', label: t('kpi.new_clients'), emailKey: 'email_new_client' },
    { key: 'notif_new_sale', label: t('kpi.sales'), emailKey: 'email_new_sale' },
    { key: 'notif_goal_achieved', label: t('nav.goals'), emailKey: 'email_goal_achieved' },
  ]

  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (settings) {
      const tg: Record<string, boolean> = {}
      NOTIFS.forEach(n => {
        tg[n.key] = settings[n.key] !== false
        tg[n.emailKey] = settings[n.emailKey] !== false
      })
      setToggles(tg)
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      if (settings) {
        await supabase.from('tenant_settings').update(toggles as never).eq('tenant_id', tenantId!)
      } else {
        await supabase.from('tenant_settings').insert({ tenant_id: tenantId, ...toggles } as never)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-settings'] }); toast.success(t('success.saved')) },
  })

  return (
    <div className="space-y-5">
      <SectionHeader title="Notifications" subtitle={t('nav.settings')} />

      {/* Column headers */}
      <div className="flex items-center gap-2 px-4 pb-1">
        <div className="flex-1" />
        <div className="flex items-center gap-1 w-16 justify-center text-[10px] font-medium text-immo-text-muted uppercase tracking-wider">
          <Bell className="h-3 w-3" /> App
        </div>
        <div className="flex items-center gap-1 w-16 justify-center text-[10px] font-medium text-immo-text-muted uppercase tracking-wider">
          <Mail className="h-3 w-3" /> Email
        </div>
      </div>

      <div className="space-y-2">
        {NOTIFS.map(n => (
          <div key={n.key} className="flex items-center gap-2 rounded-lg border border-immo-border-default bg-immo-bg-primary px-4 py-3">
            <p className="flex-1 text-sm text-immo-text-primary">{n.label}</p>

            {/* In-app toggle */}
            <div className="w-16 flex justify-center">
              <button onClick={() => setToggles(tg => ({ ...tg, [n.key]: !tg[n.key] }))}
                className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${toggles[n.key] ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}>
                <div className={`h-4 w-4 rounded-full bg-white transition-transform ${toggles[n.key] ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Email toggle */}
            <div className="w-16 flex justify-center">
              <button onClick={() => setToggles(tg => ({ ...tg, [n.emailKey]: !tg[n.emailKey] }))}
                className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${toggles[n.emailKey] ? 'bg-[#0579DA]' : 'bg-immo-border-default'}`}>
                <div className={`h-4 w-4 rounded-full bg-white transition-transform ${toggles[n.emailKey] ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-immo-text-muted">
        <Bell className="inline h-3 w-3 me-1" />App = notification dans l'application &nbsp;|&nbsp;
        <Mail className="inline h-3 w-3 me-1" />Email = email envoye a l'agent ou admin
      </p>

      <SaveButton onClick={() => save.mutate()} loading={save.isPending} />
    </div>
  )
}

/* ═══ Language ═══ */
export function LanguageSection() {
  const { i18n } = useTranslation()
  const { tenantId } = useAuthStore()
  const current = i18n.language

  async function changeLang(lang: string) {
    i18n.changeLanguage(lang)
    if (tenantId) await supabase.from('tenant_settings').update({ language: lang } as never).eq('tenant_id', tenantId)
    toast.success(lang === 'fr' ? 'Langue changée' : 'تم تغيير اللغة')
  }

  return (
    <div className="space-y-5">
      <SectionHeader title={i18n.language === 'ar' ? 'اللغة' : 'Langue'} subtitle="" />
      <div className="flex gap-3">
        {[{ code: 'fr', label: 'Francais', flag: 'FR' }, { code: 'ar', label: 'العربية', flag: 'AR' }].map(lang => (
          <button key={lang.code} onClick={() => changeLang(lang.code)}
            className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${current === lang.code ? 'border-immo-accent-green bg-immo-accent-green/5' : 'border-immo-border-default hover:border-immo-text-muted'}`}>
            <span className="text-lg font-bold text-immo-text-muted">{lang.flag}</span>
            <p className="text-sm font-medium text-immo-text-primary">{lang.label}</p>
            {current === lang.code && <div className="ms-2 h-3 w-3 rounded-full bg-immo-accent-green" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ═══ Security ═══ */
export function SecuritySection() {
  const { t } = useTranslation()
  const [oldPass, setOldPass] = useState(''); const [newPass, setNewPass] = useState(''); const [confirmPass, setConfirmPass] = useState('')

  // Audit (HIGH): the previous version (a) used the wrong i18n keys
  // (action.login / action.save) for password input labels — broken
  // copy. (b) collapsed every error to t('error.generic') so the user
  // couldn't tell "passwords don't match" from "password too short".
  // (c) collected `oldPass` but never validated it — security UX trap
  // that suggests the old password is checked when it isn't.
  const changePassword = useMutation({
    mutationFn: async () => {
      if (!oldPass) throw new Error('Saisissez votre mot de passe actuel')
      if (newPass.length < 8) throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères')
      if (newPass !== confirmPass) throw new Error('Les mots de passe ne correspondent pas')

      // Validate old password by re-authenticating against Supabase.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Session invalide')
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPass,
      })
      if (verifyErr) throw new Error('Mot de passe actuel incorrect')

      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { toast.success('Mot de passe mis à jour'); setOldPass(''); setNewPass(''); setConfirmPass('') },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="space-y-5">
      <SectionHeader title={t('nav.settings')} subtitle="" />
      <div className="max-w-md space-y-4">
        <Field label="Mot de passe actuel">
          <Input type="password" value={oldPass} onChange={e => setOldPass(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Nouveau mot de passe">
          <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min. 8 caractères" className={inputClass} />
          {newPass && newPass.length < 8 && <p className="mt-1 text-[11px] text-immo-status-red">8 caractères minimum requis</p>}
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} className={inputClass} />
          {confirmPass && newPass !== confirmPass && <p className="mt-1 text-[11px] text-immo-status-red">Les mots de passe ne correspondent pas</p>}
        </Field>
        <Button onClick={() => changePassword.mutate()} disabled={!oldPass || !newPass || !confirmPass || newPass !== confirmPass || newPass.length < 8 || changePassword.isPending}
          className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
          <Lock className="me-1.5 h-4 w-4" />
          {changePassword.isPending ? t('common.loading') : 'Modifier le mot de passe'}
        </Button>
      </div>
    </div>
  )
}
