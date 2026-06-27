/**
 * recruiterHunterAgent.js
 * Locates the hiring manager or recruiter for a given job using two strategies:
 *  1. "Meet the hiring team" section on the job listing page
 *  2. LinkedIn people search: `recruiter "<CompanyName>"`
 * Emits recruiter:found with profile details for OutreachAgent to act on.
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { thinkingPause, randomDelay, readingPause } from '../utils/humanize.js';

export class RecruiterHunterAgent extends AgentBase {
  constructor() {
    super(
      'RecruiterHunterAgent',
      'Finds the hiring manager or recruiter for each job via LinkedIn'
    );
  }

  /**
   * @param {{ job: object }} input
   * @returns {{ recruiter: object|null }}
   */
  async onRun({ job }) {
    this._log(`Hunting recruiter for: ${job.title} @ ${job.company}`);
    const page = await browserPool.getPage();

    // Strategy 1: "Meet the hiring team" on the job page
    let recruiter = await this._fromJobPage(page, job);

    // Strategy 2: People search
    if (!recruiter) {
      recruiter = await this._fromSearch(page, job);
    }

    if (recruiter) {
      this._log(`Found: ${recruiter.name ?? 'Unknown'} (${recruiter.title ?? 'Recruiter'}) at ${job.company}`);
      this._publish('recruiter:found', { jobId: job.jobId, recruiter });
    } else {
      this._log(`No recruiter found for ${job.company}`, 'warn');
      this._publish('recruiter:found', { jobId: job.jobId, recruiter: null });
    }

    return { recruiter };
  }

  async _fromJobPage(page, job) {
    try {
      if (!page.url().includes(job.jobId) && job.url) {
        await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await thinkingPause();
      }

      const card = page.locator('.hirer-card__hirer-information, .jobs-poster__hirer-card').first();
      if (!(await card.isVisible({ timeout: 5000 }).catch(() => false))) return null;

      const name = await card.locator('.hirer-card__hirer-name, .app-aware-link').first()
        .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
      const title = await card.locator('.hirer-card__hirer-title, .t-black--light').first()
        .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
      const href = await card.locator('a.app-aware-link').first()
        .getAttribute('href', { timeout: 3000 }).catch(() => null);

      if (!href) return null;

      const profileUrl = href.startsWith('http')
        ? href.split('?')[0]
        : `https://www.linkedin.com${href.split('?')[0]}`;

      return { name, title, profileUrl, source: 'job-page' };

    } catch {
      return null;
    }
  }

  async _fromSearch(page, job) {
    try {
      this._log(`Searching LinkedIn for recruiter at ${job.company}...`);
      const q = encodeURIComponent(`recruiter "${job.company}"`);
      await page.goto(
        `https://www.linkedin.com/search/results/people/?keywords=${q}&origin=GLOBAL_SEARCH_HEADER`,
        { waitUntil: 'domcontentloaded', timeout: 20_000 }
      );
      await thinkingPause();

      const first = page.locator('.reusable-search__result-container, .entity-result').first();
      if (!(await first.isVisible({ timeout: 8000 }).catch(() => false))) return null;

      const name = await first.locator('.entity-result__title-text a, .app-aware-link').first()
        .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
      const title = await first.locator('.entity-result__primary-subtitle').first()
        .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
      const href = await first.locator('a.app-aware-link').first()
        .getAttribute('href', { timeout: 3000 }).catch(() => null);

      if (!href) return null;

      const profileUrl = href.startsWith('http')
        ? href.split('?')[0]
        : `https://www.linkedin.com${href.split('?')[0]}`;

      return { name, title, profileUrl, source: 'search' };

    } catch (err) {
      this._log(`Search error: ${err.message}`, 'warn');
      return null;
    }
  }
}
