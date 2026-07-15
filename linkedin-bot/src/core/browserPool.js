/**
 * browserPool.js
 * Manages a single persistent Playwright browser context shared across agents.
 * Agents request pages; the pool handles launch, auth, and cleanup.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { randomDelay, thinkingPause } from '../utils/humanize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = join(__dirname, '../../', process.env.USER_DATA_DIR || 'browser-data');

mkdirSync(USER_DATA_DIR, { recursive: true });

class BrowserPool {
  constructor() {
    this._context = null;
    this._activePage = null;
    this._initialized = false;
  }

  // ── Launch ──────────────────────────────────────────────────────────────────
  async init() {
    if (this._initialized) return;

    logger.info('[Browser] Launching Chromium...');

    const launchOpts = {
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1440,900',
        '--ignore-certificate-errors',
      ],
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    };

    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }

    this._context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOpts);

    // Mask automation fingerprints
    await this._context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    });

    this._activePage = await this._context.newPage();
    this._initialized = true;
    logger.success('[Browser] Chromium ready.');
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  async ensureLoggedIn() {
    const page = await this.getPage();

    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    const alreadyLoggedIn = page.url().includes('/feed') || page.url().includes('/mynetwork');
    if (alreadyLoggedIn) {
      logger.success('[Browser] Existing LinkedIn session found — skipping login.');
      return;
    }

    // Perform login
    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;
    if (!email || !password) {
      throw new Error('Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env');
    }

    logger.info('[Browser] Logging in to LinkedIn...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await randomDelay(1500, 3000);

    await page.locator('#username').fill(email);
    await randomDelay(400, 800);
    await page.locator('#password').fill(password);
    await randomDelay(500, 1000);
    await page.locator('[data-litms-control-urn="login-submit"]').click();

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
    await thinkingPause();

    if (page.url().includes('/checkpoint/challenge')) {
      logger.warn('[Browser] LinkedIn 2FA/CAPTCHA detected. Complete it in the browser, then press ENTER.');
      await this._waitForCheckpoint(page);
    }

    if (page.url().includes('/login') || page.url().includes('/authwall')) {
      throw new Error('[Browser] Login failed — check credentials.');
    }

    logger.success('[Browser] LinkedIn login successful.');
  }

  async _waitForCheckpoint(page) {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await randomDelay(3000, 5000);
      if (!page.url().includes('/checkpoint') && !page.url().includes('/login')) return;
    }
    throw new Error('[Browser] Timed out waiting for 2FA completion.');
  }

  // ── Page access ─────────────────────────────────────────────────────────────
  async getPage() {
    if (!this._initialized) await this.init();
    return this._activePage;
  }

  // ── Teardown ─────────────────────────────────────────────────────────────────
  async close() {
    if (this._context) {
      await this._context.close().catch(() => {});
      this._context = null;
      this._activePage = null;
      this._initialized = false;
      logger.dim('[Browser] Browser closed.');
    }
  }
}

// Singleton — all agents share one browser session
export const browserPool = new BrowserPool();
