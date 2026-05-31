# golden-paths.md — BookkeeperPortal

If you hit this situation, do exactly this. Each block is the non-obvious part only — standard boilerplate omitted.

## Supabase

- **Public upload page identifies client by `portal_token`, never `client_id`.** The token IS the auth. Query with `.eq('is_active', true).maybeSingle()`; null token → show 404 copy, not an error.
- **Uploads from public pages run as service role in an Edge Function** (`SERVICE_ROLE_KEY`, never anon). Validate the token exists before the insert:
  ```typescript
  const { data: client } = await supabaseAdmin.from('clients')
    .select('id, bookkeeper_id').eq('portal_token', token).maybeSingle()
  if (!client) throw new Error('Invalid token')
  // then insert into document_uploads with client.id + client.bookkeeper_id
  ```
- **Portal token = 12 chars from a URL-safe alphabet** via `crypto.getRandomValues` (~72 bits). Check uniqueness in DB; retry on collision.
- **Dashboard reads the `client_monthly_status` view, never N+1.** One query: `.eq('bookkeeper_id', uid).order('submission_status')` (incomplete first). Never fetch clients then loop for status.

## React

- **Every data component handles loading + error + empty — all three.** Skeleton on load, `ErrorState` with retry on error, `EmptyState` with a CTA when zero rows.
- **Zustand: always select a slice, never the bare store.**
  ```typescript
  const plan = useStore(state => state.bookkeeper?.plan)   // ✓
  const store = useStore()                                  // ✗ re-renders on any change
  ```
- **Status color/label = single source of truth.** Import `statusColors` / `statusLabels` maps keyed by `SubmissionStatus` (complete/partial/missing/not_started); never inline Tailwind classes per call site.
- **File upload reports progress** via Supabase Storage `upload(path, file, { onUploadProgress })`, converting `loaded/total` to a percent.

## Email (Resend)

- **Reminders send with the bookkeeper's `reply_to_email`, never a no-reply address** — client replies must reach the bookkeeper. `from: 'BookDrop <reminders@bookdrop.io>'`, `reply_to: bookkeeper.reply_to_email`.

## Reminder cron (Edge Function, 9am daily)

Match today's `day_of_month` against active `reminder_schedules`, then **skip** a client if either:
1. `reminder_log` already has a row for (client, period_year, period_month, reminder_number) — dedup, and
2. the client's submission for the period is already complete.

```typescript
const { data: schedules } = await supabaseAdmin.from('reminder_schedules')
  .select('*, clients(*, bookkeepers(*))')
  .eq('day_of_month', new Date().getDate()).eq('is_active', true)
for (const s of schedules) {
  if (await alreadySent(s)) continue          // reminder_log dedup
  if (await isComplete(s.client_id)) continue // don't nag a finished client
  await sendReminder(s, year, month)
}
```

## Stripe / plans

- **Enforce plan limits server-side on every mutation that can exceed them** — never trust client state. Read `plan` from `bookkeepers`, `null` limit = pro/unlimited, else count active clients and throw if `>= limit`.

## Dual-audience account type (runtime, never build-time)

- **Detect account type at runtime via `useAccountType()`, not a build-time `VITE_USER_TYPE`.** Reads `bookkeeper.account_type` (`'solo'` | `'practitioner'`), exposes `isSolo` / `selfClientId`. Route the dashboard through a wrapper component so it can call the hook:
  ```tsx
  function DashboardRouter() {
    const { isSolo } = useAccountType()
    return isSolo ? <BusinessOwnerDashboard /> : <DashboardPage />
  }
  ```
- **`signUpSolo` is a 4-step chain** so the solo user owns their own client row — all engines then work unchanged via `/clients/:self_client_id`:
  1. `auth.signUp`
  2. insert `bookkeepers` row with `account_type: 'solo'`
  3. insert a `clients` row for the user (self-client)
  4. update `bookkeepers.self_client_id` with the new client id

## ZIP download (client-side, JSZip)

Fetch each upload via a **1-hour signed URL**, add the blob to the zip under its original filename, then trigger a browser download. Name the file `{business}_{Month}_{Year}.zip`.

```typescript
await Promise.all(uploads.map(async (u) => {
  const { data } = await supabase.storage.from('documents')
    .createSignedUrl(u.storage_path, 3600)
  if (!data) return
  zip.file(u.filename_original, await (await fetch(data.signedUrl)).blob())
}))
const blob = await zip.generateAsync({ type: 'blob' })
// createObjectURL → anchor.click() → revokeObjectURL
```
