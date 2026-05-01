import { useState, useRef } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

interface ImageUploaderProps {
  /** Current image URL */
  value?: string
  /** Callback with the public URL */
  onChange: (url: string) => void
  /** Label displayed */
  label?: string
  /** Accept multiple files */
  multiple?: boolean
  /** Callback for multiple URLs */
  onMultiple?: (urls: string[]) => void
}

export function ImageUploader({ value, onChange, label, multiple = false, onMultiple }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const tenantId = useAuthStore(s => s.tenantId)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    setUploading(true)
    const urls: string[] = []

    try {
      let failures = 0
      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // Validate by MIME first.
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          toast.error(`${file.name} : type non supporté`)
          failures++
          continue
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB max
          toast.error(`${file.name} : taille max 10MB`)
          failures++
          continue
        }

        // Audit (LOW): client-side MIME check is spoofable. Cross-
        // check with the file's magic bytes so a renamed .exe → .png
        // gets rejected before upload.
        const okMagic = await verifyMagicBytes(file)
        if (!okMagic) {
          toast.error(`${file.name} : contenu non reconnu (image/vidéo)`)
          failures++
          continue
        }

        // Tenant-scoped path. Refuse to upload without tenant context
        // so we never write to a shared `public/` prefix.
        if (!tenantId) {
          toast.error('Session expirée — veuillez vous reconnecter')
          failures++
          continue
        }
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error } = await supabase.storage
          .from('landing-assets')
          .upload(path, file, { contentType: file.type })

        if (error) {
          toast.error(`Upload echoue: ${error.message}`)
          continue
        }

        const { data: urlData } = supabase.storage.from('landing-assets').getPublicUrl(path)
        urls.push(urlData.publicUrl)
      }

      if (urls.length > 0) {
        if (multiple && onMultiple) {
          onMultiple(urls)
        } else {
          onChange(urls[0])
        }
        toast.success(`${urls.length} fichier${urls.length > 1 ? 's' : ''} uploadé${urls.length > 1 ? 's' : ''}${failures > 0 ? ` (${failures} échec${failures > 1 ? 's' : ''})` : ''}`)
      }
    } catch (err) {
      toast.error('Erreur lors de l\'upload')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      {label && <p className="mb-1 text-[10px] font-medium text-immo-text-muted">{label}</p>}

      {/* Preview */}
      {value && !multiple && (
        <div className="relative mb-2 inline-block">
          {value.match(/\.(mp4|webm|mov)$/i) ? (
            <video src={value} className="h-20 rounded-lg object-cover" controls />
          ) : (
            <img src={value} alt="" className="h-20 rounded-lg object-cover" />
          )}
          <button
            onClick={() => onChange('')}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-immo-status-red text-white shadow"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 rounded-lg border border-dashed border-immo-border-default bg-immo-bg-primary px-4 py-3 text-xs text-immo-text-muted transition-colors hover:border-immo-accent-green hover:text-immo-accent-green"
      >
        {uploading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Upload en cours...</>
        ) : (
          <><Upload className="h-4 w-4" /> {multiple ? 'Uploader des fichiers' : 'Uploader un fichier'}</>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/webm"
        multiple={multiple}
        onChange={e => handleFiles(e.target.files)}
        className="hidden"
      />

      <p className="mt-1 text-[9px] text-immo-text-muted">Max 10MB par fichier. Images : JPG, PNG, WebP. Vidéos : MP4, WebM.</p>
    </div>
  )
}

// Magic-byte signatures for the image / video formats we accept.
// Reference: https://en.wikipedia.org/wiki/List_of_file_signatures
const MAGIC_SIGNATURES: Array<{ bytes: number[]; offset?: number }> = [
  { bytes: [0xFF, 0xD8, 0xFF] },                          // JPEG
  { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }, // PNG
  { bytes: [0x47, 0x49, 0x46, 0x38] },                    // GIF
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },         // RIFF (WebP / WAV) — we double-check WEBP below
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },         // ftyp box (MP4 / MOV / generic ISO BMFF)
  { bytes: [0x1A, 0x45, 0xDF, 0xA3] },                    // WebM / Matroska
]

async function verifyMagicBytes(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 16)
    const buf = await slice.arrayBuffer()
    const bytes = new Uint8Array(buf)
    for (const sig of MAGIC_SIGNATURES) {
      const off = sig.offset ?? 0
      let match = true
      for (let i = 0; i < sig.bytes.length; i++) {
        if (bytes[off + i] !== sig.bytes[i]) { match = false; break }
      }
      if (match) {
        // RIFF: also require WEBP marker at offset 8 to exclude WAV.
        if (sig.bytes[0] === 0x52 && sig.bytes[1] === 0x49) {
          const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
          if (!isWebp) continue
        }
        return true
      }
    }
    return false
  } catch {
    // Reading failed — fail closed.
    return false
  }
}
