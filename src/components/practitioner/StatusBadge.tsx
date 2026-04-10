import { cn } from '@/lib/utils'
import type { SubmissionStatus } from '@/types'

interface StatusBadgeProps {
  status: SubmissionStatus
  className?: string
}

const statusConfig: Record<SubmissionStatus, { label: string; classes: string }> = {
  complete: { label: 'Complete', classes: 'bg-success/10 text-success border-success/20' },
  partial: { label: 'Partial', classes: 'bg-warning/10 text-warning border-warning/20' },
  missing: { label: 'Missing', classes: 'bg-danger/10 text-danger border-danger/20' },
  not_started: { label: 'Not Started', classes: 'bg-gray-100 text-gray-500 border-gray-200' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.classes,
        className,
      )}
    >
      {config.label}
    </span>
  )
}
