/**
 * recruiter.js
 * Finds the hiring manager or recruiter for a job and:
 *  1. Sends a personalized LinkedIn connection request with a note.
 *  2. After connecting, sends a compelling follow-up DM.
 */

import { logger } from './utils/logger.js';
import { humanClick, humanType, randomDelay, thinkingPause, readingPause, microPause } from './utils/humanize.js';
import { generateConnectionNote, generateRecruiterMessage } from './claude.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * Finds the recruiter/HM for a job and sends a connection + personalized message.
 *
 * @param {import('playwright').Page} page
 * @param {object} job
 * @returns {{ connected: boolean, messageSent: boolean, recruiter: object|null }}
 */
export async function connectAndMessageRecruiter(page, job) {
  const shouldConnect = process.env.AUTO_CONNECT !== 'false';
  const shouldMessage = process.env.SEND_RECRUITER_MESSAGE !== 'false';

  if (!shouldConnect) {
    logger.dim('[Recruiter] AUTO_CONNECT=false — skipping recruiter outreach.');
    return { connected: false, messageSent: false, recruiter: null };
  }

  logger.info(`[Recruiter] Finding recruiter/hiring manager for: ${job.title} @ ${job.company}`);

  // 1. Find recruiter from job page
  const recruiter = await findRecruiterFromJobPage(page, job);

  if (!recruiter || !recruiter.profileUrl) {
    // Fallback: search LinkedIn for a recruiter at this company
    const found = await searchForRecruiter(page, job);
    if (!found) {
      logger.warn(`[Recruiter] Could not find a recruiter for ${job.company} — skipping.`);
      return { connected: false, messageSent: false, recruiter: null };
    }
    Object.assign(recruiter || {}, found);
  }

  logger.info(`[Recruiter] Found: ${recruiter.name || 'Unknown'} (${recruiter.title || 'Recruiter'}) at ${job.company}`);

  // 2. Send connection request
  const connected = await sendConnectionRequest(page, recruiter, job);

  // 3. Send message (if connected or connection already existed)
  let messageSent = false;
  if (shouldMessage) {
    messageSent = await sendLinkedInMessage(page, recruiter, job);
  }

  return { connected, messageSent, recruiter };
}

// ─── Find recruiter from the job's "Meet the hiring team" section ─────────────
async function findRecruiterFromJobPage(page, job) {
  try {
    // Navigate to the job listing
    if (!page.url().includes(job.jobId) && job.url) {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await thinkingPause();
    }

    // LinkedIn shows "Meet the hiring team" on some job listings
    const hiringTeamSection = page.locator('.hirer-card__hirer-information, .jobs-poster__hirer-card').first();
    const isVisible = await hiringTeamSection.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isVisible) return null;

    const nameEl = hiringTeamSection.locator('.hirer-card__hirer-name, .app-aware-link').first();
    const titleEl = hiringTeamSection.locator('.hirer-card__hirer-title, .t-black--light').first();
    const linkEl = hiringTeamSection.locator('a.app-aware-link').first();

    const name = await nameEl.textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
    const title = await titleEl.textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
    const profileUrl = await linkEl.getAttribute('href', { timeout: 3000 }).catch(() => null);

    if (!name && !profileUrl) return null;

    return {
      name,
      title,
      profileUrl: profileUrl ? `https://www.linkedin.com${profileUrl.split('?')[0]}` : null,
    };
  } catch {
    return null;
  }
}

