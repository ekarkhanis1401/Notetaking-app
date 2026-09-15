/**
 * recruiterHunterAgent.js
 * Claude-powered AI agent that finds the right recruiter or hiring manager.
 *
 * ReAct loop: Claude decides where to look, reads search results, evaluates
 * candidates (title relevance, company match), and picks the best person
 * to contact for the given role.
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { thinkingPause, randomDelay } from '../utils/humanize.js';

const TOOLS = [
  {
    name: 'check_job_page_hiring_team',
    description: 'Check if the current job listing has a "Meet the hiring team" section, and if so extract the recruiter/HM details.',
    input_schema: {
      type: 'object',
      properties: { jobUrl: { type: 'string' } },
      required: ['jobUrl'],
    },
  },
  {
    name: 'search_linkedin_people',
    description: 'Search LinkedIn people for a recruiter or hiring manager at a specific company.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query, e.g. "recruiter Stripe" or "engineering manager Stripe"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_search_results',
    description: 'Read the top N people search results from the current search results page.',
    input_schema: {
      type: 'object',
      properties: { topN: { type: 'number', description: 'How many results to read (max 5)' } },
      required: ['topN'],
    },
  },
  {
    name: 'evaluate_and_select',
    description: 'Evaluate a list of candidates (name, title, company) and select the most appropriate one to contact for the role.',
    input_schema: {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              title: { type: 'string' },
              profileUrl: { type: 'string' },
              company: { type: 'string' },
            },
          },
        },
        jobTitle: { type: 'string' },
        company: { type: 'string' },
      },
      required: ['candidates', 'jobTitle', 'company'],
    },
  },
  {
    name: 'report_recruiter',
    description: 'Report the selected recruiter/HM to the orchestrator.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        title: { type: 'string' },
        profileUrl: { type: 'string' },
        company: { type: 'string' },
        source: { type: 'string', description: 'Where the recruiter was found: job-page, search' },
      },
      required: ['profileUrl'],
    },
  },
  {
    name: 'report_not_found',
    description: 'Report that no suitable recruiter was found for this company.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

export class RecruiterHunterAgent extends AgentBase {
  constructor() {
    super(
      'RecruiterHunterAgent',
      'Finds the best recruiter or hiring manager to contact for each role',
      `You are an expert LinkedIn researcher specialising in identifying the right people to reach out to during a job search.

Your goal: find the most appropriate recruiter or hiring manager to contact for a given role.

PRIORITY ORDER for who to contact:
1. Recruiter/Talent Acquisition person explicitly listed on the job page ("Meet the hiring team")
2. Technical recruiter or talent acquisition partner at the company found via people search
3. Hiring manager or engineering manager for the relevant team
4. HR generalist as a last resort

STRATEGY:
1. First check the job page for a "Meet the hiring team" section — if found and it's a recruiter or HM, use it
2. If not found, search LinkedIn people with targeted queries
3. Read the top results and evaluate who is the most appropriate contact
4. Pick ONE person — the most relevant and reachable

When evaluating candidates, prefer: recent hires, people with "Recruiter", "Talent", "Technical Recruiter", or "TA" in their title, who currently work at the target company.`
    );
    this._foundRecruiter = null;
    this._page = null;
  }

  async onRun({ job }) {
    this._foundRecruiter = null;
    this._page = await browserPool.getPage();

    const goal = `Find the best recruiter or hiring manager to contact for this role:
Title: ${job.title}
Company: ${job.company}
Job URL: ${job.url}

Start by checking the job page for a "Meet the hiring team" section. If not found, search LinkedIn people for a recruiter at ${job.company}.`;

    await this._runAgentLoop(goal, TOOLS, this._handleTool.bind(this));

    this._publish('recruiter:found', { jobId: job.jobId, recruiter: this._foundRecruiter });
    return { recruiter: this._foundRecruiter };
  }

  async _handleTool(name, input) {
    const page = this._page;

    switch (name) {
      case 'check_job_page_hiring_team': {
        if (!page.url().includes(input.jobUrl?.split('/').pop() ?? '__')) {
          await page.goto(input.jobUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
          await thinkingPause();
        }

        const card = page.locator('.hirer-card__hirer-information, .jobs-poster__hirer-card').first();
        if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) {
          return 'No "Meet the hiring team" section found on this job page.';
        }

        const name = await card.locator('.hirer-card__hirer-name, .app-aware-link').first()
          .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
        const title = await card.locator('.hirer-card__hirer-title, .t-black--light').first()
          .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
        const href = await card.locator('a.app-aware-link').first()
          .getAttribute('href', { timeout: 3000 }).catch(() => null);

        if (!href) return 'Hiring team section found but could not extract profile link.';

        const profileUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.linkedin.com${href.split('?')[0]}`;
        return JSON.stringify({ name, title, profileUrl, source: 'job-page' });
      }

      case 'search_linkedin_people': {
        const q = encodeURIComponent(input.query);
        await page.goto(
          `https://www.linkedin.com/search/results/people/?keywords=${q}&origin=GLOBAL_SEARCH_HEADER`,
          { waitUntil: 'domcontentloaded', timeout: 20_000 }
        );
        await thinkingPause();
        return `Search executed for: "${input.query}". Call get_search_results to read the results.`;
      }

      case 'get_search_results': {
        const topN = Math.min(input.topN || 3, 5);
        const results = await page.locator('.reusable-search__result-container, .entity-result').all();
        const candidates = [];

        for (let i = 0; i < Math.min(topN, results.length); i++) {
          const r = results[i];
          const name = await r.locator('.entity-result__title-text a, .app-aware-link').first()
            .textContent({ timeout: 2000 }).then(t => t?.trim()).catch(() => null);
          const title = await r.locator('.entity-result__primary-subtitle').first()
            .textContent({ timeout: 2000 }).then(t => t?.trim()).catch(() => null);
          const company = await r.locator('.entity-result__secondary-subtitle').first()
            .textContent({ timeout: 2000 }).then(t => t?.trim()).catch(() => null);
          const href = await r.locator('a.app-aware-link').first()
            .getAttribute('href', { timeout: 2000 }).catch(() => null);

          if (!name || !href) continue;

          candidates.push({
            name,
            title,
            company,
            profileUrl: href.startsWith('http') ? href.split('?')[0] : `https://www.linkedin.com${href.split('?')[0]}`,
          });
        }

        return candidates.length > 0
          ? JSON.stringify(candidates, null, 2)
          : 'No results found for this search.';
      }

      case 'evaluate_and_select': {
        const evaluation = await this._think(
          `Evaluate these LinkedIn profiles and select the most appropriate person to contact for the job.

JOB: ${input.jobTitle} at ${input.company}

CANDIDATES:
${JSON.stringify(input.candidates, null, 2)}

SELECTION CRITERIA (in priority order):
1. Works at ${input.company} (mandatory)
2. Title contains "Recruiter", "Talent", "TA", or "Hiring" (strongly preferred)
3. Title contains "Engineering Manager", "VP Engineering", or hiring authority for this role (acceptable)
4. Most recently active / senior person

Pick ONE candidate. Reply with JSON: {"selectedIndex": <0-based index>, "reason": "<1 sentence>"}
If no candidate is suitable (e.g., none work at ${input.company}), reply: {"selectedIndex": -1, "reason": "<why>"}`,
          400
        );

        try {
          const { selectedIndex, reason } = JSON.parse(evaluation.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
          if (selectedIndex < 0 || selectedIndex >= input.candidates.length) {
            return `No suitable candidate selected. Reason: ${reason}`;
          }
          const selected = input.candidates[selectedIndex];
          return JSON.stringify({ ...selected, evaluationReason: reason });
        } catch {
          return 'Could not parse evaluation result.';
        }
      }

      case 'report_recruiter': {
        this._foundRecruiter = { ...input };
        this._log(`Found recruiter: ${input.name ?? 'Unknown'} (${input.title ?? 'Recruiter'}) at ${input.company ?? 'target company'}`);
        return `Recruiter reported: ${input.name ?? 'Unknown'}`;
      }

      case 'report_not_found': {
        this._foundRecruiter = null;
        return 'No recruiter found — skipping outreach for this job.';
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}
