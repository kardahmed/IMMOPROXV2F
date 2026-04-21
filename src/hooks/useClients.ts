import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { emitEvent } from '@/lib/emitEvent'
import { useTenant } from './useTenant'
import toast from 'react-hot-toast'
import type { Database, PipelineStage, ClientSource } from '@/types'

type ClientInsert = Database['public']['Tables']['clients']['Insert']
type ClientUpdate = Database['public']['Tables']['clients']['Update']

interface ClientFilters {
  stage?: PipelineStage
  source?: ClientSource
  agentId?: string
  search?: string
  isPriority?: boolean
  page?: number
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 50

/** Escape special PostgREST filter characters to prevent filter injection */
function sanitizeSearch(input: string): string {
  return input.replace(/[%_(),.\\]/g, (ch) => `\\${ch}`)
}

export function useClients(filters?: ClientFilters) {
  const tenantId = useTenant()
  const qc = useQueryClient()

  const clientsQuery = useQuery({
    queryKey: ['clients', tenantId, filters],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('*, users!clients_agent_id_fkey(first_name, last_name)', { count: 'exact' })
        .eq('tenant_id', tenantId)

      if (filters?.stage) query = query.eq('pipeline_stage', filters.stage)
      if (filters?.source) query = query.eq('source', filters.source)
      if (filters?.agentId) query = query.eq('agent_id', filters.agentId)
      if (filters?.isPriority) query = query.eq('is_priority', true)
      if (filters?.search) {
        const s = sanitizeSearch(filters.search)
        query = query.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
      }

      // Pagination
      const page = filters?.page ?? 0
      const pageSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE
      const from = page * pageSize
      const to = from + pageSize - 1

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) { handleSupabaseError(error); throw error }
      return { data: data ?? [], count: count ?? 0 }
    },
  })

  const createClient = useMutation({
    mutationFn: async (input: Omit<ClientInsert, 'tenant_id'>) => {
      const { data, error } = await supabase
        .from('clients')
        .insert({ ...input, tenant_id: tenantId })
        .select()
        .single()

      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client ajoute avec succes')
      emitEvent(tenantId, 'client.created', {
        id: (data as { id: string } | null)?.id,
        full_name: (data as { full_name: string } | null)?.full_name,
        source: (data as { source: string } | null)?.source,
      })
    },
  })

  const updateClient = useMutation({
    mutationFn: async ({ id, ...input }: ClientUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('clients')
        .update(input)
        .eq('id', id)
        .select()
        .single()

      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client mis a jour')
    },
  })

  const updateClientStage = useMutation({
    mutationFn: async ({ clientId, newStage }: { clientId: string; newStage: PipelineStage }) => {
      const { data, error } = await supabase
        .from('clients')
        .update({ pipeline_stage: newStage })
        .eq('id', clientId)
        .select()
        .single()

      // history log is handled by the DB trigger (log_stage_change)
      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      emitEvent(tenantId, 'client.stage_changed', {
        client_id: variables.clientId,
        new_stage: variables.newStage,
      })
    },
  })

  return {
    clients: clientsQuery.data?.data ?? [],
    totalCount: clientsQuery.data?.count ?? 0,
    isLoading: clientsQuery.isLoading,
    error: clientsQuery.error,
    refetch: clientsQuery.refetch,
    createClient,
    updateClient,
    updateClientStage,
  }
}

/** Standalone hook for fetching a single client by ID (defense-in-depth with tenant_id) */
export function useClientById(id: string, tenantId: string) {
  return useQuery({
    queryKey: ['clients', id, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, users!clients_agent_id_fkey(first_name, last_name)')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single()

      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    enabled: !!id && !!tenantId,
  })
}
