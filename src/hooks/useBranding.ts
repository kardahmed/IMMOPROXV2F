import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export interface BrandingConfig {
  custom_logo_url: string | null
  custom_primary_color: string | null
  custom_app_name: string | null
}

export function useBranding() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()

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
    staleTime: 5 * 60 * 1000,
  })

  // Apply custom primary color via CSS variables (--immo-* which feed into --color-immo-*)
  useEffect(() => {
    const color = branding?.custom_primary_color
    const root = document.documentElement
    if (color && color !== '#0579DA') {
      // Set the base variables that @theme inline reads via var()
      root.style.setProperty('--immo-accent-green', color)
      root.style.setProperty('--immo-accent-blue', color)
      // Also set dim variant (slightly darker)
      root.style.setProperty('--immo-accent-green-dim', adjustBrightness(color, -15))
      root.style.setProperty('--immo-accent-blue-dim', adjustBrightness(color, -15))
      // Light bg variant
      root.style.setProperty('--immo-accent-green-bg', color + '12')
      root.style.setProperty('--immo-accent-blue-bg', color + '12')
    } else {
      root.style.removeProperty('--immo-accent-green')
      root.style.removeProperty('--immo-accent-blue')
      root.style.removeProperty('--immo-accent-green-dim')
      root.style.removeProperty('--immo-accent-blue-dim')
      root.style.removeProperty('--immo-accent-green-bg')
      root.style.removeProperty('--immo-accent-blue-bg')
    }
    return () => {
      root.style.removeProperty('--immo-accent-green')
      root.style.removeProperty('--immo-accent-blue')
      root.style.removeProperty('--immo-accent-green-dim')
      root.style.removeProperty('--immo-accent-blue-dim')
      root.style.removeProperty('--immo-accent-green-bg')
      root.style.removeProperty('--immo-accent-blue-bg')
    }
  }, [branding?.custom_primary_color])

  return {
    logoUrl: branding?.custom_logo_url || '/logo-180.png',
    appName: branding?.custom_app_name || 'IMMO PRO-X',
    primaryColor: branding?.custom_primary_color || '#0579DA',
    isCustom: !!(branding?.custom_logo_url || branding?.custom_primary_color || branding?.custom_app_name),
    refresh: () => qc.invalidateQueries({ queryKey: ['tenant-branding'] }),
  }
}

// Adjust hex color brightness
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xFF) + Math.round(2.55 * percent)))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xFF) + Math.round(2.55 * percent)))
  const b = Math.max(0, Math.min(255, (num & 0xFF) + Math.round(2.55 * percent)))
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
}
