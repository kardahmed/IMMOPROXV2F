import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RoleRoute } from '@/components/auth/RoleRoute'
import { SuperAdminRoute } from '@/components/auth/SuperAdminRoute'
import { FeatureRoute } from '@/components/auth/FeatureRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Lazy-loaded pages for code splitting
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
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
const ErrorLogsPage = lazy(() => import('@/pages/superadmin/ErrorLogsPage').then(m => ({ default: m.ErrorLogsPage })))
const BillingPage = lazy(() => import('@/pages/superadmin/BillingPage').then(m => ({ default: m.BillingPage })))
const MessagesPage = lazy(() => import('@/pages/superadmin/MessagesPage').then(m => ({ default: m.MessagesPage })))
const SupportPage = lazy(() => import('@/pages/superadmin/SupportPage').then(m => ({ default: m.SupportPage })))
const ChangelogPage = lazy(() => import('@/pages/superadmin/ChangelogPage').then(m => ({ default: m.ChangelogPage })))
const MonitoringPage = lazy(() => import('@/pages/superadmin/MonitoringPage').then(m => ({ default: m.MonitoringPage })))
const PlansConfigPage = lazy(() => import('@/pages/superadmin/PlansConfigPage').then(m => ({ default: m.PlansConfigPage })))
const PlaybookAdminPage = lazy(() => import('@/pages/superadmin/PlaybookAdminPage').then(m => ({ default: m.PlaybookAdminPage })))
const WhatsAppPage = lazy(() => import('@/pages/superadmin/WhatsAppPage').then(m => ({ default: m.WhatsAppPage })))
const EmailsPage = lazy(() => import('@/pages/superadmin/EmailsPage').then(m => ({ default: m.EmailsPage })))
const LeadsPage = lazy(() => import('@/pages/superadmin/LeadsPage').then(m => ({ default: m.LeadsPage })))
const SecurityAuditPage = lazy(() => import('@/pages/superadmin/SecurityAuditPage').then(m => ({ default: m.SecurityAuditPage })))
const CostsPage = lazy(() => import('@/pages/superadmin/CostsPage').then(m => ({ default: m.CostsPage })))

const TasksPage = lazy(() => import('@/pages/tasks/TasksPage').then(m => ({ default: m.TasksPage })))
const InboxPage = lazy(() => import('@/pages/inbox/InboxPage').then(m => ({ default: m.InboxPage })))
const MarketingROIPage = lazy(() => import('@/pages/marketing-roi/MarketingROIPage').then(m => ({ default: m.MarketingROIPage })))
const CorbeillePage = lazy(() => import('@/pages/corbeille/CorbeillePage').then(m => ({ default: m.CorbeillePage })))

// Landing pages
const PublicLandingPage = lazy(() => import('@/pages/landing/PublicLandingPage').then(m => ({ default: m.PublicLandingPage })))

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-immo-bg-primary">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
    </div>
  )
}

function HomeRedirect() {
  const hasSession = Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
  return <Navigate to={hasSession ? '/dashboard' : '/login'} replace />
}

function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/p/:slug" element={<PublicLandingPage />} />

        {/* Super Admin routes — /admin/* */}
        <Route element={<SuperAdminRoute />}>
          <Route path="/admin" element={<SuperAdminLayout />}>
            <Route index element={<TenantsPage />} />
            <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="security" element={<SecurityAuditPage />} />
            <Route path="logs" element={<AuditLogsPage />} />
            <Route path="error-logs" element={<ErrorLogsPage />} />
            <Route path="plans" element={<PlansConfigPage />} />
            <Route path="playbook" element={<PlaybookAdminPage />} />
            <Route path="emails" element={<EmailsPage />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="changelog" element={<ChangelogPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="stats" element={<GlobalStatsPage />} />
            <Route path="costs" element={<CostsPage />} />
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
            <Route path="/tasks" element={<TasksPage />} />
            {/* /inbox needs whatsapp feature — Essentiel tenants don't have
                a connected WhatsApp number, so the inbox stays empty for
                them and the page shouldn't be surfaced as if it worked. */}
            <Route element={<FeatureRoute feature="whatsapp" featureName="Inbox WhatsApp" />}>
              <Route path="/inbox" element={<InboxPage />} />
            </Route>
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/dossiers" element={<DossiersPage />} />

            {/* Admin & super_admin only */}
            <Route element={<RoleRoute allowedRoles={['admin', 'super_admin']} />}>
              {/* Plan-gated routes: feature must be enabled in plan_limits.features AND tenant_settings */}
              <Route element={<FeatureRoute feature="landing_pages" featureName="Pages de capture" />}>
                <Route path="/landing" element={<LandingPagesManager />} />
              </Route>
              <Route element={<FeatureRoute feature="goals" featureName="Objectifs de vente" />}>
                <Route path="/goals" element={<GoalsPage />} />
                {/* /performance dashboards live behind the same goals
                    feature key — they pivot off goal completion KPIs and
                    are listed as Pro+ in ROADMAP. Pre-fix this route was
                    open to every Essentiel admin. */}
                <Route path="/performance" element={<PerformancePage />} />
              </Route>
              <Route element={<FeatureRoute feature="roi_marketing" featureName="ROI Marketing" />}>
                <Route path="/marketing-roi" element={<MarketingROIPage />} />
              </Route>

              {/* Core admin routes — no plan gate */}
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agents/:agentId" element={<AgentDetailPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/corbeille" element={<CorbeillePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}

export default App
