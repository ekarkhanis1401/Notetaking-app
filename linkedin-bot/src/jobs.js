/**
 * jobs.js
 * Scrapes saved jobs from LinkedIn's "My Jobs → Saved" section.
 * Returns a structured list of job objects ready for processing.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { randomDelay, thinkingPause, humanScroll, readingPause } from './utils/humanize.js';
import dayjs from 'dayjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '../output');
const APPLIED_LOG = join(OUTPUT_DIR, 'applied-jobs.json');

mkdirSync(OUTPUT_DIR, { recursive: true });

// Load previously applied jobs to skip duplicates
function loadAppliedJobs() {
  if (!existsSync(APPLIED_LOG)) return new Set();
  const data = JSON.parse(readFileSync(APPLIED_LOG, 'utf8'));
  return new Set(data.map(j => j.jobId));
}

function markJobApplied(job) {
  const applied = existsSync(APPLIED_LOG)
    ? JSON.parse(readFileSync(APPLIED_LOG, 'utf8'))
    : [];
  applied.push({ jobId: job.jobId, title: job.title, company: job.company, appliedAt: new Date().toISOString() });
  writeFileSync(APPLIED_LOG, JSON.stringify(applied, null, 2));
}

// ─── Scrape saved jobs list ───────────────────────────────────────────────────
/**
 * Navigates to LinkedIn "My Jobs / Saved" and returns all saved job listings.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<Array<JobListing>>}
 */
export async function fetchSavedJobs(page) {
  logger.info('[Jobs] Navigating to LinkedIn Saved Jobs...');

  await page.goto('https://www.linkedin.com/my-items/saved-jobs/', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await thinkingPause();

  // Scroll to load all saved jobs (lazy-loaded)
  logger.info('[Jobs] Scrolling to load all saved jobs...');
  let previousCount = 0;
  let scrollAttempts = 0;

  while (scrollAttempts < 10) {
    await humanScroll(page, 800);
    await randomDelay(1200, 2500);

    const currentCount = await page.locator('.scaffold-layout__list .artdeco-entity-lockup').count();
    if (currentCount === previousCount) break;
    previousCount = currentCount;
    scrollAttempts++;
  }

  // Extract job cards
  const jobCards = await page.locator('.jobs-saved-jobs__job-card-wrapper, .scaffold-layout__list-item').all();
  logger.info(`[Jobs] Found ${jobCards.length} saved job(s). Extracting details...`);

  const appliedJobIds = loadAppliedJobs();
  const userProfile = JSON.parse(readFileSync(join(__dirname, '../config/user-profile.json'), 'utf8'));
  const maxJobs = parseInt(process.env.MAX_JOBS_PER_SESSION || '10', 10);
  const maxAgeDays = userProfile.jobFilters.skipIfJobOlderThanDays || 14;

  const jobs = [];

  for (const card of jobCards) {
    if (jobs.length >= maxJobs) break;

    try {
      // Click card to open job detail panel
      await card.click();
      await randomDelay(1500, 3000);

      const job = await extractJobFromPage(page, card);

      if (!job) continue;

      // Apply filters
      if (appliedJobIds.has(job.jobId) && userProfile.jobFilters.skipIfAlreadyApplied) {
        logger.dim(`[Jobs] Skipping already-applied job: ${job.title} @ ${job.company}`);
        continue;
      }

      if (isJobTooOld(job.postedDate, maxAgeDays)) {
        logger.dim(`[Jobs] Skipping job older than ${maxAgeDays} days: ${job.title} @ ${job.company}`);
        continue;
      }

      if (shouldSkipJob(job, userProfile.jobFilters)) {
        logger.dim(`[Jobs] Skipping due to keyword filter: ${job.title} @ ${job.company}`);
        continue;
      }

      jobs.push(job);
      logger.info(`[Jobs] Queued: ${job.title} @ ${job.company}`);

    } catch (err) {
      logger.warn(`[Jobs] Could not parse job card: ${err.message}`);
    }

    await readingPause();
  }

  logger.success(`[Jobs] Queued ${jobs.length} job(s) for processing.`);
  return jobs;
}

// ─── Extract full job details from the detail panel ─────────────────────────
async function extractJobFromPage(page, card) {
  try {
    // Wait for detail panel to load
    await page.waitForSelector('.jobs-unified-top-card', { timeout: 8000 }).catch(() => {});

    const titleEl = page.locator('.jobs-unified-top-card__job-title, h1.t-24').first();
    const companyEl = page.locator('.jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping a').first();
    const locationEl = page.locator('.jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type').first();
    const descriptionEl = page.locator('.jobs-description__content, .jobs-box__html-content').first();
    const postedEl = page.locator('.jobs-unified-top-card__posted-date, .tvm__text--positive').first();

    const title = await titleEl.textContent({ timeout: 5000 }).then(t => t?.trim()).catch(() => null);
    if (!title) return null;

    const company = await companyEl.textContent({ timeout: 5000 }).then(t => t?.trim()).catch(() => 'Unknown Company');
    const location = await locationEl.textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => '');
    const description = await descriptionEl.textContent({ timeout: 5000 }).then(t => t?.trim()).catch(() => '');
    const postedDate = await postedEl.textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => '');
    const url = page.url();
    const jobIdMatch = url.match(/\/jobs\/view\/(\d+)/);
    const jobId = jobIdMatch ? jobIdMatch[1] : `${company}-${title}`.replace(/\W+/g, '-');

    // Check for Easy Apply
    const hasEasyApply = await page.locator('.jobs-apply-button--top-card, .artdeco-button--primary').first()
      .textContent({ timeout: 3000 })
      .then(t => t?.toLowerCase().includes('easy apply'))
      .catch(() => false);

    return {
      jobId,
      title,
      company,
      location,
      description: description.slice(0, 8000), // Cap at 8K chars for Claude
      postedDate,
      url,
      hasEasyApply,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`[Jobs] Error extracting job details: ${err.message}`);
    return null;
  }
}

// ─── Filter helpers ───────────────────────────────────────────────────────────
function isJobTooOld(postedDateStr, maxDays) {
  if (!postedDateStr) return false;
  // LinkedIn uses "3 days ago", "2 weeks ago", "1 month ago"
  const str = postedDateStr.toLowerCase();
  if (str.includes('month') || str.includes('months')) {
    const months = parseInt(str) || 1;
    return months * 30 > maxDays;
  }
  if (str.includes('week') || str.includes('weeks')) {
    const weeks = parseInt(str) || 1;
    return weeks * 7 > maxDays;
  }
  if (str.includes('day') || str.includes('days')) {
    const days = parseInt(str) || 1;
    return days > maxDays;
  }
  return false;
}

function shouldSkipJob(job, filters) {
  const text = `${job.title} ${job.description}`.toLowerCase();

  for (const kw of (filters.skipKeywords || [])) {
    if (text.includes(kw.toLowerCase())) return true;
  }

  if (filters.requireKeywords && filters.requireKeywords.length > 0) {
    const hasRequired = filters.requireKeywords.some(kw => text.includes(kw.toLowerCase()));
    if (!hasRequired) return true;
  }

  return false;
}

// ─── Export markJobApplied for use in apply.js ────────────────────────────────
export { markJobApplied };
