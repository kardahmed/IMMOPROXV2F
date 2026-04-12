/**
 * Compress an image file before uploading to Supabase Storage.
 * Returns a new File with reduced size.
 */
export async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File> {
  // Skip non-images or small files (< 200KB)
  if (!file.type.startsWith('image/') || file.size < 200 * 1024) return file
  // Skip SVGs (can't compress)
  if (file.type === 'image/svg+xml') return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate dimensions
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round(height * (maxWidth / width))
        width = maxWidth
      }

      // Draw on canvas
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return }
          const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })
          console.log(`[ImageCompression] ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (${Math.round((1 - compressed.size / file.size) * 100)}% saved)`)
          resolve(compressed)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
