import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Card, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

export function PlaybookAdminPage() {
  const qc = useQueryClient()

  const { data: row, isLoading } = useQuery({
    queryKey: ['global-playbook'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_playbook' as never)
        .select('id, system_prompt, updated_at')
        .limit(1)
        .maybeSingle()
      if (error) { handleSupabaseError(error); throw error }
      return data as { id: string; system_prompt: string; updated_at: string } | null
    },
  })

  const [systemPrompt, setSystemPrompt] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (row) {
      setSystemPrompt(row.system_prompt ?? '')
      setDirty(false)
    }
  }, [row])

  const save = useMutation({
    mutationFn: async () => {
      if (!row?.id) throw new Error('Playbook not initialized')
      const { error } = await supabase
        .from('global_playbook' as never)
        .update({ system_prompt: systemPrompt } as never)
        .eq('id', row.id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['global-playbook'] })
      setDirty(false)
      toast.success('Playbook global sauvegardé — actif pour tous les tenants')
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0579DA] border-t-transparent" /></div>
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Playbook IA — global" subtitle="Le cerveau de la plateforme. Ce prompt est injecté dans chaque appel IA pour tous les tenants." />

      <Card>
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-immo-bg-primary p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-immo-accent-blue" />
          <div className="text-xs text-immo-text-secondary">
            <p className="mb-1 font-semibold text-immo-text-primary">Comment ça marche</p>
            <p>Ce prompt est ajouté en tête de chaque requête IA (scripts d'appel, suggestions de biens, futurs assistants). Écrivez-le comme si vous donniez des consignes à un expert junior : ton, méthode de vente, règles à respecter, exemples de réponses aux objections, phrases de closing, etc.</p>
            <p className="mt-1 text-immo-text-muted">Aucun tenant n'a accès à cette configuration — c'est votre expertise qui pilote toute la plateforme.</p>
          </div>
        </div>

        <label className="mb-2 block text-sm font-semibold text-immo-text-primary">Prompt système</label>
        <textarea
          value={systemPrompt}
          onChange={e => { setSystemPrompt(e.target.value); setDirty(true) }}
          placeholder={`Tu es un expert en vente immobilière en Algérie, avec 10 ans d'expérience à Alger.

Méthode : Hormozi — focus valeur, urgence, closing direct.
Ton : Professionnel mais chaleureux. Utiliser le prénom dès le 2e contact.
Règle absolue : ne jamais donner un prix exact au téléphone, toujours inviter à la visite.

Objections fréquentes :
- "Trop cher" → Comparer au prix du m² du quartier, rappeler la qualité de finition.
- "Je vais réfléchir" → Proposer un créneau de visite cette semaine, mardi ou jeudi ?

Phrases de closing :
- "Mardi 14h ou jeudi 17h, quel créneau vous arrange ?"
- "On bloque la visite ce soir avant que l'unité ne parte ?"`}
          rows={24}
          className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-4 font-mono text-sm leading-relaxed text-immo-text-primary outline-none transition-colors focus:border-[#0579DA]"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-immo-text-muted">
            {row?.updated_at
              ? `Dernière modification ${formatDistanceToNow(new Date(row.updated_at), { addSuffix: true, locale: fr })}`
              : 'Jamais sauvegardé'}
            {' · '}
            {systemPrompt.length} caractères
          </p>
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            variant="blue"
          >
            {save.isPending ? <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="mr-1.5 h-4 w-4" />}
            {save.isPending ? 'Sauvegarde…' : 'Sauvegarder pour toute la plateforme'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
