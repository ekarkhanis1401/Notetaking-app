/**
 * auth.js
 * LinkedIn authentication using Playwright.
 * Persists session cookies to a local browser profile so you only log in once.
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { humanType, randomDelay, thinkingPause, humanClick } from './utils/humanize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = join(__dirname, '../', process.env.USER_DATA_DIR || './browser-data');

mkdirSync(USER_DATA_DIR, { recursive: true });

// ─── Browser launch config ────────────────────────────────────────────────────
function getBrowserArgs() {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-infobars',
    '--window-size=1440,900',
    '--start-maximized',
  ];
}

// ─── Launch a persistent browser context ─────────────────────────────────────
/**
 * Launches a Chromium browser with a persistent user data directory.
 * This preserves cookies/session between runs, so you only log in once.
 *
 * @returns {{ browser: BrowserContext, page: Page }}
 */
export async function launchBrowser() {
  const isHeadless = process.env.HEADLESS !== 'false';

  logger.info(`[Auth] Launching browser (headless=${isHeadless})`);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: isHeadless,
    args: getBrowserArgs(),
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['geolocation'],
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Remove automation fingerprints
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  return { browser: context, page };
}

// ─── Check if already logged in ──────────────────────────────────────────────
async function isLoggedIn(page) {
  await page.goto('https://www.linkedin.com/feed/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  return page.url().includes('/feed') || page.url().includes('/mynetwork');
}

// ─── Perform login ────────────────────────────────────────────────────────────
async function performLogin(page) {
  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'LinkedIn credentials not set. Add LINKEDIN_EMAIL and LINKEDIN_PASSWORD to your .env file.'
    );
  }

  logger.info('[Auth] Navigating to LinkedIn login page...');
  await page.goto('https://www.linkedin.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await randomDelay(1500, 3000);

  // Fill email
  const emailField = page.locator('#username');
  await emailField.waitFor({ state: 'visible', timeout: 15000 });
  await humanType(emailField, email);
  await randomDelay(400, 900);

  // Fill password
  const passwordField = page.locator('#password');
  await humanType(passwordField, password);
  await randomDelay(600, 1200);

  // Click sign in
  const signInBtn = page.locator('[data-litms-control-urn="login-submit"]');
  await humanClick(page, signInBtn);

  // Wait for navigation — could land on feed, checkpoint, or 2FA
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

  await thinkingPause();

  const currentUrl = page.url();

  if (currentUrl.includes('/checkpoint/challenge')) {
    logger.warn('[Auth] LinkedIn is asking for a verification code (2FA/CAPTCHA).');
    logger.warn('[Auth] Please complete the challenge in the browser window, then press ENTER here.');
    // In headless mode we can't show a browser — flip to visible
    await waitForManualIntervention(page);
  }

  if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
    throw new Error('[Auth] Login failed — invalid credentials or unexpected redirect.');
  }

  logger.success('[Auth] Login successful!');
}

// ─── Wait for user to solve 2FA manually ─────────────────────────────────────
async function waitForManualIntervention(page) {
  // Poll until we leave the checkpoint page (up to 3 minutes)
  const maxWait = 180_000;
  const interval = 3_000;
  let elapsed = 0;

  while (elapsed < maxWait) {
    await new Promise(r => setTimeout(r, interval));
    elapsed += interval;
    const url = page.url();
    if (!url.includes('/checkpoint') && !url.includes('/authwall') && !url.includes('/login')) {
      logger.success('[Auth] Manual challenge completed successfully.');
      return;
    }
  }

  throw new Error('[Auth] Timed out waiting for manual 2FA/CAPTCHA completion.');
}

// ─── Main export: ensure browser is authenticated ────────────────────────────
/**
 * Launches browser and ensures the session is authenticated.
 * Reuses existing session cookies if already logged in.
 *
 * @returns {{ browser: BrowserContext, page: Page }}
 */
export async function ensureAuthenticated() {
  const { browser, page } = await launchBrowser();

  const loggedIn = await isLoggedIn(page).catch(() => false);

  if (loggedIn) {
    logger.success('[Auth] Session already active — skipping login.');
  } else {
    await performLogin(page);
  }

  return { browser, page };
}

/**
 * Gracefully close the browser.
 */
export async function closeBrowser(browser) {
  await browser.close().catch(() => {});
  logger.dim('[Auth] Browser closed.');
}
