/**
 * messageBus.js
 * Central event bus for inter-agent communication.
 * Agents publish events here; other agents (and the orchestrator) subscribe.
 *
 * Event naming convention:  <domain>:<action>
 *   jobs:discovered        JobScoutAgent → Orchestrator
 *   resume:ready           ResumeTailorAgent → Orchestrator
 *   coverletter:ready      CoverLetterAgent → Orchestrator
 *   job:applied            ApplicationAgent → Orchestrator
 *   recruiter:found        RecruiterHunterAgent → Orchestrator
 *   outreach:complete      OutreachAgent → Orchestrator
 *   agent:error            Any agent → Orchestrator
 *   agent:status           Any agent → Logger/UI
 */

import { EventEmitter } from 'events';

class MessageBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // many agents can subscribe
    this._history = [];
  }

  /**
   * Publish an event from an agent.
   * @param {string} event - Event name
   * @param {object} payload - Data to send
   * @param {string} from - Sending agent name
   */
  publish(event, payload, from = 'unknown') {
    const message = {
      event,
      from,
      payload,
      timestamp: new Date().toISOString(),
    };
    this._history.push(message);
    this.emit(event, message);
    this.emit('*', message); // wildcard subscription for the orchestrator
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  subscribe(event, handler) {
    this.on(event, handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe once.
   */
  subscribeOnce(event, handler) {
    this.once(event, handler);
  }

  /**
   * Wait for an event to fire (Promise-based).
   * @param {string} event
   * @param {number} [timeoutMs]
   */
  waitFor(event, timeoutMs = 120_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`[Bus] Timed out waiting for "${event}" (${timeoutMs}ms)`)),
        timeoutMs
      );

      this.once(event, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  /** Return the full message history (useful for debugging). */
  getHistory() {
    return [...this._history];
  }
}

// Singleton — all agents share the same bus
export const bus = new MessageBus();
