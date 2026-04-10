# UX-First Development Checklist

> Born from a hard lesson: 3-4 hours of building powerful features (statement parser, reconciliation engine, completeness scoring) that were completely invisible to users. The deployed app looked like an empty frontend mock with nothing to show for. Never again.

---

## The Core Principle

**Features don't exist until they're discoverable.** A statement parser that nobody can find is the same as no statement parser.

---

## Pre-Deploy Checklist (Run Before Every Deploy)

| # | Check | Question | Fail = Block Deploy |
|---|-------|----------|---------------------|
| 1 | **First Impression** | Does a stranger understand the product in 5 seconds? | Yes |
| 2 | **Feature Discovery** | Can every feature be found without prior knowledge? | Yes |
| 3 | **Navigation** | Does every link/button go somewhere real? (No dead redirects) | Yes |
| 4 | **Empty States** | Does every page explain itself when there's no data? | Yes |
| 5 | **Demo Quality** | Would you show this demo in a sales meeting? | Yes |
| 6 | **Value Visibility** | Can you see why someone would pay for this? | Yes |
| 7 | **Mobile Check** | Does it not embarrass you on a phone? | No (warn) |

### How to Run It
1. Open the live/preview URL in an incognito window
2. Pretend you have zero context about the project
3. Walk through each check honestly
4. If any "Block Deploy" check fails, fix it before sharing the URL with anyone

---

## The 7 Universal Rules

### 1. The 5-Second Rule
Before deploying anything, ask: "If someone with zero context opens this URL right now, what do they see in 5 seconds?"

Open the URL in an incognito window and pretend you've never seen it before. If you can't understand the product's value in 5 seconds, it's not ready.

### 2. Demo Mode IS the Product Demo
When the first thing users see is demo/sample data, that demo IS the pitch. It's not a developer convenience — it's the first impression that determines whether anyone bothers to sign up.

If your app has a demo mode, design it like a product tour. Every screen should sell a feature.

### 3. Features Must Be Discoverable
For every feature you build, immediately ask: "How does a new user discover this exists?" If the answer is "they click through 3 pages and scroll down," the feature doesn't exist yet.

### 4. Build Outside-In

**Do this:**
```
Step 1: Landing state, feature cards, navigation, empty states with descriptions
Step 2: Wire real features into the visible framework
```

**Not this:**
```
Step 1: Build parser engine, reconciliation engine, completeness checker
Step 2: Build more engines, deploy, wonder why it looks empty
```

Build what users see first, then what powers it. Not the other way around.

### 5. Empty States Are Not Afterthoughts
Design the empty/first-visit state of every page BEFORE the populated state. That's what 100% of new users see first. A page with no data and no explanation is a dead page.

### 6. Deploy Through a Stranger's Eyes
Passing `tsc`, tests, and build checks means technical correctness. It says nothing about experiential correctness. Always verify both.

### 7. The AI Slop Trap
Fast code generation creates a false sense of completeness. Writing 2,000 lines of backend logic feels productive, but if the 50 lines of UI that introduce the product don't exist, the app looks empty.

After every major coding session, ask: "If I deleted all the backend logic and only kept what's visible on screen, would this still impress someone?" If no, the next task is always UI/UX, never more backend features.

---

## Build Order for Any New Project

```
1. Landing/onboarding experience (what does a new user see?)
2. Navigation and page structure (can they find everything?)
3. Empty states for every page (what do they see before data exists?)
4. Feature showcase/discovery (how do they know what's possible?)
5. Demo mode as a sales tool (make it sell the product)
6. Then — and only then — build the engines, parsers, APIs
7. Wire the engines into the already-visible framework
```

---

## When Building for a Client or Stakeholder

Before showing anything to anyone:
- Open the URL as if you've never seen it
- Count to 5 — do you know what the product does?
- Click every nav link — do they all go somewhere real?
- Find every major feature — can you, without reading the code?
- Ask yourself: "Would I pay for what I'm looking at?"

If any answer is no, it's not ready. Fix the experience layer first. The backend can wait — nobody will ever see it if the frontend drives them away.

---

## Origin

This checklist was created after deploying BookDrop (a document collection portal for bookkeepers) with 6 powerful features (multi-format statement parser, auto-reconciliation, completeness scoring, bookkeeper packages, CSV exports, smart reminders) that were all completely hidden from users. The deployed app looked like an empty mock with nothing to show for. The fix required a complete UX overhaul — feature showcase cards, dedicated pages, clickable navigation, demo banners, and discovery hints — that should have been built first.
