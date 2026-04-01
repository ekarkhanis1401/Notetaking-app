/**
 * coverLetter.js
 * Orchestrates cover letter generation: calls Claude, generates PDF, returns paths.
 */

import { generateCoverLetter } from './claude.js';
import { generateCoverLetterPDF } from './utils/pdf.js';
import { logger } from './utils/logger.js';

/**
 * Generates a humanized cover letter for a job using Claude AI,
 * then produces a PDF file.
 *
 * @param {object} job - Job object from jobs.js
 * @param {object} tailoredResume - Resume already tailored for this job
 * @returns {{ coverLetterText: string, coverLetterPdfPath: string }}
 */
export async function buildCoverLetter(job, tailoredResume) {
  logger.info(`[CoverLetter] Writing cover letter for: ${job.title} @ ${job.company}`);

  // 1. Use Claude to write the cover letter
  const coverLetterText = await generateCoverLetter(job, tailoredResume);

  // 2. Generate PDF
  const coverLetterPdfPath = await generateCoverLetterPDF(coverLetterText, tailoredResume, job);

  return { coverLetterText, coverLetterPdfPath };
}
