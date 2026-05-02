import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { Modal, ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { WILAYAS } from '@/lib/constants'
import toast from 'react-hot-toast'

const labelClass = 'text-[11px] font-medium text-immo-text-secondary'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface CreateTenantDefaults {
  name?: string
  email?: string
  phone?: string
  address?: string
  wilaya?: string
  website?: string
  adminFirstName?: string
  adminLastName?: string
  adminEmail?: string
}

interface CreateTenantModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (tenantId?: string) => void
  defaults?: CreateTenantDefaults
  subtitle?: string
}

export function CreateTenantModal({ isOpen, onClose, onSuccess, defaults, subtitle }: CreateTenantModalProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [wilaya, setWilaya] = useState('')
  const [website, setWebsite] = useState('')

  const [adminFirstName, setAdminFirstName] = useState('')
  const [adminLastName, setAdminLastName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')

  const [plan, setPlan] = useState<'free' | 'starter' | 'pro' | 'enterprise'>('starter')
  const [trialDays, setTrialDays] = useState(14)

  // Field-level validation (real-time)
  const emailError = email && !EMAIL_RE.test(email) ? t('tenant_form.invalid_email') : ''
  const adminEmailError = adminEmail && !EMAIL_RE.test(adminEmail) ? t('tenant_form.invalid_email') : ''

  // Track dirty state — anything typed past the prefill triggers a confirm on close
  const isDirty =
    name !== (defaults?.name ?? '') ||
    email !== (defaults?.email ?? '') ||
    phone !== (defaults?.phone ?? '') ||
    address !== (defaults?.address ?? '') ||
    wilaya !== (defaults?.wilaya ?? '') ||
    website !== (defaults?.website ?? '') ||
    adminFirstName !== (defaults?.adminFirstName ?? '') ||
    adminLastName !== (defaults?.adminLastName ?? '') ||
    adminEmail !== (defaults?.adminEmail ?? '')

  // Populate from defaults each time the modal opens
  useEffect(() => {
    if (!isOpen) return
    setName(defaults?.name ?? '')
    setEmail(defaults?.email ?? '')
    setPhone(defaults?.phone ?? '')
    setAddress(defaults?.address ?? '')
    setWilaya(defaults?.wilaya ?? '')
    setWebsite(defaults?.website ?? '')
    setAdminFirstName(defaults?.adminFirstName ?? '')
    setAdminLastName(defaults?.adminLastName ?? '')
    setAdminEmail(defaults?.adminEmail ?? '')
    setPlan('starter')
    setTrialDays(14)
  }, [isOpen, defaults])

  function handleClose() {
    if (loading) return
    if (isDirty) {
      setConfirmCancel(true)
    } else {
      onClose()
    }
  }

  async function handleCreate() {
    if (!name.trim() || !email.trim() || !adminFirstName.trim() || !adminLastName.trim() || !adminEmail.trim()) return
    if (emailError || adminEmailError) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const response = await fetch(`${supabaseUrl}/functions/v1/create-tenant-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tenant: {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            wilaya: wilaya.trim() || undefined,
            website: website.trim() || undefined,
          },
          admin: {
            first_name: adminFirstName.trim(),
            last_name: adminLastName.trim(),
            email: adminEmail.trim().toLowerCase(),
          },
          plan,
          trial_days: trialDays,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Creation failed' }))
        throw new Error(err.error || 'Creation failed')
      }

      const result = await response.json()

      // Surface server-side warnings (e.g. duplicate name) without blocking
      if (Array.isArray(result.warnings) && result.warnings.length > 0) {
        for (const w of result.warnings) toast(w, { icon: '⚠️', duration: 5000 })
      }

      toast.success(t('tenant_form.created_success', {
        name: result.tenant.name,
        email: result.admin_email,
      }))
      onClose()
      onSuccess(result.tenant?.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('tenant_form.error_generic'))
    } finally {
      setLoading(false)
    }
  }

  const isValid = !!name.trim() && !!email.trim() && !!adminFirstName.trim() && !!adminLastName.trim() && !!adminEmail.trim() && !emailError && !adminEmailError

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={t('tenant_form.title')}
        subtitle={subtitle ?? t('tenant_form.subtitle')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={handleClose} disabled={loading} className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
              {t('tenant_form.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!isValid || loading} variant="purple">
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : t('tenant_form.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Tenant info */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">{t('tenant_form.section_company')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelClass}>{t('tenant_form.agency_name')} *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('tenant_form.agency_name_placeholder')} variant="immo" />
              </div>
              <div>
                <Label className={labelClass}>{t('tenant_form.email')} *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@agence.com" variant="immo" />
                {emailError && <p className="mt-1 text-[10px] text-immo-status-red">{emailError}</p>}
              </div>
              <div>
                <Label className={labelClass}>{t('tenant_form.phone')}</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0555 123 456" variant="immo" />
              </div>
              <div>
                <Label className={labelClass}>{t('tenant_form.wilaya')}</Label>
                <select value={wilaya} onChange={e => setWilaya(e.target.value)} className="h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
                  <option value="">{t('tenant_form.select')}</option>
                  {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <Label className={labelClass}>{t('tenant_form.address')}</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} variant="immo" />
              </div>
              <div>
                <Label className={labelClass}>{t('tenant_form.website')}</Label>
                <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" variant="immo" />
              </div>
            </div>
          </div>

          <Separator className="bg-immo-border-default" />

          {/* Plan + trial — P3 */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">{t('tenant_form.section_plan')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelClass}>{t('tenant_form.plan')} *</Label>
                <select value={plan} onChange={e => setPlan(e.target.value as typeof plan)} className="h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <Label className={labelClass}>{t('tenant_form.trial_days')}</Label>
                <Input type="number" min={0} max={365} value={trialDays} onChange={e => setTrialDays(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))} variant="immo" />
                <p className="mt-1 text-[10px] text-immo-text-muted">{t('tenant_form.trial_days_hint')}</p>
              </div>
            </div>
          </div>

          <Separator className="bg-immo-border-default" />

          {/* Admin info */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">{t('tenant_form.section_admin')}</h4>
            <p className="mb-3 text-[11px] text-immo-text-secondary">{t('tenant_form.admin_invite_note')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelClass}>{t('tenant_form.first_name')} *</Label>
                <Input value={adminFirstName} onChange={e => setAdminFirstName(e.target.value)} variant="immo" />
              </div>
              <div>
                <Label className={labelClass}>{t('tenant_form.last_name')} *</Label>
                <Input value={adminLastName} onChange={e => setAdminLastName(e.target.value)} variant="immo" />
              </div>
              <div className="col-span-2">
                <Label className={labelClass}>{t('tenant_form.admin_email')} *</Label>
                <Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@agence.com" variant="immo" />
                {adminEmailError && <p className="mt-1 text-[10px] text-immo-status-red">{adminEmailError}</p>}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => { setConfirmCancel(false); onClose() }}
        title={t('tenant_form.confirm_cancel_title')}
        description={t('tenant_form.confirm_cancel_desc')}
        confirmLabel={t('tenant_form.confirm_cancel_yes')}
        confirmVariant="danger"
      />
    </>
  )
}
