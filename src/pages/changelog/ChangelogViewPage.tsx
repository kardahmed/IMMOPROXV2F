import { useQuery } from '@tanstack/react-query'
import { Megaphone, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/common'

type Entry = { id: string; version: string; title: string; body: string; published_at: string }

export function ChangelogViewPage() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['public-changelogs'],
    queryFn: async () => {
      const { data } = await supabase.from('changelogs').select('*').order('published_at', { ascending: false }).limit(50)
      return (data ?? []) as Entry[]
    },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C3AED]/10">
          <Sparkles className="h-5 w-5 text-[#7C3AED]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-immo-text-primary">Nouveautes</h1>
          <p className="text-sm text-immo-text-secondary">Les dernieres ameliorations de la plateforme.</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-12 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-immo-text-muted" />
          <p className="mt-3 text-sm text-immo-text-muted">Aucune nouveaute pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(e => (
            <article key={e.id} className="rounded-xl border border-immo-border-default bg-immo-bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-[#7C3AED]/10 px-3 py-1 text-xs font-bold text-[#7C3AED]">{e.version}</span>
                <h3 className="text-base font-semibold text-immo-text-primary">{e.title}</h3>
                <span className="ml-auto text-xs text-immo-text-muted">
                  {new Date(e.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-immo-text-secondary">
                {e.body.replace(/\\n/g, '\n')}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
