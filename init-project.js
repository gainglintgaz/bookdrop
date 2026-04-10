#!/usr/bin/env node
// _system/init-project.js
// VictorForge Universal Project Initializer
// Usage: node init-project.js [project-name] [vertical]
// Example: node init-project.js estate-sale-portal estate-sale
//
// Creates: full directory structure, CLAUDE.md, CURRENT_SPRINT.md,
//          errors-fixed.json, golden-paths.md, package.json
// Vertical from: bookkeeping | estate-sale | equine | hoa | cleaning | new

const fs = require('fs')
const path = require('path')

const [,, projectName, vertical = 'bookkeeping'] = process.argv

if (!projectName) {
  console.error('Usage: node init-project.js [project-name] [vertical]')
  process.exit(1)
}

const projectPath = path.join(process.cwd(), '..', projectName)

// ─── DIRECTORIES ────────────────────────────────────────────────────────────
const dirs = [
  'src/components/ui',
  'src/components/practitioner',   // was 'bookkeeper' — generic
  'src/components/client',
  'src/components/shared',
  'src/hooks',
  'src/lib',
  'src/pages',
  'src/types',
  'supabase/migrations',
  'supabase/functions',
  'tests',
]

dirs.forEach(dir => {
  fs.mkdirSync(path.join(projectPath, dir), { recursive: true })
})

// ─── CLAUDE.md ──────────────────────────────────────────────────────────────
const claudeMd = `# CLAUDE.md — ${projectName}
## Read this + ../_system/CLAUDE_AUTONOMY_PROTOCOL.md before every session

---

## WHAT WE'RE BUILDING
[FILL IN — what problem does this solve, for whom, how]

## VERTICAL
${vertical}

## TECH STACK
Frontend:   React 18 + TypeScript (strict) + Vite + Tailwind + shadcn/ui
State:      Zustand with selectors
Backend:    Supabase (Postgres + Auth + Storage + Edge Functions)
Email:      Resend + React Email
Payments:   Stripe
Hosting:    Vercel
Testing:    Vitest + React Testing Library

## DATABASE — ALL TABLES
[FILL IN — add tables as designed]

## CURRENT SPRINT
See CURRENT_SPRINT.md

## ERRORS FIXED
See errors-fixed.json

## ARCHITECTURAL DECISIONS (LOCKED)
[FILL IN — add decisions as made, with reasoning]

## DO NOT DO THESE
- bare useStore() — always use selectors
- TypeScript \`as\` casting to silence errors
- floats for monetary values
- .single() when result might be null — use .maybeSingle()
- console.log in committed code
`

fs.writeFileSync(path.join(projectPath, 'CLAUDE.md'), claudeMd)

// ─── CURRENT_SPRINT.md ──────────────────────────────────────────────────────
const sprintMd = `# CURRENT_SPRINT.md — ${projectName}
## Update after EVERY task.

Last updated: ${new Date().toISOString().split('T')[0]}
Sprint goal: [FILL IN]

---

## STATUS: INITIALIZING

## DONE ✓
- [x] Project initialized

## IN PROGRESS →
- [ ] CLAUDE.md — fill in project details
- [ ] Database schema design

## QUEUE
- [ ] Supabase migration
- [ ] TypeScript types
- [ ] Core components

## BLOCKED BY
Nothing

## NEXT SESSION START HERE:
→ Complete CLAUDE.md with full project context
→ Design database schema
→ Create migration file
`

fs.writeFileSync(path.join(projectPath, 'CURRENT_SPRINT.md'), sprintMd)

// ─── errors-fixed.json ──────────────────────────────────────────────────────
fs.writeFileSync(path.join(projectPath, 'errors-fixed.json'), JSON.stringify({
  project: projectName,
  last_updated: new Date().toISOString().split('T')[0],
  errors: []
}, null, 2))

// ─── golden-paths.md ────────────────────────────────────────────────────────
const goldenPaths = `# golden-paths.md — ${projectName}
## If you hit this situation, do exactly this.

---

## SUPABASE PATTERNS

### Standard query pattern
\`\`\`typescript
// Always check error before using data
const { data, error } = await supabase.from('table').select('*')
if (error) throw error
if (!data) return null
\`\`\`

## REACT PATTERNS

### Always handle all three states
\`\`\`tsx
if (loading) return <Skeleton />
if (error) return <ErrorState message={error.message} />
if (!data || data.length === 0) return <EmptyState />
return <DataView data={data} />
\`\`\`

## PROJECT-SPECIFIC PATTERNS
[Add patterns here as you discover them]
`

fs.writeFileSync(path.join(projectPath, 'golden-paths.md'), goldenPaths)

console.log(`\n✅ Project "${projectName}" initialized at ${projectPath}`)
console.log(`\nNext steps:`)
console.log(`  1. Edit CLAUDE.md — fill in what you're building`)
console.log(`  2. Design your database schema`)
console.log(`  3. Start a Claude Code session — it reads CLAUDE.md automatically`)
console.log(`\nVertical: ${vertical}`)
console.log(`Copy tenant.config.ts from bookkeeper-portal and add a new vertical config.`)
