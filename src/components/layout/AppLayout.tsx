import { Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, X } from 'lucide-react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { supabase } from '@/lib/supabase'

function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(false)

  const { data } = useQuery({
    queryKey: ['platform-announcement'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('announcement_banner, announcement_type').limit(1).single()
      return data as { announcement_banner: string | null; announcement_type: string } | null
    },
    staleTime: 5 * 60 * 1000,
  })

  if (dismissed || !data?.announcement_banner) return null

  const typeStyles: Record<string, string> = {
    info: 'bg-immo-accent-blue/10 text-immo-accent-blue border-b border-immo-accent-blue/20',
    warning: 'bg-immo-status-orange/10 text-immo-status-orange border-b border-immo-status-orange/20',
    success: 'bg-immo-accent-green/10 text-immo-accent-green border-b border-immo-accent-green/20',
  }

  return (
    <div className={`flex items-center gap-2 px-4 py-2 text-sm ${typeStyles[data.announcement_type] ?? typeStyles.info}`}>
      <Bell className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{data.announcement_banner}</span>
      <button onClick={() => setDismissed(true)} className="shrink-0 rounded-md p-0.5 hover:bg-black/10">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function AppLayout() {
  const { title, subtitle } = usePageMeta()
  useKeyboardShortcuts()
  usePushNotifications()

  return (
    <div className="flex h-screen overflow-hidden bg-immo-bg-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AnnouncementBanner />
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
