/**
 * agentBase.js
 * Abstract base class for all agents in the team.
 *
 * Every agent has:
 *  - A unique name and role description
 *  - Access to the shared message bus and state
 *  - Standardised lifecycle: init → run → teardown
 *  - Built-in status reporting via the bus
 *  - A private Claude AI client for agents that need it
 */

import Anthropic from '@anthropic-ai/sdk';
import { bus } from './messageBus.js';
import { state } from './sharedState.js';
import { logger } from '../utils/logger.js';

export class AgentBase {
  /**
   * @param {string} name - Agent identifier (e.g. "ResumeTailorAgent")
   * @param {string} role - One-line role description shown in logs
   * @param {string} [systemPrompt] - Claude system prompt (only for AI agents)
   */
  constructor(name, role, systemPrompt = null) {
    this.name = name;
    this.role = role;
    this._systemPrompt = systemPrompt;
    this._bus = bus;
    this._state = state;
    this._status = 'idle'; // idle | running | done | failed
    this._claude = systemPrompt
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
    this._model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
  }

  // ── Lifecycle hooks (override in subclasses) ──────────────────────────────

  /** Called once before the agent starts processing. */
  async onInit() {}

  /** Main agent logic — must be implemented by subclasses. */
  async onRun(input) {
    throw new Error(`${this.name}.onRun() not implemented`);
  }

  /** Called after onRun completes or fails. */
  async onTeardown() {}

  // ── Public run method ─────────────────────────────────────────────────────

  /**
   * Execute this agent with the given input.
   * Handles status tracking, bus events, and error reporting automatically.
   *
   * @param {*} input - Agent-specific input data
   * @returns {*} Agent-specific output
   */
  async run(input) {
    this._status = 'running';
    this._publish('agent:status', { status: 'started', role: this.role });
    this._log(`Starting...`);

    try {
      await this.onInit();
      const result = await this.onRun(input);
      this._status = 'done';
      this._publish('agent:status', { status: 'completed', role: this.role });
      this._log(`Completed successfully.`);
      return result;
    } catch (err) {
      this._status = 'failed';
      this._log(`FAILED: ${err.message}`, 'error');
      this._publish('agent:error', { error: err.message, role: this.role });
      throw err;
    } finally {
      await this.onTeardown().catch(() => {});
    }
  }

  // ── Claude AI helper ──────────────────────────────────────────────────────

  /**
   * Send a prompt to Claude and return the text response.
   * Only available to agents that were constructed with a systemPrompt.
   *
   * @param {string} userMessage
   * @param {number} [maxTokens]
   * @param {number} [retries]
   */
  async _think(userMessage, maxTokens = 2000, retries = 3) {
    if (!this._claude) throw new Error(`${this.name} has no Claude client (no systemPrompt set)`);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this._claude.messages.create({
          model: this._model,
          max_tokens: maxTokens,
          system: this._systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });
        return response.content[0].text.trim();
      } catch (err) {
        this._log(`Claude attempt ${attempt}/${retries} failed: ${err.message}`, 'warn');
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }

  // ── Bus helpers ───────────────────────────────────────────────────────────

  _publish(event, payload) {
    this._bus.publish(event, payload, this.name);
  }

  _subscribe(event, handler) {
    return this._bus.subscribe(event, handler);
  }

  // ── Logging helpers ────────────────────────────────────────────────────────

  _log(msg, level = 'info') {
    const prefix = `[${this.name}]`;
    logger[level]?.(`${prefix} ${msg}`) ?? logger.info(`${prefix} ${msg}`);
  }
}
