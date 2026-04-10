import { cn } from '@/lib/utils'

interface ErrorStateProps {
  message: string
  className?: string
  onRetry?: () => void
}

export function ErrorState({ message, className, onRetry }: ErrorStateProps) {
  return (
    <div className={cn('rounded-lg border border-danger/20 bg-danger/5 p-6 text-center', className)}>
      <p className="text-danger font-medium">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
