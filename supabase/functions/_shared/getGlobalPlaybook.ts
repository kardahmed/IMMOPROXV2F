// getGlobalPlaybook — fetch the single platform-wide system prompt.
//
// The founder edits this in /admin/playbook. It's injected into every AI
// prompt across the platform so all tenants share the same expert "brain".
// Returns an empty string if not configured (caller should handle gracefully).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (t: string) => any }

export async function getGlobalPlaybook(supabase: SupabaseLike): Promise<string> {
  const { data } = await supabase
    .from('global_playbook')
    .select('system_prompt')
    .limit(1)
    .maybeSingle()
  return ((data as { system_prompt?: string } | null)?.system_prompt ?? '').trim()
}
