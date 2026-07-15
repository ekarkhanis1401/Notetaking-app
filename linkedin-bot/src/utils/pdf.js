/**
 * pdf.js
 * Generates PDF files for resumes and cover letters from HTML templates.
 * Uses Playwright's built-in PDF generation — no extra PDF library needed.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import dayjs from 'dayjs';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '../../templates');
const OUTPUT_DIR = join(__dirname, '../../output');

mkdirSync(join(OUTPUT_DIR, 'resumes'), { recursive: true });
mkdirSync(join(OUTPUT_DIR, 'cover-letters'), { recursive: true });

// ─── Helper: render HTML template with data ──────────────────────────────────
function renderTemplate(templateName, data) {
  let html = readFileSync(join(TEMPLATES_DIR, templateName), 'utf8');

  // Simple {{key}} interpolation
  for (const [key, value] of Object.entries(flattenObject(data))) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(String(value ?? '')));
  }
  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function flattenObject(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, key) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(acc, flattenObject(obj[key], fullKey));
    } else {
      acc[fullKey] = obj[key];
    }
    return acc;
  }, {});
}

// ─── Build resume HTML from structured data ──────────────────────────────────
export function buildResumeHTML(resume) {
  const template = readFileSync(join(TEMPLATES_DIR, 'resume.html'), 'utf8');

  const skillsHTML = [
    ...resume.skills.technical.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`),
    ...resume.skills.soft.map(s => `<span class="skill-tag soft">${escapeHtml(s)}</span>`),
    ...(resume.skills.tools || []).map(s => `<span class="skill-tag tool">${escapeHtml(s)}</span>`),
  ].join('');

  const experienceHTML = resume.experience.map(exp => `
    <div class="experience-item">
      <div class="exp-header">
        <div>
          <span class="exp-title">${escapeHtml(exp.title)}</span>
          <span class="exp-company"> · ${escapeHtml(exp.company)}</span>
          ${exp.location ? `<span class="exp-location"> — ${escapeHtml(exp.location)}</span>` : ''}
        </div>
        <span class="exp-dates">${escapeHtml(exp.startDate)} – ${escapeHtml(exp.endDate)}</span>
      </div>
      <ul class="exp-bullets">
        ${exp.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  const educationHTML = resume.education.map(ed => `
    <div class="education-item">
      <div class="edu-header">
        <span class="edu-degree">${escapeHtml(ed.degree)}</span>
        <span class="edu-year">${escapeHtml(ed.graduationYear)}</span>
      </div>
      <span class="edu-school">${escapeHtml(ed.institution)}</span>
      ${ed.gpa ? `<span class="edu-gpa"> · GPA: ${escapeHtml(ed.gpa)}</span>` : ''}
    </div>
  `).join('');

  const projectsHTML = (resume.projects || []).map(proj => `
    <div class="project-item">
      <strong>${escapeHtml(proj.name)}</strong>
      <span class="project-tech">[${proj.tech.map(escapeHtml).join(', ')}]</span>
      <p>${escapeHtml(proj.description)}</p>
      <ul>${proj.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
    </div>
  `).join('');

  const certHTML = (resume.certifications || []).map(c =>
    `<li>${escapeHtml(c.name)} — ${escapeHtml(c.issuer)}, ${escapeHtml(c.year)}</li>`
  ).join('');

  return template
    .replace('{{NAME}}', escapeHtml(resume.personal.name))
    .replace('{{TITLE}}', escapeHtml(resume.personal.title))
    .replace('{{EMAIL}}', escapeHtml(resume.personal.email))
    .replace('{{PHONE}}', escapeHtml(resume.personal.phone))
    .replace('{{LOCATION}}', escapeHtml(resume.personal.location))
    .replace('{{LINKEDIN}}', escapeHtml(resume.personal.linkedin || ''))
    .replace('{{PORTFOLIO}}', escapeHtml(resume.personal.portfolio || ''))
    .replace('{{SUMMARY}}', escapeHtml(resume.summary))
    .replace('{{SKILLS}}', skillsHTML)
    .replace('{{EXPERIENCE}}', experienceHTML)
    .replace('{{EDUCATION}}', educationHTML)
    .replace('{{PROJECTS}}', projectsHTML)
    .replace('{{CERTIFICATIONS}}', certHTML ? `<ul>${certHTML}</ul>` : '');
}

// ─── Build cover letter HTML ─────────────────────────────────────────────────
export function buildCoverLetterHTML(coverLetterText, resume, job) {
  const template = readFileSync(join(TEMPLATES_DIR, 'coverLetter.html'), 'utf8');
  const today = dayjs().format('MMMM D, YYYY');

  // Convert plain text paragraphs to HTML
  const paragraphsHTML = coverLetterText
    .split(/\n\n+/)
    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return template
    .replace('{{NAME}}', escapeHtml(resume.personal.name))
    .replace('{{TITLE}}', escapeHtml(resume.personal.title))
    .replace('{{EMAIL}}', escapeHtml(resume.personal.email))
    .replace('{{PHONE}}', escapeHtml(resume.personal.phone))
    .replace('{{DATE}}', today)
    .replace('{{JOB_TITLE}}', escapeHtml(job.title))
    .replace('{{COMPANY}}', escapeHtml(job.company))
    .replace('{{BODY}}', paragraphsHTML);
}

// ─── PDF generation via Playwright ──────────────────────────────────────────
async function htmlToPdf(html, outputPath) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle' });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
  });

  await browser.close();
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Generate a tailored resume PDF.
 * @returns {string} Path to the generated PDF file.
 */
export async function generateResumePDF(tailoredResume, job) {
  const slug = `${job.company.replace(/\W+/g, '-')}_${job.title.replace(/\W+/g, '-')}`;
  const fileName = `Resume_${tailoredResume.personal.name.replace(/\s+/g, '_')}_${slug}_${dayjs().format('YYYYMMDD')}.pdf`;
  const outputPath = join(OUTPUT_DIR, 'resumes', fileName);

  logger.info(`[PDF] Generating resume PDF → ${fileName}`);
  const html = buildResumeHTML(tailoredResume);
  await htmlToPdf(html, outputPath);
  logger.success(`[PDF] Resume saved: ${outputPath}`);
  return outputPath;
}

/**
 * Generate a cover letter PDF.
 * @returns {string} Path to the generated PDF file.
 */
export async function generateCoverLetterPDF(coverLetterText, resume, job) {
  const slug = `${job.company.replace(/\W+/g, '-')}_${job.title.replace(/\W+/g, '-')}`;
  const fileName = `CoverLetter_${resume.personal.name.replace(/\s+/g, '_')}_${slug}_${dayjs().format('YYYYMMDD')}.pdf`;
  const outputPath = join(OUTPUT_DIR, 'cover-letters', fileName);

  logger.info(`[PDF] Generating cover letter PDF → ${fileName}`);
  const html = buildCoverLetterHTML(coverLetterText, resume, job);
  await htmlToPdf(html, outputPath);
  logger.success(`[PDF] Cover letter saved: ${outputPath}`);
  return outputPath;
}
