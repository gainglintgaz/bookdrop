# golden-paths.md — BookkeeperPortal
## If you hit this situation, do exactly this. No exceptions.

---

## SUPABASE PATTERNS

### Fetching client requirements for upload page (public, no auth)
```typescript
// Always use portal_token to identify client — never client_id directly
// portal_token IS the authentication for the client upload page
const { data: client } = await supabase
  .from('clients')
  .select('*, document_requirements(*)')
  .eq('portal_token', token)
  .eq('is_active', true)
  .maybeSingle()

if (!client) {
  // Token not found or client deactivated — show 404 not error
  return { error: 'Portal link not found or expired' }
}
```

### Inserting a file upload (service role in Edge Function)
```typescript
// NEVER use authenticated client for uploads from public pages
// Always use service role key in Edge Function
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service role — not anon
)

// Validate token before allowing upload
const { data: client } = await supabaseAdmin
  .from('clients')
  .select('id, bookkeeper_id')
  .eq('portal_token', token)
  .maybeSingle()

if (!client) throw new Error('Invalid token')

// Now safe to insert
await supabaseAdmin.from('document_uploads').insert({
  requirement_id: requirementId,
  client_id: client.id,
  bookkeeper_id: client.bookkeeper_id,
  // ... rest of fields
})
```

### Generating portal token (unique, URL-safe, high entropy)
```typescript
// In a Supabase Edge Function or API route
function generatePortalToken(): string {
  // 12 chars from URL-safe alphabet = ~72 bits entropy
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const array = new Uint8Array(12)
  crypto.getRandomValues(array)
  return Array.from(array)
    .map(b => chars[b % chars.length])
    .join('')
}
// Check unique in DB before returning — retry if collision (vanishingly rare)
```

### Fetching dashboard data (bookkeeper — authenticated)
```typescript
// Get all clients with current month status in one query
const { data: clients } = await supabase
  .from('client_monthly_status') // use the view
  .select('*')
  .eq('bookkeeper_id', session.user.id)
  .order('submission_status', { ascending: true }) // show incomplete first

// Never fetch clients then loop to get status — use the view
```

### Plan limit check before adding client
```typescript
import { usePlanLimit } from '@/lib/tenant.config'

async function checkCanAddClient(bookkeeperId: string, plan: Plan): Promise<boolean> {
  const limit = usePlanLimit(plan)
  if (limit === null) return true // pro = unlimited

  const { count } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('bookkeeper_id', bookkeeperId)
    .eq('is_active', true)

  return (count ?? 0) < limit
}
```

---

## REACT PATTERNS

### Loading + error + empty states — always all three
```tsx
// Every list/data component needs all three states handled
function ClientList() {
  const { clients, loading, error } = useClients()

  if (loading) return <ClientListSkeleton />
  if (error) return <ErrorState message={error.message} retry={refetch} />
  if (clients.length === 0) return <EmptyState
    title="No clients yet"
    description="Add your first client to get started."
    action={<Button onClick={openAddClient}>Add client</Button>}
  />

  return <>{clients.map(c => <ClientRow key={c.id} client={c} />)}</>
}
```

### Zustand store — always use selectors
```typescript
// ✓ Correct
const plan = useStore(state => state.bookkeeper?.plan)
const clientCount = useStore(state => state.clients.length)

// ✗ Wrong — causes unnecessary re-renders
const store = useStore()
const plan = store.bookkeeper?.plan
```

### File upload with progress
```typescript
// Supabase Storage upload with progress tracking
async function uploadFile(file: File, path: string, onProgress: (pct: number) => void) {
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(path, file, {
      onUploadProgress: ({ loaded, total }) => {
        onProgress(Math.round((loaded / total) * 100))
      }
    })

  if (error) throw error
  return data
}
```

### Submission status color
```typescript
// Single source of truth for status colors — import this everywhere
export const statusColors: Record<SubmissionStatus, string> = {
  complete: 'text-green-700 bg-green-50 border-green-200',
  partial: 'text-amber-700 bg-amber-50 border-amber-200',
  missing: 'text-red-700 bg-red-50 border-red-200',
  not_started: 'text-gray-600 bg-gray-50 border-gray-200',
}

export const statusLabels: Record<SubmissionStatus, string> = {
  complete: '✓ Complete',
  partial: '↗ Partial',
  missing: '⚠ Missing',
  not_started: '○ Not started',
}
```

---

## EMAIL PATTERNS

### Resend with bookkeeper's reply-to (critical — never use no-reply)
```typescript
import { Resend } from 'resend'
const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

await resend.emails.send({
  from: 'BookDrop <reminders@bookdrop.io>',
  reply_to: bookkeeper.reply_to_email, // client replies go to bookkeeper
  to: client.contact_email,
  subject: `Your ${monthName} documents — due ${dueDate}`,
  react: ReminderEmail({ ... }),
})
```

---

## REMINDER CRON LOGIC

