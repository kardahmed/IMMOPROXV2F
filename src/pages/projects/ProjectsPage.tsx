import { useState, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  Home,
  CheckCircle,
  Bookmark,
  Plus,
  LayoutGrid,
  List,
  Package,
} from 'lucide-react'
import { useProjects } from '@/hooks/useProjects'
import { useUnits } from '@/hooks/useUnits'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard,
  SearchInput,
  FilterDropdown,
  PageSkeleton,
  DataTable,
  StatusBadge,
  EmptyState,
  ConfirmDialog,
} from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'
import type { Unit } from '@/types'
import { formatPrice } from '@/lib/constants'
import { usePlanEnforcement } from '@/hooks/usePlanEnforcement'
import { PlanLimitBanner } from '@/components/common/PlanLimitBanner'
import { format } from 'date-fns'
import { ProjectCard } from './components/ProjectCard'
const CreateProjectModal = lazy(() => import('./components/CreateProjectModal').then(m => ({ default: m.CreateProjectModal })))
import { UnitsTab } from './components/UnitsTab'

interface ProjectWithCounts {
  id: string
  name: string
  code: string
  status: string
  cover_url: string | null
  avg_price_per_unit: number | null
  delivery_date: string | null
  total: number
  sold: number
  reserved: number
  available: number
}

const STATUS_OPTIONS_KEYS = [
  { value: 'all', key: 'projects_extra.status_all' },
  { value: 'active', key: 'projects_extra.status_active' },
  { value: 'inactive', key: 'projects_extra.status_inactive' },
  { value: 'archived', key: 'projects_extra.status_archived' },
]

