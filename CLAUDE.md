# Tamoxifen Tracker - Claude Instructions (Hypervelocity)

## Project Reality (Current)
This repo is a static PWA hosted on GitHub Pages with **optional Supabase sync**.

- **Real app:** `public/index.html` + `public/tracker.js`
    - Stores entries locally (browser storage) and syncs to Supabase when signed in.
    - Supports patient + partner accounts in the same household.
    - Supports doctor read-only share links (7-day expiry) via Supabase Edge Function.
- **Demo:** `public/demo.html`
    - **Visual-only** sample data. **No auth, no sync, no Supabase.**

Important: older docs in this repo assumed `data/entries.json`. That is no longer the production storage path.

---

## Hypervelocity Rules

### Closed-loop behavior (no human intervention)
For any task:
1) Run tests first (`npm test`).
2) If a step fails due to code/test issues, fix and retry until green.
3) Only stop if blocked by external credentials/permissions (missing env vars, GitHub auth, Supabase auth).
4) Never print secrets.

### What to edit (source of truth)
- Pure/core business logic is in `src/tracker.js`.
- The production web app runs `public/tracker.js`.
- **Rule:** if you change a core function used by both, update both files or add a test ensuring they stay in sync.

### UI invariants
- `public/index.html` contains auth/sync/invites/doctor-share UI.
- `public/demo.html` must stay visual-only.
- Do not re-introduce Supabase scripts or login UI into demo.

---

## Commands (Canonical)

### Tests
```powershell
npm test
```

### Feature-specific tests (run before committing feature changes)
```powershell
node tests/test-exercise-and-notes.js
```

### Dev server
```powershell
npm run dev
```

---

## Supabase (Deployment)

This project uses Supabase CLI for DB migrations and Edge Functions.

### Required env vars (set once, then Claude can run non-interactively)
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY` (used as a Supabase secret for Edge Functions; never commit it)

### Non-interactive deploy commands
```powershell
npx supabase login --token $env:SUPABASE_ACCESS_TOKEN
npx supabase db push --linked --password $env:SUPABASE_DB_PASSWORD --yes
npx supabase functions deploy claim-household-invite --project-ref mhloxubuifluwvnlrklb
```

---

## GitHub Pages (Deployment)

The site updates when changes are committed and pushed to `main`.

```powershell
git add -A
git commit -m "<message>"
git push origin main
```

---

## Debugging Notes

### PWA caching
Phones can get stuck on older cached HTML/JS. Prefer a service worker strategy that is network-first for navigations and bump cache versions when UI changes.

### Partner data visibility
Partners must be routed to the household they’re a member of (not an accidental empty household they created earlier). Household resolution should prefer membership when present.
