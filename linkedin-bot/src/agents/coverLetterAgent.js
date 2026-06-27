/**
 * coverLetterAgent.js
 * AI storytelling specialist that writes a humanized, job-specific cover letter.
 * Follows a hook → achievement → fit → CTA narrative arc.
 */

import { AgentBase } from '../core/agentBase.js';
import { generateCoverLetterPDF } from '../utils/pdf.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

const SYSTEM_PROMPT = `You are a master storyteller and executive ghostwriter who has helped C-suite leaders and senior engineers craft cover letters that hiring managers actually read to the end.

Your letters:
- Open with a specific, genuine hook — never "I am writing to express my interest"
- Tell one compelling achievement story in 2-3 sentences
- Show authentic excitement for THIS company at THIS moment (based on what you know about them)
- Close with a warm, confident CTA — never desperate or begging
- Sound 100% human — a senior professional writing on a Sunday morning, not an AI

Tone: ${userProfile.tone.coverLetter}
Length: 250-320 words, 3-4 paragraphs`;

export class CoverLetterAgent extends AgentBase {
  constructor() {
    super('CoverLetterAgent', 'Writes humanized, story-driven cover letters via Claude AI', SYSTEM_PROMPT);
  }

  /**
   * @param {{ job: object, tailoredResume: object }} input
   * @returns {{ coverLetterText: string, coverLetterPdfPath: string }}
   */
  async onRun({ job, tailoredResume }) {
    this._log(`Writing cover letter for: ${job.title} @ ${job.company}`);

    const coverLetterText = await this._writeWithClaude(job, tailoredResume);
    const coverLetterPdfPath = await generateCoverLetterPDF(coverLetterText, tailoredResume, job);

    this._publish('coverletter:ready', { jobId: job.jobId, coverLetterText, coverLetterPdfPath });
    this._log(`Cover letter PDF saved → ${coverLetterPdfPath}`);

    return { coverLetterText, coverLetterPdfPath };
  }

  async _writeWithClaude(job, tailoredResume) {
    const applicant = userProfile.applicant;

    const prompt = `Write a cover letter for this job application.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${job.description}

CANDIDATE SNAPSHOT:
Name: ${tailoredResume.personal.name}
Current role: ${applicant.currentRole}
Years of experience: ${applicant.yearsOfExperience}
Summary: ${tailoredResume.summary}
Top skills: ${tailoredResume.skills.technical.slice(0, 6).join(', ')}
Strongest achievement: ${tailoredResume.experience[0]?.bullets[0] ?? 'N/A'}

STRUCTURE:
1. Hook — a genuine, specific observation about ${job.company}'s mission, recent product, or impact. NOT "I came across your job posting."
2. Achievement story — 2-3 sentences on the candidate's single most relevant win that maps to a challenge this role faces.
3. Company fit — 2-3 specific reasons why ${job.company} right now is genuinely exciting to this candidate.
4. Close — a warm, confident ask for a conversation. Curious and collaborative, not desperate.

FORMAT: Plain text, "Dear Hiring Manager," opening, end with "Best regards,\n${tailoredResume.personal.name}".
Return ONLY the letter — no subject line, no extra commentary.`;

    return this._think(prompt, 1500);
  }
}
