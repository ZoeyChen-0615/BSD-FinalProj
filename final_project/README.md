# WorkWise Browser Extension MVP

This repository now contains a no-build browser extension MVP for the `Week 5 Goal` in `PROJECT_PROPOSAL.md`.

## What is implemented

- LinkedIn Jobs toolbar popup UI via Manifest V3
- Resume upload with local demo parsing and persistence
- Refresh-based job capture from the active LinkedIn job page
- Skills match scoring with matched/missing requirement highlights
- Job description red flag / green flag analysis
- Seeded work-life balance data for major tech companies
- Provider-style module boundaries so Claude API / Supabase can be swapped in later

## Load in Chrome

1. Open `chrome://extensions`
2. Turn on Developer Mode
3. Click `Load unpacked`
4. Select this folder:
   `/Users/zoeychen/Desktop/Build Ship/final_project`

## Safari direction

The extension has been reshaped around a toolbar popup rather than a Chrome-only side panel so it is easier to port to Safari Web Extensions.

Current Safari-compatible design choices:

- popup entrypoint instead of `side_panel`
- content script keeps current LinkedIn job cached in browser storage
- popup reads cached job data and can still fall back to direct tab scripting

## Demo flow

1. Open a LinkedIn Jobs page like `https://www.linkedin.com/jobs/*`
2. Click the WorkWise extension icon to open the popup
3. Upload a `.txt`, `.doc`, `.docx`, or `.pdf` resume for the current demo build
   - you can use `/Users/zoeychen/Desktop/Build Ship/final_project/demo/demo-resume.txt`
4. Click `Refresh`
5. The panel will show:
   - skills match score
   - requirement match highlights
   - job description language red/green flags
   - seeded company work-life balance data for major tech companies

## Architecture for future final-goal work

Current provider entry points are in:

- `src/shared/providers.js`
- `src/shared/storage.js`
- `src/shared/companyData.js`

Recommended future replacements:

- `demoResumeParser.parseResume()` -> Claude API backed parser
- `demoJobAnalyzer.analyzeJob()` -> Claude API or hybrid rules + LLM
- `authStore` and `storage.js` -> Supabase Auth + profile tables
- `companyData.js` -> Supabase / Postgres Glassdoor dataset lookup

The popup only depends on provider contracts, so backend upgrades should not require major UI rewrites.

## Current Week 5 scope notes

- Resume parsing is demo-safe and local right now, using local TXT/DOC/DOCX/PDF extraction instead of a live Claude API call.
- Persistence is implemented with `chrome.storage.local` so the demo works immediately; this is the swap point for Supabase-backed auth/session storage.
- Company coverage is intentionally strongest for major tech companies named in the proposal.
