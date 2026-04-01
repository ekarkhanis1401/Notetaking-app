/**
 * resume.js
 * Orchestrates resume tailoring: calls Claude, generates PDF, returns paths.
 */

import { tailorResume } from './claude.js';
import { generateResumePDF } from './utils/pdf.js';
import { logger } from './utils/logger.js';

/**
 * For a given job, tailors the base resume with Claude AI and generates a PDF.
 *
 * @param {object} job - Job object from jobs.js
 * @returns {{ tailoredResume: object, resumePdfPath: string }}
 */
export async function buildTailoredResume(job) {
  logger.info(`[Resume] Tailoring resume for: ${job.title} @ ${job.company}`);

  // 1. Use Claude to tailor the resume content
  const tailoredResume = await tailorResume(job);

  // 2. Generate PDF from the tailored resume
  const resumePdfPath = await generateResumePDF(tailoredResume, job);

  return { tailoredResume, resumePdfPath };
}
