import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { usePageMeta } from '@/hooks/usePageMeta'

export function AppLayout() {
  const { title, subtitle } = usePageMeta()

  return (
    <div className="flex h-screen overflow-hidden bg-immo-bg-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="animate-in fade-in duration-200">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
