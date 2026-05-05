# Data Flywheel (VictorForge rule)

Operational counterpart to `ai-first-principles.md`. Defines what data to collect from users, how to store it honestly, how to keep AI grounded in real evidence, and how to bootstrap the flywheel without fabrication.

**Apply this when:** designing the data layer for a new AI-native product, adding a contribution UX (reviews / ratings / outcomes / photos), or auditing whether your AI has receipts.

---

## 1. The flywheel in one paragraph

Every user contributes real evidence — outcomes, ratings, reviews, photos, corrections, time-and-context data. That evidence becomes both **personal memory** (your next cycle uses your last cycle's lessons) and **collective knowledge** (the next user in a similar situation sees what worked for the last N similar users). The AI never invents claims; it cites the data behind every annotation. As more users contribute, the data deepens, the AI gets sharper, and the system rewards contributors with more useful experiences. **This is the moat.**

---

## 2. The seven contribution types (universal)

Every project has a different domain, but the contribution types abstract cleanly. Match each type to your domain.

| Type | What it captures | Effort to provide | Signal density |
|---|---|---|---|
| **Outcomes** | Did the planned thing happen? Was it worth it? | Low (one tap) | Highest |
| **Ratings** | Numeric or thumbs-up/down on a thing | Lowest (one tap) | High at scale |
| **Reviews** | Free-text per item, optional public | Medium (1-2 min) | High (rich for LLM summarization) |
| **Media uploads** | Photos / receipts / files relevant to the domain | Medium-high (mobile UX matters) | Very high but storage cost |
| **Likes / loves** | One-tap signal "I want more like this" | Lowest | Useful at scale, low individually |
| **Corrections** | "This data is wrong, here's what's right" | Medium | Critical for data quality |
| **Time / context** | When did it happen, was it crowded/easy/hard, weather, stage of life | Auto-captured during outcome | Builds the differentiating dataset |

**Don't try to collect all 7 from day one.** Sequence by signal-per-effort (Section 9).

---

## 3. The schema patterns (Postgres-shaped, portable)

Below are abstract table patterns. Replace `[entity]` with your domain entity (place, transaction, candidate, document, etc.). All examples assume Supabase Postgres or any Postgres-compatible host (Neon, RDS, self-hosted).

### Outcomes (the per-user, per-entity heart of personal learning)

```sql
create table [entity]_outcomes (
  outcome_id        uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  [entity]_id       text not null,                 -- universal entity key (e.g., place_id, transaction_id)
  cycle_id          uuid references cycles(id),    -- the parent loop/cycle this outcome belongs to
  outcome           text not null,                 -- enum specific to your domain
  rating            smallint check (rating between 1 and 5),
  worth_it          boolean,                       -- the single most-important field
  would_repeat      boolean,                       -- distinguishes "good once" from "love"
  [domain_metric]   numeric,                       -- e.g., hours_spent, $_amount, accuracy
  context           jsonb,                         -- domain-specific context blob
  notes             text,                          -- private free-text
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on [entity]_outcomes(user_id);
create index on [entity]_outcomes([entity]_id);
```

### Reviews (text, optionally public)

```sql
create table [entity]_reviews (
  review_id         uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  [entity]_id       text not null,
  rating            smallint not null check (rating between 1 and 5),
  title             text,
  body              text,
  is_public         boolean not null default true,
  is_anonymous      boolean not null default false,
  helpful_count     int not null default 0,
  flagged           boolean not null default false,
  flagged_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on [entity]_reviews([entity]_id) where is_public and not flagged;
```

### Media uploads (photos / receipts / documents)

```sql
create table [entity]_media (
  media_id          uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  [entity]_id       text not null,
  storage_path      text not null,                 -- key in Supabase Storage / R2 / S3
  caption           text,
  is_public         boolean not null default true,
  is_anonymous      boolean not null default false,
  taken_at          timestamptz,
  width             int,
  height            int,
  file_size_bytes   int,
  flagged           boolean not null default false,
  moderated_at      timestamptz,                   -- null until moderated
  created_at        timestamptz not null default now()
);
create index on [entity]_media([entity]_id) where is_public and not flagged and moderated_at is not null;
```

### Likes (one-tap signal)

```sql
create table [entity]_likes (
  user_id           uuid not null references auth.users(id) on delete cascade,
  [entity]_id       text not null,
  created_at        timestamptz not null default now(),
  primary key (user_id, [entity]_id)
);
```

### Corrections (user-flagged data fixes)

```sql
create table [entity]_corrections (
  correction_id     uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  [entity]_id       text not null,
  field             text not null,                 -- which field is wrong
  old_value         text,
  new_value         text,
  reason            text,
  status            text not null default 'pending',  -- pending / verified / rejected
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index on [entity]_corrections([entity]_id) where status = 'verified';
```

### Cycles (top-level container — your project's loop)

```sql
create table cycles (
  cycle_id          uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  cycle_type        text not null,                  -- e.g., 'trip', 'month_close', 'hire_round'
  status            text not null default 'started', -- started / in_progress / completed / cancelled
  context           jsonb not null,                  -- snapshot of inputs at cycle start
  outcome_summary   jsonb,                           -- captured at completion
  started_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index on cycles(user_id);
create index on cycles(status);
```

### RLS pattern (row-level security)

```sql
-- Outcomes / corrections / cycles: private, owner-only
alter table [entity]_outcomes enable row level security;
create policy [entity]_outcomes_owner on [entity]_outcomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reviews / media: owner full access + public read where allowed
alter table [entity]_reviews enable row level security;
create policy [entity]_reviews_owner_rw on [entity]_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy [entity]_reviews_public_read on [entity]_reviews
  for select using (is_public and not flagged);
```

---

## 4. The k=N minimum-sample privacy rule

**Every aggregate stat is suppressed if fewer than N distinct users contributed to it.** Default N = 5.

Why this matters:

1. **Privacy.** "1 person said this was great" can identify the person, especially in a small population.
2. **Honesty.** 1 sample isn't an aggregate; presenting it as one is misleading.
3. **Trust.** Users learn the system only shows aggregates when they're real, which builds trust in the ones that DO show.

When suppressed, render the LOCKED state with honest copy:

```
🔒 [Stat name]
[N]+ contributions needed — done [current] / [N]
```

### Aggregate view pattern (with k=N suppression)

```sql
create materialized view [entity]_aggregates as
select
  [entity]_id,
  count(distinct user_id) as contributor_count,
  case when count(distinct user_id) >= 5
    then round(avg(rating)::numeric, 2)
    else null
  end as avg_rating,
  case when count(distinct user_id) filter (where worth_it is not null) >= 5
    then round(100.0 * count(*) filter (where worth_it = true)
                     / count(*) filter (where worth_it is not null), 0)
    else null
  end as pct_worth_it,
  -- domain-specific metric averages, all k-gated
  max(updated_at) as last_seen
from [entity]_outcomes
group by [entity]_id;

create unique index on [entity]_aggregates([entity]_id);
-- Refresh nightly via pg_cron, Supabase Cron, or Edge Function:
-- refresh materialized view concurrently [entity]_aggregates;
```

---

## 5. The contribution UX flow (universal pattern)

### When does the prompt fire?

| Trigger | What you ask | Why |
|---|---|---|
| Cycle status flips to `completed` | Did each planned [entity] actually happen? | Highest-signal moment, reality is fresh |
| Mid-cycle pulse (optional) | One-tap "How is [entity] going?" | Real-time signal before details fade |
| Post-cycle reflection (24-48 hr after end) | Free-form "what would you change next time?" | Settled signal, future-trip relevance |
| Specific moment (e.g., right after using a feature) | One-tap rating | Captures micro-feedback |

### What does the survey look like?

Per-entity flow, mobile-first single-screen:

```
[Entity name]
[Optional thumbnail]

Did this happen?
  [ Yes ]  [ Skipped ]  [ Couldn't / didn't ]

If "Yes":
  Rate it
  ⭐⭐⭐⭐⭐ (1-5 tap)

  Worth it?
  [ Yes ] [ Mixed ] [ No ]

  [domain-specific quantitative field]
  [slider / picker / number input]

  [domain-specific context fields]
  [tap-to-select chips]

  Anything to add? (optional)
  [text box, 200 chars]

  Want to share [media]? (optional)
  [+ Upload]

  [ Save ]  [ Skip — I'll do this later ]
```

### Privacy controls (per-contribution, not global)

For every text review and media upload, three options:

1. **Private** — only you see it
2. **Anonymous public** — visible to all users, attributed as "an [project] user"
3. **Named public** — visible to all users, attributed as "@yourhandle" (only if the user set a handle in settings — never their email)

For outcomes / ratings / quantitative data: **always private at the row level** — only AGGREGATES are public, and only above the k=N threshold.

---

## 6. Cold-start strategy

The flywheel is hard at the start because there's nothing in it. **Don't lie about the gap; make it part of the experience.**

### What the first user sees

For every entity card before any aggregates exist:

```
"Be the first to share what worked here."
```

For entities where external data exists (e.g., third-party reviews) but no internal data:

```
"From [external source]:
  [their data here]

No [project] user has reviewed this yet — yours could be the first."
```

For entities with 1 to k-1 contributions (under threshold):

```
"From [external source]:
  [their data here]

[N] [project] users have contributed; we'll surface stats once [k]+ have
contributed for honest aggregates."
```

For entities with k+ contributions:

```
"X of Y [project] users said worth it" + cited reviews + verbatim snippets
(all substring-validated against real data)
```

The progression is honest: starts with external data, becomes hybrid, eventually becomes "[project] users say…" — and the user can see exactly why and where.

### Strategies to bootstrap

1. **Personal flywheel first.** Even at zero collective data, a user's own first-cycle outcomes power their second-cycle. Personal AI works at Loop 2 even when collective AI needs Loop 5+ to be honest.
2. **Seed deliberately.** For each launch domain, capture 5-10 real contributions from alpha testers (founders, friends) so each entity starts above the k=N threshold.
3. **Reward contribution visibility.** A "your impact" stat in settings: *"Your reviews helped 12 other users."* Real numbers, not gamification points.
4. **Resurface user's own work.** When a user comes back to start a new cycle and sees their own past contribution on a related entity, the loop becomes self-reinforcing.

---

## 7. Moderation rules

### Automated layer (cheap, runs on every submission)

- **Profanity filter** (regex against a maintained list — false positives acceptable, hides text behind "review hidden, pending review")
- **Spam detection** (URLs, repeated submissions, copy-paste patterns)
- **Media content moderation** (Cloud Vision SafeSearch / equivalent — ~$0.001 per item). Auto-rejects nudity, violence, etc.
- **EXIF stripping** on every uploaded image (no leaking GPS / device metadata)
- **Min-length** on reviews (10 chars+) — prevents drive-by submissions

### Human layer (slow, but necessary)

- Flag queue for items auto-mod uncertain on
- User-flagged items go into the queue
- Single moderator (founder, initially) reviews via private mod page
- Reject sets `flagged=true`, hides from public, retains for the user's record

### Trust scoring (longer-term)

A user with several completed cycles, many recorded outcomes, and zero flagged contributions earns "trusted contributor" weight that mildly boosts review surfacing. **Not visible to the user** (avoids gamification arms race). Pure backend signal.

A user with flagged contributions or spam history gets reduced weight; future submissions go straight to manual review.

---

## 8. The AI/LLM layer rules

The AI's job: **synthesize real data into useful claims, never fabricate.**

### Three categories

**8.1 Aggregation (no LLM needed, just SQL)**

These don't need AI. They're real numbers:
- "8 of 10 users said worth it"
- "Average X hours / dollars / cycles"
- "Most users do this in [time window]"

Render directly. Cite the data. No interpretation needed.

**8.2 Review summarization (LLM with substring validation)**

- Take 5+ recent real reviews of an entity
- Ask LLM to extract verdict-tagged snippets per category
- **Substring-validate**: snippet must be a verbatim quote from a real review (case + whitespace normalized)
- Reject and retry if not — never let unvalidated output reach users

This pattern is universal. It works for restaurant reviews, candidate feedback, product reviews, transaction descriptions — anywhere the LLM is summarizing user-generated text.

**8.3 Personal pattern detection (LLM + user's own data only)**

When a user has 3+ completed cycles:
- Pass their own cycle history to the LLM
- Prompt: *"Identify patterns in this user's outcomes. Don't speculate beyond the data."*
- Substring-validate every claim against the input
- Surface as PREVIEW-state suggestions: *"You tend to mark X as 'worth it' more than Y (8 vs 2)"*

Critically: **only the user's own data.** Never "users like you" claims at this stage. Cross-user pattern claims are gated on far more data per cohort to be honest.

### What the LLM is NOT allowed to do

- Make up review counts ("hundreds of users say…") when data doesn't support it
- Generate fake reviews to fill cold-start gaps
- Output predictions presented as facts ("you'll love this")
- Compose claims that mix data sources without citing which is which
- Use other users' private outcomes to influence one user's recommendations

---

## 9. Sequenced build phases

Don't build all 7 contribution types at once. Sequence by signal-per-effort.

### Universal phase order

| Phase | What | Why first/later |
|---|---|---|
| **A** | Outcomes only (the highest-signal data, lowest effort) | Even one cycle gives Loop 2 personalization |
| **B** | Text reviews + LLM summarization with substring validator | Compounds outcomes with rich text |
| **C** | Likes (one-tap) | Lowest-effort signal; adds before complexity |
| **D** | Media uploads (photos / receipts) | Highest UX cost; worth it once flywheel is proven |
| **E** | Corrections | Improves data quality; needs moderation infrastructure |
| **F** | Cross-cycle pattern AI (personal only, substring-validated) | Unlocks Loop 4-5 personalization |
| **G** | Cross-user collective AI ("users like you") | **Gated on >1000 users with 3+ cycles each** |

Phase A alone unlocks Loop 2 personalization. Even with zero collective data, the user gets personal AI from cycle 2 onward. Phase G waits for population.

---

## 10. Cost realism (template)

For any project applying this framework, estimate:

| Item | Free tier accommodates | Paid tier ceiling |
|---|---|---|
| Postgres rows | Supabase 500MB / Neon 0.5GB = ~5M typical rows | $25/mo Pro = 8GB, ~80M rows |
| Media storage | Supabase 1GB = ~1k images at 1MB / Cloudflare R2 10GB = ~10k | R2: $0.015/GB after 10GB |
| Moderation API | Cloud Vision: 1000 free/month | $1.50 / 1000 items |
| LLM summarization | Daily batch: ~100 calls/day at peak | ~$0.05/day on Gemini Flash |
| Aggregate refresh | Trivial CPU; nightly via cron | n/a |

**Realistic spend at first 1k users**: **free → $10/mo** depending on media adoption. Plan for the slope, not the launch.

---

## 11. The contributor pact (verbatim template)

Codify into the privacy page and onboarding for every project applying this framework:

> *[Project] only gets smarter with your evidence. We rely on you to tell us what worked, what didn't, and what we got wrong. In return:*
>
> *1. **Your private data stays private.** Outcomes, ratings, quantitative data — only you see them. We aggregate them into anonymous stats above a [N]-user minimum.*
> *2. **Your public contributions stay yours.** You pick anonymous, named, or private. You can delete any of them anytime.*
> *3. **We never fabricate.** Every claim cites real data. If we don't have enough yet, we say so.*
> *4. **Your impact is visible.** Settings shows how many other users your contributions helped.*
> *5. **The AI works for you, not on you.** We never use your private outcomes to influence other users' recommendations except via aggregate stats above the threshold.*
>
> *That's the pact. If we ever break it, hold us accountable.*

---

## 12. Per-project worksheet (drop into your repo's `DATA_FLYWHEEL.md`)

Fill in for any project applying this framework:

### 12.1 Domain mapping
- Your `[entity]` is: ?
- Your `[cycle]` is: ?
- Your `[domain_metric]` is: ?

### 12.2 Contribution types you'll collect
| Type | Implement in Phase | Locked-state copy |
|---|---|---|
| Outcomes | A | |
| Ratings | A | |
| Reviews | B | |
| Media | D | |
| Likes | C | |
| Corrections | E | |
| Time/context | A (via outcome context jsonb) | |

### 12.3 k=N threshold
- Default 5. Adjust if your population is small (raise) or expressively private (raise more).

### 12.4 Cold-start sources
- External data we can show before flywheel data exists: ?
- Seed contributors (alpha testers): list of N users we'll capture from before launch

### 12.5 Sequenced build phases
- Phase A start date: ?
- Phase B trigger: ?
- Phase G trigger: >X users with Y+ cycles (state your X, Y)

### 12.6 Honest copy templates (write these BEFORE the unlock logic)

For each AI feature, write the LOCKED-state copy:

```
🔒 [Feature]
We need [specific input] to learn this.
Done: [progress] / [target].
[CTA]
```

If you can't write this honestly, the feature is premature.

---

## 13. The contrarian footnotes

What this framework intentionally does NOT do:

- **No gamification.** No points, badges, leaderboards. Reward = better experience for you and others. Gamification taints data quality.
- **No paid contributors.** Reviews aren't crypto. Don't pay for reviews; payment becomes motivation, motivation corrupts data.
- **No real-time multi-user collaboration yet.** That's a CRDT/OT subdomain; deferred.
- **No social graph.** Don't conflate planning/utility tools with social networks. Different products.
- **No external-API auto-correction.** When your users flag a place / record / candidate as wrong, update YOUR display. Don't push back to the source.

---

## 14. Cross-reference

This rule pairs with `ai-first-principles.md`:

- `ai-first-principles.md` — *how to think about AI*: when it's centered, when it unlocks
- `data-flywheel.md` (this file) — *what data to collect*: schemas, contribution types, privacy rules, the validator pattern

**Use both together.** Without principles, the data flywheel becomes surveillance. Without the flywheel, principles become theater.

---

*This file is part of the VictorForge factory ruleset. Auto-loaded into every project that has `.claude/rules/`. Update via PR; changes propagate to all projects on next session.*
