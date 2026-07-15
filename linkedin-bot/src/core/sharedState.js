/**
 * sharedState.js
 * Thread-safe shared state store for the agent team.
 * Agents read/write job processing status, generated artifacts, and metrics.
 */

class SharedState {
  constructor() {
    this._jobs = new Map();      // jobId → JobRecord
    this._session = {
      startedAt: new Date().toISOString(),
      totalJobs: 0,
      applied: 0,
      connected: 0,
      messaged: 0,
      errors: 0,
    };
  }

  // ── Job records ────────────────────────────────────────────────────────────

  /**
   * Register a batch of discovered jobs.
   * @param {object[]} jobs
   */
  setJobs(jobs) {
    this._session.totalJobs = jobs.length;
    for (const job of jobs) {
      this._jobs.set(job.jobId, {
        ...job,
        status: 'queued',
        tailoredResume: null,
        resumePdfPath: null,
        coverLetterText: null,
        coverLetterPdfPath: null,
        recruiter: null,
        applied: false,
        connected: false,
        messageSent: false,
        error: null,
        startedAt: null,
        completedAt: null,
      });
    }
  }

  getJob(jobId) {
    return this._jobs.get(jobId);
  }

  getAllJobs() {
    return [...this._jobs.values()];
  }

  /**
   * Partially update a job record.
   * @param {string} jobId
   * @param {object} patch
   */
  updateJob(jobId, patch) {
    const existing = this._jobs.get(jobId);
    if (!existing) throw new Error(`[State] Unknown jobId: ${jobId}`);
    this._jobs.set(jobId, { ...existing, ...patch });
  }

  markJobStarted(jobId) {
    this.updateJob(jobId, { status: 'processing', startedAt: new Date().toISOString() });
  }

  markJobComplete(jobId) {
    const job = this.getJob(jobId);
    const applied = job?.applied || false;
    const connected = job?.connected || false;
    const messaged = job?.messageSent || false;

    this.updateJob(jobId, { status: 'done', completedAt: new Date().toISOString() });

    if (applied) this._session.applied++;
    if (connected) this._session.connected++;
    if (messaged) this._session.messaged++;
  }

  markJobFailed(jobId, error) {
    this.updateJob(jobId, { status: 'failed', error: error?.message || String(error) });
    this._session.errors++;
  }

  // ── Session metrics ────────────────────────────────────────────────────────

  getSessionSummary() {
    return {
      ...this._session,
      completedAt: new Date().toISOString(),
      jobs: this.getAllJobs().map(j => ({
        title: j.title,
        company: j.company,
        status: j.status,
        applied: j.applied,
        connected: j.connected,
        messageSent: j.messageSent,
        error: j.error,
      })),
    };
  }
}

// Singleton
export const state = new SharedState();
