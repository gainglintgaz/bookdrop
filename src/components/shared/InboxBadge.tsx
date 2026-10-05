// src/components/shared/InboxBadge.tsx
// Small red badge showing unread message count. Renders nothing when count is 0.

interface InboxBadgeProps {
  count: number
}

export function InboxBadge({ count }: InboxBadgeProps) {
  if (count <= 0) return null

  const display = count > 9 ? '9+' : String(count)

  return (
    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">
      {display}
    </span>
  )
}
