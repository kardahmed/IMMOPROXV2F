import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useTenant } from './useTenant'
import type { Database, HistoryType } from '@/types'

type HistoryInsert = Database['public']['Tables']['history']['Insert']

interface HistoryFilters {
  type?: HistoryType
}

export function useHistory(clientId: string, filters?: HistoryFilters) {
  const tenantId = useTenant()
  const qc = useQueryClient()

  const historyQuery = useQuery({
    queryKey: ['history', clientId, filters],
    queryFn: async () => {
      let query = supabase
        .from('history')
        .select('*, users!history_agent_id_fkey(first_name, last_name)')
        .eq('client_id', clientId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)

      if (filters?.type) query = query.eq('type', filters.type)

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    enabled: !!clientId,
  })

  const addEntry = useMutation({
    mutationFn: async (input: Omit<HistoryInsert, 'tenant_id'>) => {
      const { data, error } = await supabase
        .from('history')
        .insert({ ...input, tenant_id: tenantId })
        .select()
        .single()

      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['history', clientId] })
    },
  })

  return {
    history: historyQuery.data ?? [],
    isLoading: historyQuery.isLoading,
    error: historyQuery.error,
    refetch: historyQuery.refetch,
    addEntry,
  }
}
