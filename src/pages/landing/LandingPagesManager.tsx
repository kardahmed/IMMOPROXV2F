import { useState, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ExternalLink, Copy, Pencil, Trash2, Eye, EyeOff, Layout } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { KPICard, LoadingSpinner, StatusBadge, ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
// Lazy-load the editor and template selector — both are heavy and only open on user action
const LandingPageEditor = lazy(() => import('./LandingPageEditor').then(m => ({ default: m.LandingPageEditor })))
const TemplateSelector = lazy(() => import('./components/TemplateSelector').then(m => ({ default: m.TemplateSelector })))
import type { Template } from './components/TemplateSelector'

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
  const { t } = useTranslation()
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()
  const [showEditor, setShowEditor] = useState(false)
  const [editPage, setEditPage] = useState<LandingPage | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const { data: pages = [], isLoading, refetch } = useQuery({
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Statut mis à jour') },
  })

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('landing_pages').delete().eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Page supprimée'); setDeleteId(null) },
  })

  // KPIs
  const totalViews = pages.reduce((s, p) => s + p.views_count, 0)
  const totalSubmissions = pages.reduce((s, p) => s + p.submissions_count, 0)
  const conversionRate = totalViews > 0 ? ((totalSubmissions / totalViews) * 100).toFixed(1) : '0'

  function copyLink(slug: string) {
    const url = `${window.location.origin}/p/${slug}`
    navigator.clipboard.writeText(url)
    toast.success(t('landing_page.link_copied'))
  }

  async function handleTemplateSelect(template: Template) {
    // Create page
    const slug = template.id + '-' + Date.now().toString(36)
    const { data: newPage, error } = await supabase.from('landing_pages').insert({
      tenant_id: tenantId, slug, title: template.name, description: template.description,
      accent_color: template.accent, is_active: true, default_source: 'facebook_ads',
    } as never).select('id').single()

    if (error || !newPage) { toast.error('Erreur création'); return }
    const pageId = (newPage as { id: string }).id

    // Create sections
    for (let i = 0; i < template.sections.length; i++) {
      const s = template.sections[i]
      await supabase.from('landing_page_sections').insert({
        page_id: pageId, type: s.type, sort_order: i, title: s.title, content: s.content,
      } as never)
    }

    toast.success(`Page "${template.name}" creee depuis le template`)
    refetch()
    // Open editor
    const created = { id: pageId, slug, title: template.name } as unknown as LandingPage
    setEditPage(created)
    setShowEditor(true)
  }

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-immo-text-primary">{t('landing_page.pages_capture')}</h2>
          <p className="text-xs text-immo-text-muted">{t('landing_page.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowTemplates(true)} variant="ghost" className="border border-immo-border-default text-immo-text-secondary hover:bg-immo-bg-card-hover">
            <Layout className="mr-1.5 h-4 w-4" /> {t('landing_page.from_template')}
          </Button>
          <Button onClick={() => { setEditPage(null); setShowEditor(true) }} className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
            <Plus className="mr-1.5 h-4 w-4" /> {t('landing_page.new_page')}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label={t('landing_page.active_pages')} value={pages.filter(p => p.is_active).length} accent="blue" />
        <KPICard label={t('landing_page.total_views')} value={totalViews} accent="blue" />
        <KPICard label={t('landing_page.leads_captured')} value={totalSubmissions} accent="green" />
        <KPICard label={t('landing_page.conversion_rate')} value={`${conversionRate}%`} accent={Number(conversionRate) > 5 ? 'green' : 'orange'} />
      </div>

      {/* Pages list */}
      {pages.length === 0 ? (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-16 text-center">
          <p className="text-sm text-immo-text-muted">{t('landing_page.no_pages')}</p>
          <p className="mt-1 text-xs text-immo-text-muted">{t('landing_page.create_first')}</p>
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
                  <button onClick={() => copyLink(page.slug)} aria-label="Copier le lien" title="Copier le lien" className="rounded-md p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
                    <Copy className="h-4 w-4" />
                  </button>
                  <a href={`/p/${page.slug}`} target="_blank" rel="noopener noreferrer" aria-label="Voir la page" title="Voir" className="rounded-md p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button onClick={() => { setEditPage(page); setShowEditor(true) }} aria-label="Modifier la page" title="Modifier" className="rounded-md p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => toggleActive.mutate({ id: page.id, active: !page.is_active })} aria-label={page.is_active ? 'Desactiver la page' : 'Activer la page'} title={page.is_active ? 'Desactiver' : 'Activer'} className="rounded-md p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
                    {page.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button onClick={() => setDeleteId(page.id)} aria-label="Supprimer la page" title="Supprimer" className="rounded-md p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Template selector */}
      <Suspense fallback={null}>
        {showTemplates && <TemplateSelector isOpen={showTemplates} onClose={() => setShowTemplates(false)} onSelect={handleTemplateSelect} />}
      </Suspense>

      {/* Editor modal */}
      <Suspense fallback={null}>
        {showEditor && <LandingPageEditor isOpen={showEditor} onClose={() => { setShowEditor(false); setEditPage(null) }} editPage={editPage as unknown as Record<string, unknown> | null} />}
      </Suspense>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deletePage.mutate(deleteId)}
        title={t('landing_page.confirm_delete')}
        description={t('landing_page.delete_desc')}
        confirmVariant="danger"
        loading={deletePage.isPending}
      />
    </div>
  )
}