const STATUS_MAP_TYPE: Record<string, 'green' | 'muted' | 'red'> = {
  active: 'green',
  inactive: 'muted',
  archived: 'red',
}
const STATUS_LABEL_KEYS: Record<string, string> = {
  active: 'projects_extra.status_active',
  inactive: 'projects_extra.status_inactive',
  archived: 'projects_extra.status_archived',
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projects, isLoading: loadingProjects, deleteProject, updateProject } = useProjects()
  const { units: rawUnits, isLoading: loadingUnits } = useUnits()
  const units = rawUnits as unknown as Unit[]
  const { canManageProjects } = usePermissions()
  const { canAddProject, usage, limits } = usePlanEnforcement()

  const [activeTab, setActiveTab] = useState<'projects' | 'units'>('projects')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Build projects with unit counts
  const projectsWithCounts: ProjectWithCounts[] = useMemo(() => {
    return projects.map((p) => {
      const pUnits = units.filter((u) => u.project_id === p.id)
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        cover_url: p.cover_url,
        avg_price_per_unit: p.avg_price_per_unit,
        delivery_date: p.delivery_date,
        total: pUnits.length,
        sold: pUnits.filter((u) => u.status === 'sold').length,
        reserved: pUnits.filter((u) => u.status === 'reserved').length,
        available: pUnits.filter((u) => u.status === 'available').length,
      }
    })
  }, [projects, units])

  // Filter
  const filtered = useMemo(() => {
    return projectsWithCounts.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
      }
      return true
    })
  }, [projectsWithCounts, statusFilter, search])

  // KPIs
  const totalProjects = projectsWithCounts.length
  const activeProjects = projectsWithCounts.filter((p) => p.status === 'active').length
  const totalUnits = projectsWithCounts.reduce((s, p) => s + p.total, 0)
  const soldUnits = projectsWithCounts.reduce((s, p) => s + p.sold, 0)
  const reservedUnits = projectsWithCounts.reduce((s, p) => s + p.reserved, 0)

  // Handlers
  function handleView(id: string) { navigate(`/projects/${id}`) }
  function handleViewUnits(_id: string) { setActiveTab('units') }
  function handleEdit(id: string) { navigate(`/projects/${id}`) }
  function handleArchive(id: string) {
    updateProject.mutate({ id, status: 'archived' })
  }
  async function handleDelete() {
    if (deleteId) {
      await deleteProject.mutateAsync(deleteId)
      setDeleteId(null)
    }
  }

  // Table columns
  const columns: Column<ProjectWithCounts>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (p) => <span className="font-mono text-xs text-immo-text-muted">{p.code}</span>,
      className: 'w-[100px]',
    },
    {
      key: 'name',
      header: 'Nom',
      render: (p) => <span className="font-medium">{p.name}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (p) => {
        const stType = STATUS_MAP_TYPE[p.status] ?? 'muted'
        const stKey = STATUS_LABEL_KEYS[p.status] ?? STATUS_LABEL_KEYS.inactive
        return <StatusBadge label={t(stKey)} type={stType} />
      },
      className: 'w-[110px]',
    },
    {
      key: 'units',
      header: 'Unités',
      render: (p) => <span>{p.total}</span>,
      className: 'w-[80px]',
    },
    {
      key: 'sold',
      header: 'Vendues',
      render: (p) => <span className="text-immo-accent-green">{p.sold}</span>,
      className: 'w-[90px]',
    },
    {
      key: 'delivery',
      header: 'Livraison',
      render: (p) => (
        <span className="text-xs text-immo-text-muted">
          {p.delivery_date ? format(new Date(p.delivery_date), 'MM/yyyy') : '-'}
        </span>
      ),
      className: 'w-[100px]',
    },
    {
      key: 'price',
      header: 'Prix moy.',
      render: (p) => (
        <span className="text-xs">
          {p.avg_price_per_unit != null ? formatPrice(p.avg_price_per_unit) : '-'}
        </span>
      ),
      className: 'w-[130px]',
    },
  ]

  const isLoading = loadingProjects || loadingUnits

  if (isLoading) {
    return <PageSkeleton kpiCount={4} hasTable />
  }

  if (activeTab === 'units') {
    return (
      <div className="space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-immo-border-default">
          <button
            onClick={() => setActiveTab('projects')}
            className="border-b-2 border-transparent px-4 py-2.5 text-sm text-immo-text-muted hover:text-immo-text-primary"
          >
            <Building2 className="me-1.5 inline h-4 w-4" /> Projets
          </button>
          <button
            onClick={() => setActiveTab('units')}
            className="border-b-2 border-immo-accent-green px-4 py-2.5 text-sm font-medium text-immo-accent-green"
          >
            <Home className="me-1.5 inline h-4 w-4" /> Biens
          </button>
        </div>
        <UnitsTab />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-immo-border-default">
        <button
          onClick={() => setActiveTab('projects')}
          className="border-b-2 border-immo-accent-green px-4 py-2.5 text-sm font-medium text-immo-accent-green"
        >
          <Building2 className="me-1.5 inline h-4 w-4" /> {t('projects_extra.tab_projects')}
        </button>
        <button
          onClick={() => setActiveTab('units')}
          className="border-b-2 border-transparent px-4 py-2.5 text-sm text-immo-text-muted hover:text-immo-text-primary"
        >
          <Home className="me-1.5 inline h-4 w-4" /> {t('projects_extra.tab_units')}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KPICard
          label={t('projects_extra.kpi_total_projects')}
          value={totalProjects}
          accent="blue"
          icon={<Building2 className="h-5 w-5 text-immo-accent-blue" />}
        />
        <KPICard
          label={t('status.active')}
          value={activeProjects}
          accent="green"
          icon={<Building2 className="h-5 w-5 text-immo-accent-green" />}
        />
        <KPICard
          label={t('projects_extra.kpi_total_units')}
          value={totalUnits}
          accent="blue"
          icon={<Home className="h-5 w-5 text-immo-accent-blue" />}
        />
        <KPICard
          label={t('status.sold')}
          value={soldUnits}
          accent="green"
          icon={<CheckCircle className="h-5 w-5 text-immo-accent-green" />}
        />
        <KPICard
          label={t('status.reserved')}
          value={reservedUnits}
          accent="orange"
          icon={<Bookmark className="h-5 w-5 text-immo-status-orange" />}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder={t('projects_extra.search_placeholder')}
            value={search}
            onChange={setSearch}
            className="w-[260px]"
          />
          <FilterDropdown
            label={t('projects_extra.filter_status')}
            options={STATUS_OPTIONS_KEYS.map(o => ({ value: o.value, label: t(o.key) }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          {/* View toggle */}
          <div className="flex rounded-lg border border-immo-border-default">
            <button
              onClick={() => setView('grid')}
              className={`rounded-l-lg p-2 ${view === 'grid' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:text-immo-text-secondary'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`rounded-r-lg p-2 ${view === 'list' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:text-immo-text-secondary'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {canManageProjects && (
          <Button
            onClick={() => setShowCreate(true)}
            disabled={!canAddProject}
            className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!canAddProject ? t('projects_extra.limit_reached') : undefined}
          >
            <Plus className="me-1.5 h-4 w-4" /> {t('projects_extra.btn_new')}
          </Button>
        )}
      </div>

      {/* Plan limit banner */}
      {!canAddProject && (
        <PlanLimitBanner type="projects" current={usage.projects} max={limits.max_projects} />
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="Aucun projet"
          description="Créez votre premier projet immobilier pour commencer"
          action={canManageProjects && canAddProject ? { label: 'Nouveau projet', onClick: () => setShowCreate(true) } : undefined}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onView={handleView}
              onViewUnits={handleViewUnits}
              onEdit={handleEdit}
              onArchive={handleArchive}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(p) => p.id}
          onRowClick={(p) => handleView(p.id)}
        />
      )}

      {/* Create modal */}
      <Suspense fallback={null}>
        {showCreate && <CreateProjectModal isOpen={showCreate} onClose={() => setShowCreate(false)} />}
      </Suspense>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Supprimer ce projet ?"
        description="Toutes les unités, réservations et ventes liées seront supprimées. Cette action est irréversible."
        confirmLabel="Supprimer"
        confirmVariant="danger"
        loading={deleteProject.isPending}
      />
    </div>
  )
}
