# Tamoxifen Side Effect Tracker - Requirements

## Overview
A zero-cost PWA (Progressive Web App) to help breast cancer patients track Tamoxifen side effects and share summaries with their doctors.

## Core Features (MVP)

### 1. Log Side Effects
- Record side effects with date, severity (1-5), and notes
- Common Tamoxifen side effects to track:
  - Hot flashes
  - Joint/muscle pain
  - Fatigue
  - Mood changes
  - Nausea
  - Headaches
  - Weight changes
  - Sleep problems
  - Custom (user-defined)

### 2. View History
- List all logged entries
- Filter by date range
- Filter by side effect type

### 3. Generate Summary Report
- Create a summary for doctor visits
- Show frequency and severity trends
- Export as shareable link (time-limited public access)
- Export as PDF for offline use

### 4. Data Privacy
- All data stored locally in browser (localStorage)
- No account required
- No cloud sync (data stays on device)
- Shareable links use temporary encrypted URLs

## Technical Constraints
- Must work offline (PWA with service worker)
- Zero hosting cost (static hosting: GitHub Pages/Vercel/Netlify)
- Mobile-first responsive design
- No backend server required

## Non-Goals (Not MVP)
- User accounts
- Cloud sync
- Medication reminders
- Medical advice
