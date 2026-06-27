/**
 * orchestratorAgent.js
 * The master coordinator of the LinkedIn Job Bot team.
 *
 * Responsibilities:
 *  1. Initialises the browser and authenticates with LinkedIn
 *  2. Dispatches JobScoutAgent to discover saved jobs
 *  3. For each job, fans out work across specialist agents:
 *       ResumeTailorAgent  ─┐
 *                           ├─ parallel ─→ ApplicationAgent
 *       CoverLetterAgent   ─┘
 *
 *       RecruiterHunterAgent ──→ OutreachAgent
 *
 *  4. Enforces inter-job cooldowns to avoid rate limiting
 *  5. Collects results and logs a session summary
 *
 * The orchestrator itself uses Claude AI to handle unexpected situations —
 * e.g. deciding whether to retry a failed agent or skip a job.
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { state } from '../core/sharedState.js';
import { bus } from '../core/messageBus.js';

import { JobScoutAgent } from './jobScoutAgent.js';
import { ResumeTailorAgent } from './resumeTailorAgent.js';
import { CoverLetterAgent } from './coverLetterAgent.js';
import { ApplicationAgent } from './applicationAgent.js';
import { RecruiterHunterAgent } from './recruiterHunterAgent.js';
import { OutreachAgent } from './outreachAgent.js';

import { jobCooldown, thinkingPause } from '../utils/humanize.js';
import { logger } from '../utils/logger.js';

const ORCHESTRATOR_SYSTEM = `You are the strategic coordinator of an AI agent team that helps job seekers land interviews.

When an agent encounters an unexpected situation, you decide how to handle it:
- Should we retry this step or skip this job?
- Is this error recoverable or should we move on?
- How should we prioritise the remaining jobs?

Your decisions are pragmatic, bias toward action, and protect the candidate's LinkedIn account from being flagged.`;

export class OrchestratorAgent extends AgentBase {
  constructor(mode = 'full', isDryRun = false) {
    super('OrchestratorAgent', 'Master coordinator — plans, dispatches, monitors, and synthesises all agent work', ORCHESTRATOR_SYSTEM);
    this._mode = mode;       // 'full' | 'apply' | 'connect' | 'dry-run'
    this._isDryRun = isDryRun;

    // Instantiate the team
    this._team = {
      scout: new JobScoutAgent(),
      resumeTailor: new ResumeTailorAgent(),
      coverLetter: new CoverLetterAgent(),
      application: new ApplicationAgent(),
      recruiterHunter: new RecruiterHunterAgent(),
      outreach: new OutreachAgent(),
    };
  }

  // ── Main run ───────────────────────────────────────────────────────────────
  async onRun() {
    this._printBanner();

    // 1. Init browser + login
    this._log('Initialising browser...');
    await browserPool.init();
    await browserPool.ensureLoggedIn();

    await thinkingPause();

    // 2. Discover saved jobs
    this._log('Dispatching JobScoutAgent...');
    const jobs = await this._team.scout.run();

    if (!jobs || jobs.length === 0) {
      this._log('No jobs to process. Save some jobs on LinkedIn first.', 'warn');
      return;
    }

    state.setJobs(jobs);
    this._log(`Processing ${jobs.length} job(s) across the agent team.`);

    // 3. Process jobs sequentially (with cooldown) — agents run in parallel within each job
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      logger.jobHeader(i + 1, jobs.length, job);
      state.markJobStarted(job.jobId);

      try {
        await this._processJob(job);
        state.markJobComplete(job.jobId);
      } catch (err) {
        this._log(`Job failed: ${job.title} @ ${job.company} — ${err.message}`, 'error');
        state.markJobFailed(job.jobId, err);
      }

      // Cooldown between jobs (skip after the last one)
      if (i < jobs.length - 1) {
        this._log(`Cooling down before next job...`);
        await jobCooldown();
      }
    }

    // 4. Session summary
    const summary = state.getSessionSummary();
    logger.sessionSummary({
      filter: r => r.applied,
      ...summary,
      length: summary.jobs.length,
    });

    return summary;
  }

  // ── Process a single job ───────────────────────────────────────────────────
  async _processJob(job) {
    const doApply   = (this._mode === 'full' || this._mode === 'apply') && !this._isDryRun;
    const doConnect = (this._mode === 'full' || this._mode === 'connect') && !this._isDryRun;

    // ── Phase A: Generate documents (resume + cover letter in parallel) ──────
    this._log(`[${job.title}] Phase A — Generating tailored documents in parallel...`);

    const [resumeResult, _placeholder] = await Promise.allSettled([
      this._team.resumeTailor.run({ job }),
      // Cover letter must wait for tailored resume — runs in sequence after resume
      Promise.resolve(null),
    ]);

    if (resumeResult.status === 'rejected') {
      this._log(`Resume tailoring failed — ${resumeResult.reason?.message}`, 'error');
      throw resumeResult.reason;
    }

    const { tailoredResume, resumePdfPath } = resumeResult.value;
    state.updateJob(job.jobId, { tailoredResume, resumePdfPath });

    // Cover letter uses the tailored resume — runs after resume is ready
    const clResult = await this._team.coverLetter.run({ job, tailoredResume }).catch(err => {
      this._log(`Cover letter failed — ${err.message}`, 'warn');
      return null;
    });

    const coverLetterText    = clResult?.coverLetterText    ?? '';
    const coverLetterPdfPath = clResult?.coverLetterPdfPath ?? null;
    state.updateJob(job.jobId, { coverLetterText, coverLetterPdfPath });

    // ── Phase B: Apply + Recruit in parallel ─────────────────────────────────
    this._log(`[${job.title}] Phase B — Applying & finding recruiter in parallel...`);

    const [applyResult, recruiterResult] = await Promise.allSettled([
      doApply
        ? this._team.application.run({ job, resumePdfPath, coverLetterText, coverLetterPdfPath })
        : Promise.resolve(false),

      doConnect
        ? this._team.recruiterHunter.run({ job })
        : Promise.resolve({ recruiter: null }),
    ]);

    const applied = applyResult.status === 'fulfilled' ? applyResult.value : false;
    state.updateJob(job.jobId, { applied });

    if (applyResult.status === 'rejected') {
      this._log(`Application failed: ${applyResult.reason?.message}`, 'warn');
    }

    // ── Phase C: Outreach (sequential — needs recruiter info) ─────────────────
    const recruiter = recruiterResult.status === 'fulfilled'
      ? recruiterResult.value?.recruiter
      : null;

    state.updateJob(job.jobId, { recruiter });

    if (doConnect && recruiter) {
      const outreachResult = await this._team.outreach.run({ job, recruiter }).catch(err => {
        this._log(`Outreach failed: ${err.message}`, 'warn');
        return { connected: false, messageSent: false };
      });

      state.updateJob(job.jobId, {
        connected:   outreachResult.connected,
        messageSent: outreachResult.messageSent,
      });
    }

    // ── Summary for this job ──────────────────────────────────────────────────
    const jobRecord = state.getJob(job.jobId);
    this._log(
      `[${job.title}] Done — Applied: ${jobRecord.applied} | Connected: ${jobRecord.connected} | Messaged: ${jobRecord.messageSent}`
    );
  }

  // ── Banner ─────────────────────────────────────────────────────────────────
  _printBanner() {
    const lines = [
      '',
      '╔══════════════════════════════════════════════════════════╗',
      '║        LinkedIn Job Bot — AI Agent Team                  ║',
      '║                                                          ║',
      '║  Agents: Scout · ResumeTailor · CoverLetter ·           ║',
      '║          Application · RecruiterHunter · Outreach ·      ║',
      '║          Orchestrator                                     ║',
      `║  Mode: ${(this._isDryRun ? 'DRY RUN' : this._mode.toUpperCase()).padEnd(50)}║`,
      '╚══════════════════════════════════════════════════════════╝',
      '',
    ].join('\n');
    console.log(lines);
  }

  async onTeardown() {
    await browserPool.close();
  }
}
