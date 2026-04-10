import { formatPeriod } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MonthSelectorProps {
  year: number
  month: number
  onChange: (period: { year: number; month: number }) => void
}

export function MonthSelector({ year, month, onChange }: MonthSelectorProps) {
  const goBack = () => {
    if (month === 1) {
      onChange({ year: year - 1, month: 12 })
    } else {
      onChange({ year, month: month - 1 })
    }
  }

  const goForward = () => {
    if (month === 12) {
      onChange({ year: year + 1, month: 1 })
    } else {
      onChange({ year, month: month + 1 })
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={goBack}
        className={cn(
          'rounded-md border border-gray-200 p-1.5 hover:bg-gray-100',
        )}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4 text-gray-600" />
      </button>
      <span className="min-w-[140px] text-center text-sm font-medium text-gray-900">
        {formatPeriod(year, month)}
      </span>
      <button
        onClick={goForward}
        className={cn(
          'rounded-md border border-gray-200 p-1.5 hover:bg-gray-100',
        )}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4 text-gray-600" />
      </button>
    </div>
  )
}
