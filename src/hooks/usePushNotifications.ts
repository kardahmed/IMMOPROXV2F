import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

export function usePushNotifications() {
  const tenantId = useAuthStore(s => s.tenantId)

  useEffect(() => {
    if (!tenantId || !('Notification' in window)) return

    // Request permission on first load
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [tenantId])

  function sendPush(title: string, body?: string, url?: string) {
    if (Notification.permission !== 'granted') return

    const notif = new Notification(title, {
      body,
      icon: '/logo-180.png',
      badge: '/favicon.png',
      tag: 'immo-prox',
      silent: false,
    })

    if (url) {
      notif.onclick = () => {
        window.focus()
        window.location.href = url
      }
    }
  }

  return { sendPush, isSupported: 'Notification' in window, permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied' }
}
