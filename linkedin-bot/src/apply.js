/**
 * apply.js
 * Automates LinkedIn Easy Apply job applications.
 * Handles multi-step forms, file uploads, and screening questions.
 */

import { logger } from './utils/logger.js';
import { humanClick, humanType, humanTypeAndClear, randomDelay, readingPause, thinkingPause, microPause } from './utils/humanize.js';
import { answerScreeningQuestions } from './claude.js';
import { markJobApplied } from './jobs.js';

// ─── Main apply function ──────────────────────────────────────────────────────
/**
 * Applies to a job via LinkedIn Easy Apply.
 *
 * @param {import('playwright').Page} page
 * @param {object} job
 * @param {string} resumePdfPath - Absolute path to the tailored resume PDF
 * @param {string} coverLetterText - Plain text of the cover letter (for text fields)
 * @param {string} [coverLetterPdfPath] - Optional cover letter PDF path
 * @returns {boolean} true if application was submitted successfully
 */
export async function applyToJob(page, job, resumePdfPath, coverLetterText, coverLetterPdfPath) {
  const isDryRun = process.env.AUTO_APPLY !== 'true';

  if (isDryRun) {
    logger.warn(`[Apply] DRY RUN — Would apply to: ${job.title} @ ${job.company}`);
    return false;
  }

  if (!job.hasEasyApply) {
    logger.warn(`[Apply] No Easy Apply for ${job.title} @ ${job.company} — skipping application.`);
    return false;
  }

  logger.info(`[Apply] Starting Easy Apply for: ${job.title} @ ${job.company}`);

  try {
    // Navigate to job page
    if (!page.url().includes(job.jobId)) {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await thinkingPause();
    }

    // Click Easy Apply button
    const easyApplyBtn = page.locator('button.jobs-apply-button, .artdeco-button--primary').filter({ hasText: /easy apply/i }).first();
    await easyApplyBtn.waitFor({ state: 'visible', timeout: 10000 });
    await humanClick(page, easyApplyBtn);
    await randomDelay(1500, 3000);

    // Handle multi-step modal
    const submitted = await handleApplicationModal(page, job, resumePdfPath, coverLetterText, coverLetterPdfPath);

    if (submitted) {
      markJobApplied(job);
      logger.success(`[Apply] Successfully applied to: ${job.title} @ ${job.company}`);
    }

    return submitted;

  } catch (err) {
    logger.error(`[Apply] Failed to apply to ${job.title} @ ${job.company}: ${err.message}`);
    // Close modal if open
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }
}

// ─── Multi-step application modal handler ─────────────────────────────────────
async function handleApplicationModal(page, job, resumePdfPath, coverLetterText, coverLetterPdfPath) {
  const MAX_STEPS = 10;
  let stepCount = 0;

  while (stepCount < MAX_STEPS) {
    stepCount++;
    await readingPause();

    // Detect current modal state
    const modalVisible = await page.locator('.jobs-easy-apply-modal').isVisible().catch(() => false);
    if (!modalVisible) {
      logger.dim('[Apply] Modal closed — checking if submitted...');
      break;
    }

    // Check if we're on the "Review" (final) step
    const isReviewStep = await isOnReviewStep(page);
    const isSuccessStep = await isOnSuccessStep(page);

    if (isSuccessStep) {
      logger.success('[Apply] Application submitted!');
      await closeModal(page);
      return true;
    }

    // Fill in current step
    await fillCurrentStep(page, job, resumePdfPath, coverLetterText, coverLetterPdfPath);
    await readingPause();

    if (isReviewStep) {
      // Submit the application
      const submitBtn = page.locator('button[aria-label*="Submit application"], button').filter({ hasText: /submit application/i }).first();
      const submitVisible = await submitBtn.isVisible().catch(() => false);

      if (submitVisible) {
        logger.info('[Apply] Clicking Submit Application...');
        await humanClick(page, submitBtn);
        await randomDelay(2000, 4000);
        // Check for success
        const success = await isOnSuccessStep(page);
        await closeModal(page);
        return success;
      }
    }

    // Click Next button
    const nextBtn = page.locator('button[aria-label="Continue to next step"], button').filter({ hasText: /next/i }).first();
    const reviewBtn = page.locator('button[aria-label="Review your application"], button').filter({ hasText: /review/i }).first();

    if (await reviewBtn.isVisible().catch(() => false)) {
      await humanClick(page, reviewBtn);
    } else if (await nextBtn.isVisible().catch(() => false)) {
      await humanClick(page, nextBtn);
    } else {
      logger.warn('[Apply] No next/review button found — breaking out of modal loop.');
      break;
    }

    await randomDelay(1500, 3000);
  }

  return false;
}

