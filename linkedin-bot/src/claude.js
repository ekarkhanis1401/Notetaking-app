/**
 * claude.js
 * Central Claude AI integration — all prompts go through here.
 * Uses @anthropic-ai/sdk with streaming for long-form content.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// Load user configs once at startup
const userProfile = JSON.parse(
  readFileSync(join(__dirname, '../config/user-profile.json'), 'utf8')
);
const baseResume = JSON.parse(
  readFileSync(join(__dirname, '../config/resume.json'), 'utf8')
);

// ─── Shared system prompt ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert career coach, professional resume writer, and executive communication specialist with 20+ years of experience placing candidates at top-tier companies.

Your writing is:
- Humanized and authentic — never sounds AI-generated or robotic
- Concise and impactful — every word earns its place
- Quantified where possible — real numbers, real outcomes
- Tailored precisely to the job description — no generic filler
- Natural in tone — reads like a thoughtful human wrote it

The applicant's profile:
${JSON.stringify(userProfile.applicant, null, 2)}

Tone guidelines:
- Resume: ${userProfile.tone.resume}
- Cover Letter: ${userProfile.tone.coverLetter}
- Recruiter Message: ${userProfile.tone.recruiterMessage}`;

// ─── Helper: call Claude with retry logic ───────────────────────────────────
async function callClaude(messages, maxTokens = 2000, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages,
      });
      return response.content[0].text.trim();
    } catch (err) {
      logger.warn(`Claude API attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

// ─── 1. Tailor Resume ───────────────────────────────────────────────────────
/**
 * Returns a tailored resume object (same shape as resume.json) customized for
 * the specific job description. Claude rewrites the summary, reorders skills,
 * and sharpens bullet points to mirror the JD's language.
 */
export async function tailorResume(job) {
  logger.info(`[Claude] Tailoring resume for: ${job.title} @ ${job.company}`);

  const prompt = `You are tailoring a resume for the following job:

JOB TITLE: ${job.title}
COMPANY: ${job.company}
LOCATION: ${job.location || 'Not specified'}
JOB DESCRIPTION:
${job.description}

BASE RESUME (JSON):
${JSON.stringify(baseResume, null, 2)}

TASK:
Return a modified version of the resume JSON, tailored for this specific role. Rules:
1. Rewrite the "summary" (2-3 sentences) to directly address what this company and role need.
2. Reorder "skills.technical" to surface the most relevant skills first (match JD language exactly).
3. For each experience bullet, strengthen it using keywords from the JD without fabricating facts.
4. Add or emphasize any projects, certifications, or education that align with this role.
5. DO NOT invent new facts — only reframe and reorder existing ones.
6. Keep the JSON structure identical to the input.
7. Respond with ONLY the valid JSON object — no explanation, no markdown fences.`;

  const raw = await callClaude([{ role: 'user', content: prompt }], 3000);

  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    logger.warn('[Claude] Could not parse tailored resume JSON — returning base resume');
    return baseResume;
  }
}

// ─── 2. Generate Cover Letter ────────────────────────────────────────────────
/**
 * Returns a humanized, job-specific cover letter as plain text.
 * It follows a storytelling structure: hook → value → fit → CTA.
 */
export async function generateCoverLetter(job, tailoredResume) {
  logger.info(`[Claude] Writing cover letter for: ${job.title} @ ${job.company}`);

  const prompt = `Write a cover letter for the following job application.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${job.description}

CANDIDATE'S TAILORED RESUME SUMMARY:
${JSON.stringify({
    name: tailoredResume.personal.name,
    summary: tailoredResume.summary,
    topSkills: tailoredResume.skills.technical.slice(0, 6),
    topExperience: tailoredResume.experience[0],
  }, null, 2)}

COVER LETTER REQUIREMENTS:
1. Opening: A compelling, human hook — a specific observation about ${job.company}'s mission, product, or recent news. NOT "I am writing to express my interest in…"
2. Paragraph 2: A concise story of the candidate's most relevant achievement that directly maps to a challenge this role/company faces.
3. Paragraph 3: 2-3 specific reasons why THIS company at THIS time is genuinely exciting to the candidate.
4. Closing: A warm, confident call to action. Not desperate — curious and collaborative.
5. Tone: Warm, confident, real — sounds like a senior professional wrote it on a Sunday morning, not a bot.
6. Length: 3-4 paragraphs, ~250-320 words total. No fluff.
7. Format: Plain text. Start with "Dear Hiring Manager," unless a name is known. End with "Best regards,\n${tailoredResume.personal.name}".

Write ONLY the letter body — no subject line, no extra commentary.`;

  return callClaude([{ role: 'user', content: prompt }], 1500);
}

