/**
 * orchestratorAgent.js
 * Claude-powered master coordinator of the LinkedIn Job Bot agent team.
 *
 * The orchestrator itself runs a ReAct loop — Claude decides how to sequence
 * the work, which agents to dispatch next, and how to recover from failures.
 * All 6 specialist agents are tools the orchestrator can call.
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

import { jobCooldown } from '../utils/humanize.js';
import { logger } from '../utils/logger.js';
import { writeSessionToTracker, TRACKER_PATH } from '../utils/tracker.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

// ── Tools the orchestrator can call (each delegates to a specialist agent) ────
const TOOLS = [
  {
    name: 'dispatch_job_scout',
    description: 'Launch the JobScoutAgent to discover and score all saved LinkedIn jobs. Returns list of queued jobs.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'dispatch_resume_tailor',
    description: 'Launch the ResumeTailorAgent to tailor the resume for a specific job.',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
  },
  {
    name: 'dispatch_cover_letter',
    description: 'Launch the CoverLetterAgent to write a cover letter for a specific job. Requires resume tailoring to be complete first.',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
  },
  {
    name: 'dispatch_application',
    description: 'Launch the ApplicationAgent to submit the Easy Apply form for a specific job. Requires resume + cover letter to be ready.',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
  },
  {
    name: 'dispatch_recruiter_hunter',
    description: 'Launch the RecruiterHunterAgent to find the hiring manager or recruiter for a specific job.',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
  },
  {
    name: 'dispatch_outreach',
    description: 'Launch the OutreachAgent to send a connection request and DM to the recruiter for a specific job. Requires recruiter to be found first.',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
  },
  {
    name: 'get_job_status',
    description: 'Get the current processing status of a specific job.',
    input_schema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
  },
  {
    name: 'get_all_jobs_status',
    description: 'Get a summary of all jobs and their current processing status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'wait_between_jobs',
    description: 'Insert a human-like cooldown delay between processing jobs to avoid rate limiting.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'mark_session_complete',
    description: 'Signal that all jobs have been processed and the session is complete.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

export class OrchestratorAgent extends AgentBase {
  constructor(mode = 'full', isDryRun = false) {
    super(
      'OrchestratorAgent',
      'Master coordinator — plans and sequences all agent work',
      `You are the strategic coordinator of a LinkedIn job application AI agent team.

Your team of 6 specialist agents:
- JobScoutAgent: Scouts and scores LinkedIn Saved Jobs
- ResumeTailorAgent: Tailors resumes to each JD
- CoverLetterAgent: Writes humanized cover letters
- ApplicationAgent: Submits Easy Apply forms
- RecruiterHunterAgent: Finds recruiters/hiring managers
- OutreachAgent: Sends personalized connection requests and DMs

CURRENT MODE: ${isDryRun ? 'DRY RUN (generate documents only — do NOT apply or connect)' : mode.toUpperCase()}
${mode === 'apply' ? '→ Apply to jobs but skip recruiter outreach' : ''}
${mode === 'connect' ? '→ Recruiter outreach only — skip job applications' : ''}
${mode === 'full' ? '→ Full pipeline: apply to jobs AND do recruiter outreach' : ''}

CANDIDATE: ${userProfile.applicant.name}, ${userProfile.applicant.currentRole}

YOUR WORKFLOW for each job:
1. Tailor resume (ResumeTailorAgent)
2. Write cover letter (CoverLetterAgent) — depends on resume being done
3. PARALLEL: Submit application (ApplicationAgent) + Find recruiter (RecruiterHunterAgent)
4. Send outreach (OutreachAgent) — depends on recruiter being found

YOUR PRINCIPLES:
- If an agent fails, decide: retry once, or skip to next step and continue?
- Application failure should NOT block recruiter outreach (and vice versa)
- Always wait between jobs to avoid LinkedIn rate limiting
- Be pragmatic — partial success (documents generated but not applied) is better than aborting the whole session

Start by dispatching the JobScoutAgent, then systematically process each job.`
    );
    this._mode = mode;
    this._isDryRun = isDryRun;

    // Instantiate the specialist team
    this._agents = {
      scout: new JobScoutAgent(),
      resumeTailor: new ResumeTailorAgent(),
      coverLetter: new CoverLetterAgent(),
      application: new ApplicationAgent(),
      recruiterHunter: new RecruiterHunterAgent(),
      outreach: new OutreachAgent(),
    };

    this._discoveredJobs = [];
  }

  async onRun() {
    this._printBanner();

    await browserPool.init();
    await browserPool.ensureLoggedIn();

    const goal = `Coordinate the agent team to process all LinkedIn Saved Jobs for ${userProfile.applicant.name}.

Start with dispatch_job_scout to discover jobs, then for each discovered job: tailor the resume, write a cover letter, apply (if mode allows), find the recruiter, and send outreach (if mode allows). Wait between jobs. Mark session complete when all jobs are processed.`;

    await this._runAgentLoop(goal, TOOLS, this._handleTool.bind(this), 100 /* generous cap for multi-job sessions */);

    const summary = state.getSessionSummary();
    logger.sessionSummary(summary);
    return summary;
  }

  async _handleTool(name, input) {
    switch (name) {

      // ── Scout ──────────────────────────────────────────────────────────────
      case 'dispatch_job_scout': {
        try {
          this._discoveredJobs = await this._agents.scout.run();
          await browserPool.closeExtraPages();
          state.setJobs(this._discoveredJobs);
          if (this._discoveredJobs.length === 0) {
            return 'No jobs found. Instruct the user to save jobs on LinkedIn and retry.';
          }
          return `JobScoutAgent found ${this._discoveredJobs.length} job(s):\n${this._discoveredJobs.map((j, i) => `${i}: [${j.jobId}] ${j.title} @ ${j.company} (fit: ${j.fitScore ?? 'N/A'})`).join('\n')}`;
        } catch (err) {
          return `JobScoutAgent failed: ${err.message}`;
        }
      }

      // ── Resume ─────────────────────────────────────────────────────────────
      case 'dispatch_resume_tailor': {
        const job = this._getJob(input.jobId);
        if (!job) return `Job ${input.jobId} not found.`;
        state.markJobStarted(job.jobId);
        try {
          const { tailoredResume, resumePdfPath } = await this._agents.resumeTailor.run({ job });
          state.updateJob(job.jobId, { tailoredResume, resumePdfPath });
          return `Resume tailored for ${job.title} @ ${job.company}. PDF: ${resumePdfPath}`;
        } catch (err) {
          state.updateJob(job.jobId, { error: err.message });
          return `ResumeTailorAgent failed for ${job.jobId}: ${err.message}`;
        }
      }

      // ── Cover letter ───────────────────────────────────────────────────────
      case 'dispatch_cover_letter': {
        const job = this._getJob(input.jobId);
        if (!job) return `Job ${input.jobId} not found.`;
        const jobRecord = state.getJob(job.jobId);
        if (!jobRecord?.tailoredResume) return `Resume not yet tailored for ${input.jobId} — run dispatch_resume_tailor first.`;
        try {
          const { coverLetterText, coverLetterPdfPath } = await this._agents.coverLetter.run({ job, tailoredResume: jobRecord.tailoredResume });
          state.updateJob(job.jobId, { coverLetterText, coverLetterPdfPath });
          return `Cover letter written for ${job.title} @ ${job.company}. PDF: ${coverLetterPdfPath}`;
        } catch (err) {
          return `CoverLetterAgent failed for ${input.jobId}: ${err.message}`;
        }
      }

      // ── Application ────────────────────────────────────────────────────────
      case 'dispatch_application': {
        if (this._isDryRun) return 'DRY RUN — skipping application.';
        if (this._mode === 'connect') return 'Mode=connect — skipping application.';
        const job = this._getJob(input.jobId);
        if (!job) return `Job ${input.jobId} not found.`;
        const jobRecord = state.getJob(job.jobId);
        try {
          const applied = await this._agents.application.run({
            job,
            resumePdfPath: jobRecord?.resumePdfPath,
            coverLetterText: jobRecord?.coverLetterText,
            coverLetterPdfPath: jobRecord?.coverLetterPdfPath,
          });
          await browserPool.closeExtraPages();
          state.updateJob(job.jobId, { applied });
          return `ApplicationAgent: applied=${applied} for ${job.title} @ ${job.company}`;
        } catch (err) {
          await browserPool.closeExtraPages();
          return `ApplicationAgent failed for ${input.jobId}: ${err.message}`;
        }
      }

      // ── Recruiter hunter ───────────────────────────────────────────────────
      case 'dispatch_recruiter_hunter': {
        if (this._isDryRun) return 'DRY RUN — skipping recruiter search.';
        if (this._mode === 'apply') return 'Mode=apply — skipping recruiter search.';
        const job = this._getJob(input.jobId);
        if (!job) return `Job ${input.jobId} not found.`;
        try {
          const { recruiter } = await this._agents.recruiterHunter.run({ job });
          await browserPool.closeExtraPages();
          state.updateJob(job.jobId, { recruiter });
          return recruiter
            ? `RecruiterHunterAgent found: ${recruiter.name ?? 'Unknown'} (${recruiter.title ?? 'Recruiter'}) at ${job.company}`
            : `RecruiterHunterAgent: no recruiter found for ${job.company}`;
        } catch (err) {
          await browserPool.closeExtraPages();
          return `RecruiterHunterAgent failed for ${input.jobId}: ${err.message}`;
        }
      }

      // ── Outreach ───────────────────────────────────────────────────────────
      case 'dispatch_outreach': {
        if (this._isDryRun) return 'DRY RUN — skipping outreach.';
        if (this._mode === 'apply') return 'Mode=apply — skipping outreach.';
        const job = this._getJob(input.jobId);
        if (!job) return `Job ${input.jobId} not found.`;
        const jobRecord = state.getJob(job.jobId);
        if (!jobRecord?.recruiter) return `No recruiter found for ${input.jobId} — run dispatch_recruiter_hunter first.`;
        try {
          const { connected, messageSent } = await this._agents.outreach.run({ job, recruiter: jobRecord.recruiter });
          await browserPool.closeExtraPages();
          state.updateJob(job.jobId, { connected, messageSent });
          return `OutreachAgent: connected=${connected}, messageSent=${messageSent} for ${job.title} @ ${job.company}`;
        } catch (err) {
          await browserPool.closeExtraPages();
          return `OutreachAgent failed for ${input.jobId}: ${err.message}`;
        }
      }

      // ── Status queries ─────────────────────────────────────────────────────
      case 'get_job_status': {
        const record = state.getJob(input.jobId);
        if (!record) return `Job ${input.jobId} not found in state.`;
        return JSON.stringify({
          jobId: record.jobId,
          title: record.title,
          company: record.company,
          status: record.status,
          hasResume: !!record.resumePdfPath,
          hasCoverLetter: !!record.coverLetterText,
          applied: record.applied,
          recruiterFound: !!record.recruiter,
          connected: record.connected,
          messageSent: record.messageSent,
          error: record.error,
        });
      }

      case 'get_all_jobs_status': {
        const jobs = state.getAllJobs();
        return JSON.stringify(jobs.map(j => ({
          jobId: j.jobId,
          title: j.title,
          company: j.company,
          status: j.status,
          applied: j.applied,
          connected: j.connected,
          messageSent: j.messageSent,
        })), null, 2);
      }

      case 'wait_between_jobs': {
        const min = parseInt(process.env.DELAY_BETWEEN_JOBS_MIN || '30', 10);
        const max = parseInt(process.env.DELAY_BETWEEN_JOBS_MAX || '90', 10);
        this._log(`Cooling down ${min}–${max}s before next job...`);
        await browserPool.closeExtraPages();
        await jobCooldown();
        return `Cooldown complete.`;
      }

      case 'mark_session_complete': {
        const jobs = state.getAllJobs();
        for (const j of jobs) {
          if (j.status === 'processing' || j.status === 'queued') {
            state.markJobComplete(j.jobId);
          }
        }
        return `Session marked complete. ${jobs.length} jobs processed.`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }

  _getJob(jobId) {
    return this._discoveredJobs.find(j => j.jobId === jobId) ?? null;
  }

  async onTeardown() {
    await browserPool.close();

    // Write all processed jobs to the Excel tracker
    const allJobs = state.getAllJobs();
    if (allJobs.length > 0) {
      logger.info(`[Orchestrator] Writing session results to Excel tracker → ${TRACKER_PATH}`);
      await writeSessionToTracker(allJobs).catch(err =>
        logger.error(`[Orchestrator] Excel tracker write failed: ${err.message}`)
      );
    }
  }

  _printBanner() {
    const lines = [
      '',
      '╔══════════════════════════════════════════════════════════════╗',
      '║       LinkedIn Job Bot — AI Agent Team (ReAct Architecture)  ║',
      '╠══════════════════════════════════════════════════════════════╣',
      '║  Every agent is powered by Claude AI.                        ║',
      '║  Agents reason → call tools → observe results → repeat.      ║',
      '╠══════════════════════════════════════════════════════════════╣',
      '║  Team:  OrchestratorAgent (you are here)                     ║',
      '║         ├─ JobScoutAgent          (Claude + Browser)         ║',
      '║         ├─ ResumeTailorAgent      (Claude AI)                ║',
      '║         ├─ CoverLetterAgent       (Claude AI)                ║',
      '║         ├─ ApplicationAgent       (Claude + Browser)         ║',
      '║         ├─ RecruiterHunterAgent   (Claude + Browser)         ║',
      '║         └─ OutreachAgent          (Claude + Browser)         ║',
      `╠══════════════════════════════════════════════════════════════╣`,
      `║  Mode: ${(this._isDryRun ? 'DRY RUN' : this._mode.toUpperCase()).padEnd(54)}║`,
      '╚══════════════════════════════════════════════════════════════╝',
      '',
    ].join('\n');
    console.log(lines);
  }
}
