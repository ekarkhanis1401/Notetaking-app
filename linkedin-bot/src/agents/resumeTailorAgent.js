/**
 * resumeTailorAgent.js
 * AI specialist that rewrites a master resume to precisely mirror a job
 * description's language, priorities, and keywords — using Claude AI.
 */

import { AgentBase } from '../core/agentBase.js';
import { generateResumePDF } from '../utils/pdf.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseResume = JSON.parse(readFileSync(join(__dirname, '../../config/resume.json'), 'utf8'));
const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

const SYSTEM_PROMPT = `You are a world-class resume writer with 20 years of experience helping engineers land roles at Google, Meta, Stripe, and similar companies.

Your specialty: you study a job description like a detective, extract the exact skills, outcomes, and language the hiring team cares about, and then rewrite the candidate's resume to speak directly to those priorities — without fabricating a single fact.

Your writing is:
- Quantified: every bullet has a metric or a tangible outcome
- Mirrored: you use the JD's own vocabulary so ATS scores are maximised
- Tight: zero fluff, every word earns its place
- Human: reads like a thoughtful senior professional wrote it, not a bot

Tone: ${userProfile.tone.resume}`;

export class ResumeTailorAgent extends AgentBase {
  constructor() {
    super('ResumeTailorAgent', 'Tailors the master resume to each job description using Claude AI', SYSTEM_PROMPT);
  }

  /**
   * @param {{ job: object }} input
   * @returns {{ tailoredResume: object, resumePdfPath: string }}
   */
  async onRun({ job }) {
    this._log(`Tailoring resume for: ${job.title} @ ${job.company}`);

    const tailoredResume = await this._tailorWithClaude(job);
    const resumePdfPath = await generateResumePDF(tailoredResume, job);

    this._publish('resume:ready', { jobId: job.jobId, tailoredResume, resumePdfPath });
    this._log(`Resume PDF saved → ${resumePdfPath}`);

    return { tailoredResume, resumePdfPath };
  }

  async _tailorWithClaude(job) {
    const prompt = `Tailor the following resume for this specific job.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
LOCATION: ${job.location || 'Not specified'}

JOB DESCRIPTION:
${job.description}

BASE RESUME (JSON):
${JSON.stringify(baseResume, null, 2)}

INSTRUCTIONS:
1. Rewrite "summary" (2-3 sentences) to directly address what ${job.company} needs for this ${job.title} role.
2. Reorder "skills.technical" so the most JD-relevant skills appear first — use the JD's exact phrasing where possible.
3. Sharpen each experience bullet to echo JD keywords. Keep facts truthful — only reframe, never invent.
4. Surface any project, certification, or education detail that aligns with this role.
5. Keep the JSON structure identical to the input.
6. Respond with ONLY the valid JSON object — no explanation, no markdown fences.`;

    const raw = await this._think(prompt, 3500);
    try {
      return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      this._log('JSON parse failed — falling back to base resume', 'warn');
      return baseResume;
    }
  }
}
