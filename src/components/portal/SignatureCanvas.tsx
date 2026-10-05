import { useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { RotateCcw, PenLine } from 'lucide-react'

interface SignatureCanvasProps {
  onSignature: (dataUrl: string) => void
  disabled?: boolean
}

export function SignatureCanvas({ onSignature, disabled }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return
    e.preventDefault()
    setIsDrawing(true)
    lastPos.current = getPos(e)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !lastPos.current) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setHasSignature(true)
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    lastPos.current = null
    if (hasSignature) {
      const canvas = canvasRef.current
      if (canvas) onSignature(canvas.toDataURL('image/png'))
    }
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  return (
    <div className="space-y-2">
      <div className={cn(
        'relative rounded-lg border-2 border-dashed bg-white',
        disabled ? 'border-gray-200 opacity-50' : 'border-gray-300',
        isDrawing && 'border-primary',
      )}>
        <canvas
          ref={canvasRef}
          width={500}
          height={120}
          className="w-full touch-none rounded-lg"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ cursor: disabled ? 'default' : 'crosshair' }}
        />
        {!hasSignature && !disabled && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <PenLine className="h-4 w-4" />
              Sign here
            </div>
          </div>
        )}
      </div>
      {hasSignature && !disabled && (
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <RotateCcw className="h-3 w-3" />
          Clear and redo
        </button>
      )}
    </div>
  )
}