// ─── Search LinkedIn for a recruiter at the company ───────────────────────────
async function searchForRecruiter(page, job) {
  try {
    logger.info(`[Recruiter] Searching LinkedIn for recruiter at ${job.company}...`);

    // Search for "recruiter OR talent acquisition" at the company
    const searchQuery = encodeURIComponent(`recruiter "${job.company}"`);
    await page.goto(
      `https://www.linkedin.com/search/results/people/?keywords=${searchQuery}&origin=GLOBAL_SEARCH_HEADER`,
      { waitUntil: 'domcontentloaded', timeout: 20000 }
    );
    await thinkingPause();

    const firstResult = page.locator('.reusable-search__result-container, .entity-result').first();
    const isVisible = await firstResult.isVisible({ timeout: 8000 }).catch(() => false);
    if (!isVisible) return null;

    const nameEl = firstResult.locator('.entity-result__title-text a, .app-aware-link').first();
    const titleEl = firstResult.locator('.entity-result__primary-subtitle').first();
    const linkEl = firstResult.locator('a.app-aware-link').first();

    const name = await nameEl.textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
    const title = await titleEl.textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => null);
    const href = await linkEl.getAttribute('href', { timeout: 3000 }).catch(() => null);

    if (!href) return null;

    const profileUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.linkedin.com${href.split('?')[0]}`;

    return { name, title, profileUrl };
  } catch (err) {
    logger.warn(`[Recruiter] Search failed: ${err.message}`);
    return null;
  }
}

// ─── Send connection request with personalized note ───────────────────────────
async function sendConnectionRequest(page, recruiter, job) {
  try {
    if (!recruiter.profileUrl) return false;

    logger.info(`[Recruiter] Visiting profile: ${recruiter.profileUrl}`);
    await page.goto(recruiter.profileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await thinkingPause();

    // Check if already connected
    const alreadyConnected = await page.locator('button[aria-label*="Message"], .pvs-profile-actions__action').filter({ hasText: /^message$/i })
      .first().isVisible({ timeout: 3000 }).catch(() => false);

    if (alreadyConnected) {
      logger.dim('[Recruiter] Already connected — skipping connection request.');
      recruiter.alreadyConnected = true;
      return true;
    }

    // Find Connect button
    let connectBtn = page.locator('button').filter({ hasText: /^connect$/i }).first();
    let connectVisible = await connectBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!connectVisible) {
      // May be in a "More" dropdown
      const moreBtn = page.locator('button[aria-label="More actions"]').first();
      if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await humanClick(page, moreBtn);
        await randomDelay(800, 1500);
        connectBtn = page.locator('[role="menuitem"]').filter({ hasText: /^connect$/i }).first();
        connectVisible = await connectBtn.isVisible({ timeout: 3000 }).catch(() => false);
      }
    }

    if (!connectVisible) {
      logger.warn('[Recruiter] Connect button not found — may already be connected or profile not accessible.');
      return false;
    }

    await humanClick(page, connectBtn);
    await randomDelay(1000, 2000);

    // Click "Add a note"
    const addNoteBtn = page.locator('button[aria-label="Add a note"]').first();
    const addNoteVisible = await addNoteBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (addNoteVisible) {
      await humanClick(page, addNoteBtn);
      await randomDelay(800, 1500);

      // Generate personalized connection note via Claude
      const note = await generateConnectionNote(job, recruiter);
      logger.dim(`[Recruiter] Connection note (${note.length} chars): "${note.slice(0, 80)}..."`);

      const noteTextarea = page.locator('textarea[name="message"], #custom-message').first();
      await noteTextarea.waitFor({ state: 'visible', timeout: 5000 });
      await humanType(noteTextarea, note);
      await randomDelay(600, 1200);
    }

    // Send the request
    const sendBtn = page.locator('button[aria-label="Send invitation"], button[aria-label="Send now"]').first();
    const sendVisible = await sendBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (sendVisible) {
      await humanClick(page, sendBtn);
      await randomDelay(1500, 3000);
      logger.success(`[Recruiter] Connection request sent to: ${recruiter.name || 'recruiter'}`);
      return true;
    }

    logger.warn('[Recruiter] Send button not found — connection request may not have been sent.');
    return false;

  } catch (err) {
    logger.error(`[Recruiter] Connection request failed: ${err.message}`);
    return false;
  }
}

// ─── Send a LinkedIn DM ───────────────────────────────────────────────────────
async function sendLinkedInMessage(page, recruiter, job) {
  try {
    if (!recruiter.profileUrl) return false;

    // Navigate to profile if not already there
    if (!page.url().includes(recruiter.profileUrl?.split('/in/')[1])) {
      await page.goto(recruiter.profileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await thinkingPause();
    }

    // Find Message button (only available for connections/open profiles)
    const messageBtn = page.locator('button').filter({ hasText: /^message$/i }).first();
    const msgVisible = await messageBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!msgVisible) {
      logger.dim('[Recruiter] Message button not available — likely pending connection. Will message after they accept.');
      return false;
    }

    await humanClick(page, messageBtn);
    await randomDelay(1500, 3000);

    // Generate personalized message via Claude
    const message = await generateRecruiterMessage(job, recruiter);
    logger.dim(`[Recruiter] Message preview: "${message.slice(0, 100)}..."`);

    // Type into message compose box
    const composeBox = page.locator('.msg-form__contenteditable, [data-placeholder="Write a message…"]').first();
    await composeBox.waitFor({ state: 'visible', timeout: 8000 });
    await composeBox.click();
    await randomDelay(400, 800);

    // Type message character by character
    for (const char of message) {
      await page.keyboard.type(char, { delay: Math.floor(Math.random() * 120) + 40 });
      if (Math.random() < 0.03) await randomDelay(150, 500);
    }

    await randomDelay(1000, 2000);

    // Send the message
    const sendBtn = page.locator('button.msg-form__send-button, button[type="submit"]').first();
    const sendVisible = await sendBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (sendVisible) {
      await humanClick(page, sendBtn);
      await randomDelay(1500, 2500);
      logger.success(`[Recruiter] Message sent to: ${recruiter.name || 'recruiter'}`);
      return true;
    }

    logger.warn('[Recruiter] Send message button not found.');
    return false;

  } catch (err) {
    logger.error(`[Recruiter] Message failed: ${err.message}`);
    return false;
  }
}
