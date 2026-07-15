/**
 * tracker.js
 * Reads and writes the Job Applications tracker Excel workbook.
 *
 * File location: /Users/paragkarkhanis/Desktop/Personal/Parag Resume/Job Applications/Job_Applications_Tracker.xlsx
 *
 * Columns (in order):
 *  A  Job ID
 *  B  Date Applied
 *  C  Job Title
 *  D  Company
 *  E  Location
 *  F  Job URL
 *  G  Applied (Yes / No / Dry Run)
 *  H  Resume PDF Path
 *  I  Cover Letter PDF Path
 *  J  Fit Score
 *  K  Recruiter Name
 *  L  Recruiter Title
 *  M  Recruiter LinkedIn
 *  N  Connected (Yes / No)
 *  O  Message Sent (Yes / No)
 *  P  Status
 *  Q  Notes / Error
 */

import ExcelJS from 'exceljs';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from './logger.js';
import dayjs from 'dayjs';

// ── Tracker file location ──────────────────────────────────────────────────
export const TRACKER_PATH =
  process.env.TRACKER_PATH ||
  '/Users/paragkarkhanis/Desktop/Personal/Parag Resume/Job Applications/Job_Applications_Tracker.xlsx';

const SHEET_NAME = 'Applications';

// ── Column definitions ─────────────────────────────────────────────────────
const COLUMNS = [
  { header: 'Job ID',              key: 'jobId',              width: 18 },
  { header: 'Date Applied',        key: 'dateApplied',        width: 16 },
  { header: 'Job Title',           key: 'title',              width: 36 },
  { header: 'Company',             key: 'company',            width: 24 },
  { header: 'Location',            key: 'location',           width: 22 },
  { header: 'Job URL',             key: 'url',                width: 50 },
  { header: 'Applied',             key: 'applied',            width: 10 },
  { header: 'Resume PDF',          key: 'resumePdfPath',      width: 60 },
  { header: 'Cover Letter PDF',    key: 'coverLetterPdfPath', width: 60 },
  { header: 'Fit Score',           key: 'fitScore',           width: 10 },
  { header: 'Recruiter Name',      key: 'recruiterName',      width: 24 },
  { header: 'Recruiter Title',     key: 'recruiterTitle',     width: 28 },
  { header: 'Recruiter LinkedIn',  key: 'recruiterProfile',   width: 50 },
  { header: 'Connected',           key: 'connected',          width: 12 },
  { header: 'Message Sent',        key: 'messageSent',        width: 14 },
  { header: 'Status',              key: 'status',             width: 14 },
  { header: 'Notes / Error',       key: 'notes',              width: 40 },
];

// ── Style helpers ──────────────────────────────────────────────────────────
const HEADER_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };
const HEADER_FONT  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
const ROW_FONT     = { size: 10, name: 'Calibri' };
const BORDER_THIN  = { style: 'thin', color: { argb: 'FFCBD5E0' } };
const BORDER_ALL   = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

const STATUS_COLORS = {
  done:       'FFD4EDDA', // green tint
  failed:     'FFF8D7DA', // red tint
  processing: 'FFFFF3CD', // yellow tint
  queued:     'FFE8F4FD', // blue tint
};

// ── Open or create the workbook ────────────────────────────────────────────
async function openWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LinkedIn Job Bot';
  wb.created = new Date();

  // Ensure parent directory exists
  const dir = dirname(TRACKER_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.info(`[Tracker] Created directory: ${dir}`);
  }

  if (existsSync(TRACKER_PATH)) {
    await wb.xlsx.readFile(TRACKER_PATH);
  }

  return wb;
}

