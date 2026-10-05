import { useCallback, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Upload } from 'lucide-react'

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  accept?: string
  className?: string
}

export function FileDropzone({ onFilesSelected, disabled, accept, className }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) onFilesSelected(files)
  }, [disabled, onFilesSelected])

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) onFilesSelected(files)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }, [onFilesSelected])

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-gray-300 hover:border-primary/50 hover:bg-gray-50',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Upload className="mb-2 h-8 w-8 text-gray-400" />
      <p className="text-sm font-medium text-gray-600">
        Drop file here or <span className="text-primary underline">browse</span>
      </p>
      <p className="mt-1 text-xs text-gray-400">PDF, JPG, PNG, Excel — up to 25 MB</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept ?? '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.doc,.docx'}
        onChange={handleInputChange}
        disabled={disabled}
      />
    </div>
  )
}
