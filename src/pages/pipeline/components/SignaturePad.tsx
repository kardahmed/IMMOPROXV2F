import { useRef, useState, useEffect } from 'react'
import { Eraser, Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onSave: (dataUrl: string) => void
  onCancel: () => void
  width?: number
  height?: number
}

export function SignaturePad({ onSave, onCancel, width = 500, height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#0A2540'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [width, height])

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    setDrawing(true)
    setHasDrawn(true)
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  function endDraw() {
    setDrawing(false)
  }

  function clear() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    setHasDrawn(false)
  }

  function save() {
    if (!canvasRef.current || !hasDrawn) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-immo-text-secondary">Signez dans la zone ci-dessous</p>

      <div className="rounded-lg border-2 border-dashed border-immo-border-default bg-white p-1">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={clear} size="sm" className="border border-immo-border-default bg-transparent text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
            <Eraser className="me-1 h-3 w-3" /> Effacer
          </Button>
          <Button onClick={() => { clear(); onCancel() }} size="sm" className="border border-immo-border-default bg-transparent text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
            <RotateCcw className="me-1 h-3 w-3" /> Annuler
          </Button>
        </div>
        <Button onClick={save} disabled={!hasDrawn} size="sm" className="bg-immo-accent-green text-xs text-white disabled:opacity-50">
          <Check className="me-1 h-3 w-3" /> Valider la signature
        </Button>
      </div>
    </div>
  )
}
