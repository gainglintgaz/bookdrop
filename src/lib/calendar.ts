// src/lib/calendar.ts
// Generate .ics calendar files for upload deadlines.
// Works with Outlook, Google Calendar, Apple Calendar, and any .ics-compatible app.

export function generateUploadDeadlineICS(
  clientName: string,
  deadline: Date,
  note = 'Upload monthly documents for bookkeeping',
): void {
  const pad = (n: number) => String(n).padStart(2, '0')

  const formatDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`

  const start = formatDate(deadline)
  const endDate = new Date(deadline.getTime() + 60 * 60 * 1000) // 1 hour event
  const end = formatDate(endDate)
  const now = formatDate(new Date())
  const uid = `bookdrop-${clientName.replace(/\s+/g, '-').toLowerCase()}-${deadline.getTime()}@bookdrop.io`

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BookDrop//Upload Deadline//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:Upload documents — ${clientName}`,
    `DESCRIPTION:${note.replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${clientName} documents due tomorrow`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${clientName.replace(/\s+/g, '_')}_upload_deadline.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Generate the next upload deadline date for a given due day of month */
export function getNextDeadline(dueDay: number = 5): Date {
  const now = new Date()
  const deadline = new Date(now.getFullYear(), now.getMonth(), dueDay, 9, 0, 0)

  // If we're past this month's deadline, use next month
  if (now > deadline) {
    deadline.setMonth(deadline.getMonth() + 1)
  }

  return deadline
}
