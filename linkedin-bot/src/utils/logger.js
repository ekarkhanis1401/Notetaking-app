/**
 * logger.js
 * Structured console + file logger with color output.
 */

import { createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../output/logs');

mkdirSync(LOG_DIR, { recursive: true });

const logFile = createWriteStream(
  join(LOG_DIR, `session-${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.log`),
  { flags: 'a' }
);

// ANSI colour codes
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  info: '\x1b[36m',    // cyan
  success: '\x1b[32m', // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  dim: '\x1b[2m',      // grey
};

function stamp() {
  return dayjs().format('HH:mm:ss');
}

function write(level, color, ...args) {
  const msg = args.join(' ');
  const colored = `${COLORS[color]}${COLORS.bright}[${level}]${COLORS.reset} ${COLORS.dim}${stamp()}${COLORS.reset} ${msg}`;
  const plain = `[${level}] ${stamp()} ${msg}`;

  console.log(colored);
  logFile.write(plain + '\n');
}

export const logger = {
  info: (...args) => write('INFO', 'info', ...args),
  success: (...args) => write('OK  ', 'success', ...args),
  warn: (...args) => write('WARN', 'warn', ...args),
  error: (...args) => write('ERR ', 'error', ...args),
  dim: (...args) => write('    ', 'dim', ...args),

  /**
   * Log a job processing header — makes session logs easy to scan.
   */
  jobHeader(index, total, job) {
    const line = '─'.repeat(60);
    const msg = `\n${line}\n  Job ${index}/${total}: ${job.title} @ ${job.company}\n  URL: ${job.url}\n${line}`;
    console.log(`${COLORS.bright}${COLORS.info}${msg}${COLORS.reset}`);
    logFile.write(msg + '\n');
  },

  /**
   * Print a compact summary table at the end of a session.
   * Accepts either the SharedState summary object or a plain array of results.
   */
  sessionSummary(results) {
    // Accept SharedState.getSessionSummary() object
    if (results && typeof results === 'object' && !Array.isArray(results) && results.jobs) {
      results = results.jobs;
    }
    if (!Array.isArray(results)) results = [];
    const applied = results.filter(r => r.applied).length;
    const connected = results.filter(r => r.connected).length;
    const messaged = results.filter(r => r.messageSent).length;
    const failed = results.filter(r => r.error).length;

    const summary = [
      '',
      '═'.repeat(60),
      '  SESSION SUMMARY',
      '═'.repeat(60),
      `  Jobs processed : ${results.length}`,
      `  Applied        : ${applied}`,
      `  Connected      : ${connected}`,
      `  Messages sent  : ${messaged}`,
      `  Errors         : ${failed}`,
      '═'.repeat(60),
      '',
    ].join('\n');

    console.log(`${COLORS.bright}${COLORS.success}${summary}${COLORS.reset}`);
    logFile.write(summary + '\n');
  },
};
