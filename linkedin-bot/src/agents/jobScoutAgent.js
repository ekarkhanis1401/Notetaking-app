/**
 * jobScoutAgent.js
 * Claude-powered AI agent that scouts LinkedIn Saved Jobs.
 *
 * This agent runs a ReAct loop: Claude navigates LinkedIn, reads job cards,
 * reasons about each job's fit against the candidate's profile, scores them,
 * and decides which jobs are worth pursuing — no hardcoded filter logic.
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomDelay, thinkingPause, humanScroll } from '../utils/humanize.js';
import { loadAppliedJobIds, upsertJobRecord, TRACKER_PATH } from '../utils/tracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(__dirname, '../../output'), { recursive: true });

const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));
const MAX_JOBS = parseInt(process.env.MAX_JOBS_PER_SESSION || '10', 10);

// ── Tool definitions that Claude can call ─────────────────────────────────────
const TOOLS = [
  {
    name: 'navigate_to_saved_jobs',
    description: 'Navigate the browser to the LinkedIn Saved Jobs page and wait for it to load.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'scroll_page',
    description: 'Scroll the page down to trigger lazy-loaded job cards.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_job_card_count',
    description: 'Return the number of job cards currently visible on the Saved Jobs page.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'click_job_card',
    description: 'Click the Nth job card (0-indexed) to open its detail panel.',
    input_schema: {
      type: 'object',
      properties: { index: { type: 'number', description: '0-based index of the card to click' } },
      required: ['index'],
    },
  },
  {
    name: 'get_job_details',
    description: 'Extract the title, company, location, description, posted date, Easy Apply flag, URL, and jobId from the currently open job detail panel.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'score_job_fit',
    description: 'Analyse a job description against the candidate profile and return a fit score (0-100) with a short rationale.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        title: { type: 'string' },
        company: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['jobId', 'title', 'company', 'description'],
    },
  },
  {
    name: 'mark_job_queued',
    description: 'Accept a job for processing by the rest of the agent team.',
    input_schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        title: { type: 'string' },
        company: { type: 'string' },
        location: { type: 'string' },
        description: { type: 'string' },
        postedDate: { type: 'string' },
        url: { type: 'string' },
        hasEasyApply: { type: 'boolean' },
        fitScore: { type: 'number' },
        fitRationale: { type: 'string' },
      },
      required: ['jobId', 'title', 'company', 'description'],
    },
  },
  {
    name: 'report_done',
    description: 'Signal that job scouting is complete and return the list of queued jobs.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

export class JobScoutAgent extends AgentBase {
  constructor() {
    super(
      'JobScoutAgent',
      'Scouts and scores LinkedIn Saved Jobs',
      // System prompt is built async in onRun — placeholder here
      'You are a LinkedIn job scout. Await task instructions.'
    );
    this._queuedJobs = [];
    this._page = null;
    this._appliedIds = new Set();
  }

  async onInit() {
    // Load applied IDs from the Excel tracker before scouting
    this._appliedIds = await loadAppliedJobIds();
    this._log(`Loaded ${this._appliedIds.size} previously applied job(s) from Excel tracker (${TRACKER_PATH})`);

    // Rebuild system prompt now that we have the applied IDs
    this._systemPrompt = `You are an expert job-fit analyst and LinkedIn job scout. Your job is to:
1. Navigate to the LinkedIn Saved Jobs page
2. Scroll to load all job cards
3. Click through each job card and read its details
4. Score each job's fit (0-100) against the candidate's profile below
5. Queue only jobs with fit score ≥ 60 that have Easy Apply enabled
6. Stop when you have queued ${MAX_JOBS} jobs or reviewed all cards

CANDIDATE PROFILE:
${JSON.stringify(userProfile.applicant, null, 2)}

JOB FILTERS:
${JSON.stringify(userProfile.jobFilters, null, 2)}

ALREADY APPLIED JOBS — skip these job IDs (already in tracker):
${JSON.stringify([...this._appliedIds], null, 2)}

Be methodical. After navigating and scrolling, click each card in order, get its details, score it, then decide to queue or skip it. Call report_done when finished.`;
  }

  async onRun() {
    this._page = await browserPool.getPage();
    this._queuedJobs = [];

    const goal = `Scout LinkedIn Saved Jobs, score each job against the candidate profile, and queue the best-matching ones (max ${MAX_JOBS}). Start by navigating to the saved jobs page.`;

    await this._runAgentLoop(goal, TOOLS, this._handleTool.bind(this));

    this._publish('jobs:discovered', { jobs: this._queuedJobs });
    this._log(`Dispatched ${this._queuedJobs.length} job(s) to the team.`);
    return this._queuedJobs;
  }

  // ── Tool handler ─────────────────────────────────────────────────────────
  async _handleTool(name, input) {
    const page = this._page;

    switch (name) {
      case 'navigate_to_saved_jobs': {
        await page.goto('https://www.linkedin.com/my-items/saved-jobs/', {
          waitUntil: 'networkidle', timeout: 30_000,
        });
        await thinkingPause();
        return 'Navigated to LinkedIn Saved Jobs page.';
      }

      case 'scroll_page': {
        await humanScroll(page, 1000);
        await randomDelay(1200, 2500);
        return 'Page scrolled.';
      }

      case 'get_job_card_count': {
        const count = await page.locator('.scaffold-layout__list-item').count();
        return `${count} job cards are visible.`;
      }

      case 'click_job_card': {
        const cards = await page.locator('.scaffold-layout__list-item').all();
        if (input.index >= cards.length) return `Index ${input.index} out of range (${cards.length} cards).`;
        await cards[input.index].click();
        await randomDelay(1500, 3000);
        return `Clicked job card ${input.index}.`;
      }

      case 'get_job_details': {
        await page.waitForSelector('.jobs-unified-top-card', { timeout: 8000 }).catch(() => {});
        const get = async (sel) =>
          page.locator(sel).first().textContent({ timeout: 4000 }).then(t => t?.trim() ?? '').catch(() => '');

        const title = await get('.jobs-unified-top-card__job-title, h1.t-24');
        if (!title) return 'Could not read job details from panel.';

        const company = await get('.jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping a');
        const location = await get('.jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type');
        const description = await get('.jobs-description__content, .jobs-box__html-content');
        const postedDate = await get('.jobs-unified-top-card__posted-date, .tvm__text--positive');
        const url = page.url();
        const jobIdMatch = url.match(/\/jobs\/view\/(\d+)/);
        const jobId = jobIdMatch?.[1] ?? `${company}-${title}`.replace(/\W+/g, '-');
        const easyApplyText = await page.locator('.jobs-apply-button--top-card, .artdeco-button--primary')
          .first().textContent({ timeout: 3000 }).catch(() => '');
        const hasEasyApply = easyApplyText.toLowerCase().includes('easy apply');

        return JSON.stringify({ jobId, title, company, location, description: description.slice(0, 5000), postedDate, url, hasEasyApply });
      }

      case 'score_job_fit': {
        // Claude-within-Claude: the agent reasons about fit
        const prompt = `Rate the fit (0-100) of this job for the candidate.

CANDIDATE: ${userProfile.applicant.currentRole}, ${userProfile.applicant.yearsOfExperience} yrs exp.
TARGET ROLES: ${userProfile.applicant.targetRoles.join(', ')}
TARGET INDUSTRIES: ${userProfile.applicant.targetIndustries.join(', ')}

JOB: ${input.title} at ${input.company}
DESCRIPTION EXCERPT: ${input.description?.slice(0, 1500)}

Reply with JSON: {"score": <0-100>, "rationale": "<1-2 sentences>"}. Nothing else.`;

        const raw = await this._think(prompt, 300);
        try {
          const parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
          return JSON.stringify(parsed);
        } catch {
          return JSON.stringify({ score: 50, rationale: 'Could not parse score — treating as average fit.' });
        }
      }

      case 'mark_job_queued': {
        if (this._queuedJobs.length >= MAX_JOBS) return `Max jobs (${MAX_JOBS}) already queued.`;
        this._queuedJobs.push({ ...input, scrapedAt: new Date().toISOString() });
        this._log(`Queued [${this._queuedJobs.length}/${MAX_JOBS}] → ${input.title} @ ${input.company} (fit: ${input.fitScore ?? 'N/A'})`);
        return `Job queued. ${MAX_JOBS - this._queuedJobs.length} slots remaining.`;
      }

      case 'report_done': {
        return `Scouting complete. ${this._queuedJobs.length} job(s) queued: ${this._queuedJobs.map(j => `${j.title} @ ${j.company}`).join('; ')}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }

  /**
   * Write an "Applied" row to the Excel tracker immediately after a successful
   * application. Full session data is also written at end-of-session by the
   * orchestrator — this call ensures the record exists even if the session crashes.
   */
  static async recordApplied(job) {
    await upsertJobRecord({
      jobId:   job.jobId,
      title:   job.title,
      company: job.company,
      location: job.location,
      url:     job.url,
      applied: true,
      status:  'done',
    });
  }
}
