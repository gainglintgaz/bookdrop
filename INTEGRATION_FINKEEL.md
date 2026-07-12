# INTEGRATION_FINKEEL.md — BookDrop ↔ FinKeel merge contract

> **Status:** Contract only (2026-07-11). No FinKeel code changes in this session.  
> **Strategy:** BookDrop stays a thin bookkeeper portal + close-PREP. FinKeel remains the flagship money OS. Preferred long-term: fold portal/package into FinKeel **or** keep BookDrop thin SaaS with clean export.

---

## 1. Entities (BookDrop canonical)

| Entity | BookDrop source | FinKeel import role |
|---|---|---|
| **Bookkeeper** | `bookkeepers` (auth user + practice) | Future: FinKeel "advisor / bookkeeper" role OR external partner |
| **Client** | `clients` (no login; `portal_token`) | Maps to FinKeel household/business **or** advisor's client record |
| **Period** | `period_year` + `period_month` on uploads | Tax/accounting period — never upload date |
| **Requirement** | `document_requirements` | Checklist of expected docs per client/period |
| **Upload** | `document_uploads` + Storage path | Source document + optional AI summary JSON |
| **Completeness** | `completeness-check.ts` report | Gate for "package ready" |
| **Package** | ZIP + optional QBO/Xero/OFX export + HTML prep | Artifact FinKeel or CPA imports / attaches |

### Minimal package JSON (proposed export envelope)

```json
{
  "schema_version": "bookdrop_package_v1",
  "exported_at": "ISO-8601",
  "bookkeeper": { "id": "uuid", "practice_name": "string", "email": "string" },
  "client": {
    "id": "uuid",
    "business_name": "string",
    "contact_email": "string",
    "portal_token_hash": "optional-sha256-not-raw-token"
  },
  "period": { "year": 2026, "month": 7 },
  "completeness": {
    "score": 0,
    "status": "ready|partial|missing",
    "checks": []
  },
  "documents": [
    {
      "requirement_label": "string",
      "doc_type": "bank|credit_card|receipt|payroll|other",
      "filename": "string",
      "storage_ref": "path-or-relative-zip-entry",
      "auto_categorization_confidence": "high|medium|low|null",
      "parsed_summary": {},
      "categorization_summary": {}
    }
  ],
  "exceptions": [
    { "kind": "low_confidence_txn", "count": 0, "note": "string" }
  ],
  "non_goals_note": "No GL postings; review-only package"
}
```

ZIP layout (client-side JSZip today):  
`{client}/{year}-{month}/{requirement}/{filename}` + optional `package.json` / `README.txt`.

---

## 2. Auth model

| Surface | Today | Future FinKeel merge |
|---|---|---|
| Bookkeeper app | Supabase Auth (`bookkeepers.id = auth.uid()`) | Map `auth.users.id` if shared project; else OAuth invite |
| Client portal | **`portal_token` only** — no client account | Keep magic link; optional FinKeel deep-link for business owners who already have FinKeel login |
| Service role | Edge/API for public upload + emails | Never expose to browser |

**Non-goal day one:** shared session cookie between FinKeel and BookDrop.

---

## 3. Invite flow (bookkeeper ↔ client ↔ FinKeel)

### BookDrop-only (now)
1. Bookkeeper creates client → generates `portal_token`  
2. Client uploads via `/upload/:token`  
3. Bookkeeper reviews / ZIP / package  

### Merge-path (later)
1. FinKeel user: "Invite bookkeeper" or bookkeeper: "Link this client to FinKeel"  
2. Consent + shared client id mapping table (`external_finkeel_client_id` on BookDrop `clients` — additive)  
3. Package export pushes to FinKeel attachment store **or** user downloads ZIP and uploads  
4. FinKeel never auto-posts JE from BookDrop without human approve  

---

## 4. Export formats FinKeel or CPA can import

| Format | Exists in BookDrop | FinKeel use |
|---|---|---|
| ZIP of source docs | Yes (`download-zip.ts`) | Attachments |
| CSV month export | Yes (`export-csv.ts`) | Import/review |
| QBO/Xero/OFX paths | `export-qb.ts` | Optional; validate before marketing as live |
| HTML finance prep | `finance-prep.ts` | Human-readable close packet |
| `package.json` envelope | **Proposed** | Machine import of metadata + exceptions |

---

## 5. Explicit non-goals (v1 merge)

- Shared production database between FinKeel and BookDrop  
- Shared Stripe subscription for both products day-one  
- Shared auth session day-one  
- Auto-post journal entries to QBO from BookDrop  
- Multi-vertical white-label (HOA/estate) as FinKeel modules  
- BookDrop replacing FinKeel's personal/business money OS  

---

## 6. Privacy / compliance

- Do not send SSN/EIN/bank account numbers to LLM APIs (privacy rules)  
- Portal tokens treated as secrets (prefer hash in exports)  
- RLS: bookkeeper isolation; public upload only via valid token  
- Package is **working draft**, not audited statements (compliance copy)  

---

## 7. Open questions for founder

1. Preferred end state: **sub-feature of FinKeel** vs **standalone thin SaaS** with export only?  
2. Shared Supabase project with `bookdrop_*` prefix, or separate projects forever?  
3. Who owns the client relationship in a merge (FinKeel user vs bookkeeper as primary)?  
4. Should package auto-push into FinKeel, or always human download?  
5. Pricing: keep BookDrop $39/$79 or fold into FinKeel Business tier?  

---

## 8. Success criteria for this document

- [x] Entities listed  
- [x] Auth portal_token vs FinKeel user distinguished  
- [x] Export format sketched  
- [x] Non-goals stated  
- [x] Open questions listed  
- [ ] Founder answers §7 (next session)  
