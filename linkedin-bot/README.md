# LinkedIn Job Bot — AI Agent Team

An autonomous **multi-agent system** that handles your entire LinkedIn job-application workflow. Seven specialised AI agents collaborate — running in parallel where possible — to apply for jobs and reach out to recruiters on your behalf.

---

## Agent Team

| Agent | Role | AI? |
|---|---|---|
| **OrchestratorAgent** | Master coordinator — plans workflow, fans out work, handles failures | Claude AI |
| **JobScoutAgent** | Scrapes LinkedIn Saved Jobs, applies filters, queues valid listings | Browser |
| **ResumeTailorAgent** | Rewrites your master resume to mirror each JD's language and priorities | Claude AI |
| **CoverLetterAgent** | Writes a humanized story-driven cover letter (hook → achievement → fit → CTA) | Claude AI |
| **ApplicationAgent** | Fills and submits LinkedIn Easy Apply forms, answers screening questions | Claude AI + Browser |
| **RecruiterHunterAgent** | Finds the hiring manager or recruiter from the job listing or LinkedIn search | Browser |
| **OutreachAgent** | Sends a personalized connection request note + compelling follow-up DM | Claude AI + Browser |

---

## How They Collaborate

```
OrchestratorAgent
    │
    ├─ 1. JobScoutAgent ──────────────────────── discovers & filters saved jobs
    │
    └─ For each job:
        │
        ├─ Phase A (documents):
        │   ├─ ResumeTailorAgent ─────────────── tailors resume to JD
        │   └─ CoverLetterAgent ──────────────── writes cover letter
        │
        ├─ Phase B (parallel):
        │   ├─ ApplicationAgent ────────────────── Easy Apply submission
        │   └─ RecruiterHunterAgent ──────────── finds recruiter/HM
        │
        └─ Phase C (outreach):
            └─ OutreachAgent ─────────────────── connection note + DM
```

**Agents communicate via a shared event bus** — no tight coupling. Each agent publishes events (`jobs:discovered`, `resume:ready`, `recruiter:found`, etc.) and the orchestrator coordinates.

---

## Setup

### 1. Install dependencies

```bash
cd linkedin-bot
npm install
npx playwright install chromium
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:
```env
LINKEDIN_EMAIL=you@example.com
LINKEDIN_PASSWORD=your_password
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Fill in your resume

Edit `config/resume.json` — this is the master resume all agents work from. Fill in every field with real information.

### 4. Set your preferences

Edit `config/user-profile.json` to set your target roles, tone preferences, job filters, and outreach settings.

---

## Usage

```bash
# Full run: apply to all saved jobs + reach out to recruiters (recommended first time: dry-run)
npm run start:dry-run       # generates PDFs + logs everything, submits nothing
npm start                   # full agent team run

# Targeted runs
npm run start:apply         # only apply (no recruiter outreach)
npm run start:connect       # only connect with recruiters (no applications)
```

---

## Agent Communication (Event Bus)

Agents coordinate through a central `MessageBus` (event emitter). Key events:

| Event | From | Carries |
|---|---|---|
| `jobs:discovered` | JobScoutAgent | Array of filtered job objects |
| `resume:ready` | ResumeTailorAgent | `tailoredResume`, `resumePdfPath` |
| `coverletter:ready` | CoverLetterAgent | `coverLetterText`, `coverLetterPdfPath` |
| `job:applied` | ApplicationAgent | `jobId`, `title`, `company` |
| `recruiter:found` | RecruiterHunterAgent | `recruiter` (name, title, profileUrl) |
| `outreach:complete` | OutreachAgent | `connected`, `messageSent` |
| `agent:status` | Any agent | `started` / `completed` lifecycle events |
| `agent:error` | Any agent | Error details for orchestrator handling |

---

## Output

```
output/
├── resumes/                 ← Tailored PDF resume per job
├── cover-letters/           ← Tailored PDF cover letter per job
├── logs/                    ← Session logs with timestamps
└── applied-jobs.json        ← Applied-job registry (prevents re-applying)
```

---

## Architecture

```
linkedin-bot/
├── src/
│   ├── index.js                      ← Entry point
│   ├── core/
│   │   ├── agentBase.js              ← Abstract base class for all agents
│   │   ├── messageBus.js             ← Shared event bus (pub/sub)
│   │   ├── sharedState.js            ← Shared job-processing state
│   │   └── browserPool.js            ← Singleton browser session
│   ├── agents/
│   │   ├── orchestratorAgent.js      ← Master coordinator (Claude AI)
│   │   ├── jobScoutAgent.js          ← LinkedIn scraper
│   │   ├── resumeTailorAgent.js      ← Resume tailoring (Claude AI)
│   │   ├── coverLetterAgent.js       ← Cover letter writing (Claude AI)
│   │   ├── applicationAgent.js       ← Easy Apply automation (Claude AI + Browser)
│   │   ├── recruiterHunterAgent.js   ← Recruiter finder (Browser)
│   │   └── outreachAgent.js          ← Connection + DM (Claude AI + Browser)
│   └── utils/
│       ├── humanize.js               ← Random delays, typing, mouse simulation
│       ├── logger.js                 ← Colored console + file logging
│       └── pdf.js                    ← HTML → PDF via Playwright
├── templates/
│   ├── resume.html                   ← ATS-friendly resume template
│   └── coverLetter.html              ← Professional letterhead template
└── config/
    ├── resume.json                   ← YOUR master resume (fill this in!)
    └── user-profile.json             ← Job preferences + bot behavior
```

---

## Safety Notes

- **LinkedIn ToS**: Automated scraping/automation may violate LinkedIn's Terms of Service. Use responsibly and at your own risk.
- **2FA**: If LinkedIn triggers a challenge, set `HEADLESS=false` in `.env` to complete it manually.
- **Rate limiting**: Built-in 30–90 second cooldowns between jobs. Agents use human-like typing and mouse movements.
- **Easy Apply only**: The bot only applies to jobs with the Easy Apply button.
- **Always dry-run first**: Run `npm run start:dry-run` to review generated resumes and cover letters before enabling live submission.
