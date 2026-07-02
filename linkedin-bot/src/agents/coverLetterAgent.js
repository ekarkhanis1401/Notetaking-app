/**
 * coverLetterAgent.js
 * Claude-powered AI agent that writes humanized cover letters.
 *
 * ReAct loop: Claude researches the company angle, plans the narrative arc,
 * drafts the letter, then self-critiques and refines it before finalising.
 */

import { AgentBase } from '../core/agentBase.js';
import { generateCoverLetterPDF } from '../utils/pdf.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

const TOOLS = [
  {
    name: 'plan_narrative',
    description: 'Plan the cover letter narrative: choose the hook angle, the achievement story to tell, the company-fit points, and the CTA phrasing.',
    input_schema: {
      type: 'object',
      properties: {
        jobTitle: { type: 'string' },
        company: { type: 'string' },
        jobDescription: { type: 'string' },
        resumeSummary: { type: 'string' },
        topAchievement: { type: 'string' },
      },
      required: ['jobTitle', 'company', 'jobDescription'],
    },
  },
  {
    name: 'draft_letter',
    description: 'Write the full cover letter based on the narrative plan. Returns the plain-text letter body.',
    input_schema: {
      type: 'object',
      properties: {
        narrativePlan: { type: 'string' },
        jobTitle: { type: 'string' },
        company: { type: 'string' },
        candidateName: { type: 'string' },
      },
      required: ['narrativePlan', 'jobTitle', 'company', 'candidateName'],
    },
  },
  {
    name: 'critique_and_refine',
    description: 'Self-critique the draft for any clichés, AI-sounding phrases, or weak spots, then return a refined final version.',
    input_schema: {
      type: 'object',
      properties: { draft: { type: 'string' } },
      required: ['draft'],
    },
  },
];

export class CoverLetterAgent extends AgentBase {
  constructor() {
    super(
      'CoverLetterAgent',
      'Writes humanized story-driven cover letters',
      `You are a master storyteller and executive ghostwriter. You write cover letters that hiring managers read to the very end.

Your letters:
- Open with a specific, genuine hook — something real about the company's mission, product, or impact. NEVER "I am writing to express my interest in…"
- Tell ONE compelling achievement story that maps directly to the company's challenge
- Show authentic excitement for this specific company at this moment in time
- Close with a confident, low-friction CTA — curious and collaborative, never desperate
- Read like a senior professional wrote them on a Sunday morning, not an AI

Your process:
1. Plan the narrative — choose the angle, the story, the fit points
2. Draft the letter
3. Critique it ruthlessly for any clichés or AI-sounding phrases, then refine

Tone: ${userProfile.tone.coverLetter}
Word count: 250-320 words, 3-4 paragraphs`
    );
    this._finalLetter = null;
  }

  async onRun({ job, tailoredResume }) {
    this._finalLetter = null;

    const goal = `Write a compelling, humanized cover letter for this job application.

JOB: ${job.title} at ${job.company}
LOCATION: ${job.location || 'Not specified'}
JOB DESCRIPTION:
${job.description?.slice(0, 3000)}

CANDIDATE:
Name: ${tailoredResume.personal.name}
Summary: ${tailoredResume.summary}
Top skills: ${tailoredResume.skills.technical.slice(0, 6).join(', ')}
Strongest achievement: ${tailoredResume.experience?.[0]?.bullets?.[0] ?? 'N/A'}
Current role: ${userProfile.applicant.currentRole}
Years experience: ${userProfile.applicant.yearsOfExperience}

Follow your process: plan the narrative first, then draft, then self-critique and produce the final letter.`;

    await this._runAgentLoop(goal, TOOLS, this._handleTool.bind(this));

    const coverLetterText = this._finalLetter || '[Cover letter generation failed]';
    const coverLetterPdfPath = await generateCoverLetterPDF(coverLetterText, tailoredResume, job);

    this._publish('coverletter:ready', { jobId: job.jobId, coverLetterText, coverLetterPdfPath });
    return { coverLetterText, coverLetterPdfPath };
  }

  async _handleTool(name, input) {
    switch (name) {
      case 'plan_narrative': {
        return this._think(
          `Plan a cover letter narrative for this job application.

JOB: ${input.jobTitle} at ${input.company}
JD EXCERPT: ${input.jobDescription?.slice(0, 2000)}
RESUME SUMMARY: ${input.resumeSummary || ''}
TOP ACHIEVEMENT: ${input.topAchievement || ''}

Plan:
1. HOOK ANGLE: What specific, genuine thing about ${input.company} will open the letter? (not generic praise)
2. ACHIEVEMENT STORY: Which single achievement to tell, and how it maps to this role's challenges
3. COMPANY FIT POINTS: 2-3 specific reasons this candidate + this company is a great match
4. CTA PHRASING: How to close warmly and confidently without being desperate

Be specific. This is an internal plan — be direct and detailed.`,
          600
        );
      }

      case 'draft_letter': {
        return this._think(
          `Write a cover letter following this narrative plan.

PLAN:
${input.narrativePlan}

JOB: ${input.jobTitle} at ${input.company}
CANDIDATE: ${input.candidateName}

Format:
- "Dear Hiring Manager," opening
- 3-4 paragraphs, 250-320 words total
- End: "Best regards,\n${input.candidateName}"
- Plain text only

Write only the letter — nothing else.`,
          1000
        );
      }

      case 'critique_and_refine': {
        const refined = await this._think(
          `You are a ruthless editor. Critique this cover letter and produce a refined final version.

DRAFT:
${input.draft}

CHECK FOR:
1. Clichés ("passionate about", "team player", "fast-paced environment") → replace with specifics
2. AI-sounding phrases ("I am eager to leverage", "I am writing to express") → cut or humanize
3. Weak/vague openings → make them punchy and specific
4. Passive sentences → make active
5. Anything over 320 words → trim

Return ONLY the refined final letter — no commentary, no "Here's the refined version:".`,
          1000
        );
        this._finalLetter = refined;
        return `Letter refined and finalised (${refined.split(/\s+/).length} words).`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}
