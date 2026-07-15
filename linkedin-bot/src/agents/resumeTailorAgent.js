/**
 * resumeTailorAgent.js
 * Claude-powered AI agent that tailors resumes.
 *
 * ReAct loop: Claude analyses the JD, identifies gaps and keywords,
 * plans the tailoring strategy, then produces the tailored JSON resume.
 */

import { AgentBase } from '../core/agentBase.js';
import { generateResumePDF } from '../utils/pdf.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generalResume  = JSON.parse(readFileSync(join(__dirname, '../../config/resume.json'), 'utf8'));
const aerospaceResume = JSON.parse(readFileSync(join(__dirname, '../../config/resume-aerospace.json'), 'utf8'));
const userProfile    = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

/** Pick the best base resume for this job based on aerospace keyword detection. */
function selectBaseResume(job) {
  const text = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  const isAerospace = (userProfile.resumeSelection?.aerospaceKeywords ?? [])
    .some(kw => text.includes(kw.toLowerCase()));
  return isAerospace ? aerospaceResume : generalResume;
}

const TOOLS = [
  {
    name: 'analyse_job_description',
    description: 'Analyse the job description and extract: required skills, preferred skills, seniority level, key responsibilities, company values, and ATS keywords.',
    input_schema: {
      type: 'object',
      properties: { jobDescription: { type: 'string' } },
      required: ['jobDescription'],
    },
  },
  {
    name: 'plan_tailoring_strategy',
    description: 'Given JD analysis and base resume, produce a prioritised tailoring plan: which skills to surface, which bullets to rewrite, and what summary angle to take.',
    input_schema: {
      type: 'object',
      properties: {
        jdAnalysis: { type: 'string' },
        jobTitle: { type: 'string' },
        company: { type: 'string' },
      },
      required: ['jdAnalysis', 'jobTitle', 'company'],
    },
  },
  {
    name: 'produce_tailored_resume',
    description: 'Apply the tailoring strategy and return the complete tailored resume as a JSON string (same schema as the base resume). Rewrite summary, reorder skills, sharpen bullets — no fabrication.',
    input_schema: {
      type: 'object',
      properties: { strategy: { type: 'string' }, jdAnalysis: { type: 'string' } },
      required: ['strategy', 'jdAnalysis'],
    },
  },
];

export class ResumeTailorAgent extends AgentBase {
  constructor() {
    // System prompt is set dynamically per job in onRun — placeholder here
    super('ResumeTailorAgent', 'Tailors resumes to each job description', 'Await task instructions.');
    this._lastTailoredResume = null;
    this._baseResume = null;
  }

  async onRun({ job }) {
    this._lastTailoredResume = null;
    this._baseResume = selectBaseResume(job);
    const resumeType = this._baseResume === aerospaceResume ? 'Aerospace' : 'General / Industrial';
    this._log(`Using ${resumeType} base resume for: ${job.title} @ ${job.company}`);

    // Build system prompt with the right base resume for this job
    this._systemPrompt = `You are a world-class resume writer with 20 years of experience placing senior sales and business development leaders at top industrial, aerospace, and engineering services companies.

Your process is methodical:
1. Deeply analyse the job description to extract what the hiring team truly cares about
2. Plan a tailoring strategy — which skills to surface, what narrative angle to take
3. Produce the tailored resume JSON

Your writing:
- Mirrors the JD's exact vocabulary (ATS optimisation)
- Quantifies every achievement (numbers, percentages, deals, quota %)
- Is tight and impactful — every word earns its place
- Never fabricates — only reframes and reorders real facts
- Reads as if a senior human sales leader wrote it, not a bot

Tone: ${userProfile.tone.resume}

BASE RESUME (${resumeType}):
${JSON.stringify(this._baseResume, null, 2)}`;

    const goal = `Tailor the base resume for this role:

JOB TITLE: ${job.title}
COMPANY: ${job.company}
LOCATION: ${job.location || 'Not specified'}
JOB DESCRIPTION:
${job.description}

Follow your process: analyse the JD first, then plan your tailoring strategy, then produce the final tailored resume JSON.`;

    await this._runAgentLoop(goal, TOOLS, this._handleTool.bind(this));

    if (!this._lastTailoredResume) {
      this._log('Falling back to base resume — tailoring loop did not produce output.', 'warn');
      this._lastTailoredResume = baseResume;
    }

    const resumePdfPath = await generateResumePDF(this._lastTailoredResume, job);
    this._publish('resume:ready', { jobId: job.jobId, tailoredResume: this._lastTailoredResume, resumePdfPath });
    return { tailoredResume: this._lastTailoredResume, resumePdfPath };
  }

  async _handleTool(name, input) {
    switch (name) {
      case 'analyse_job_description': {
        const analysis = await this._think(
          `Analyse this job description and extract:
- Required hard skills (list)
- Preferred / nice-to-have skills (list)
- Key responsibilities (top 5)
- Seniority level signals
- Company culture signals
- ATS keywords (10-15 most important)

JOB DESCRIPTION:
${input.jobDescription?.slice(0, 6000)}

Return structured analysis as plain text.`,
          800
        );
        return analysis;
      }

      case 'plan_tailoring_strategy': {
        const strategy = await this._think(
          `Based on this JD analysis and the base resume, create a tailoring plan.

JD ANALYSIS:
${input.jdAnalysis}

JOB: ${input.jobTitle} at ${input.company}

For each section of the resume, specify EXACTLY what to change and why:
1. Summary — what angle/narrative to take
2. Skills — which to surface first, which JD keywords to mirror
3. Experience bullet rewrites — for each job, which bullets to strengthen and how
4. Projects/Certifications — any to emphasise

Be specific and actionable. This is your internal plan — be direct.`,
          1000
        );
        return strategy;
      }

      case 'produce_tailored_resume': {
        const raw = await this._think(
          `Execute this tailoring strategy on the base resume.

STRATEGY:
${input.strategy}

JD ANALYSIS:
${input.jdAnalysis}

BASE RESUME:
${JSON.stringify(this._baseResume, null, 2)}

Produce the complete tailored resume as a valid JSON object — identical schema to the input.
Rules:
- Mirror JD keywords exactly in the summary and skill list
- All facts must be true — reframe and reorder, never fabricate
- Every experience bullet must have a metric or concrete outcome
- Respond with ONLY the JSON — no markdown, no explanation.`,
          3500
        );
        try {
          this._lastTailoredResume = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
          return `Tailored resume produced for ${this._lastTailoredResume.personal.name}.`;
        } catch {
          this._log('JSON parse error — will use base resume.', 'warn');
          return 'JSON parse error in resume output.';
        }
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}
