# BookDrop Phase 0–2 Design — Line truth + magic-link confirm (auditable)

> **Status:** APPROVED TO BUILD (Victor 2026-07-11)  
> **Phases:** 0 Honesty · 1 Line table + write path · 2 Portal confirm UX  
> **Out of scope until later phase:** Client Supabase accounts (Phase “Accounts” — separate)  
> **Playbooks:** Phase 4 only (after 0–2)

---

## 1. Decisions locked

| # | Decision | Choice |
|---|---|---|
| D2 | Client identity for confirm | **Magic-link only** (`portal_token`). No client Auth accounts in 0–2. |
| D3 | Line storage | **Real table** `document_line_items` (not JSON-only). Summaries remain denormalized on upload for dashboards. |
| D4 | Playbooks | **After** Phase 2 (Phase 4). |
| D5 | Auditability | Every suggestion/confirm/correct is **append-friendly evidence**: who/what/when/from which upload/line/source_kind. |
| D6 | Client accounts | **Separate later phase** — does not block 0–2. |

---

## 2. What “auditable / two-way traceable” means here

Borrow **patterns** from FinKeel (`sourceProvenance`: `source_kind`, `source_id`, drillable evidence) and BookDrop’s existing `ProvenanceData` / `categorization_corrections` (never delete corrections).

### Two-way loop

```text
DOCUMENT (upload + storage path)
    ↓ parse/categorize (source_kind = statement_parse | pdf_parse | csv_import)
LINE (document_line_items)  ←──→  PROVENANCE fields on line
    ↓ human act
CONFIRM / CORRECT event (portal_line_events)  ←──→  line_id + actor + at
    ↓
CORRECTION row (categorization_corrections) when category changes
    ↓ next upload
LEARNED suggestion cites prior correction_id (source_kind = correction)
```

**Forward:** document → lines → events → corrections.  
**Backward:** any category on screen → citation → line → upload → file.  
**No orphan AI claims:** if engine cannot cite upload/line/rule, do not show a confident number.

### Magic-link actor (no account)

We cannot claim “Maria Rodriguez logged in.” We **can** prove:

| Evidence field | Meaning |
|---|---|
| `portal_token_fingerprint` | SHA-256 of token (not raw token in audit tables) |
| `confirmed_at` | Server time of action |
| `user_agent` / `ip_hash` optional | Abuse investigation only; not required for product truth |
| `upload_id` + `line_id` | Exact rows touched |
| `before_category` / `after_category` | Diff |
| `event_type` | `view_confirm_ui` \| `accept` \| `change` \| `reject_file` |

Optional later (same phase or 2b): **short-lived confirm session** (`portal_confirm_sessions`: nonce, expires_at, rate limit).

---

## 3. Schema (Phase 1 migration)

### 3.1 `document_line_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| upload_id | uuid FK → document_uploads ON DELETE CASCADE | |
| client_id | uuid FK | denorm for RLS/query |
| bookkeeper_id | uuid FK | denorm for RLS |
| line_index | int | 0-based order in statement |
| txn_date | date null | |
| description_raw | text | full from parse |
| description_display | text | may truncate for UI |
| amount_cents | bigint not null | money rule |
| amount_sign | text check credit/debit | |
| suggested_category | text | engine output |
| suggested_subcategory | text null | |
| confidence | text check high/medium/low | |
| matched_vendor | text null | |
| final_category | text null | set on confirm/correct |
| final_subcategory | text null | |
| confirmed_by | text null check client_portal \| bookkeeper \| null | |
| confirmed_at | timestamptz null | |
| source_kind | text not null default 'statement_parse' | FinKeel-style |
| source_rule | text null | e.g. vendor key |
| content_hash | text null | dedup within upload |
| engine_version | text null | e.g. categorize-v1 |
| created_at | timestamptz default now() | |
| UNIQUE (upload_id, line_index) | | |

**RLS:** bookkeeper_id = auth.uid() for authenticated.  
**Public portal:** no direct client SELECT all lines via anon — use **Edge Function / RPC** with portal_token validation (service role) for confirm flow. Demo mode: local/demo store.

