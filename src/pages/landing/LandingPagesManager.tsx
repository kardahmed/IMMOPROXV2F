import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ExternalLink, Copy, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { KPICard, LoadingSpinner, StatusBadge, ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { LandingPageEditor } from './LandingPageEditor'

interface LandingPage {
  id: string
  slug: string
  title: string
  description: string
  project_id: string | null
  is_active: boolean
  views_count: number
  submissions_count: number
  distribution_mode: string
  meta_pixel_id: string | null
  google_tag_id: string | null
  created_at: string
}

export function LandingPagesManager() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()
  const [showEditor, setShowEditor] = useState(false)
  const [editPage, setEditPage] = useState<LandingPage | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['landing-pages', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landing_pages')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as LandingPage[]
    },
    enabled: !!tenantId,
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('landing_pages').update({ is_active: active } as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Statut mis a jour') },
  })

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('landing_pages').delete().eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Page supprimee'); setDeleteId(null) },
  })

  // KPIs
  const totalViews = pages.reduce((s, p) => s + p.views_count, 0)
  const totalSubmissions = pages.reduce((s, p) => s + p.submissions_count, 0)
  const conversionRate = totalViews > 0 ? ((totalSubmissions / totalViews) * 100).toFixed(1) : '0'

  function copyLink(slug: string) {
    const url = `${window.location.origin}/p/${slug}`
    navigator.clipboard.writeText(url)
    toast.success('Lien copie !')
  }

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-immo-text-primary">Pages de capture</h2>
          <p className="text-xs text-immo-text-muted">Landing pages pour vos campagnes publicitaires</p>
        </div>
        <Button onClick={() => { setEditPage(null); setShowEditor(true) }} className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
          <Plus className="mr-1.5 h-4 w-4" /> Nouvelle page
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Pages actives" value={pages.filter(p => p.is_active).length} accent="blue" />
        <KPICard label="Vues totales" value={totalViews} accent="blue" />
        <KPICard label="Leads captures" value={totalSubmissions} accent="green" />
        <KPICard label="Taux conversion" value={`${conversionRate}%`} accent={Number(conversionRate) > 5 ? 'green' : 'orange'} />
      </div>

      {/* Pages list */}
      {pages.length === 0 ? (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-16 text-center">
          <p className="text-sm text-immo-text-muted">Aucune page de capture</p>
          <p className="mt-1 text-xs text-immo-text-muted">Creez votre premiere landing page pour capturer des leads</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map(page => {
            const rate = page.views_count > 0 ? ((page.submissions_count / page.views_count) * 100).toFixed(1) : '0'
            const hasTracking = !!(page.meta_pixel_id || page.google_tag_id)
            return (
              <div key={page.id} className="flex items-center gap-4 rounded-xl border border-immo-border-default bg-immo-bg-card p-4 shadow-sm">
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-immo-text-primary">{page.title}</h3>
                    <StatusBadge label={page.is_active ? 'Actif' : 'Inactif'} type={page.is_active ? 'green' : 'muted'} />
                    {hasTracking && <StatusBadge label="Pixel" type="blue" />}
                    <StatusBadge label={page.distribution_mode === 'round_robin' ? 'Round-robin' : page.distribution_mode === 'per_agent' ? 'Par agent' : 'Agent fixe'} type="muted" />
                  </div>
                  <p className="mt-0.5 text-xs text-immo-text-muted">/p/{page.slug}</p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-center">
                  <div>
                    <p className="text-lg font-bold text-immo-text-primary">{page.views_count}</p>
                    <p className="text-[10px] text-immo-text-muted">Vues</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-immo-accent-green">{page.submissions_count}</p>
                    <p className="text-[10px] text-immo-text-muted">Leads</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-immo-text-primary">{rate}%</p>
                    <p className="text-[10px] text-immo-text-muted">Conv.</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button onClick={() => copyLink(page.slug)} title="Copier le lien" className="rounded-md p-2 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
                    <Copy className="h-4 w-4" />
                  </button>
                  <a href={`/p/${page.slug}`} target="_blank" rel="noopener noreferrer" title="Voir" className="rounded-md p-2 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button onClick={() => { setEditPage(page); setShowEditor(true) }} title="Modifier" className="rounded-md p-2 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => toggleActive.mutate({ id: page.id, active: !page.is_active })} title={page.is_active ? 'Desactiver' : 'Activer'} className="rounded-md p-2 text-immo-text-muted hover:bg-immo-bg-card-hover">
                    {page.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button onClick={() => setDeleteId(page.id)} title="Supprimer" className="rounded-md p-2 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-status-red">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Editor modal */}
      <LandingPageEditor isOpen={showEditor} onClose={() => { setShowEditor(false); setEditPage(null) }} editPage={editPage as unknown as Record<string, unknown> | null} />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deletePage.mutate(deleteId)}
        title="Supprimer cette page ?"
        description="Les statistiques seront perdues. Les leads deja captures resteront dans le pipeline."
        confirmVariant="danger"
        loading={deletePage.isPending}
      />
    </div>
  )
}
