import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export interface BrandingConfig {
  custom_logo_url: string | null
  custom_primary_color: string | null
  custom_app_name: string | null
}

export function useBranding() {
  const tenantId = useAuthStore(s => s.tenantId)

  const { data: branding } = useQuery({
    queryKey: ['tenant-branding', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_settings')
        .select('custom_logo_url, custom_primary_color, custom_app_name')
        .eq('tenant_id', tenantId!)
        .maybeSingle()
      return (data ?? null) as BrandingConfig | null
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 min cache
  })

  // Apply custom primary color as CSS variable on <html>
  useEffect(() => {
    const color = branding?.custom_primary_color
    if (color && color !== '#0579DA') {
      document.documentElement.style.setProperty('--color-immo-accent-green', color)
      document.documentElement.style.setProperty('--color-immo-accent-blue', color)
    } else {
      document.documentElement.style.removeProperty('--color-immo-accent-green')
      document.documentElement.style.removeProperty('--color-immo-accent-blue')
    }
    return () => {
      document.documentElement.style.removeProperty('--color-immo-accent-green')
      document.documentElement.style.removeProperty('--color-immo-accent-blue')
    }
  }, [branding?.custom_primary_color])

  return {
    logoUrl: branding?.custom_logo_url || '/logo-180.png',
    appName: branding?.custom_app_name || 'IMMO PRO-X',
    primaryColor: branding?.custom_primary_color || '#0579DA',
    isCustom: !!(branding?.custom_logo_url || branding?.custom_primary_color || branding?.custom_app_name),
  }
}
