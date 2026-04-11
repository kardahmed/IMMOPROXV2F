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

const inputClass = 'border-immo-border-default bg-immo-bg-card text-immo-text-primary placeholder-immo-text-muted'

export function PlatformSettingsPage() {
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_settings').select('*').limit(1).single()
      if (error) { handleSupabaseError(error); throw error }
      return data as { id: string; platform_name: string; version: string; support_email: string; maintenance_mode: boolean; anthropic_api_key: string | null; openai_api_key: string | null; default_ai_provider: string }
    },
  })

  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [maintenance, setMaintenance] = useState(false)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [aiProvider, setAiProvider] = useState('anthropic')

  useEffect(() => {
    if (settings) {
      setName(settings.platform_name)
      setVersion(settings.version)
      setSupportEmail(settings.support_email)
      setMaintenance(settings.maintenance_mode)
      setAnthropicKey(settings.anthropic_api_key ?? '')
      setOpenaiKey(settings.openai_api_key ?? '')
      setAiProvider(settings.default_ai_provider ?? 'anthropic')
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
        anthropic_api_key: anthropicKey || null,
        openai_api_key: openaiKey || null,
        default_ai_provider: aiProvider,
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
        <h1 className="text-2xl font-bold text-immo-text-primary">Parametres de la plateforme</h1>
        <p className="text-sm text-immo-text-secondary">Configuration globale IMMO PRO-X</p>
      </div>

      <div className="max-w-lg space-y-5 rounded-xl border border-immo-border-default bg-immo-bg-card p-6">
        <div>
          <Label className="text-[11px] font-medium text-immo-text-secondary">Nom de la plateforme</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <Label className="text-[11px] font-medium text-immo-text-secondary">Version</Label>
          <Input value={version} onChange={e => setVersion(e.target.value)} className={inputClass} />
        </div>

        <div>
          <Label className="text-[11px] font-medium text-immo-text-secondary">Email de support</Label>
          <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@immoprox.com" className={inputClass} />
        </div>

        <div className="rounded-lg border border-immo-border-default p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-5 w-5 ${maintenance ? 'text-immo-status-red' : 'text-immo-text-secondary'}`} />
              <div>
                <p className="text-sm font-medium text-immo-text-primary">Mode maintenance</p>
                <p className="text-[11px] text-immo-text-secondary">Bloque l'acces a tous les utilisateurs</p>
              </div>
            </div>
            <button
              onClick={() => setMaintenance(!maintenance)}
              className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${maintenance ? 'bg-immo-status-red' : 'bg-immo-border-default'}`}
            >
              <div className={`h-5 w-5 rounded-full bg-white transition-transform ${maintenance ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="mt-6 rounded-lg border border-[#7C3AED]/20 bg-[#7C3AED]/5 p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#7C3AED]">Configuration IA</h3>
          <p className="mb-3 text-[11px] text-immo-text-muted">Les cles API sont utilisees par toutes les fonctionnalites IA de la plateforme. Les tenants y accedent selon leur plan.</p>
          <div className="space-y-3">
            <div>
              <Label className="text-[11px] font-medium text-immo-text-muted">Fournisseur IA par defaut</Label>
              <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-medium text-immo-text-muted">Cle API Anthropic</Label>
              <Input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className={inputClass} />
            </div>
            <div>
              <Label className="text-[11px] font-medium text-immo-text-muted">Cle API OpenAI</Label>
              <Input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." className={inputClass} />
            </div>
            <p className="text-[10px] text-immo-text-muted">
              Acces IA par plan : Free = aucun | Starter = suggestions | Pro = suggestions + scripts + documents | Enterprise = tout
            </p>
          </div>
        </div>

        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="mt-4 bg-[#7C3AED] font-semibold text-white hover:bg-[#6D28D9]"
        >
          {save.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <><Save className="mr-1.5 h-4 w-4" /> Enregistrer</>}
        </Button>
      </div>
    </div>
  )
}
