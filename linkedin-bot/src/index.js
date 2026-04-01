#!/usr/bin/env node
/**
 * index.js — LinkedIn Job Bot Orchestrator
 *
 * Modes (via --mode flag or AUTO_APPLY / AUTO_CONNECT env vars):
 *   apply    → Tailor resume, write cover letter, apply via Easy Apply
 *   connect  → Find recruiter, send connection + personalized message
 *   full     → Both (default)
 *   dry-run  → Simulate everything, generate PDFs, but do NOT submit anything
 *
 * Usage:
 *   node src/index.js
 *   node src/index.js --mode apply
 *   node src/index.js --mode connect
 *   node src/index.js --dry-run
 */

import 'dotenv/config';
import { logger } from './utils/logger.js';
import { ensureAuthenticated, closeBrowser } from './auth.js';
import { fetchSavedJobs } from './jobs.js';
import { buildTailoredResume } from './resume.js';
import { buildCoverLetter } from './coverLetter.js';
import { applyToJob } from './apply.js';
import { connectAndMessageRecruiter } from './recruiter.js';
import { jobCooldown, thinkingPause } from './utils/humanize.js';

// ─── Parse CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const modeArg = args.find(a => a.startsWith('--mode='))?.split('=')[1]
  || (args.includes('--mode') ? args[args.indexOf('--mode') + 1] : null)
  || 'full';

if (isDryRun) {
  process.env.AUTO_APPLY = 'false';
  process.env.AUTO_CONNECT = 'false';
  logger.warn('=== DRY RUN MODE — No applications or messages will be sent ===');
}

// ─── Validate environment ─────────────────────────────────────────────────────
function validateEnv() {
  const required = ['LINKEDIN_EMAIL', 'LINKEDIN_PASSWORD', 'ANTHROPIC_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Copy .env.example → .env and fill in your values.');
    process.exit(1);
  }
}

// ─── Process a single job ─────────────────────────────────────────────────────
async function processJob(page, job, index, total) {
  logger.jobHeader(index, total, job);

  const result = {
    job: { title: job.title, company: job.company, url: job.url },
    applied: false,
    connected: false,
    messageSent: false,
    resumePath: null,
    coverLetterPath: null,
    error: null,
  };

  try {
    // ── Step 1: Tailor resume with Claude AI ──────────────────────────────────
    logger.info('[Bot] Step 1/3 — Tailoring resume with Claude AI...');
    const { tailoredResume, resumePdfPath } = await buildTailoredResume(job);
    result.resumePath = resumePdfPath;
    logger.success(`[Bot] Resume tailored and saved: ${resumePdfPath}`);

    // ── Step 2: Write humanized cover letter ──────────────────────────────────
    logger.info('[Bot] Step 2/3 — Writing cover letter with Claude AI...');
    const { coverLetterText, coverLetterPdfPath } = await buildCoverLetter(job, tailoredResume);
    result.coverLetterPath = coverLetterPdfPath;
    logger.success(`[Bot] Cover letter saved: ${coverLetterPdfPath}`);

    // ── Step 3a: Apply to job ─────────────────────────────────────────────────
    if (modeArg === 'apply' || modeArg === 'full') {
      logger.info('[Bot] Step 3/3 — Applying to job...');
      result.applied = await applyToJob(page, job, resumePdfPath, coverLetterText, coverLetterPdfPath);
    }

    // ── Step 3b: Connect with recruiter ───────────────────────────────────────
    if (modeArg === 'connect' || modeArg === 'full') {
      logger.info('[Bot] Step 3/3 — Connecting with recruiter...');
      const { connected, messageSent, recruiter } = await connectAndMessageRecruiter(page, job);
      result.connected = connected;
      result.messageSent = messageSent;
      if (recruiter) {
        logger.success(`[Bot] Recruiter outreach complete for: ${recruiter.name || 'recruiter'} @ ${job.company}`);
      }
    }

  } catch (err) {
    result.error = err.message;
    logger.error(`[Bot] Error processing job "${job.title}": ${err.message}`);
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n');
  logger.info('═'.repeat(60));
  logger.info('  LinkedIn Job Bot — powered by Claude AI');
  logger.info(`  Mode: ${isDryRun ? 'DRY RUN' : modeArg.toUpperCase()}`);
  logger.info('═'.repeat(60));
  console.log('\n');

  validateEnv();

  let browser = null;
  let page = null;
  const sessionResults = [];

  try {
    // ── Authenticate ────────────────────────────────────────────────────────
    logger.info('[Bot] Authenticating with LinkedIn...');
    ({ browser, page } = await ensureAuthenticated());
    logger.success('[Bot] LinkedIn session ready.');

    await thinkingPause();

    // ── Fetch saved jobs ────────────────────────────────────────────────────
    logger.info('[Bot] Fetching your saved jobs from LinkedIn...');
    const jobs = await fetchSavedJobs(page);

    if (jobs.length === 0) {
      logger.warn('[Bot] No saved jobs found (or all were filtered out).');
      logger.warn('[Bot] → Go to LinkedIn → Jobs → Saved, and save some jobs first.');
      return;
    }

    logger.success(`[Bot] Processing ${jobs.length} saved job(s)...\n`);

    // ── Process each job ────────────────────────────────────────────────────
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const result = await processJob(page, job, i + 1, jobs.length);
      sessionResults.push(result);

      // Cooldown between jobs (except after the last one)
      if (i < jobs.length - 1) {
        const delayMin = parseInt(process.env.DELAY_BETWEEN_JOBS_MIN || '30', 10);
        const delayMax = parseInt(process.env.DELAY_BETWEEN_JOBS_MAX || '90', 10);
        logger.dim(`[Bot] Cooling down ${delayMin}–${delayMax}s before next job...`);
        await jobCooldown();
      }
    }

  } catch (err) {
    logger.error(`[Bot] Fatal error: ${err.message}`);
    if (err.stack) logger.dim(err.stack);
  } finally {
    if (browser) await closeBrowser(browser);
    logger.sessionSummary(sessionResults);
    printResultsTable(sessionResults);
  }
}

// ─── Pretty-print results ─────────────────────────────────────────────────────
function printResultsTable(results) {
  if (results.length === 0) return;

  console.log('\n  Detailed Results:');
  console.log('  ' + '─'.repeat(80));

  for (const r of results) {
    const applied = r.applied ? '✓ Applied' : '✗ Not Applied';
    const connected = r.connected ? '✓ Connected' : '✗ Not Connected';
    const messaged = r.messageSent ? '✓ Messaged' : '✗ Not Messaged';
    const error = r.error ? ` ⚠ ${r.error.slice(0, 50)}` : '';

    console.log(`  ${r.job.title.slice(0, 30).padEnd(32)} @ ${r.job.company.slice(0, 20).padEnd(22)} | ${applied.padEnd(14)} | ${connected.padEnd(16)} | ${messaged}${error}`);
  }

  console.log('  ' + '─'.repeat(80));
  console.log('\n  Output files saved in: linkedin-bot/output/\n');
}

// ─── Run ──────────────────────────────────────────────────────────────────────
main().catch(err => {
  logger.error(`Unhandled error: ${err.message}`);
  process.exit(1);
});