// ─── Fill current step fields ─────────────────────────────────────────────────
async function fillCurrentStep(page, job, resumePdfPath, coverLetterText, coverLetterPdfPath) {
  // 1. Resume upload
  await handleResumeUpload(page, resumePdfPath);

  // 2. Cover letter (text area or file upload)
  await handleCoverLetterField(page, coverLetterText, coverLetterPdfPath);

  // 3. Answer any visible questions
  await handleScreeningQuestions(page, job);
}

// ─── Resume upload ─────────────────────────────────────────────────────────────
async function handleResumeUpload(page, resumePdfPath) {
  const uploadInput = page.locator('input[type="file"][name*="resume"], input[type="file"][accept*="pdf"]').first();
  const isVisible = await uploadInput.isVisible().catch(() => false);
  const isAttached = await uploadInput.isHidden().catch(() => true); // hidden inputs are uploadable

  if (await uploadInput.count() > 0) {
    try {
      await uploadInput.setInputFiles(resumePdfPath);
      logger.info(`[Apply] Resume uploaded: ${resumePdfPath}`);
      await randomDelay(1000, 2000);
    } catch (e) {
      logger.warn(`[Apply] Could not upload resume: ${e.message}`);
    }
  }
}

// ─── Cover letter field ────────────────────────────────────────────────────────
async function handleCoverLetterField(page, coverLetterText, coverLetterPdfPath) {
  // Text area for cover letter
  const clTextArea = page.locator('textarea[id*="cover"], textarea[placeholder*="cover"], div[data-placeholder*="cover"]').first();
  if (await clTextArea.count() > 0 && await clTextArea.isVisible().catch(() => false)) {
    await humanTypeAndClear(clTextArea, coverLetterText);
    logger.info('[Apply] Cover letter text entered.');
    await randomDelay(500, 1000);
    return;
  }

  // File upload for cover letter
  if (coverLetterPdfPath) {
    const clUpload = page.locator('input[type="file"][name*="cover"]').first();
    if (await clUpload.count() > 0) {
      await clUpload.setInputFiles(coverLetterPdfPath);
      logger.info('[Apply] Cover letter PDF uploaded.');
      await randomDelay(800, 1500);
    }
  }
}

// ─── Screening questions ───────────────────────────────────────────────────────
async function handleScreeningQuestions(page, job) {
  // Collect all visible input fields and labels
  const questionGroups = await page.locator('.jobs-easy-apply-form-section__grouping, .fb-form-element').all();

  if (questionGroups.length === 0) return;

  const questionTexts = [];
  const questionElements = [];

  for (const group of questionGroups) {
    const label = await group.locator('label, .fb-form-element__label, legend').first()
      .textContent({ timeout: 2000 }).then(t => t?.trim()).catch(() => null);
    if (!label) continue;

    const input = group.locator('input:not([type="file"]), textarea, select').first();
    const inputExists = await input.count() > 0;
    if (!inputExists) continue;

    // Skip already filled fields
    const currentVal = await input.inputValue().catch(() => '');
    if (currentVal && currentVal.length > 0) continue;

    questionTexts.push(label);
    questionElements.push({ element: input, label });
  }

  if (questionTexts.length === 0) return;

  logger.info(`[Apply] Answering ${questionTexts.length} screening question(s) with Claude AI...`);
  const answers = await answerScreeningQuestions(questionTexts, job);

  for (let i = 0; i < questionElements.length; i++) {
    const { element, label } = questionElements[i];
    const answer = answers[i] || '';
    if (!answer) continue;

    try {
      const tagName = await element.evaluate(el => el.tagName.toLowerCase());
      if (tagName === 'select') {
        // Select the closest matching option
        await element.selectOption({ label: answer }).catch(() =>
          element.selectOption({ index: 1 })
        );
      } else {
        await humanTypeAndClear(element, answer);
      }
      logger.dim(`[Apply] Q: "${label.slice(0, 50)}…" → A: "${answer.slice(0, 60)}"`);
      await microPause();
    } catch (err) {
      logger.warn(`[Apply] Could not fill question "${label.slice(0, 40)}": ${err.message}`);
    }
  }
}

// ─── Modal state helpers ──────────────────────────────────────────────────────
async function isOnReviewStep(page) {
  const header = await page.locator('.jobs-easy-apply-modal h3, .t-bold').first()
    .textContent({ timeout: 3000 }).then(t => t?.toLowerCase() || '').catch(() => '');
  return header.includes('review') || header.includes('additional questions');
}

async function isOnSuccessStep(page) {
  const successVisible = await page.locator(
    '.jobs-easy-apply-modal [data-test-modal=""] h3, .artdeco-inline-feedback--success, .t-green'
  ).filter({ hasText: /application submitted|applied|successfully/i })
    .first().isVisible().catch(() => false);
  return successVisible;
}

async function closeModal(page) {
  const dismissBtn = page.locator('button[aria-label="Dismiss"], button[data-test-modal-close-btn]').first();
  if (await dismissBtn.isVisible().catch(() => false)) {
    await humanClick(page, dismissBtn);
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await randomDelay(800, 1500);
}
