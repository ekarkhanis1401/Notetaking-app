/**
 * jobScoutAgent.js
 * Scrapes LinkedIn "Saved Jobs", applies filters, and reports discovered jobs
 * to the orchestrator via the message bus.
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomDelay, thinkingPause, humanScroll, readingPause } from '../utils/humanize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '../../output');
const APPLIED_LOG = join(OUTPUT_DIR, 'applied-jobs.json');

mkdirSync(OUTPUT_DIR, { recursive: true });

export class JobScoutAgent extends AgentBase {
  constructor() {
    super(
      'JobScoutAgent',
      'Scans LinkedIn Saved Jobs, filters irrelevant listings, queues valid jobs for the team'
    );
    this._userProfile = JSON.parse(
      readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8')
    );
  }

  async onRun() {
    const page = await browserPool.getPage();
    this._log('Navigating to LinkedIn Saved Jobs...');

    await page.goto('https://www.linkedin.com/my-items/saved-jobs/', {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    await thinkingPause();

    // Scroll to trigger lazy loading
    let prevCount = 0;
    for (let i = 0; i < 10; i++) {
      await humanScroll(page, 800);
      await randomDelay(1200, 2500);
      const count = await page.locator('.scaffold-layout__list-item').count();
      if (count === prevCount) break;
      prevCount = count;
    }

    const cards = await page.locator('.scaffold-layout__list-item').all();
    this._log(`Found ${cards.length} saved job card(s). Extracting details...`);

    const appliedIds = this._loadAppliedIds();
    const maxJobs = parseInt(process.env.MAX_JOBS_PER_SESSION || '10', 10);
    const jobs = [];

    for (const card of cards) {
      if (jobs.length >= maxJobs) break;
      try {
        await card.click();
        await randomDelay(1500, 3000);
        const job = await this._extractJob(page);
        if (!job) continue;
        if (this._shouldSkip(job, appliedIds)) continue;
        jobs.push(job);
        this._log(`Queued → ${job.title} @ ${job.company}`);
      } catch (err) {
        this._log(`Card parse error: ${err.message}`, 'warn');
      }
      await readingPause();
    }

    this._publish('jobs:discovered', { jobs });
    this._log(`Dispatched ${jobs.length} job(s) to the team.`);
    return jobs;
  }

  async _extractJob(page) {
    await page.waitForSelector('.jobs-unified-top-card', { timeout: 8000 }).catch(() => {});

    const get = async (selector, timeout = 5000) =>
      page.locator(selector).first().textContent({ timeout }).then(t => t?.trim()).catch(() => null);

    const title = await get('.jobs-unified-top-card__job-title, h1.t-24');
    if (!title) return null;

    const company = await get('.jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping a') ?? 'Unknown';
    const location = await get('.jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type') ?? '';
    const description = await get('.jobs-description__content, .jobs-box__html-content') ?? '';
    const postedDate = await get('.jobs-unified-top-card__posted-date, .tvm__text--positive') ?? '';

    const url = page.url();
    const jobIdMatch = url.match(/\/jobs\/view\/(\d+)/);
    const jobId = jobIdMatch?.[1] ?? `${company}-${title}`.replace(/\W+/g, '-');

    const hasEasyApply = await page
      .locator('.jobs-apply-button--top-card, .artdeco-button--primary')
      .first()
      .textContent({ timeout: 3000 })
      .then(t => t?.toLowerCase().includes('easy apply'))
      .catch(() => false);

    return {
      jobId,
      title,
      company,
      location,
      description: description.slice(0, 8000),
      postedDate,
      url,
      hasEasyApply,
      scrapedAt: new Date().toISOString(),
    };
  }

  _shouldSkip(job, appliedIds) {
    const filters = this._userProfile.jobFilters;

    if (appliedIds.has(job.jobId) && filters.skipIfAlreadyApplied) {
      this._log(`Already applied — skipping: ${job.title} @ ${job.company}`);
      return true;
    }

    if (this._isTooOld(job.postedDate, filters.skipIfJobOlderThanDays ?? 14)) {
      this._log(`Too old — skipping: ${job.title} @ ${job.company}`);
      return true;
    }

    const text = `${job.title} ${job.description}`.toLowerCase();
    for (const kw of filters.skipKeywords ?? []) {
      if (text.includes(kw.toLowerCase())) {
        this._log(`Keyword filter "${kw}" — skipping: ${job.title}`);
        return true;
      }
    }

    return false;
  }

  _isTooOld(str = '', maxDays) {
    const s = str.toLowerCase();
    if (s.includes('month')) return (parseInt(s) || 1) * 30 > maxDays;
    if (s.includes('week')) return (parseInt(s) || 1) * 7 > maxDays;
    if (s.includes('day')) return (parseInt(s) || 1) > maxDays;
    return false;
  }

  _loadAppliedIds() {
    if (!existsSync(APPLIED_LOG)) return new Set();
    return new Set(JSON.parse(readFileSync(APPLIED_LOG, 'utf8')).map(j => j.jobId));
  }

  // Called by ApplicationAgent after a successful apply
  static recordApplied(job) {
    const existing = existsSync(APPLIED_LOG)
      ? JSON.parse(readFileSync(APPLIED_LOG, 'utf8'))
      : [];
    existing.push({ jobId: job.jobId, title: job.title, company: job.company, appliedAt: new Date().toISOString() });
    writeFileSync(APPLIED_LOG, JSON.stringify(existing, null, 2));
  }
}
