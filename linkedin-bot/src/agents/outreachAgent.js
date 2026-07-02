/**
 * outreachAgent.js
 * Claude-powered AI agent for recruiter and hiring-manager outreach.
 *
 * ReAct loop: Claude visits the recruiter's profile, reads their background
 * to personalise the message, writes a connection note and DM, then sends them.
 */

import { AgentBase } from '../core/agentBase.js';
import { browserPool } from '../core/browserPool.js';
import { humanClick, humanType, randomDelay, thinkingPause, microPause } from '../utils/humanize.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const userProfile = JSON.parse(readFileSync(join(__dirname, '../../config/user-profile.json'), 'utf8'));

const TOOLS = [
  {
    name: 'visit_profile',
    description: 'Navigate to the recruiter\'s LinkedIn profile page.',
    input_schema: {
      type: 'object',
      properties: { profileUrl: { type: 'string' } },
      required: ['profileUrl'],
    },
  },
  {
    name: 'read_profile_details',
    description: 'Read the recruiter\'s headline, about section, and recent activity from the current profile page to personalise the message.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_connection_status',
    description: 'Check whether you are already connected, have a pending request, or can send a connection request.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_connection_note',
    description: 'Write a personalised LinkedIn connection request note (≤ 275 characters) for this specific recruiter and role.',
    input_schema: {
      type: 'object',
      properties: {
        recruiterName: { type: 'string' },
        recruiterTitle: { type: 'string' },
        company: { type: 'string' },
        jobTitle: { type: 'string' },
        profileDetails: { type: 'string', description: 'Recruiter profile context for personalisation' },
      },
      required: ['company', 'jobTitle'],
    },
  },
  {
    name: 'send_connection_request',
    description: 'Click the Connect button, add the note, and send the connection request.',
    input_schema: {
      type: 'object',
      properties: { note: { type: 'string', description: 'The connection note to include (≤ 275 chars)' } },
      required: ['note'],
    },
  },
  {
    name: 'write_recruiter_message',
    description: 'Write a compelling LinkedIn DM to send to the recruiter (≤ 120 words). Opens strong, states value, closes with a low-friction CTA.',
    input_schema: {
      type: 'object',
      properties: {
        recruiterName: { type: 'string' },
        recruiterTitle: { type: 'string' },
        company: { type: 'string' },
        jobTitle: { type: 'string' },
        profileDetails: { type: 'string' },
      },
      required: ['company', 'jobTitle'],
    },
  },
  {
    name: 'send_message',
    description: 'Click the Message button and send the DM to the recruiter.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
  {
    name: 'report_outcome',
    description: 'Report the final outcome of the outreach attempt.',
    input_schema: {
      type: 'object',
      properties: {
        connected: { type: 'boolean' },
        messageSent: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['connected', 'messageSent'],
    },
  },
];

export class OutreachAgent extends AgentBase {
  constructor() {
    super(
      'OutreachAgent',
      'Sends personalized connection requests and DMs to recruiters',
      `You are an expert in professional LinkedIn outreach. You write messages that feel genuinely human and start real conversations.

CANDIDATE:
Name: ${userProfile.applicant.name}
Current role: ${userProfile.applicant.currentRole}
Experience: ${userProfile.applicant.yearsOfExperience} years
Target roles: ${userProfile.applicant.targetRoles.join(', ')}

YOUR PROCESS:
1. Visit the recruiter's profile to read their background
2. Check if you're already connected
3. If not connected: write a personalised connection note (≤ 275 chars) and send the request
4. If already connected (or after connecting): write a compelling DM and send it
5. Report the outcome

MESSAGE PRINCIPLES:
- Connection note: mention the specific role, one genuine observation, end with first name. Never "I'd love to connect."
- DM: open with something specific about the company/role (not "Hope this finds you well"), state value in 1-2 sentences, one easy ask. ≤ 120 words.
- Both must sound 100% human — written by a thoughtful senior professional, not an AI.

Tone: ${userProfile.tone.recruiterMessage}`
    );
    this._connected = false;
    this._messageSent = false;
    this._page = null;
  }

  async onRun({ job, recruiter }) {
    if (!recruiter?.profileUrl) {
      this._log('No recruiter profile — skipping outreach.', 'warn');
      return { connected: false, messageSent: false };
    }
    if (process.env.AUTO_CONNECT === 'false') {
      this._log('AUTO_CONNECT=false — skipping outreach.', 'warn');
      return { connected: false, messageSent: false };
    }

    this._connected = false;
    this._messageSent = false;
    this._page = await browserPool.getPage();

    const goal = `Reach out to this recruiter/hiring manager on LinkedIn on behalf of the candidate.

RECRUITER: ${recruiter.name ?? 'Unknown'} (${recruiter.title ?? 'Recruiter'}) at ${job.company}
PROFILE URL: ${recruiter.profileUrl}
ROLE APPLIED FOR: ${job.title} at ${job.company}

Visit their profile, read their background for personalisation hooks, check connection status, write a tailored connection note and send it, then write and send a compelling DM.`;

    await this._runAgentLoop(goal, TOOLS, this._handleTool.bind(this, job, recruiter));

    this._publish('outreach:complete', {
      jobId: job.jobId,
      recruiterName: recruiter.name,
      connected: this._connected,
      messageSent: this._messageSent,
    });

    return { connected: this._connected, messageSent: this._messageSent };
  }

  async _handleTool(job, recruiter, name, input) {
    const page = this._page;

    switch (name) {
      case 'visit_profile': {
        await page.goto(input.profileUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await thinkingPause();
        return `Visiting profile: ${input.profileUrl}. Current page: ${page.url()}`;
      }

      case 'read_profile_details': {
        const headline = await page.locator('.text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium').first()
          .textContent({ timeout: 4000 }).then(t => t?.trim()).catch(() => '');
        const about = await page.locator('#about ~ * .pv-shared-text-with-see-more, .pv-about-section .pv-about__summary-text').first()
          .textContent({ timeout: 4000 }).then(t => t?.trim()).catch(() => '');
        const posts = await page.locator('.feed-shared-update-v2__description').first()
          .textContent({ timeout: 3000 }).then(t => t?.trim()).catch(() => '');

        return JSON.stringify({ headline, about: about.slice(0, 500), recentPost: posts.slice(0, 300) });
      }

      case 'check_connection_status': {
        const messageBtn = await page.locator('button').filter({ hasText: /^message$/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
        const connectBtn = await page.locator('button').filter({ hasText: /^connect$/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
        const pendingBtn = await page.locator('button').filter({ hasText: /^pending$/i }).first().isVisible({ timeout: 3000 }).catch(() => false);

        if (messageBtn) return 'ALREADY_CONNECTED — Message button is visible, connection request accepted.';
        if (pendingBtn) return 'PENDING — Connection request already sent, awaiting acceptance.';
        if (connectBtn) return 'NOT_CONNECTED — Connect button is available.';

        // May be in "More" dropdown
        const moreBtn = page.locator('button[aria-label="More actions"]').first();
        if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await humanClick(page, moreBtn);
          await randomDelay(800, 1500);
          const menuConnect = await page.locator('[role="menuitem"]').filter({ hasText: /^connect$/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
          await page.keyboard.press('Escape').catch(() => {});
          if (menuConnect) return 'NOT_CONNECTED — Connect option found in More menu.';
        }

        return 'UNKNOWN — Could not determine connection status.';
      }

      case 'write_connection_note': {
        const note = await this._think(
          `Write a LinkedIn connection request note for this outreach.

SENDER: ${userProfile.applicant.name}, ${userProfile.applicant.currentRole}, ${userProfile.applicant.yearsOfExperience} yrs exp.
RECIPIENT: ${input.recruiterName ?? 'Hiring Manager'} (${input.recruiterTitle ?? 'Recruiter'}) at ${input.company}
OPEN ROLE: ${input.jobTitle}
THEIR PROFILE CONTEXT: ${input.profileDetails || 'No additional context.'}

RULES:
- HARD LIMIT: 275 characters
- Mention the specific role: ${input.jobTitle}
- Include one genuine, specific observation (from their profile or the company)
- End with the sender's first name
- Never say "I'd love to connect" or "I came across your profile"
- Return ONLY the note text

Character count must be ≤ 275.`,
          250
        );
        const trimmed = note.length > 275 ? note.slice(0, 272) + '...' : note;
        return `Connection note written (${trimmed.length} chars): "${trimmed}"`;
      }

      case 'send_connection_request': {
        let connectBtn = page.locator('button').filter({ hasText: /^connect$/i }).first();

        if (!(await connectBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
          const moreBtn = page.locator('button[aria-label="More actions"]').first();
          if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await humanClick(page, moreBtn);
            await randomDelay(800, 1500);
            connectBtn = page.locator('[role="menuitem"]').filter({ hasText: /^connect$/i }).first();
          }
        }

        if (!(await connectBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
          return 'Connect button not found — profile may be restricted or already connected.';
        }

        await humanClick(page, connectBtn);
        await randomDelay(1000, 2000);

        const addNoteBtn = page.locator('button[aria-label="Add a note"]').first();
        if (await addNoteBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
          await humanClick(page, addNoteBtn);
          await randomDelay(800, 1500);

          const textarea = page.locator('textarea[name="message"], #custom-message').first();
          await textarea.waitFor({ state: 'visible', timeout: 5000 });
          await humanType(textarea, input.note);
          await randomDelay(600, 1200);
        }

        const sendBtn = page.locator('button[aria-label="Send invitation"], button[aria-label="Send now"]').first();
        if (await sendBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
          await humanClick(page, sendBtn);
          await randomDelay(1500, 3000);
          this._connected = true;
          return 'Connection request sent successfully.';
        }

        return 'Send button not found — connection request may not have been sent.';
      }

      case 'write_recruiter_message': {
        const message = await this._think(
          `Write a LinkedIn DM to a recruiter/hiring manager.

SENDER: ${userProfile.applicant.name}, ${userProfile.applicant.currentRole}, ${userProfile.applicant.yearsOfExperience} yrs exp.
RECIPIENT: ${input.recruiterName ?? 'the recruiter'} (${input.recruiterTitle ?? 'Recruiter'}) at ${input.company}
ROLE APPLIED FOR: ${input.jobTitle} at ${input.company}
THEIR PROFILE: ${input.profileDetails || 'No additional context.'}
CANDIDATE VALUE PROPS: ${userProfile.applicant.targetRoles.join(', ')}

REQUIREMENTS:
1. Open with something SPECIFIC about ${input.company} or this role — not "Hope this finds you well" or "I am reaching out"
2. State in 1-2 sentences why the candidate is a strong, specific fit for ${input.jobTitle}
3. Close with ONE easy ask: a 15-minute call OR "would love your perspective on the role"
4. Max 120 words. Tone: ${userProfile.tone.recruiterMessage}
5. 100% human — senior professional, not an AI

Return ONLY the message text.`,
          500
        );
        return `Recruiter DM written (${message.split(/\s+/).length} words): "${message.slice(0, 100)}..."`;
      }

      case 'send_message': {
        const messageBtn = page.locator('button').filter({ hasText: /^message$/i }).first();
        if (!(await messageBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
          return 'Message button not available — likely pending connection or restricted profile.';
        }

        await humanClick(page, messageBtn);
        await randomDelay(1500, 3000);

        const composeBox = page.locator('.msg-form__contenteditable, [data-placeholder="Write a message…"]').first();
        await composeBox.waitFor({ state: 'visible', timeout: 8000 });
        await composeBox.click();
        await microPause();

        for (const char of input.message) {
          await page.keyboard.type(char, { delay: Math.floor(Math.random() * 110) + 40 });
          if (Math.random() < 0.03) await randomDelay(100, 400);
        }

        await randomDelay(1000, 2000);

        const sendBtn = page.locator('button.msg-form__send-button, button[type="submit"]').first();
        if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await humanClick(page, sendBtn);
          await randomDelay(1500, 2500);
          this._messageSent = true;
          return 'Message sent successfully.';
        }

        return 'Send button not found — message may not have been sent.';
      }

      case 'report_outcome': {
        this._connected = input.connected;
        this._messageSent = input.messageSent;
        this._log(`Outreach complete — connected: ${input.connected}, messaged: ${input.messageSent}. ${input.notes ?? ''}`);
        return `Outcome recorded: connected=${input.connected}, messageSent=${input.messageSent}`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}
