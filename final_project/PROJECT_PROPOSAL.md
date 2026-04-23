# Project Proposal: WorkWise

## One-Line Description
A Chrome extension that overlays a smart side panel on LinkedIn, giving tech job seekers instant visibility into work-life balance, skills match, and compensation data for every job they browse.

## The Problem
Job searching in tech is fragmented and exhausting. Salary data lives on one site, company reviews on another, interview info on a third — and none of them tell you how well your skills actually match the role. For someone like a data engineering candidate who wants work-life balance but feels trapped applying to big tech (the only companies hiring for their role), there's no single tool that answers: "Is this job right for me — technically and personally?" WorkWise solves this by bringing all of that context directly into your LinkedIn browsing experience.

## Target User
Tech job seekers in the US market — especially those who care about work-life balance and want to quickly assess how well they match a role before investing time in an application. The initial version targets LinkedIn users browsing for roles like data engineer, software engineer, and other technical positions.

## Core Features (v1)
1. **Chrome side panel on LinkedIn** — click the extension icon while on LinkedIn's job search page to open a persistent side panel that shows data for the currently selected job
2. **Resume upload + auto-parsing** — upload a PDF/DOCX resume once; the Claude API parses it into structured skills, experience, and education data that persists across sessions
3. **Skills match scoring** — parses the job description and highlights which requirements you meet vs. don't, with an overall match score (e.g., "7/10 requirements matched")
4. **Job description red flag / green flag detector** — uses the Claude API to analyze the language of the job posting itself and surface work-life balance signals. Red flags like "fast-paced," "wear many hats," and "rockstar" suggest burnout culture; green flags like "flexible hours," "sustainable pace," and "no on-call" suggest healthy balance. This works for every job posting — no external dataset needed.
5. **Skill gap + learning path** — for each unmatched requirement, suggests a specific free learning resource (e.g., a Coursera course, YouTube tutorial, or documentation link) so users can close the gap. Turns the match score into an actionable plan, not just a number.
6. **Work-life balance rating** — looks up the company in a pre-loaded Glassdoor review dataset and displays the work-life balance score, along with key pros/cons from employee reviews. Combined with the red flag detector, users get both company-level and job-posting-level work-life balance signals.
7. **Basic company info** — displays company size, industry, and available salary data for the role/location

## Tech Stack
- **Frontend:** React + Tailwind CSS (Chrome extension side panel)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL — stores user profiles, parsed resume data, and pre-loaded company datasets)
- **Auth:** Supabase Auth (email/password or Google OAuth, integrated into the extension)
- **APIs:**
  - Claude API — resume parsing and skills matching against job descriptions
  - JSearch API (RapidAPI, free tier) — supplementary salary estimates
  - BLS API — baseline salary data by occupation and location
- **Data Sources:**
  - Kaggle Glassdoor reviews dataset — work-life balance ratings, company reviews
  - Kaggle Glassdoor interview dataset — interview difficulty and process info (stretch goal)
  - H-1B salary disclosure data (US DOL) — company-specific salary data
- **Deployment:** Chrome Web Store (or local/unpacked for demo purposes)
- **MCP Servers:** Supabase MCP (database management and migrations)

## Stretch Goals
- **Auto-detect job changes** — instead of a manual refresh, automatically detect when the user navigates to a new job listing and update the side panel
- **Salary breakdown** — combine BLS, H-1B, and JSearch data into a detailed compensation view with percentile ranges
- **Interview prep info** — show interview difficulty, common questions, and process descriptions using Glassdoor interview data
- **Employee tenure estimation** — use LLM to estimate average tenure based on available company data signals
- **Job bookmarking and comparison** — save interesting jobs and compare them side-by-side on skills match, salary, and work-life balance
- **Support for Indeed and other job boards** — extend the content script to detect job postings on additional platforms
- **Personalized recommendations** — "Based on your skills, you might also be a good fit for these roles"

## Biggest Risk
**Data coverage gaps.** The static Kaggle datasets only cover well-known companies — if a user is looking at a job from a small or newer company, there may be no work-life balance rating, no interview data, and limited salary info. The mitigation strategy is threefold: (1) be transparent in the UI about what's real data vs. estimated, (2) use the Claude API to provide LLM-estimated insights when hard data isn't available, and (3) focus the v1 demo on major tech companies where data coverage is strong. A secondary risk is LinkedIn DOM changes breaking the job detection logic, but the side panel architecture minimizes this — only a small content script reads the page, and fixing broken selectors is a quick update.

## Week 5 Goal
A working Chrome extension that can be demoed live on LinkedIn:
- Extension installs and opens a side panel on LinkedIn's job search page
- User has uploaded a resume that was auto-parsed by the Claude API
- Clicking on a job posting and hitting "refresh" in the panel shows: (1) a skills match score with green/red highlights for each requirement, (2) a red flag / green flag analysis of the job description's language, and (3) a work-life balance rating pulled from the Glassdoor dataset
- User profile and parsed resume persist across sessions via Supabase Auth
- Works reliably for major tech companies (Google, Meta, Amazon, etc.) where dataset coverage is strong
