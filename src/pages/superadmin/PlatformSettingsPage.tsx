import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { LoadingSpinner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

const inputClass = 'border-[#1E325A] bg-[#0A1030] text-white placeholder-[#4E6687]'

export function PlatformSettingsPage() {
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_settings').select('*').limit(1).single()
      if (error) { handleSupabaseError(error); throw error }
      return data as { id: string; platform_name: string; version: string; support_email: string; maintenance_mode: boolean }
    },
  })

  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [maintenance, setMaintenance] = useState(false)

  useEffect(() => {
    if (settings) {
      setName(settings.platform_name)
      setVersion(settings.version)
      setSupportEmail(settings.support_email)
      setMaintenance(settings.maintenance_mode)
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) return
      const { error } = await supabase.from('platform_settings').update({
        platform_name: name,
        version,
        support_email: supportEmail,
        maintenance_mode: maintenance,
        updated_at: new Date().toISOString(),
      } as never).eq('id', settings.id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] })
      toast.success('Parametres enregistres')
    },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Parametres de la plateforme</h1>
        <p className="text-sm text-[#7F96B7]">Configuration globale IMMO PRO-X</p>
      </div>

      <div className="max-w-lg space-y-5 rounded-xl border border-[#1E325A] bg-[#0A1030] p-6">
        <div>
          <Label className="text-[11px] font-medium text-[#7F96B7]">Nom de la plateforme</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <Label className="text-[11px] font-medium text-[#7F96B7]">Version</Label>
          <Input value={version} onChange={e => setVersion(e.target.value)} className={inputClass} />
        </div>

        <div>
          <Label className="text-[11px] font-medium text-[#7F96B7]">Email de support</Label>
          <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@immoprox.com" className={inputClass} />
        </div>

        <div className="rounded-lg border border-[#1E325A] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${maintenance ? 'text-[#FF4949]' : 'text-[#7F96B7]'}`} />
              <div>
                <p className="text-sm font-medium text-white">Mode maintenance</p>
                <p className="text-[11px] text-[#7F96B7]">Bloque l'acces a tous les utilisateurs</p>
              </div>
            </div>
            <button
              onClick={() => setMaintenance(!maintenance)}
              className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${maintenance ? 'bg-[#FF4949]' : 'bg-[#1E325A]'}`}
            >
              <div className={`h-5 w-5 rounded-full bg-white transition-transform ${maintenance ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="bg-[#7C3AED] font-semibold text-white hover:bg-[#6D28D9]"
        >
          {save.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <><Save className="mr-1.5 h-4 w-4" /> Enregistrer</>}
        </Button>
      </div>
    </div>
  )
}
