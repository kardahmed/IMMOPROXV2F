import { MoreHorizontal, Eye, Home, Calendar, Pencil, Archive, Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatPrice } from '@/lib/constants'
import { usePermissions } from '@/hooks/usePermissions'
import { format } from 'date-fns'

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

interface ProjectCardProps {
  project: ProjectWithCounts
  onView: (id: string) => void
  onViewUnits: (id: string) => void
  onEdit: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}

const STATUS_MAP: Record<string, { label: string; type: 'green' | 'muted' | 'red' }> = {
  active: { label: 'Actif', type: 'green' },
  inactive: { label: 'Inactif', type: 'muted' },
  archived: { label: 'Archivé', type: 'red' },
}

export function ProjectCard({
  project,
  onView,
  onViewUnits,
  onEdit,
  onArchive,
  onDelete,
}: ProjectCardProps) {
  const { canManageProjects, canDeleteData } = usePermissions()
  const progress = project.total > 0
    ? ((project.sold + project.reserved) / project.total) * 100
    : 0
  const st = STATUS_MAP[project.status] ?? STATUS_MAP.inactive

  return (
    <div className="group overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card transition-colors hover:border-immo-border-glow/30">
      {/* Cover */}
      <div className="relative h-40 overflow-hidden bg-immo-bg-primary">
        {project.cover_url ? (
          <img
            src={project.cover_url}
            alt={project.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Home className="h-12 w-12 text-immo-border-default" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <StatusBadge label={st.label} type={st.type} />
        </div>
        {canManageProjects && (
          <div className="absolute right-3 top-3">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-md bg-immo-bg-sidebar/80 text-immo-text-secondary backdrop-blur-sm hover:text-immo-text-primary">
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-immo-border-default bg-immo-bg-card"
              >
                <DropdownMenuItem
                  onClick={() => onEdit(project.id)}
                  className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover"
                >
                  <Pencil className="me-2 h-3.5 w-3.5" /> Modifier
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onArchive(project.id)}
                  className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover"
                >
                  <Archive className="me-2 h-3.5 w-3.5" /> Archiver
                </DropdownMenuItem>
                {canDeleteData && (
                  <DropdownMenuItem
                    onClick={() => onDelete(project.id)}
                    className="text-sm text-immo-status-red focus:bg-immo-status-red-bg"
                  >
                    <Trash2 className="me-2 h-3.5 w-3.5" /> Supprimer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="truncate text-sm font-semibold text-immo-text-primary">
            {project.name}
          </h3>
          <span className="shrink-0 text-[11px] text-immo-text-muted">{project.code}</span>
        </div>

        <div className="mb-3 flex items-center gap-3 text-xs text-immo-text-muted">
          {project.avg_price_per_unit != null && (
            <span>{formatPrice(project.avg_price_per_unit)}/unité</span>
          )}
          {project.delivery_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(project.delivery_date), 'MM/yyyy')}
            </span>
          )}
        </div>

        {/* Counters */}
        <div className="mb-3 flex gap-3 text-[11px]">
          <span className="text-immo-accent-green">{project.sold} vendues</span>
          <span className="text-immo-status-orange">{project.reserved} réservées</span>
          <span className="text-immo-text-muted">{project.available} dispos</span>
          <span className="text-immo-text-muted ms-auto">{project.total} total</span>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-immo-bg-primary">
            <div className="flex h-full">
              {project.sold > 0 && (
                <div
                  className="bg-immo-accent-green"
                  style={{ width: `${(project.sold / project.total) * 100}%` }}
                />
              )}
              {project.reserved > 0 && (
                <div
                  className="bg-immo-status-orange"
                  style={{ width: `${(project.reserved / project.total) * 100}%` }}
                />
              )}
            </div>
          </div>
          <div className="mt-1 text-end text-[10px] text-immo-text-muted">
            {progress.toFixed(0)}% commercialisé
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onView(project.id)}
            className="flex-1 border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
          >
            <Eye className="me-1.5 h-3.5 w-3.5" /> Détails
          </Button>
          <Button
            size="sm"
            onClick={() => onViewUnits(project.id)}
            className="flex-1 bg-immo-accent-green/10 text-xs text-immo-accent-green hover:bg-immo-accent-green/20"
          >
            <Home className="me-1.5 h-3.5 w-3.5" /> Biens
          </Button>
        </div>
      </div>
    </div>
  )
}