// ── Get or create the Applications sheet ──────────────────────────────────
function getSheet(wb) {
  let ws = wb.getWorksheet(SHEET_NAME);
  if (ws) return ws;

  ws = wb.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }], // freeze header row
  });

  ws.columns = COLUMNS;

  // Style the header row
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell(cell => {
    cell.fill   = HEADER_FILL;
    cell.font   = HEADER_FONT;
    cell.border = BORDER_ALL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
  });

  // Auto-filter on header
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLUMNS.length)}1` };

  return ws;
}

// ── Read all applied Job IDs from the sheet ────────────────────────────────
export async function loadAppliedJobIds() {
  if (!existsSync(TRACKER_PATH)) return new Set();

  try {
    const wb = await openWorkbook();
    const ws = wb.getWorksheet(SHEET_NAME);
    if (!ws) return new Set();

    const ids = new Set();
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const jobId = row.getCell('A').value;
      const applied = row.getCell('G').value;
      // Only block re-application if previously applied (not just tracked)
      if (jobId && applied === 'Yes') ids.add(String(jobId));
    });
    return ids;
  } catch (err) {
    logger.warn(`[Tracker] Could not read tracker: ${err.message}`);
    return new Set();
  }
}

// ── Append or update a row in the tracker ─────────────────────────────────
/**
 * Upserts a job record into the Excel tracker.
 * If a row with the same jobId already exists, it is updated in-place.
 * Otherwise a new row is appended.
 *
 * @param {object} record
 */
export async function upsertJobRecord(record) {
  try {
    const wb = await openWorkbook();
    const ws = getSheet(wb);

    // Find existing row by Job ID
    let targetRow = null;
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      if (String(row.getCell('A').value) === String(record.jobId)) {
        targetRow = row;
      }
    });

    if (!targetRow) {
      // Append a new row
      targetRow = ws.addRow({});
      targetRow.height = 18;
    }

    // Write values
    const now = dayjs().format('YYYY-MM-DD HH:mm');
    targetRow.getCell('A').value = record.jobId           ?? '';
    targetRow.getCell('B').value = record.dateApplied     ?? now;
    targetRow.getCell('C').value = record.title           ?? '';
    targetRow.getCell('D').value = record.company         ?? '';
    targetRow.getCell('E').value = record.location        ?? '';
    targetRow.getCell('F').value = record.url
      ? { text: 'Open', hyperlink: record.url }
      : '';
    targetRow.getCell('G').value = record.applied         ? 'Yes' : (record.dryRun ? 'Dry Run' : 'No');
    targetRow.getCell('H').value = record.resumePdfPath   ?? '';
    targetRow.getCell('I').value = record.coverLetterPdfPath ?? '';
    targetRow.getCell('J').value = record.fitScore        ?? '';
    targetRow.getCell('K').value = record.recruiterName   ?? '';
    targetRow.getCell('L').value = record.recruiterTitle  ?? '';
    targetRow.getCell('M').value = record.recruiterProfile
      ? { text: record.recruiterName ?? 'Profile', hyperlink: record.recruiterProfile }
      : '';
    targetRow.getCell('N').value = record.connected       ? 'Yes' : 'No';
    targetRow.getCell('O').value = record.messageSent     ? 'Yes' : 'No';
    targetRow.getCell('P').value = _statusLabel(record);
    targetRow.getCell('Q').value = record.notes           ?? record.error ?? '';

    // Style the row
    const rowFill = STATUS_COLORS[record.status] ?? 'FFFFFFFF';
    targetRow.eachCell(cell => {
      cell.font   = ROW_FONT;
      cell.border = BORDER_ALL;
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
      cell.alignment = { vertical: 'middle', wrapText: false };
    });

    // Hyperlinks in blue
    targetRow.getCell('F').font = { ...ROW_FONT, color: { argb: 'FF2B6CB0' }, underline: true };
    targetRow.getCell('M').font = { ...ROW_FONT, color: { argb: 'FF2B6CB0' }, underline: true };

    await wb.xlsx.writeFile(TRACKER_PATH);
    logger.success(`[Tracker] Saved → ${record.title} @ ${record.company} (${TRACKER_PATH})`);

  } catch (err) {
    logger.error(`[Tracker] Failed to write Excel: ${err.message}`);
  }
}

// ── Write a full session summary ───────────────────────────────────────────
/**
 * Called at end of session to upsert all processed jobs into the tracker.
 * @param {object[]} jobRecords - Array of job state objects from sharedState
 */
export async function writeSessionToTracker(jobRecords) {
  if (!jobRecords || jobRecords.length === 0) return;
  logger.info(`[Tracker] Writing ${jobRecords.length} job(s) to Excel tracker...`);

  for (const record of jobRecords) {
    await upsertJobRecord({
      jobId:               record.jobId,
      title:               record.title,
      company:             record.company,
      location:            record.location,
      url:                 record.url,
      dateApplied:         record.completedAt
                             ? dayjs(record.completedAt).format('YYYY-MM-DD HH:mm')
                             : dayjs().format('YYYY-MM-DD HH:mm'),
      applied:             record.applied,
      dryRun:              process.env.AUTO_APPLY !== 'true',
      resumePdfPath:       record.resumePdfPath,
      coverLetterPdfPath:  record.coverLetterPdfPath,
      fitScore:            record.fitScore,
      recruiterName:       record.recruiter?.name,
      recruiterTitle:      record.recruiter?.title,
      recruiterProfile:    record.recruiter?.profileUrl,
      connected:           record.connected,
      messageSent:         record.messageSent,
      status:              record.status,
      notes:               record.error,
    });
  }

  logger.success(`[Tracker] Excel tracker updated → ${TRACKER_PATH}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function _statusLabel(record) {
  if (record.status === 'failed') return 'Failed';
  if (record.applied && record.messageSent) return 'Applied + Messaged';
  if (record.applied && record.connected)  return 'Applied + Connected';
  if (record.applied)                       return 'Applied';
  if (record.messageSent)                   return 'Messaged';
  if (record.connected)                     return 'Connected';
  if (record.dryRun || process.env.AUTO_APPLY !== 'true') return 'Dry Run';
  return 'Processed';
}
