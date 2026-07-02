/**
 * applicationAgent.js
 * Claude-powered AI agent that navigates and submits LinkedIn Easy Apply forms.
 *
 * ReAct loop: Claude reads the current modal state, decides what action to take
 * (upload file, fill field, answer question, click next, submit), executes it,
 * and loops until the application is submitted or an unrecoverable error occurs.
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { JobScoutAgent } from './jobScoutAgent.js';
import { humanClick, humanType, randomDelay, thinkingPause, microPause } from '../utils/humanize.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

const TOOLS = [
  {
    name: 'navigate_to_job',
    description: 'Navigate the browser to the job listing URL.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'click_easy_apply_button',
    description: 'Find and click the Easy Apply button on the current job listing page.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_modal_state',
    description: 'Read the current state of the Easy Apply modal: step header, visible form fields (label, type, current value), and available action buttons.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'upload_resume',
    description: 'Upload the tailored resume PDF to the file input in the current modal step.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'fill_text_field',
    description: 'Type a value into a form field identified by its label text.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'The label text of the field to fill' },
        value: { type: 'string', description: 'The value to type into the field' },
      },
      required: ['label', 'value'],
    },
  },
  {
    name: 'fill_cover_letter_field',
    description: 'Paste the cover letter text into the cover letter textarea (if one is visible).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'select_option',
    description: 'Select a value from a dropdown/select field identified by its label text.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['label', 'value'],
    },
  },
  {
    name: 'click_next',
    description: 'Click the Next button to advance to the next step of the modal.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'click_review',
    description: 'Click the Review button to go to the final review step.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'submit_application',
    description: 'Click the Submit Application button on the review step.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'close_modal',
    description: 'Close or dismiss the Easy Apply modal.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_submission_success',
    description: 'Check whether the application was successfully submitted (looks for confirmation message).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

export class ApplicationAgent extends AgentBase {
  constructor() {
    super(
      'ApplicationAgent',
      'Navigates and submits LinkedIn Easy Apply forms',
      `You are an expert job application assistant operating a web browser. Your goal is to complete a LinkedIn Easy Apply job application on behalf of the candidate.

CANDIDATE PROFILE:
Name: ${userProfile.applicant.name}
Current role: ${userProfile.applicant.currentRole}
Years experience: ${userProfile.applicant.yearsOfExperience}
Work authorization: ${userProfile.applicant.workAuthorization}
Salary expectation: ${userProfile.applicant.salaryExpectation}
Notice period: ${userProfile.applicant.noticePeriod}
Willing to relocate: ${userProfile.applicant.willingToRelocate}

YOUR PROCESS:
1. Navigate to the job URL
2. Click the Easy Apply button
3. Read the modal state to understand what's on screen
4. Fill in fields methodically — upload resume, fill text fields, answer questions
5. Advance with Next/Review buttons
6. Submit on the final review step
7. Confirm the submission was successful

For any question you're unsure how to answer, use the candidate's profile and common sense. Be honest — never fabricate information. If a field is already filled, skip it.`
    );
    this._resumePdfPath = null;
    this._coverLetterText = null;
    this._coverLetterPdfPath = null;
    this._submitted = false;
    this._page = null;
  }

  async onRun({ job, resumePdfPath, coverLetterText, coverLetterPdfPath }) {
    if (process.env.AUTO_APPLY !== 'true') {
      this._log(`DRY RUN — would apply to: ${job.title} @ ${job.company}`);
      return false;
    }
    if (!job.hasEasyApply) {
      this._log(`No Easy Apply for ${job.title} @ ${job.company} — skipping.`, 'warn');
      return false;
    }

    this._resumePdfPath = resumePdfPath;
    this._coverLetterText = coverLetterText;
    this._coverLetterPdfPath = coverLetterPdfPath;
    this._submitted = false;
    this._page = await browserPool.getPage();

    const goal = `Apply to this job via LinkedIn Easy Apply:
Title: ${job.title}
Company: ${job.company}
URL: ${job.url}
Resume PDF path: ${resumePdfPath}
Cover letter available: ${!!coverLetterText}

Navigate to the job, click Easy Apply, fill in all form steps completely, and submit the application.`;

    await this._runAgentLoop(goal, TOOLS, this._handleTool.bind(this));

    if (this._submitted) {
      JobScoutAgent.recordApplied(job);
      this._publish('job:applied', { jobId: job.jobId, title: job.title, company: job.company });
    }

    return this._submitted;
  }

  async _handleTool(name, input) {
    const page = this._page;

    switch (name) {
      case 'navigate_to_job': {
        await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await thinkingPause();
        return `Navigated to job page. Current URL: ${page.url()}`;
      }

      case 'click_easy_apply_button': {
        const btn = page.locator('button.jobs-apply-button, .artdeco-button--primary')
          .filter({ hasText: /easy apply/i }).first();
        const visible = await btn.isVisible({ timeout: 8000 }).catch(() => false);
        if (!visible) return 'Easy Apply button not found on this page.';
        await humanClick(page, btn);
        await randomDelay(1500, 3000);
        return 'Easy Apply button clicked. Modal should be opening.';
      }

      case 'read_modal_state': {
        const modalOpen = await page.locator('.jobs-easy-apply-modal').isVisible({ timeout: 5000 }).catch(() => false);
        if (!modalOpen) return 'Modal is not open.';

        const header = await page.locator('.jobs-easy-apply-modal h3, .jobs-easy-apply-header__title').first()
          .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => 'Unknown step');

        // Collect form fields
        const groups = await page.locator('.jobs-easy-apply-form-section__grouping, .fb-form-element').all();
        const fields = [];
        for (const g of groups) {
          const label = await g.locator('label, legend').first().textContent({ timeout: 2000 }).then(t => t?.trim()).catch(() => null);
          const input = g.locator('input:not([type="hidden"]), textarea, select').first();
          if (!label || await input.count() === 0) continue;
          const tag = await input.evaluate(el => el.tagName.toLowerCase()).catch(() => 'input');
          const val = await input.inputValue().catch(() => '');
          const type = await input.getAttribute('type').catch(() => tag);
          fields.push({ label, type: type || tag, currentValue: val || '(empty)' });
        }

        // Collect buttons
        const buttonTexts = [];
        for (const btn of await page.locator('.jobs-easy-apply-modal button:visible').all()) {
          const t = await btn.textContent({ timeout: 1000 }).then(t => t?.trim()).catch(() => '');
          if (t) buttonTexts.push(t);
        }

        // Check for file upload
        const hasFileUpload = await page.locator('input[type="file"]').count() > 0;
        const hasCoverLetterArea = await page.locator('textarea[id*="cover"], textarea[placeholder*="cover"]').count() > 0;

        return JSON.stringify({ header, fields, buttons: buttonTexts, hasFileUpload, hasCoverLetterArea }, null, 2);
      }

      case 'upload_resume': {
        const input = page.locator('input[type="file"][name*="resume"], input[type="file"][accept*="pdf"], input[type="file"]').first();
        if (await input.count() === 0) return 'No file input found for resume upload.';
        await input.setInputFiles(this._resumePdfPath);
        await randomDelay(1000, 2000);
        return `Resume uploaded: ${this._resumePdfPath}`;
      }

      case 'fill_text_field': {
        const label = input.label?.toLowerCase();
        const groups = await page.locator('.jobs-easy-apply-form-section__grouping, .fb-form-element').all();
        for (const g of groups) {
          const lbl = await g.locator('label, legend').first().textContent({ timeout: 1500 }).then(t => t?.trim()?.toLowerCase()).catch(() => '');
          if (!lbl?.includes(label)) continue;
          const el = g.locator('input:not([type="file"]), textarea').first();
          if (await el.count() === 0) continue;
          await el.click();
          await el.fill('');
          await microPause();
          await humanType(el, input.value);
          await microPause();
          return `Filled "${input.label}" with "${input.value.slice(0, 60)}"`;
        }
        return `Field with label "${input.label}" not found on page.`;
      }

      case 'fill_cover_letter_field': {
        if (!this._coverLetterText) return 'No cover letter text available.';
        const area = page.locator('textarea[id*="cover"], textarea[placeholder*="cover"]').first();
        if (await area.count() === 0 || !(await area.isVisible().catch(() => false))) {
          // Try file upload fallback
          if (this._coverLetterPdfPath) {
            const fileInput = page.locator('input[type="file"][name*="cover"]').first();
            if (await fileInput.count() > 0) {
              await fileInput.setInputFiles(this._coverLetterPdfPath);
              return 'Cover letter PDF uploaded.';
            }
          }
          return 'No cover letter field found.';
        }
        await area.click();
        await area.fill('');
        await humanType(area, this._coverLetterText);
        return 'Cover letter text entered.';
      }

      case 'select_option': {
        const label = input.label?.toLowerCase();
        const groups = await page.locator('.jobs-easy-apply-form-section__grouping, .fb-form-element').all();
        for (const g of groups) {
          const lbl = await g.locator('label, legend').first().textContent({ timeout: 1500 }).then(t => t?.trim()?.toLowerCase()).catch(() => '');
          if (!lbl?.includes(label)) continue;
          const sel = g.locator('select').first();
          if (await sel.count() === 0) continue;
          await sel.selectOption({ label: input.value }).catch(() => sel.selectOption({ index: 1 }));
          return `Selected "${input.value}" for "${input.label}"`;
        }
        return `Select field "${input.label}" not found.`;
      }

      case 'click_next': {
        const btn = page.locator('button').filter({ hasText: /^next$/i }).first();
        if (!(await btn.isVisible({ timeout: 4000 }).catch(() => false))) return 'Next button not found.';
        await humanClick(page, btn);
        await randomDelay(1500, 3000);
        return 'Clicked Next.';
      }

      case 'click_review': {
        const btn = page.locator('button').filter({ hasText: /^review$/i }).first();
        if (!(await btn.isVisible({ timeout: 4000 }).catch(() => false))) return 'Review button not found.';
        await humanClick(page, btn);
        await randomDelay(1500, 3000);
        return 'Clicked Review.';
      }

      case 'submit_application': {
        const btn = page.locator('button').filter({ hasText: /submit application/i }).first();
        if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) return 'Submit button not found — may not be on review step yet.';
        await humanClick(page, btn);
        await randomDelay(2000, 4000);
        return 'Submit Application clicked.';
      }

      case 'check_submission_success': {
        const success = await page.locator('.artdeco-inline-feedback--success, .t-green, [aria-live]')
          .filter({ hasText: /submitted|applied|successfully/i })
          .first().isVisible({ timeout: 5000 }).catch(() => false);
        this._submitted = success;
        return success ? 'SUCCESS — Application was submitted successfully.' : 'Submission not confirmed yet — modal may still be open.';
      }

      case 'close_modal': {
        const btn = page.locator('button[aria-label="Dismiss"], button[data-test-modal-close-btn]').first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await humanClick(page, btn);
        } else {
          await page.keyboard.press('Escape');
        }
        await randomDelay(800, 1500);
        return 'Modal closed.';
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}