// ─── 3. Generate Recruiter Connection Note ──────────────────────────────────
/**
 * Returns a short LinkedIn connection request note (≤ 300 characters).
 */
export async function generateConnectionNote(job, recruiter) {
  logger.info(`[Claude] Writing connection note to: ${recruiter.name || 'recruiter'} @ ${job.company}`);

  const profile = userProfile.applicant;

  const prompt = `Write a LinkedIn connection request note for the following scenario:

SENDER: ${profile.name}, ${profile.currentRole} with ${profile.yearsOfExperience} years of experience.
RECIPIENT: ${recruiter.name || 'Hiring Manager / Recruiter'} at ${job.company}${recruiter.title ? ` (${recruiter.title})` : ''}.
OPEN ROLE: ${job.title}

RULES:
1. Maximum 280 characters (LinkedIn note limit is 300 — leave buffer).
2. Be specific and human — mention the role name and one authentic reason for interest.
3. No generic phrases like "I came across your profile" or "I would love to connect."
4. Warm but professional — not desperate or salesy.
5. End with the sender's first name only.
6. Return ONLY the note text, nothing else.`;

  const note = await callClaude([{ role: 'user', content: prompt }], 200);
  // Enforce hard limit
  return note.length > 295 ? note.substring(0, 292) + '...' : note;
}

// ─── 4. Generate Recruiter Follow-up Message ────────────────────────────────
/**
 * Returns a personalized LinkedIn DM to send after connecting.
 * Aimed at prompting a conversation, not begging for a referral.
 */
export async function generateRecruiterMessage(job, recruiter) {
  logger.info(`[Claude] Writing recruiter message to: ${recruiter.name || 'recruiter'}`);

  const profile = userProfile.applicant;
  const msgConfig = userProfile.recruiterMessageTemplate;

  const prompt = `Write a personalized LinkedIn direct message from a job candidate to a recruiter or hiring manager.

CONTEXT:
- Candidate: ${profile.name}, ${profile.currentRole}, ${profile.yearsOfExperience} years of experience.
- Recipient: ${recruiter.name || 'the recruiter'} at ${job.company}${recruiter.title ? ` (${recruiter.title})` : ''}.
- Role applied for: ${job.title}
- Job URL: ${job.url || 'N/A'}

MESSAGE REQUIREMENTS:
1. Open with a ${msgConfig.openWith} — something genuine about ${job.company} or the role, NOT "Hope this message finds you well."
2. In 1-2 sentences, state why the candidate is a strong fit (use specific skills from their profile: ${profile.targetRoles.join(', ')}).
3. Include a value proposition: what unique thing they bring to ${job.company}.
4. Close with a low-friction CTA — a 15-minute call OR just ask if they'd like to share any thoughts on the role. NOT "please review my resume."
5. Total length: ${msgConfig.maxWords} words max.
6. Tone: ${userProfile.tone.recruiterMessage}
7. Must sound 100% human — no corporate speak, no clichés.
8. Return ONLY the message text. No subject line.`;

  return callClaude([{ role: 'user', content: prompt }], 600);
}

// ─── 5. Answer Screening Questions ──────────────────────────────────────────
/**
 * Given an array of screening question strings, returns an array of answers.
 */
export async function answerScreeningQuestions(questions, job) {
  if (!questions || questions.length === 0) return [];
  logger.info(`[Claude] Answering ${questions.length} screening question(s) for ${job.title}`);

  const prompt = `Answer the following job application screening questions on behalf of the candidate.

CANDIDATE PROFILE:
${JSON.stringify(userProfile.applicant, null, 2)}

JOB: ${job.title} at ${job.company}

QUESTIONS:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

RULES:
1. Answer each question honestly based on the candidate's profile.
2. Keep answers concise: 1-2 sentences for yes/no questions, 2-3 sentences for open-ended ones.
3. For numeric fields (years of experience, salary), give a realistic number based on the profile.
4. If a question asks about a skill the candidate doesn't clearly have, acknowledge the learning curve positively.
5. Respond with a JSON array of answer strings in the same order as the questions.
6. Return ONLY the JSON array — no explanation.

Example format: ["Answer to Q1", "Answer to Q2", "Answer to Q3"]`;

  const raw = await callClaude([{ role: 'user', content: prompt }], 1000);
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    logger.warn('[Claude] Could not parse screening answers — returning empty array');
    return questions.map(() => 'Please refer to my resume and cover letter for details.');
  }
}
