/**
 * outreachAgent.js
 * Combines Claude AI persuasion + browser automation to:
 *  1. Send a personalized LinkedIn connection request (≤ 300 chars note)
 *  2. Send a compelling DM once connected
 *
 * Message strategy:
 *  - Connection note: warm, specific, name-drops the role  (≤ 280 chars)
 *  - DM: opens with a specific company observation, states value prop in 1-2
 *    sentences, closes with a low-friction CTA (not "review my CV please")
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { humanClick, humanType, randomDelay, thinkingPause, microPause } from '../utils/humanize.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

const SYSTEM_PROMPT = `You are a world-class executive communication coach who writes LinkedIn messages that hiring managers actually respond to.

Your messages:
- Sound like a real senior professional wrote them — never AI-generated
- Open with something specific and genuine about the company or role
- Are concise and respect the reader's time
- End with a low-friction CTA (coffee chat or quick thoughts — never "please review my resume")
- Are warm but direct — confident without being arrogant

Connection notes: ≤ 280 characters. Direct, human, specific.
DMs: ≤ 120 words. Open strong, state value, close with one easy ask.`;

export class OutreachAgent extends AgentBase {
  constructor() {
    super(
      'OutreachAgent',
      'Sends Claude-written connection requests and personalized DMs to recruiters/HMs',
      SYSTEM_PROMPT
    );
  }

  /**
   * @param {{ job: object, recruiter: object }} input
   * @returns {{ connected: boolean, messageSent: boolean }}
   */
  async onRun({ job, recruiter }) {
    if (!recruiter?.profileUrl) {
      this._log('No recruiter profile URL — skipping outreach.', 'warn');
      return { connected: false, messageSent: false };
    }

    const shouldConnect = process.env.AUTO_CONNECT !== 'false';
    const shouldMessage = process.env.SEND_RECRUITER_MESSAGE !== 'false';

    if (!shouldConnect) {
      this._log('AUTO_CONNECT=false — skipping.', 'warn');
      return { connected: false, messageSent: false };
    }

    const page = await browserPool.getPage();
    const connected = await this._sendConnectionRequest(page, job, recruiter);
    let messageSent = false;

    if (shouldMessage) {
      messageSent = await this._sendMessage(page, job, recruiter);
    }

    this._publish('outreach:complete', {
      jobId: job.jobId,
      recruiterName: recruiter.name,
      connected,
      messageSent,
    });

    return { connected, messageSent };
  }

  // ── Connection request ─────────────────────────────────────────────────────
  async _sendConnectionRequest(page, job, recruiter) {
    try {
      this._log(`Visiting profile: ${recruiter.profileUrl}`);
      await page.goto(recruiter.profileUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await thinkingPause();

      // Already connected?
      const alreadyMsg = await page.locator('button').filter({ hasText: /^message$/i })
        .first().isVisible({ timeout: 3000 }).catch(() => false);
      if (alreadyMsg) {
        this._log('Already connected — skipping connection request.');
        recruiter.alreadyConnected = true;
        return true;
      }

      // Find Connect button (may be hidden in More dropdown)
      let connectBtn = page.locator('button').filter({ hasText: /^connect$/i }).first();
      if (!(await connectBtn.isVisible({ timeout: 4000 }).catch(() => false))) {
        const moreBtn = page.locator('button[aria-label="More actions"]').first();
        if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await humanClick(page, moreBtn);
          await randomDelay(800, 1500);
          connectBtn = page.locator('[role="menuitem"]').filter({ hasText: /^connect$/i }).first();
        }
      }

      if (!(await connectBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
        this._log('Connect button not found — profile may be restricted.', 'warn');
        return false;
      }

      await humanClick(page, connectBtn);
      await randomDelay(1000, 2000);

      // Add a personalized note
      const addNoteBtn = page.locator('button[aria-label="Add a note"]').first();
      if (await addNoteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await humanClick(page, addNoteBtn);
        await randomDelay(800, 1500);

        const note = await this._writeConnectionNote(job, recruiter);
        this._log(`Connection note (${note.length} chars): "${note.slice(0, 70)}..."`);

        const textarea = page.locator('textarea[name="message"], #custom-message').first();
        await textarea.waitFor({ state: 'visible', timeout: 5000 });
        await humanType(textarea, note);
        await randomDelay(600, 1200);
      }

      // Send
      const sendBtn = page.locator('button[aria-label="Send invitation"], button[aria-label="Send now"]').first();
      if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await humanClick(page, sendBtn);
        await randomDelay(1500, 3000);
        this._log(`Connection request sent to: ${recruiter.name ?? 'recruiter'}`);
        return true;
      }

      this._log('Send button not found.', 'warn');
      return false;

    } catch (err) {
      this._log(`Connection request failed: ${err.message}`, 'error');
      return false;
    }
  }

  // ── DM ─────────────────────────────────────────────────────────────────────
  async _sendMessage(page, job, recruiter) {
    try {
      if (!page.url().includes(recruiter.profileUrl?.split('/in/')[1] ?? '__')) {
        await page.goto(recruiter.profileUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await thinkingPause();
      }

      const messageBtn = page.locator('button').filter({ hasText: /^message$/i }).first();
      if (!(await messageBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        this._log('Message button not available — likely pending connection.', 'warn');
        return false;
      }

      await humanClick(page, messageBtn);
      await randomDelay(1500, 3000);

      const message = await this._writeRecruiterDM(job, recruiter);
      this._log(`DM preview: "${message.slice(0, 80)}..."`);

      const composeBox = page.locator('.msg-form__contenteditable, [data-placeholder="Write a message…"]').first();
      await composeBox.waitFor({ state: 'visible', timeout: 8000 });
      await composeBox.click();
      await randomDelay(300, 700);

      for (const char of message) {
        await page.keyboard.type(char, { delay: Math.floor(Math.random() * 110) + 40 });
        if (Math.random() < 0.03) await randomDelay(120, 450);
      }

      await randomDelay(1000, 2000);

      const sendBtn = page.locator('button.msg-form__send-button, button[type="submit"]').first();
      if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await humanClick(page, sendBtn);
        await randomDelay(1500, 2500);
        this._log(`DM sent to: ${recruiter.name ?? 'recruiter'}`);
        return true;
      }

      this._log('Message send button not found.', 'warn');
      return false;

    } catch (err) {
      this._log(`DM failed: ${err.message}`, 'error');
      return false;
    }
  }

  // ── Claude AI writing ──────────────────────────────────────────────────────
  async _writeConnectionNote(job, recruiter) {
    const a = userProfile.applicant;

    const prompt = `Write a LinkedIn connection request note.

SENDER: ${a.name}, ${a.currentRole}, ${a.yearsOfExperience} years experience.
RECIPIENT: ${recruiter.name ?? 'Hiring Manager'} at ${job.company}${recruiter.title ? ` (${recruiter.title})` : ''}.
OPEN ROLE: ${job.title}

Rules:
- Maximum 275 characters (hard limit)
- Mention the role name and one authentic reason for interest
- Avoid "I came across your profile" or "I would love to connect"
- Warm, professional, ends with the sender's first name
- Return ONLY the note text`;

    const note = await this._think(prompt, 200);
    return note.length > 275 ? note.slice(0, 272) + '...' : note;
  }

  async _writeRecruiterDM(job, recruiter) {
    const a = userProfile.applicant;
    const msgCfg = userProfile.recruiterMessageTemplate;

    const prompt = `Write a LinkedIn direct message from a job candidate to a recruiter or hiring manager.

SENDER: ${a.name}, ${a.currentRole}, ${a.yearsOfExperience} years experience.
RECIPIENT: ${recruiter.name ?? 'the recruiter'} at ${job.company}${recruiter.title ? ` (${recruiter.title})` : ''}.
ROLE APPLIED FOR: ${job.title}

REQUIREMENTS:
1. Open with a ${msgCfg.openWith} — something specific and genuine about ${job.company} or this role. NOT "Hope this finds you well."
2. State in 1-2 sentences WHY the candidate is a strong fit (use: ${a.targetRoles.join(', ')}).
3. Close with a low-friction CTA — a 15-minute chat OR just "would love your thoughts on the role." Never "please review my resume."
4. Max ${msgCfg.maxWords} words. Tone: ${userProfile.tone.recruiterMessage}.
5. Must sound 100% human. Return ONLY the message text.`;

    return this._think(prompt, 500);
  }
}
