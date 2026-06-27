#!/usr/bin/env node
/**
 * index.js — LinkedIn Job Bot entry point
 *
 * Boots the agent team and hands control to the OrchestratorAgent.
 *
 * CLI flags:
 *   --mode apply      Only apply to jobs (no recruiter outreach)
 *   --mode connect    Only reach out to recruiters (no applications)
 *   --mode full       Both (default)
 *   --dry-run         Generate PDFs and log everything, submit nothing
 */

import 'dotenv/config';
import { logger } from './utils/logger.js';
import { OrchestratorAgent } from './agents/orchestratorAgent.js';
import { bus } from './core/messageBus.js';

// ── Parse CLI ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const mode = (() => {
  const idx = args.indexOf('--mode');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const inline = args.find(a => a.startsWith('--mode='));
  return inline ? inline.split('=')[1] : 'full';
})();

if (isDryRun) {
  process.env.AUTO_APPLY = 'false';
  process.env.AUTO_CONNECT = 'false';
}

// ── Validate env ───────────────────────────────────────────────────────────
const REQUIRED_ENV = ['LINKEDIN_EMAIL', 'LINKEDIN_PASSWORD', 'ANTHROPIC_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  logger.error(`Missing required environment variables: ${missing.join(', ')}`);
  logger.error('Copy linkedin-bot/.env.example → linkedin-bot/.env and fill in your values.');
  process.exit(1);
}

// ── Global bus monitor (prints agent status lines) ─────────────────────────
bus.subscribe('agent:status', ({ from, payload }) => {
  if (payload.status === 'started') {
    logger.info(`  → ${from} starting...`);
  } else if (payload.status === 'completed') {
    logger.success(`  ✓ ${from} completed`);
  }
});

bus.subscribe('agent:error', ({ from, payload }) => {
  logger.error(`  ✗ ${from} error: ${payload.error}`);
});

// ── Run ────────────────────────────────────────────────────────────────────
const orchestrator = new OrchestratorAgent(mode, isDryRun);

orchestrator.run().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  if (err.stack) logger.dim(err.stack);
  process.exit(1);
});
