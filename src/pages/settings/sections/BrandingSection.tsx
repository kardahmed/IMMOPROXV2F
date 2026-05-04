import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Upload, X, Palette, Type, Image, Eye, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

const PRESET_COLORS = [
  { color: '#0579DA', label: 'Bleu (defaut)' },
  { color: '#0579DA', label: 'Violet' },
  { color: '#00D4A0', label: 'Vert' },
  { color: '#F5A623', label: 'Orange' },
  { color: '#CD3D64', label: 'Rouge' },
  { color: '#06B6D4', label: 'Cyan' },
  { color: '#059669', label: 'Emeraude' },
  { color: '#0A2540', label: 'Marine' },
]

export function BrandingSection() {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings-branding', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('custom_logo_url, custom_primary_color, custom_app_name').eq('tenant_id', tenantId!).maybeSingle()
      return data as { custom_logo_url: string | null; custom_primary_color: string | null; custom_app_name: string | null } | null
    },
    enabled: !!tenantId,
  })

  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#0579DA')
  const [appName, setAppName] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (settings) {
      setLogoUrl(settings.custom_logo_url ?? '')
      setPrimaryColor(settings.custom_primary_color ?? '#0579DA')
      setAppName(settings.custom_app_name ?? '')
    }
  }, [settings])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${tenantId}/branding/logo-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('landing-assets').upload(path, file)
    if (error) { toast.error('Erreur upload'); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('landing-assets').getPublicUrl(path)
    setLogoUrl(urlData.publicUrl)
    setUploading(false)
    e.target.value = ''
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        custom_logo_url: logoUrl || null,
        custom_primary_color: primaryColor || null,
        custom_app_name: appName || null,
      }
      const { error } = await supabase.from('tenant_settings').update(payload as never).eq('tenant_id', tenantId!)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-settings-branding'] })
      qc.invalidateQueries({ queryKey: ['tenant-branding'] })
      toast.success('Branding sauvegardé — rechargez la page pour voir les changements')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function resetToDefault() {
    setLogoUrl('')
    setPrimaryColor('#0579DA')
    setAppName('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-immo-text-primary">Personnalisation</h2>
          <p className="text-sm text-immo-text-secondary">Personnalisez l'apparence de votre espace IMMO PRO-X.</p>
        </div>
        <button onClick={resetToDefault} className="flex items-center gap-1.5 rounded-lg border border-immo-border-default px-3 py-1.5 text-xs text-immo-text-muted hover:bg-immo-bg-card-hover">
          <RotateCcw className="h-3 w-3" /> Reinitialiser
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Settings */}
        <div className="space-y-5">
          {/* App Name */}
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Type className="h-4 w-4 text-immo-accent-blue" />
              <h3 className="text-sm font-semibold text-immo-text-primary">Nom de l'application</h3>
            </div>
            <Input value={appName} onChange={e => setAppName(e.target.value)} placeholder="IMMO PRO-X"
              className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary" />
            <p className="mt-1.5 text-[10px] text-immo-text-muted">S'affiche dans la sidebar, le titre du navigateur et les emails.</p>
          </div>

          {/* Logo */}
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Image className="h-4 w-4 text-[#0579DA]" />
              <h3 className="text-sm font-semibold text-immo-text-primary">Logo</h3>
            </div>

            {logoUrl ? (
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img src={logoUrl} alt="Logo" className="h-16 w-16 rounded-xl border border-immo-border-default object-contain p-1" />
                  <button onClick={() => setLogoUrl('')}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-immo-status-red text-white shadow">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-xs text-immo-text-muted">
                  <p>Logo personnalise actif</p>
                  <p className="text-[10px]">Recommande : 180x180px, PNG transparent</p>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-immo-border-default p-6 transition-colors hover:border-immo-accent-blue hover:bg-immo-accent-blue/5">
                {uploading ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-blue border-t-transparent" />
                ) : (
                  <Upload className="h-6 w-6 text-immo-text-muted" />
                )}
                <span className="text-xs text-immo-text-muted">{uploading ? 'Upload en cours...' : 'Cliquez pour uploader votre logo'}</span>
                <span className="text-[10px] text-immo-text-muted">PNG, JPG, SVG — max 2MB</span>
                <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
              </label>
            )}
          </div>

          {/* Color */}
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Palette className="h-4 w-4 text-immo-accent-green" />
              <h3 className="text-sm font-semibold text-immo-text-primary">Couleur principale</h3>
            </div>

            {/* Presets */}
            <div className="mb-4 flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button key={c.color} onClick={() => setPrimaryColor(c.color)} title={c.label}
                  className={`h-8 w-8 rounded-lg transition-all ${primaryColor === c.color ? 'ring-2 ring-offset-2 ring-immo-accent-blue' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c.color }} />
              ))}
            </div>

            {/* Custom */}
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-immo-border-default" />
              <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#0579DA"
                className="w-32 font-mono text-sm border-immo-border-default bg-immo-bg-primary text-immo-text-primary" />
              <div className="h-10 flex-1 rounded-lg" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}88)` }} />
            </div>
            <p className="mt-2 text-[10px] text-immo-text-muted">Appliquee aux boutons, liens, accents et elements actifs dans votre espace.</p>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div>
          <div className="sticky top-24">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-immo-text-muted">
              <Eye className="h-3.5 w-3.5" /> APERCU EN DIRECT
            </div>

            {/* Sidebar preview */}
            <div className="overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card shadow-lg">
              {/* Mini sidebar */}
              <div className="flex">
                <div className="w-[180px] border-r border-immo-border-default bg-immo-bg-sidebar p-4">
                  <div className="mb-4 flex items-center gap-2.5">
                    {logoUrl ? (
                      <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white" style={{ backgroundColor: primaryColor }}>
                        {(appName || 'IP').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-immo-text-primary">{appName || 'IMMO PRO-X'}</div>
                      <div className="text-[8px] text-immo-text-muted">v2.0</div>
                    </div>
                  </div>
                  {['Dashboard', 'Projets', 'Pipeline', 'Taches'].map((item, i) => (
                    <div key={item} className={`mb-1 rounded-md px-2.5 py-1.5 text-[10px] ${i === 0 ? 'font-semibold' : 'text-immo-text-muted'}`}
                      style={i === 0 ? { backgroundColor: primaryColor + '12', color: primaryColor } : {}}>
                      {item}
                    </div>
                  ))}
                </div>

                {/* Mini content */}
                <div className="flex-1 bg-immo-bg-primary p-4">
                  <div className="mb-3 text-xs font-bold text-immo-text-primary">Tableau de bord</div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-lg border border-immo-border-default bg-white p-2.5">
                      <div className="text-lg font-bold" style={{ color: primaryColor }}>12</div>
                      <div className="text-[8px] text-immo-text-muted">Clients</div>
                    </div>
                    <div className="rounded-lg border border-immo-border-default bg-white p-2.5">
                      <div className="text-lg font-bold text-immo-accent-green">3</div>
                      <div className="text-[8px] text-immo-text-muted">Ventes</div>
                    </div>
                  </div>
                  <button className="w-full rounded-lg px-3 py-2 text-[10px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                    + Nouveau client
                  </button>
                </div>
              </div>
            </div>

            {/* Button preview */}
            <div className="mt-4 rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
              <p className="mb-3 text-[10px] font-medium text-immo-text-muted">Elements d'interface</p>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>Bouton principal</button>
                <button className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: primaryColor + '40', color: primaryColor, backgroundColor: primaryColor + '08' }}>Bouton secondaire</button>
                <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: primaryColor + '15', color: primaryColor }}>Badge</span>
                <span className="text-xs font-semibold" style={{ color: primaryColor }}>Lien actif</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save */}
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
        {save.isPending ? <div className="me-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="me-1.5 h-4 w-4" />}
        Sauvegarder le branding
      </Button>
    </div>
  )
}
