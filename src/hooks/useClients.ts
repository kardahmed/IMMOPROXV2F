import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
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
        .is('deleted_at', null)

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Client ajoute avec succes')
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['history'] })
    },
  })

  // Soft-delete: marks the row for the Corbeille view. RLS in
  // migration 017 restricts this UPDATE to admins, so an agent
  // calling this hook will get an access-denied error.
  const softDeleteClient = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as never)
        .eq('id', id)

      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['deleted-clients'] })
      toast.success('Client mis dans la corbeille')
    },
  })

  const restoreClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: null, deleted_by: null } as never)
        .eq('id', id)

      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['deleted-clients'] })
      toast.success('Client restaure')
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
    softDeleteClient,
    restoreClient,
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
        .is('deleted_at', null)
        .single()

      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    enabled: !!id && !!tenantId,
  })
}

/** Admin-only: list soft-deleted clients (for the Corbeille page). */
export function useDeletedClients() {
  const tenantId = useTenant()
  return useQuery({
    queryKey: ['deleted-clients', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, phone, email, pipeline_stage, agent_id, deleted_at, deleted_by, users!clients_agent_id_fkey(first_name, last_name)')
        .eq('tenant_id', tenantId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })

      if (error) { handleSupabaseError(error); throw error }
      return data ?? []
    },
    enabled: !!tenantId,
  })
}
