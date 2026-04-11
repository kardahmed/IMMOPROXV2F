import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RoleRoute } from '@/components/auth/RoleRoute'
import { SuperAdminRoute } from '@/components/auth/SuperAdminRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'

// Lazy-loaded pages for code splitting
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage').then(m => ({ default: m.ProjectsPage })))
const ProjectDetailPage = lazy(() => import('@/pages/projects/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })))
const PipelinePage = lazy(() => import('@/pages/pipeline/PipelinePage').then(m => ({ default: m.PipelinePage })))
const ClientDetailPage = lazy(() => import('@/pages/pipeline/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })))
const PlanningPage = lazy(() => import('@/pages/planning/PlanningPage').then(m => ({ default: m.PlanningPage })))
const DossiersPage = lazy(() => import('@/pages/dossiers/DossiersPage').then(m => ({ default: m.DossiersPage })))
const GoalsPage = lazy(() => import('@/pages/goals/GoalsPage').then(m => ({ default: m.GoalsPage })))
const PerformancePage = lazy(() => import('@/pages/performance/PerformancePage').then(m => ({ default: m.PerformancePage })))
const AgentsPage = lazy(() => import('@/pages/agents/AgentsPage').then(m => ({ default: m.AgentsPage })))
const AgentDetailPage = lazy(() => import('@/pages/agents/AgentDetailPage').then(m => ({ default: m.AgentDetailPage })))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })))

// Landing pages
const LandingPagesManager = lazy(() => import('@/pages/landing/LandingPagesManager').then(m => ({ default: m.LandingPagesManager })))

// Super Admin pages
const SuperAdminLayout = lazy(() => import('@/pages/superadmin/SuperAdminLayout').then(m => ({ default: m.SuperAdminLayout })))
const TenantsPage = lazy(() => import('@/pages/superadmin/TenantsPage').then(m => ({ default: m.TenantsPage })))
const TenantDetailPage = lazy(() => import('@/pages/superadmin/TenantDetailPage').then(m => ({ default: m.TenantDetailPage })))
const GlobalStatsPage = lazy(() => import('@/pages/superadmin/GlobalStatsPage').then(m => ({ default: m.GlobalStatsPage })))
const PlatformSettingsPage = lazy(() => import('@/pages/superadmin/PlatformSettingsPage').then(m => ({ default: m.PlatformSettingsPage })))
const AuditLogsPage = lazy(() => import('@/pages/superadmin/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })))

// Landing pages
const PublicLandingPage = lazy(() => import('@/pages/landing/PublicLandingPage').then(m => ({ default: m.PublicLandingPage })))

function PageLoader() {
  return <LoadingSpinner size="lg" className="h-screen" />
}

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/p/:slug" element={<PublicLandingPage />} />

        {/* Super Admin routes — /admin/* */}
        <Route element={<SuperAdminRoute />}>
          <Route path="/admin" element={<SuperAdminLayout />}>
            <Route index element={<TenantsPage />} />
            <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
            <Route path="logs" element={<AuditLogsPage />} />
            <Route path="stats" element={<GlobalStatsPage />} />
            <Route path="settings" element={<PlatformSettingsPage />} />
          </Route>
        </Route>

        {/* App routes — /dashboard, /pipeline, etc. */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            {/* Accessible to all authenticated users */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/pipeline/clients/:clientId" element={<ClientDetailPage />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/dossiers" element={<DossiersPage />} />

            {/* Admin & super_admin only */}
            <Route element={<RoleRoute allowedRoles={['admin', 'super_admin']} />}>
              <Route path="/landing" element={<LandingPagesManager />} />
              <Route path="/goals" element={<GoalsPage />} />
              <Route path="/performance" element={<PerformancePage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agents/:agentId" element={<AgentDetailPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
