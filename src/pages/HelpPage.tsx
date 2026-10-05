import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronDown, ChevronRight, Upload, FileText, Bell,
  Archive, BarChart3, Camera, User,
} from 'lucide-react'

interface Section {
  title: string
  icon: typeof Upload
  content: React.ReactNode
}

const sections: Section[] = [
  {
    title: 'Getting Started (2 minutes)',
    icon: Upload,
    content: (
      <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
        <li>Click <strong>Add Client</strong> in the sidebar</li>
        <li>Enter your client's business name and email</li>
        <li>Choose which documents they need to submit each month (bank statements, credit card statements, receipts, payroll — check the ones that apply)</li>
        <li>Click Save — a unique portal link is created automatically</li>
        <li>Copy the portal link and send it to your client via email or text</li>
        <li>Done — when they upload, you'll see it on your dashboard</li>
      </ol>
    ),
  },
  {
    title: 'What Your Client Sees',
    icon: FileText,
    content: (
      <div className="space-y-3 text-sm text-gray-700">
        <p>When your client clicks the portal link:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>They see a simple upload page — no login required</li>
          <li>Each document type you selected shows as a row</li>
          <li>They drag and drop files or click to browse</li>
          <li>A green checkmark appears when each document is uploaded</li>
          <li>They can re-upload if they sent the wrong file</li>
        </ul>
        <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <strong>Tip:</strong> Send them the link with a message like "Please upload your [month] documents here: [link]"
        </p>
      </div>
    ),
  },
  {
    title: 'Checking Who\'s Submitted',
    icon: FileText,
    content: (
      <div className="space-y-2 text-sm text-gray-700">
        <p>Your dashboard shows every client with a color-coded status:</p>
        <ul className="space-y-1 pl-5">
          <li><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> <strong>Green</strong> = all required documents submitted</li>
          <li><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> <strong>Yellow</strong> = some documents submitted</li>
          <li><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> <strong>Red</strong> = nothing submitted yet</li>
        </ul>
        <p>Use the month selector at the top to switch between months.</p>
      </div>
    ),
  },
  {
    title: 'Sending Reminders',
    icon: Bell,
    content: (
      <div className="space-y-2 text-sm text-gray-700">
        <p>Go to any client's detail page and click <strong>Send Reminder</strong>.</p>
        <p>Reminders are also sent automatically on the schedule you set when adding the client (default: day 1, 5, and 10 of the month).</p>
        <p>Reminders only go to clients who haven't completed their uploads.</p>
      </div>
    ),
  },
  {
    title: 'Downloading Files',
    icon: Archive,
    content: (
      <div className="space-y-2 text-sm text-gray-700">
        <p>Go to a client's detail page → click <strong>Download ZIP</strong>.</p>
        <p>This downloads all uploaded files for the selected month as one ZIP file. File names match what your client uploaded.</p>
      </div>
    ),
  },
  {
    title: 'Analyzing Statements',
    icon: BarChart3,
    content: (
      <div className="space-y-3 text-sm text-gray-700">
        <p>After your client uploads bank statements:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Go to their detail page → Analysis tab → Statement Parser</li>
          <li>Click "Parse All Uploads" — this reads the PDF and extracts transactions</li>
          <li>Once parsed, other analysis tools unlock:</li>
        </ol>
        <ul className="list-disc space-y-1 pl-8">
          <li><strong>Auto-Categorization:</strong> sorts transactions into IRS categories</li>
          <li><strong>Smart Analysis:</strong> flags business/personal mix-ups and unusual transactions</li>
          <li><strong>Cash Flow Forecast:</strong> projects next month's cash position</li>
          <li><strong>Trends:</strong> month-over-month spending patterns</li>
          <li><strong>Export:</strong> QuickBooks, Xero, CSV formats</li>
        </ul>
      </div>
    ),
  },
  {
    title: 'Receipt Scanner',
    icon: Camera,
    content: (
      <div className="space-y-2 text-sm text-gray-700">
        <p>Go to a client's detail page → Analysis tab → Receipt Scanner.</p>
        <p>Click "Scan Receipt" and take a photo or upload an image.</p>
        <p>The scanner reads the receipt and extracts: vendor, amount, date, category. Review the extracted data, then export as CSV.</p>
      </div>
    ),
  },
  {
    title: 'For Solo Business Owners',
    icon: User,
    content: (
      <div className="space-y-2 text-sm text-gray-700">
        <p>If you signed up as a Business Owner (not a Bookkeeper):</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your sidebar shows "My Business" instead of "Clients"</li>
          <li>Click "My Business" to see your own analysis dashboard</li>
          <li>Upload your own bank statements, receipts, and documents</li>
          <li>Use the Receipt Scanner and all analysis tools</li>
          <li>Everything works the same — you're both the bookkeeper and the client</li>
        </ul>
      </div>
    ),
  },
]

export function HelpPage() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]))

  const toggle = (index: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Help & Getting Started</h1>
      <p className="mt-1 text-sm text-gray-500">
        Step-by-step guides for every feature. Click a section to expand.
      </p>

      <div className="mt-6 space-y-2">
        {sections.map((section, i) => {
          const isOpen = expanded.has(i)
          const Icon = section.icon
          return (
            <div key={i} className="rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => toggle(i)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                )}
                <Icon className={cn('h-4 w-4 shrink-0', isOpen ? 'text-primary' : 'text-gray-400')} />
                <span className={cn('text-sm font-medium', isOpen ? 'text-gray-900' : 'text-gray-700')}>
                  {section.title}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 px-11 pb-4 pt-3">
                  {section.content}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
