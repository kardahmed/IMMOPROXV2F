import { useState, useRef } from 'react'
import { Upload } from 'lucide-react'
import { compressImage } from '@/lib/imageCompression'
import toast from 'react-hot-toast'

interface Props {
  onFilesSelected: (files: File[]) => void
  accept?: string
  multiple?: boolean
  maxSizeMB?: number
  label?: string
  compact?: boolean
}

export function DragDropZone({ onFilesSelected, accept = '*', multiple = true, maxSizeMB = 10, label, compact }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFiles(fileList: FileList | null) {
    if (!fileList) return
    const files: File[] = []

    for (const file of Array.from(fileList)) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`${file.name} depasse ${maxSizeMB}MB`)
        continue
      }
      // Auto-compress images
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file)
        files.push(compressed)
      } else {
        files.push(file)
      }
    }

    if (files.length > 0) onFilesSelected(files)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    processFiles(e.dataTransfer.files)
  }

  if (compact) {
    return (
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-immo-border-default px-3 py-2 text-xs text-immo-text-muted transition-colors hover:border-immo-accent-blue hover:bg-immo-accent-blue/5">
        <Upload className="h-3.5 w-3.5" />
        {label ?? 'Ajouter un fichier'}
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={e => processFiles(e.target.files)} className="hidden" />
      </label>
    )
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 transition-all ${
        dragging ? 'border-immo-accent-blue bg-immo-accent-blue/5 scale-[1.01]' : 'border-immo-border-default hover:border-immo-accent-blue/40'
      }`}
    >
      <Upload className={`h-6 w-6 ${dragging ? 'text-immo-accent-blue' : 'text-immo-text-muted'}`} />
      <p className="text-xs text-immo-text-muted">
        {dragging ? 'Deposez ici' : label ?? 'Glissez vos fichiers ici ou cliquez pour parcourir'}
      </p>
      <p className="text-[10px] text-immo-text-muted">Max {maxSizeMB}MB · Images auto-compressees</p>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={e => processFiles(e.target.files)} className="hidden" />
    </div>
  )
}
