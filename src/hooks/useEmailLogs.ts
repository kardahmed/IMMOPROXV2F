import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'

export interface EmailLog {
  id: string
  tenant_id: string | null
  template_slug: string | null
  to_email: string
  subject: string
  status: string | null
  resend_id: string | null
  error_message: string | null
  metadata: unknown
  created_at: string | null
}

interface EmailLogFilters {
  template?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

export function useEmailLogs(filters?: EmailLogFilters) {
  const logsQuery = useQuery({
    queryKey: ['email-logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters?.template) query = query.eq('template_slug', filters.template)
      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom)
      if (filters?.dateTo) query = query.lte('created_at', filters.dateTo)

      const { data, error } = await query

      if (error) { handleSupabaseError(error); throw error }
      return (data ?? []) as EmailLog[]
    },
  })

  return logsQuery
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: async (params: {
      to: string
      template: string
      template_data: Record<string, unknown>
    }) => {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: params.to,
          template: params.template,
          template_data: params.template_data,
          metadata: { test: true },
        },
      })

      if (error) throw error
      return data
    },
  })
}
