import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CatalogFeature {
  slug: string
  label_fr: string
  label_ar: string
  category: 'core' | 'ai' | 'communication' | 'marketing' | 'tools' | 'admin'
  icon: string | null
  description_fr: string | null
  description_ar: string | null
  cost_da_monthly_estimated: number
  cost_da_per_use: number
  is_implemented: boolean
  display_order: number
}

// Reads feature_catalog from DB so the front-end never has to know
// which features exist — adding a row in the catalog table is enough
// for it to appear in the plan editor and comparison grid.
export function useFeatureCatalog() {
  return useQuery({
    queryKey: ['feature-catalog'],
    queryFn: async (): Promise<CatalogFeature[]> => {
      const { data, error } = await (supabase.from('feature_catalog' as never) as unknown as {
        select: (s: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: CatalogFeature[] | null; error: { message: string } | null }> }
      })
        .select('*')
        .order('display_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as CatalogFeature[]
    },
    staleTime: 5 * 60_000,
  })
}

// Lookup helper: get a feature definition by slug (typed access)
export function findFeature(catalog: CatalogFeature[], slug: string): CatalogFeature | undefined {
  return catalog.find(f => f.slug === slug)
}
