import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useTenant } from './useTenant'
import type { EmailBlock } from '@/lib/blocksToHtml'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string
  tenant_id: string
  name: string
  subject: string
  blocks: EmailBlock[]
  html_cache: string | null
  created_at: string
  updated_at: string
}

export interface EmailCampaign {
  id: string
  tenant_id: string
  template_id: string | null
  marketing_template_id: string | null
  name: string
  subject: string
  status: string
  segment_rules: SegmentRules
  scheduled_at: string | null
  sent_at: string | null
  total_recipients: number
  total_sent: number
  total_opened: number
  total_clicked: number
  created_at: string
  marketing_email_templates?: { name: string } | null
}

export interface SegmentRules {
  pipeline_stages?: string[]
  sources?: string[]
  project_ids?: string[]
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  client_id: string | null
  email: string
  full_name: string | null
  status: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
}

// ─── Templates ──────────────────────────────────────────────────────────────

export function useEmailTemplates() {
  const tenantId = useTenant()
  return useQuery({
    queryKey: ['email-templates', tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as never as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: EmailTemplate[] | null; error: { message: string } | null }> } } } })
        .from('marketing_email_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
      if (error) { handleSupabaseError(error as never); throw error }
      return (data ?? []).map(d => ({ ...d, blocks: (d.blocks ?? []) as unknown as EmailBlock[] }))
    },
    enabled: !!tenantId,
  })
}

export function useSaveTemplate() {
  const tenantId = useTenant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (template: { id?: string; name: string; subject: string; blocks: EmailBlock[]; html_cache: string }) => {
      if (template.id) {
        const { error } = await supabase.from('marketing_email_templates' as never)
          .update({
            name: template.name,
            subject: template.subject,
            blocks: template.blocks,
            html_cache: template.html_cache,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', template.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('marketing_email_templates' as never)
          .insert({
            tenant_id: tenantId,
            name: template.name,
            subject: template.subject,
            blocks: template.blocks,
            html_cache: template.html_cache,
          } as never)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_email_templates' as never).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export function useEmailCampaigns() {
  const tenantId = useTenant()
  return useQuery({
    queryKey: ['email-campaigns', tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as never as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => Promise<{ data: EmailCampaign[] | null; error: { message: string } | null }> } } } })
        .from('email_campaigns')
        .select('*, marketing_email_templates(name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error as never); throw error }
      return (data ?? []).map(d => ({
        ...d,
        segment_rules: (d.segment_rules ?? {}) as SegmentRules,
      }))
    },
    enabled: !!tenantId,
  })
}

export function useSaveCampaign() {
  const tenantId = useTenant()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (campaign: {
      id?: string
      name: string
      subject: string
      template_id: string | null
      segment_rules: SegmentRules
      scheduled_at?: string | null
      status?: string
    }) => {
      if (campaign.id) {
        const { error } = await supabase.from('email_campaigns' as never)
          .update({
            name: campaign.name,
            subject: campaign.subject,
            marketing_template_id: campaign.template_id,
            segment_rules: campaign.segment_rules,
            scheduled_at: campaign.scheduled_at ?? null,
            status: campaign.status ?? 'draft',
          } as never)
          .eq('id', campaign.id)
        if (error) throw error
        return campaign.id
      } else {
        const { data, error } = await supabase.from('email_campaigns' as never)
          .insert({
            tenant_id: tenantId,
            name: campaign.name,
            subject: campaign.subject,
            marketing_template_id: campaign.template_id,
            segment_rules: campaign.segment_rules,
            scheduled_at: campaign.scheduled_at ?? null,
            status: campaign.status ?? 'draft',
          } as never)
          .select('id')
          .single()
        if (error) throw error
        return (data as { id: string }).id
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaigns'] }),
  })
}

// ─── Segment Preview ────────────────────────────────────────────────────────

export function useSegmentCount(rules: SegmentRules) {
  const tenantId = useTenant()
  return useQuery({
    queryKey: ['segment-count', tenantId, rules],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('email', 'is', null)

      if (rules.pipeline_stages?.length) query = query.in('pipeline_stage', rules.pipeline_stages as never)
      if (rules.sources?.length) query = query.in('source', rules.sources as never)
      if (rules.project_ids?.length) query = query.in('project_id' as never, rules.project_ids as never)

      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    },
    enabled: !!tenantId,
  })
}

// ─── Campaign Recipients ────────────────────────────────────────────────────

export function useCampaignRecipients(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-recipients', campaignId],
    queryFn: async () => {
      const { data, error } = await (supabase as never as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: CampaignRecipient[] | null; error: { message: string } | null }> } } } } })
        .from('email_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaignId!)
        .order('sent_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
    enabled: !!campaignId,
  })
}

// ─── Send Campaign ──────────────────────────────────────────────────────────

export function useSendCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('send-campaign', {
        body: { campaign_id: campaignId },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] })
      qc.invalidateQueries({ queryKey: ['campaign-recipients'] })
    },
  })
}

// ─── Projects list (for segment builder) ────────────────────────────────────

export function useProjectsList() {
  const tenantId = useTenant()
  return useQuery({
    queryKey: ['projects-list', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tenantId,
  })
}
