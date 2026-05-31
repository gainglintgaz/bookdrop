# SCHEMA — BookDrop core tables

Core V1 table design (extracted from CLAUDE.md for token hygiene). The live Supabase DB (`mvvadmlivrpyawmlaqye`) also carries the tables added by migrations 004-008 (messaging, notifications, e-signature, categorization corrections, etc.) — for the authoritative current shape see `supabase/migrations/*.sql` and the generated `src/types/database.types.ts`.

## bookkeepers (practitioners / the paying customer)
- id UUID PK (auth.users ref)
- email TEXT UNIQUE
- full_name TEXT
- practice_name TEXT
- reply_to_email TEXT
- plan TEXT — 'free' | 'starter' | 'pro'
- stripe_customer_id TEXT
- stripe_subscription_id TEXT
- reminder_tone TEXT — 'friendly' | 'professional' | 'firm'
- created_at TIMESTAMPTZ

## clients (the bookkeeper's clients — never log in)
- id UUID PK
- bookkeeper_id UUID FK → bookkeepers (RLS: bookkeeper can only see own clients)
- business_name TEXT NOT NULL
- contact_name TEXT
- contact_email TEXT NOT NULL
- portal_token TEXT UNIQUE NOT NULL (12-char random — the magic link key)
- notes_private TEXT (bookkeeper only)
- notes_for_client TEXT (shown on upload page)
- is_active BOOLEAN DEFAULT true
- created_at TIMESTAMPTZ

## document_requirements (what documents each client must submit)
- id UUID PK
- client_id UUID FK → clients CASCADE DELETE
- label TEXT NOT NULL — e.g. "Chase Business Checking — April statement"
- doc_type TEXT — 'bank' | 'credit_card' | 'receipt' | 'payroll' | 'other'
- required BOOLEAN DEFAULT true
- sort_order INT DEFAULT 0

## document_uploads (actual files submitted by clients)
- id UUID PK
- requirement_id UUID FK → document_requirements
- client_id UUID FK → clients (denormalized for query performance)
- bookkeeper_id UUID FK → bookkeepers (denormalized for RLS)
- period_year INT NOT NULL
- period_month INT NOT NULL (1-12)
- filename_original TEXT NOT NULL
- storage_path TEXT NOT NULL (Supabase Storage path)
- file_size_bytes BIGINT
- uploaded_at TIMESTAMPTZ DEFAULT now()

## reminder_schedules (when to send reminders each month)
- id UUID PK
- client_id UUID FK → clients CASCADE DELETE
- day_of_month INT NOT NULL (1, 5, 10)
- reminder_number INT NOT NULL (1=initial, 2=followup, 3=escalation)
- is_active BOOLEAN DEFAULT true

## reminder_log (audit trail of all emails sent)
- id UUID PK
- client_id UUID FK → clients
- bookkeeper_id UUID FK → bookkeepers
- period_year INT NOT NULL
- period_month INT NOT NULL
- sent_at TIMESTAMPTZ DEFAULT now()
- reminder_number INT NOT NULL
- triggered_by TEXT — 'auto' | 'manual'
- resend_email_id TEXT (delivery tracking)

## RLS policies (enforce on every table)
- bookkeepers: users read/write their own row only
- clients: `bookkeeper_id = auth.uid()`
- document_requirements: via client → `bookkeeper_id = auth.uid()`
- document_uploads: `bookkeeper_id = auth.uid()`
- reminder_schedules: via client → `bookkeeper_id = auth.uid()`
- reminder_log: `bookkeeper_id = auth.uid()`
- Public upload page: identified by `portal_token`, NO auth. Upload function runs as service role, validates portal_token exists before inserting.

## Storage
- Bucket `documents` (private)
- Path: `{bookkeeper_id}/{client_id}/{year}/{month}/{requirement_id}/{filename}`
- Access: signed URLs only, generated server-side, expire in 1 hour
