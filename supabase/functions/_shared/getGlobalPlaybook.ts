// getGlobalPlaybook — fetch the single platform-wide system prompt + per-stage overrides.
//
// The founder edits this in /admin/playbook. It's injected into every AI
// prompt across the platform so all tenants share the same expert "brain".
// Returns empty values if not configured (caller should handle gracefully).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (t: string) => any }

export type GlobalPlaybook = {
  systemPrompt: string
  stageOverrides: Record<string, string>
}

export async function getGlobalPlaybook(supabase: SupabaseLike): Promise<GlobalPlaybook> {
  const { data } = await supabase
    .from('global_playbook')
    .select('system_prompt, stage_overrides')
    .limit(1)
    .maybeSingle()
  const row = data as { system_prompt?: string; stage_overrides?: Record<string, string> } | null
  return {
    systemPrompt: (row?.system_prompt ?? '').trim(),
    stageOverrides: row?.stage_overrides ?? {},
  }
}
