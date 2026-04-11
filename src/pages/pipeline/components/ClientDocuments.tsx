import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Trash2, Download, Eye, CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
// import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface Document {
  id: string
  name: string
  type: string
  url: string
  size: number
  created_at: string
}

const DOC_TYPES = [
  { value: 'cin', label: 'CIN / Carte d\'identite' },
  { value: 'contrat_vente', label: 'Contrat de vente' },
  { value: 'bon_reservation', label: 'Bon de reservation' },
  { value: 'echeancier', label: 'Echeancier' },
  { value: 'justificatif', label: 'Justificatif de revenu' },
  { value: 'autre', label: 'Autre document' },
]

interface Props {
  clientId: string
  clientName: string
  cinVerified?: boolean
}

export function ClientDocuments({ clientId, cinVerified }: Props) {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)

  // List documents from storage
  const { data: documents = [] } = useQuery({
    queryKey: ['client-documents', clientId],
    queryFn: async () => {
      const path = `${tenantId}/${clientId}`
      const { data, error } = await supabase.storage.from('client-documents').list(path, { sortBy: { column: 'created_at', order: 'desc' } })
      if (error) return []
      return (data ?? []).map(f => ({
        id: f.id,
        name: f.name,
        type: f.name.split('-')[0] ?? 'autre',
        url: supabase.storage.from('client-documents').getPublicUrl(`${path}/${f.name}`).data.publicUrl,
        size: f.metadata?.size ?? 0,
        created_at: f.created_at ?? new Date().toISOString(),
      })) as Document[]
    },
    enabled: !!tenantId && !!clientId,
  })

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, docType: string) {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return

    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'pdf'
    const fileName = `${docType}-${Date.now()}.${ext}`
    const path = `${tenantId}/${clientId}/${fileName}`

    const { error } = await supabase.storage.from('client-documents').upload(path, file)
    if (error) {
      handleSupabaseError(error)
      // If bucket doesn't exist, try creating it
      if (error.message?.includes('not found')) {
        toast.error('Bucket "client-documents" non configure. Contactez l\'admin.')
      } else {
        toast.error('Erreur lors de l\'upload')
      }
    } else {
      toast.success('Document uploade')
      qc.invalidateQueries({ queryKey: ['client-documents', clientId] })

      // If CIN uploaded, mark cin_verified
      if (docType === 'cin') {
        await supabase.from('clients').update({ cin_verified: true } as never).eq('id', clientId)
        qc.invalidateQueries({ queryKey: ['client-detail'] })
      }
    }

    setUploading(false)
    e.target.value = ''
  }

  const deleteDoc = useMutation({
    mutationFn: async (name: string) => {
      const path = `${tenantId}/${clientId}/${name}`
      const { error } = await supabase.storage.from('client-documents').remove([path])
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client-documents', clientId] }); toast.success('Document supprime') },
  })

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / 1048576).toFixed(1)} Mo`
  }

  return (
    <div className="space-y-4">
      {/* CIN status */}
      <div className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
        {cinVerified ? (
          <CheckCircle className="h-5 w-5 text-immo-accent-green" />
        ) : (
          <XCircle className="h-5 w-5 text-immo-status-red" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-immo-text-primary">CIN / Carte d'identite</p>
          <p className="text-[10px] text-immo-text-muted">{cinVerified ? 'Verifie' : 'Non verifie — uploadez le document'}</p>
        </div>
        <StatusBadge label={cinVerified ? 'Verifie' : 'Manquant'} type={cinVerified ? 'green' : 'red'} />
      </div>

      {/* Upload buttons */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DOC_TYPES.map(dt => (
          <label key={dt.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-immo-border-default px-3 py-2 text-xs text-immo-text-secondary transition-colors hover:border-immo-accent-green hover:bg-immo-accent-green/5">
            <Upload className="h-3.5 w-3.5 shrink-0" />
            {dt.label}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => handleUpload(e, dt.value)} className="hidden" disabled={uploading} />
          </label>
        ))}
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-xs text-immo-text-muted">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
          Upload en cours...
        </div>
      )}

      {/* Documents list */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
        <div className="border-b border-immo-border-default px-4 py-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Documents ({documents.length})</h3>
        </div>
        <div className="divide-y divide-immo-border-default">
          {documents.map(doc => {
            const typeLabel = DOC_TYPES.find(dt => doc.name.startsWith(dt.value))?.label ?? 'Document'
            return (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-immo-accent-blue" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-immo-text-primary">{typeLabel}</p>
                  <p className="text-[10px] text-immo-text-muted">{formatSize(doc.size)} · {format(new Date(doc.created_at), 'dd/MM/yyyy')}</p>
                </div>
                <div className="flex gap-1">
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-accent-blue">
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                  <a href={doc.url} download className="rounded-md p-1 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-accent-green">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => deleteDoc.mutate(doc.name)} className="rounded-md p-1 text-immo-text-muted hover:bg-immo-status-red/10 hover:text-immo-status-red">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
          {documents.length === 0 && <p className="px-4 py-6 text-center text-xs text-immo-text-muted">Aucun document uploade</p>}
        </div>
      </div>
    </div>
  )
}
