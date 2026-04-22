import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { WILAYAS } from '@/lib/constants'
import toast from 'react-hot-toast'

const inputClass = 'border-immo-border-default bg-immo-bg-card text-immo-text-primary placeholder-immo-text-muted'
const labelClass = 'text-[11px] font-medium text-immo-text-secondary'

interface CreateTenantModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateTenantModal({ isOpen, onClose, onSuccess }: CreateTenantModalProps) {
  const [loading, setLoading] = useState(false)

  // Tenant fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [wilaya, setWilaya] = useState('')
  const [website, setWebsite] = useState('')

  // Admin fields
  const [adminFirstName, setAdminFirstName] = useState('')
  const [adminLastName, setAdminLastName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')

  function resetForm() {
    setName(''); setEmail(''); setPhone(''); setAddress(''); setWilaya(''); setWebsite('')
    setAdminFirstName(''); setAdminLastName(''); setAdminEmail('')
  }

  async function handleCreate() {
    if (!name || !email || !adminFirstName || !adminLastName || !adminEmail) return

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
          tenant: { name, email, phone: phone || undefined, address: address || undefined, wilaya: wilaya || undefined, website: website || undefined },
          admin: { first_name: adminFirstName, last_name: adminLastName, email: adminEmail },
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Creation failed')
      }

      const result = await response.json()
      toast.success(`Tenant "${result.tenant.name}" cree. Invitation envoyee a ${result.admin_email}`)
      resetForm()
      onClose()
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la creation')
    } finally {
      setLoading(false)
    }
  }

  const isValid = name && email && adminFirstName && adminLastName && adminEmail

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nouveau Tenant" subtitle="Creer une agence et son premier administrateur" size="lg">
      <div className="space-y-5">
        {/* Tenant info */}
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">Informations entreprise</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={labelClass}>Nom de l'agence *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom..." className={inputClass} /></div>
            <div><Label className={labelClass}>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@..." className={inputClass} /></div>
            <div><Label className={labelClass}>Telephone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0xxx..." className={inputClass} /></div>
            <div>
              <Label className={labelClass}>Wilaya</Label>
              <select value={wilaya} onChange={e => setWilaya(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
                <option value="">Selectionner</option>
                {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div><Label className={labelClass}>Adresse</Label><Input value={address} onChange={e => setAddress(e.target.value)} className={inputClass} /></div>
            <div><Label className={labelClass}>Site web</Label><Input value={website} onChange={e => setWebsite(e.target.value)} className={inputClass} /></div>
          </div>
        </div>

        <Separator className="bg-immo-border-default" />

        {/* Admin info */}
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">Administrateur du tenant</h4>
          <p className="mb-3 text-[11px] text-immo-text-secondary">Un email d'invitation sera envoye a cet administrateur</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={labelClass}>Prenom *</Label><Input value={adminFirstName} onChange={e => setAdminFirstName(e.target.value)} className={inputClass} /></div>
            <div><Label className={labelClass}>Nom *</Label><Input value={adminLastName} onChange={e => setAdminLastName(e.target.value)} className={inputClass} /></div>
            <div className="col-span-2"><Label className={labelClass}>Email Admin *</Label><Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@agence.com" className={inputClass} /></div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-immo-border-default pt-4">
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
            Annuler
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!isValid || loading}
            variant="purple"
          >
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Creer le tenant'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
