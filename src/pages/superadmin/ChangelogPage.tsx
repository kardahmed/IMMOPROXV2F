import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Megaphone, ScrollText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, EmptyState, Modal, PageHeader, PageSkeleton } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

export function ChangelogPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['changelogs'],
    queryFn: async () => {
      const { data } = await supabase.from('changelogs').select('*').order('published_at', { ascending: false })
      return (data ?? []) as Array<{ id: string; version: string; title: string; body: string; published_at: string }>
    },
  })

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('changelogs').insert({ version, title, body } as never)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelogs'] })
      toast.success('Release note publiée')
      setShowAdd(false); setVersion(''); setTitle(''); setBody('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <PageSkeleton kpiCount={0} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Changelog"
        subtitle="Publiez les notes de version visibles par tous les tenants"
        actions={
          <Button onClick={() => setShowAdd(true)} variant="blue">
            <Plus className="mr-1.5 h-4 w-4" /> Nouvelle release
          </Button>
        }
      />

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-immo-border-default bg-immo-bg-card">
          <EmptyState
            icon={<ScrollText className="h-10 w-10" />}
            title="Aucune release note"
            description="Commencez par publier la premiere note de version pour informer vos tenants des nouveautes."
            action={{ label: 'Publier une release', onClick: () => setShowAdd(true) }}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {entries.map(e => (
            <Card key={e.id} hoverable>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#0579DA]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#0579DA]">{e.version}</span>
                <span className="ml-auto text-[11px] text-immo-text-muted">{format(new Date(e.published_at), 'dd/MM/yyyy')}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-immo-text-primary">{e.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-immo-text-secondary">{e.body}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title="Nouvelle release note"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-immo-text-secondary">Annuler</Button>
            <Button onClick={() => create.mutate()} disabled={!version || !title || !body || create.isPending} variant="blue">
              <Megaphone className="mr-1.5 h-4 w-4" /> Publier
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px] text-immo-text-muted">Version *</Label><Input value={version} onChange={e => setVersion(e.target.value)} placeholder="v2.5.0" variant="immo" /></div>
            <div><Label className="text-[11px] text-immo-text-muted">Titre *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nouvelles fonctionnalites" variant="immo" /></div>
          </div>
          <div>
            <Label className="text-[11px] text-immo-text-muted">Contenu *</Label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="- Ajout de..." className="mt-1 w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
