# golden-paths.md — BookDrop
## Hit this situation → do exactly this. Snippets ARE the rule.

Patterns with a canonical implementation in `src/` are referenced by file, not inlined.

---

## SUPABASE

**Public upload page auth = `portal_token`, never `client_id`.** The token IS the auth.
```typescript
const { data: client } = await supabase
  .from('clients')
  .select('*, document_requirements(*)')
  .eq('portal_token', token).eq('is_active', true)
  .maybeSingle()
if (!client) return { error: 'Portal link not found or expired' } // 404, not error
```

**Public-page writes use the service-role key in a server fn, never the anon client.** Validate the token, then insert with `bookkeeper_id` from the looked-up client. See `api/notify-upload.ts`, `src/lib/db.ts`.

**Dashboard data: query the view, never N+1.** `client_monthly_status` view joins status in one round-trip; order by `submission_status` to show incomplete first.

**Portal token: 12 chars URL-safe (~72 bits), check-unique-then-retry.** Canonical: `generatePortalToken()` in `src/lib/utils.ts`.

---

## REACT

**Every data component handles all three states: loading / error / empty.** Skeleton → `ErrorState` (with retry) → `EmptyState` (with CTA) → data.

**Zustand: always select, never bare.**
```typescript
const plan = useStore(s => s.bookkeeper?.plan)   // ✓
const store = useStore(); store.bookkeeper?.plan  // ✗ re-renders on any change
```

**Status colors/labels: single source of truth.** Canonical: `StatusBadge` in `src/components/practitioner/StatusBadge.tsx`. Import it; don't re-map colors locally.

---

## EMAIL (Resend)

**Always set `reply_to` to the bookkeeper — never a no-reply address.** Client replies must reach the practitioner.
```typescript
await resend.emails.send({
  from: 'BookDrop <reminders@bookdrop.io>',
  reply_to: bookkeeper.reply_to_email,
  to: client.contact_email,
  subject: `Your ${monthName} documents — due ${dueDate}`,
  html,
})
```

---

## REMINDER CRON

**Dedup before send.** Two gates, both required: (1) skip if a `reminder_log` row already exists for this client+year+month+reminder_number; (2) skip if the client's submission is already complete. Canonical: `api/cron/auto-reminders.ts`.
```typescript
// pseudo: for each schedule matching today's day_of_month + is_active
if (await alreadySentThisMonth(...)) continue
if (await clientComplete(...)) continue
await sendReminder(schedule, year, month)
```

---

## STRIPE / PLAN LIMITS

**Enforce plan limits server-side. Never trust client state.** One helper, used by every client-creating mutation:
```typescript
async function assertPlanLimit(bookkeeperId: string) {
  const { data: bk } = await supabaseAdmin.from('bookkeepers')
    .select('plan').eq('id', bookkeeperId).single()
  const limit = planLimits[bk.plan as Plan]
  if (limit === null) return                       // pro = unlimited
  const { count } = await supabaseAdmin.from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('bookkeeper_id', bookkeeperId).eq('is_active', true)
  if ((count ?? 0) >= limit) throw new Error('Plan limit reached. Upgrade to add more clients.')
}
```

---

## DUAL-AUDIENCE (practitioner vs solo)

**Detect account type at runtime, never build-time.** Canonical: `useAccountType()` in `src/hooks/useAccountType.ts` → `{ isSolo, isPractitioner, selfClientId, businessName }`. Use it in components, NOT the deprecated build-time `mode.ts` flag.

**Dashboard routing is a runtime component**, not a build switch:
```tsx
function DashboardRouter() {
  const { isSolo } = useAccountType()
  return isSolo ? <BusinessOwnerDashboard /> : <DashboardPage />
}
```

**`signUpSolo` = 4 steps: auth → bookkeeper(account_type=solo) → client → link back.** The solo user owns their own `clients` row, so all 16 engines work unchanged via `/clients/:self_client_id`. Canonical: `src/stores/auth.store.ts`.

---

## ZIP DOWNLOAD

**Client-side via JSZip + 1-hour signed URLs.** Fetch each file by signed URL, add to zip, generate blob, trigger download. Filename = `{business}_{Month}_{year}.zip`. Canonical: `src/lib/download-zip.ts`.

---

## PROVENANCE (AI claims)

**Every AI-derived number/label exposes its source.** Wrap with `<Provenance>` from `src/components/shared/Provenance.tsx`. Aggregates stay LOCKED until k=N — never render a cross-firm number below threshold (`isLockedByThreshold`). Anti-fabrication invariant is unit-tested in `tests/provenance.test.ts`.
