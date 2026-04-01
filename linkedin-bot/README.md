# LinkedIn Job Bot — AI-Powered Job Application Assistant

Automates your LinkedIn saved-job workflow end-to-end using **Claude AI** and **Playwright** browser automation.

## What It Does

| Step | Action |
|---|---|
| 1 | Logs into LinkedIn (persists session — only logs in once) |
| 2 | Scrapes your **Saved Jobs** list |
| 3 | Sends the job description to **Claude AI**, which **tailors your resume** to mirror the JD's language and priorities |
| 4 | Claude writes a **humanized, story-driven cover letter** (not a generic template) |
| 5 | Generates **PDF files** for both resume and cover letter |
| 6 | Submits the application via **LinkedIn Easy Apply**, filling in all form fields and screening questions automatically |
| 7 | Finds the **hiring manager or recruiter** for the role |
| 8 | Sends a **personalized connection request** with a custom note (≤ 300 chars) |
| 9 | Sends a **compelling LinkedIn DM** designed to start a conversation, not beg for a referral |

---

## Setup

### 1. Install dependencies

```bash
cd linkedin-bot
npm install
npx playwright install chromium
```

### 2. Configure your credentials

```bash
cp .env.example .env
```

Edit `.env`:

```env
LINKEDIN_EMAIL=you@example.com
LINKEDIN_PASSWORD=your_password
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Fill in your resume data

Edit `config/resume.json` — this is your **master resume**. Claude uses it as the raw material and tailors it per job. Fill in every field accurately.

### 4. Set your preferences

Edit `config/user-profile.json`:
- Target roles, industries, and locations
- Tone preferences for cover letters and recruiter messages
- Job filters (max age, skip keywords, etc.)

---

## Usage

```bash
# Full run: apply + connect with recruiter (recommended)
npm start

# Only apply to jobs (no recruiter outreach)
npm run start:apply

# Only connect with recruiters (no applications)
npm run start:connect

# Dry run: generate PDFs and log everything, but submit nothing
npm run start:dry-run
```

---

## Output

All generated files are saved in `output/`:

```
output/
├── resumes/
│   └── Resume_Your_Name_CompanyName_RoleName_20240601.pdf
├── cover-letters/
│   └── CoverLetter_Your_Name_CompanyName_RoleName_20240601.pdf
├── logs/
│   └── session-2024-06-01_09-30-00.log
└── applied-jobs.json   ← tracks applied jobs to prevent re-applying
```

---

## Safety & Rate Limiting

- **Human-like behavior**: random delays between every action, natural typing speed, realistic mouse movement
- **Job cooldown**: configurable 30–90 second pause between applications (see `.env`)
- **Session persistence**: browser cookies are saved in `browser-data/` — you only log in once
- **Applied-job tracking**: `output/applied-jobs.json` prevents re-applying to the same role
- **Age filter**: skips jobs older than N days (configurable in `user-profile.json`)
- **Keyword filters**: skip jobs containing undesired keywords

---

## Architecture

```
linkedin-bot/
├── src/
│   ├── index.js          ← Main orchestrator (entry point)
│   ├── auth.js           ← LinkedIn login + session management
│   ├── jobs.js           ← Scrape saved jobs + filtering
│   ├── resume.js         ← Resume tailoring pipeline
│   ├── coverLetter.js    ← Cover letter generation pipeline
│   ├── apply.js          ← LinkedIn Easy Apply automation
│   ├── recruiter.js      ← Recruiter finder + connection + messaging
│   ├── claude.js         ← All Claude AI prompts (tailoring, writing, Q&A)
│   └── utils/
│       ├── humanize.js   ← Delays, typing, scrolling simulation
│       ├── logger.js     ← Colored console + file logging
│       └── pdf.js        ← HTML → PDF generation via Playwright
├── templates/
│   ├── resume.html       ← ATS-friendly resume template
│   └── coverLetter.html  ← Professional cover letter template
├── config/
│   ├── resume.json       ← YOUR master resume data (fill this in!)
│   └── user-profile.json ← Your job preferences and bot behavior settings
└── output/               ← Generated files (gitignored)
```

---

## Important Notes

- **LinkedIn ToS**: Automated scraping and actions may violate LinkedIn's Terms of Service. Use responsibly and at your own risk.
- **2FA**: If LinkedIn prompts for 2-step verification, run with `HEADLESS=false` in your `.env` to see the browser and complete it manually.
- **Easy Apply only**: The bot only applies to jobs with the Easy Apply button. External application sites require separate automation.
- **Review before submitting**: Run with `--dry-run` first to review the generated resumes and cover letters before enabling auto-apply.
