import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Megaphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LoadingSpinner, Modal } from '@/components/common'
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
      await supabase.from('changelogs').insert({ version, title, body } as never)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelogs'] })
      toast.success('Release note publiée')
      setShowAdd(false); setVersion(''); setTitle(''); setBody('')
    },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-immo-text-primary">Changelog</h1>
        <Button onClick={() => setShowAdd(true)} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
          <Plus className="mr-1.5 h-4 w-4" /> Nouvelle release
        </Button>
      </div>

      <div className="space-y-4">
        {entries.map(e => (
          <div key={e.id} className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-[#7C3AED]/10 px-3 py-0.5 text-xs font-bold text-[#7C3AED]">{e.version}</span>
              <h3 className="text-sm font-semibold text-immo-text-primary">{e.title}</h3>
              <span className="ml-auto text-xs text-immo-text-muted">{format(new Date(e.published_at), 'dd/MM/yyyy')}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-immo-text-secondary">{e.body.replace(/\\n/g, '\n')}</p>
          </div>
        ))}
        {entries.length === 0 && <p className="py-12 text-center text-sm text-immo-text-muted">Aucune release note</p>}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Nouvelle release note" size="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-[11px] text-immo-text-muted">Version *</Label><Input value={version} onChange={e => setVersion(e.target.value)} placeholder="v2.5.0" className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary" /></div>
            <div><Label className="text-[11px] text-immo-text-muted">Titre *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nouvelles fonctionnalites" className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary" /></div>
          </div>
          <div>
            <Label className="text-[11px] text-immo-text-muted">Contenu *</Label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="- Ajout de..." className="mt-1 w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-immo-text-secondary">Annuler</Button>
            <Button onClick={() => create.mutate()} disabled={!version || !title || !body || create.isPending} className="bg-[#7C3AED] text-white hover:bg-[#6D28D9]">
              <Megaphone className="mr-1.5 h-4 w-4" /> Publier
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