### 3.2 `portal_line_events` (append-only audit)

| Column | Type |
|---|---|
| id | uuid PK |
| line_id | uuid FK null if event is upload-level |
| upload_id | uuid FK |
| client_id | uuid |
| bookkeeper_id | uuid |
| event_type | text |
| before_category | text null |
| after_category | text null |
| portal_token_fingerprint | text not null |
| recorded_at | timestamptz default now() |
| meta | jsonb | optional { filename, line_index } — no secrets |

**No UPDATE/DELETE** for app roles (append-only).

### 3.3 Extend `categorization_corrections`

Add (if missing):

- `line_id` uuid FK null  
- `actor` text check bookkeeper \| client_portal  
- `portal_token_fingerprint` text null  

### 3.4 Upload-level confirm (existing)

Keep `document_uploads.client_confirmed_at` = when **all required low-conf lines** for that upload are confirmed (or policy says none required).

---

## 4. Phase breakdown

### Phase 0 — Honesty (no fake Run)

- Workflow card: **Run** only if `status === 'live'`.  
- Stub: no executor call that fakes success.  
- Copy: live count accurate.  
- Docs: PROGRESS note.

### Phase 1 — Line table + write path

1. Migration 009 as above.  
2. `autoCategorizeUpload` returns `lines[]` (mapped from categorize report + parse).  
3. After upload: insert lines (cloud) / demo in-memory or localStorage keyed by upload id.  
4. ExceptionsQueue / bookkeeper UI prefers **real lines** where `confidence = low` or unconfirmed; fallback message if old uploads have summaries only: “Re-upload or re-parse to get line-level review.”  
5. Provenance on each line: source_kind + rule/vendor citation.  
6. Tests: insert lines, uniqueness, correction links to line_id.

### Phase 2 — Magic-link confirm UX

1. Portal section after bank/CC categorize: list low-conf (or policy-all) lines.  
2. Actions: Accept suggested · Change category · (optional) Skip only if policy allows.  
3. Each action: write `portal_line_events` + update line final_* + optional correction row.  
4. When all required confirms done: set `client_confirmed_at`.  
5. UI shows bookkeeper: “Client confirmed at {time} via portal link (token fingerprint …short).”  
6. Rate limit: max N confirms per token per hour (Edge Function).  
7. **No** fake “client name signed” without evidence.

### Later — Accounts phase (not 0–2)

- Client auth.users, multi-device, revoke link, true identity.  
- Bigger RLS redesign. Explicit kickoff when Victor wants it.

---

## 5. FinKeel borrow (what we take / don’t take)

| FinKeel | BookDrop adapt |
|---|---|
| `source_kind` + `source_id` spine | On lines + events |
| Drill to source | Citation → upload filename + line_index + storage path (signed URL for bookkeeper) |
| Never invent source_kind | Unknown → do not claim AI |
| BookDrop Provenance component | Keep UI; feed from line fields |
| Plaid/card last4 | Only if present in parse; never fabricate |

---

## 6. Customization (even in 0–2)

| Setting | Scope | Phase |
|---|---|---|
| Require client confirm for low-conf | Per client (column or exception_policies) | 2 |
| Confirm all lines vs low-conf only | Per client | 2 |
| Category list | Firm defaults (engine) — custom firm categories Phase 4+ | 1 uses engine list |

---

## 7. Success criteria (Phase 0–2)

- [ ] No stub workflow produces fake pipeline success  
- [ ] New bank/CC upload creates N line rows matching parse count  
- [ ] Bookkeeper can open line-level exceptions with provenance  
- [ ] Client can confirm/change via portal; event rows exist  
- [ ] Bookkeeper can prove “confirmed_at + fingerprint + line_ids”  
- [ ] Money in cents; no float  
- [ ] Tests green; no fabricated demo claiming cloud write  

---

## 8. Implementation order (this approval)

1. Phase 0 UI honesty  
2. Migration 009 + types  
3. Write path lines on auto-categorize  
4. Bookkeeper queue from lines  
5. Phase 2 portal confirm + events  

---

*Design complete for 0–2. Accounts and playbooks intentionally deferred.*
