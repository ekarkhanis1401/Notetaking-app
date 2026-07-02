/**
 * agentBase.js
 * Abstract base class for all AI agents.
 *
 * DESIGN: Every agent runs a Claude-powered ReAct loop.
 *   1. Claude receives a goal + available tools + context
 *   2. Claude reasons and picks a tool to call
 *   3. Agent executes the tool and feeds the result back to Claude
 *   4. Loop repeats until Claude returns a final text answer (no tool call)
 *
 * Agents that are pure-AI (no browser) simply call _think() directly.
 * Browser agents use _runAgentLoop() with their declared tool set.
 */

import Anthropic from '@anthropic-ai/sdk';
import { bus } from './messageBus.js';
import { state } from './sharedState.js';
import { logger } from '../utils/logger.js';

export class AgentBase {
  /**
   * @param {string} name
   * @param {string} role
   * @param {string} systemPrompt  - Claude's persona and instructions for this agent
   */
  constructor(name, role, systemPrompt) {
    this.name = name;
    this.role = role;
    this._systemPrompt = systemPrompt;
    this._bus = bus;
    this._state = state;
    this._claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this._model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
    this._conversationHistory = []; // per-agent memory within a job
  }

  // ── Lifecycle (subclasses override onRun) ─────────────────────────────────

  async onInit() {}
  async onRun(_input) { throw new Error(`${this.name}.onRun() not implemented`); }
  async onTeardown() {}

  async run(input) {
    this._conversationHistory = []; // reset for each new task
    this._publish('agent:status', { status: 'started' });
    this._log(`Starting — ${this.role}`);
    try {
      await this.onInit();
      const result = await this.onRun(input);
      this._publish('agent:status', { status: 'completed' });
      this._log('Done.');
      return result;
    } catch (err) {
      this._publish('agent:error', { error: err.message });
      this._log(`FAILED: ${err.message}`, 'error');
      throw err;
    } finally {
      await this.onTeardown().catch(() => {});
    }
  }

  // ── ReAct loop ────────────────────────────────────────────────────────────
  /**
   * Run a multi-turn Claude tool-use loop until Claude produces a final
   * text answer (meaning it considers the task complete).
   *
   * @param {string}   goal        - The task description sent to Claude
   * @param {object[]} toolDefs    - Array of Anthropic tool schema objects
   * @param {Function} toolHandler - (toolName, toolInput) => result string
   * @param {number}   [maxTurns]  - Safety cap on iterations
   * @returns {string} Claude's final reasoning / summary
   */
  async _runAgentLoop(goal, toolDefs, toolHandler, maxTurns = 15) {
    const messages = [
      ...this._conversationHistory,
      { role: 'user', content: goal },
    ];

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await this._claude.messages.create({
        model: this._model,
        max_tokens: 4096,
        system: this._systemPrompt,
        tools: toolDefs,
        messages,
      });

      // Append Claude's response to the conversation
      messages.push({ role: 'assistant', content: response.content });

      // If Claude stopped naturally (no tool call) → we're done
      if (response.stop_reason === 'end_turn') {
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');
        this._log(`[Turn ${turn + 1}] Concluded.`);
        return text;
      }

      // Process all tool_use blocks in this response
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) break;

      const toolResults = [];
      for (const block of toolUseBlocks) {
        this._log(`[Turn ${turn + 1}] Claude calls → ${block.name}(${JSON.stringify(block.input).slice(0, 120)})`);
        let result;
        try {
          result = await toolHandler(block.name, block.input);
        } catch (err) {
          result = `ERROR: ${err.message}`;
        }
        this._log(`[Turn ${turn + 1}] Result: ${String(result).slice(0, 200)}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: String(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return '[Agent loop max turns reached]';
  }

  // ── Simple one-shot Claude call ───────────────────────────────────────────
  /**
   * Single-turn Claude call — for generation tasks (writing, JSON output).
   * @param {string}   prompt
   * @param {number}   [maxTokens]
   * @param {number}   [retries]
   */
  async _think(prompt, maxTokens = 2000, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this._claude.messages.create({
          model: this._model,
          max_tokens: maxTokens,
          system: this._systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        });
        return response.content[0].text.trim();
      } catch (err) {
        this._log(`Claude attempt ${attempt}/${retries}: ${err.message}`, 'warn');
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }

  // ── Bus helpers ───────────────────────────────────────────────────────────
  _publish(event, payload) { this._bus.publish(event, payload, this.name); }
  _subscribe(event, handler) { return this._bus.subscribe(event, handler); }

  // ── Log helpers ────────────────────────────────────────────────────────────
  _log(msg, level = 'info') {
    const fn = logger[level] ?? logger.info;
    fn(`[${this.name}] ${msg}`);
  }
}