```typescript
// Edge Function: send-reminders
// Runs at 9am daily via Supabase cron
// Checks if today matches any reminder schedule day
// Sends only to clients whose submission is not complete

const today = new Date()
const dayOfMonth = today.getDate()
const year = today.getFullYear()
const month = today.getMonth() + 1

// Get all active reminder schedules for today
const { data: schedules } = await supabaseAdmin
  .from('reminder_schedules')
  .select('*, clients(*, bookkeepers(*))')
  .eq('day_of_month', dayOfMonth)
  .eq('is_active', true)

for (const schedule of schedules) {
  // Check if already sent this reminder this month
  const { data: alreadySent } = await supabaseAdmin
    .from('reminder_log')
    .select('id')
    .eq('client_id', schedule.client_id)
    .eq('period_year', year)
    .eq('period_month', month)
    .eq('reminder_number', schedule.reminder_number)
    .maybeSingle()

  if (alreadySent) continue

  // Check if client has already submitted everything
  // (don't send reminder to client who already submitted)
  const isComplete = await checkClientComplete(schedule.client_id, year, month)
  if (isComplete) continue

  // Send the reminder
  await sendReminder(schedule, year, month)
}
```

---

## STRIPE PATTERNS

### Plan enforcement at API level
```typescript
// Always check plan server-side — never trust client-side plan state
// Add this check to any mutation that could exceed plan limits
async function assertPlanLimit(bookkeeperId: string): Promise<void> {
  const { data: bk } = await supabaseAdmin
    .from('bookkeepers')
    .select('plan')
    .eq('id', bookkeeperId)
    .single()

  const limit = planLimits[bk.plan as Plan]
  if (limit === null) return // pro = unlimited

  const { count } = await supabaseAdmin
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('bookkeeper_id', bookkeeperId)
    .eq('is_active', true)

  if ((count ?? 0) >= limit) {
    throw new Error(`Plan limit reached. Upgrade to add more clients.`)
  }
}
```

---

## DUAL-AUDIENCE ACCOUNT TYPE PATTERNS

### Runtime account type detection (replaces build-time VITE_USER_TYPE)
```typescript
// src/hooks/useAccountType.ts
import { useAuthStore } from '@/stores/auth.store'

export function useAccountType() {
  const bookkeeper = useAuthStore(state => state.bookkeeper)
  return {
    accountType: bookkeeper?.account_type ?? 'practitioner',
    isPractitioner: bookkeeper?.account_type !== 'solo',
    isSolo: bookkeeper?.account_type === 'solo',
    selfClientId: bookkeeper?.self_client_id ?? null,
    businessName: bookkeeper?.business_name ?? null,
  }
}

// In components: use this, NOT the build-time isBusinessOwnerMode from mode.ts
// const { isSolo, selfClientId } = useAccountType()
```

### Runtime dashboard routing (never build-time)
```tsx
// In App.tsx — wraps dashboard in a component so it can use the hook
function DashboardRouter() {
  const { isSolo } = useAccountType()
  return isSolo ? <BusinessOwnerDashboard /> : <DashboardPage />
}

// Then in routes:
// <Route path="/dashboard" element={<DashboardRouter />} />
```

### signUpSolo — 3-step pattern (auth → bookkeeper → client → link)
```typescript
// api/auth.store.ts
signUpSolo: async (email, password, fullName, businessName) => {
  // 1. Create auth user
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: error.message }

  // 2. Create bookkeeper row with account_type = 'solo'
  await supabase.from('bookkeepers').insert({
    id: data.user.id, email, full_name: fullName,
    account_type: 'solo', business_name: businessName,
    practice_name: '', reply_to_email: email,
  })

  // 3. Auto-create client row (solo user IS their own client)
  const { data: clientRow } = await supabase
    .from('clients')
    .insert({ bookkeeper_id: data.user.id, business_name: businessName,
              contact_name: fullName, contact_email: email,
              portal_token: generatePortalToken() })
    .select('id').single()

  // 4. Link self_client_id back to bookkeeper row
  await supabase.from('bookkeepers')
    .update({ self_client_id: clientRow.id })
    .eq('id', data.user.id)
}
// Result: solo user owns their own client row — all 16 engines work unchanged
// via /clients/:self_client_id — no engine code needs to change
```

---

## ZIP DOWNLOAD PATTERN

```typescript
import JSZip from 'jszip'

async function downloadClientMonth(
  client: Client,
  year: number,
  month: number,
  uploads: DocumentUpload[]
) {
  const zip = new JSZip()

  // Fetch each file via signed URL and add to zip
  await Promise.all(uploads.map(async (upload) => {
    const { data: signedUrl } = await supabase.storage
      .from('documents')
      .createSignedUrl(upload.storage_path, 3600) // 1 hour expiry

    if (!signedUrl) return

    const response = await fetch(signedUrl.signedUrl)
    const blob = await response.blob()
    zip.file(upload.filename_original, blob)
  }))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' })
  const filename = `${client.business_name.replace(/\s+/g, '_')}_${monthName}_${year}.zip`

  // Trigger browser download
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```
