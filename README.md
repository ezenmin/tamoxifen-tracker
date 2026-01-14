# Tamoxifen Tracker

A lightweight, static web app to track Tamoxifen side effects and quickly generate summaries you can share with your doctor.

## Local development

- Install deps: `npm install`
- Run locally: `npm run dev`
- Open: `http://localhost:3000`

## Tests

- Run: `npm test`

## Deploy (GitHub Pages)

This repo includes a GitHub Actions workflow that deploys the contents of `public/` to GitHub Pages on every push to `main`.

One-time repo setup:

1) GitHub repo → **Settings** → **Pages**
2) Under **Build and deployment**, set **Source** to **GitHub Actions**

After the workflow runs, your site should be available at:

- `https://ezenmin.github.io/tamoxifen-tracker/`

## Data & privacy

- The app stores entries in your browser (LocalStorage).
- Personal data should not be committed to git.
- This repo ignores `data/entries.json` and `.claude/` via `.gitignore`.

## Project layout

- `public/` — static site (the app)
- `src/` — shared logic used by the app and tools
- `tests/` — node-based tests
- `data/test-data.json` — test fixtures
