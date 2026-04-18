import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Check, AlertTriangle, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Row = { full_name: string; phone?: string; email?: string; source?: string; pipeline_stage?: string; budget?: string; notes?: string }

const HEADERS = ['full_name', 'phone', 'email', 'source', 'pipeline_stage', 'budget', 'notes']

export function ImportClientsModal({ isOpen, onClose }: Props) {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState<{ ok: number; failed: number } | null>(null)

  function parseCsv(text: string): { rows: Row[]; errors: string[] } {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) return { rows: [], errors: ['Le fichier doit contenir au moins une ligne de donnees'] }

    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''))
    const errs: string[] = []
    if (!header.includes('full_name')) errs.push('Colonne "full_name" obligatoire manquante')
    if (errs.length) return { rows: [], errors: errs }

    const parsed: Row[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = splitCsvLine(lines[i])
      const row: Record<string, string> = {}
      header.forEach((h, idx) => { row[h] = (values[idx] ?? '').trim() })
      if (!row.full_name) { errs.push(`Ligne ${i + 1}: nom manquant`); continue }
      parsed.push(row as Row)
    }
    return { rows: parsed, errors: errs }
  }

  function splitCsvLine(line: string): string[] {
    const out: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') inQuotes = !inQuotes
      else if (c === ',' && !inQuotes) { out.push(current); current = '' }
      else current += c
    }
    out.push(current)
    return out.map(s => s.replace(/^"|"$/g, ''))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name); setDone(null)
    const text = await file.text()
    const { rows: parsed, errors: errs } = parseCsv(text)
    setRows(parsed); setErrors(errs)
  }

  async function handleImport() {
    if (!tenantId || rows.length === 0) return
    setImporting(true)
    let ok = 0, failed = 0
    for (const r of rows) {
      const { error } = await supabase.from('clients').insert({
        tenant_id: tenantId,
        full_name: r.full_name,
        phone: r.phone || null,
        email: r.email || null,
        source: r.source || 'manuel',
        pipeline_stage: r.pipeline_stage || 'accueil',
        confirmed_budget: r.budget ? Number(r.budget) || null : null,
        notes: r.notes || null,
      } as never)
      if (error) failed++; else ok++
    }
    setImporting(false)
    setDone({ ok, failed })
    qc.invalidateQueries({ queryKey: ['clients'] })
    if (ok > 0) toast.success(`${ok} client(s) importe(s)`)
    if (failed > 0) toast.error(`${failed} ligne(s) en echec`)
  }

  function downloadTemplate() {
    const csv = HEADERS.join(',') + '\n' +
      'Ahmed Benali,0555123456,ahmed@example.com,facebook,accueil,15000000,Interesse par F3\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'template-clients.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function reset() {
    setRows([]); setErrors([]); setFileName(''); setDone(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose() }} title="Importer des clients (CSV)" size="lg">
      <div className="space-y-4">
        {!done && (
          <>
            <div className="flex items-center justify-between rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
              <div className="flex items-center gap-2 text-xs text-immo-text-secondary">
                <FileText className="h-4 w-4" />
                Colonnes attendues : <code className="rounded bg-immo-bg-card px-1.5 py-0.5 font-mono text-[11px]">{HEADERS.join(', ')}</code>
              </div>
              <Button variant="ghost" onClick={downloadTemplate} className="text-immo-accent-green">
                <Download className="mr-1 h-3.5 w-3.5" /> Template
              </Button>
            </div>

            <div className="rounded-xl border-2 border-dashed border-immo-border-default p-8 text-center">
              <Upload className="mx-auto h-10 w-10 text-immo-text-muted" />
              <p className="mt-2 text-sm text-immo-text-primary">Deposez votre fichier CSV</p>
              <p className="text-xs text-immo-text-muted">{fileName || 'Aucun fichier selectionne'}</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" id="csv-file" />
              <label htmlFor="csv-file" className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-lg bg-immo-accent-green px-4 text-xs font-semibold text-immo-bg-primary hover:opacity-90">
                Choisir un fichier
              </label>
            </div>

            {errors.length > 0 && (
              <div className="rounded-lg border border-[#CD3D64]/30 bg-[#CD3D64]/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#CD3D64]" />
                  <div className="flex-1 space-y-0.5">
                    {errors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-[#CD3D64]">{e}</p>)}
                    {errors.length > 5 && <p className="text-xs text-[#CD3D64]">...et {errors.length - 5} autres erreurs</p>}
                  </div>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="rounded-lg border border-immo-border-default bg-immo-bg-primary">
                <div className="flex items-center justify-between border-b border-immo-border-default px-4 py-2">
                  <span className="text-xs font-semibold text-immo-text-primary">Apercu : {rows.length} clients prets a importer</span>
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-immo-bg-card sticky top-0">
                      <tr>
                        {HEADERS.map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-immo-text-muted">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-t border-immo-border-default">
                          {HEADERS.map(h => <td key={h} className="px-3 py-1.5 text-immo-text-primary">{(r as Record<string, string>)[h] || '—'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-immo-border-default pt-4">
              <Button variant="ghost" onClick={() => { reset(); onClose() }} className="text-immo-text-secondary">Annuler</Button>
              <Button onClick={handleImport} disabled={rows.length === 0 || importing} className="bg-immo-accent-green text-immo-bg-primary">
                {importing ? `Import en cours...` : `Importer ${rows.length} clients`}
              </Button>
            </div>
          </>
        )}

        {done && (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-immo-accent-green/10">
              <Check className="h-7 w-7 text-immo-accent-green" />
            </div>
            <h3 className="mt-4 text-base font-bold text-immo-text-primary">Import termine</h3>
            <p className="mt-1 text-sm text-immo-text-secondary">
              <span className="font-bold text-immo-accent-green">{done.ok}</span> reussis
              {done.failed > 0 && <>, <span className="font-bold text-[#CD3D64]">{done.failed}</span> en echec</>}
            </p>
            <Button onClick={() => { reset(); onClose() }} className="mt-5 bg-immo-accent-green text-immo-bg-primary">Fermer</Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
