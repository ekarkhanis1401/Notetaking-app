/**
 * humanize.js
 * Utilities that make bot behavior indistinguishable from a human user.
 * Randomized delays, natural typing, realistic mouse movement patterns.
 */

// ─── Delay helpers ───────────────────────────────────────────────────────────

/**
 * Sleep for a random number of ms between min and max.
 * Defaults simulate natural human reaction time.
 */
export function randomDelay(minMs = 800, maxMs = 2200) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Short micro-pause (like a human glancing at the screen before clicking).
 */
export const microPause = () => randomDelay(150, 450);

/**
 * Medium pause — like reading a form field label before filling it in.
 */
export const readingPause = () => randomDelay(600, 1800);

/**
 * Longer "thinking" pause — between major actions like page navigation.
 */
export const thinkingPause = () => randomDelay(2000, 5000);

/**
 * Job-to-job cooldown — much longer gap to avoid rate limiting.
 */
export function jobCooldown() {
  const minSec = parseInt(process.env.DELAY_BETWEEN_JOBS_MIN || '30', 10);
  const maxSec = parseInt(process.env.DELAY_BETWEEN_JOBS_MAX || '90', 10);
  const ms = (Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec) * 1000;
  return new Promise(r => setTimeout(r, ms));
}

// ─── Typing ──────────────────────────────────────────────────────────────────

/**
 * Types text into a Playwright locator character-by-character at a human
 * typing speed, with occasional brief hesitations.
 *
 * @param {import('playwright').Locator} locator
 * @param {string} text
 */
export async function humanType(locator, text) {
  await locator.click();
  await microPause();

  for (const char of text) {
    await locator.pressSequentially(char, {
      // ~40-120 WPM: each character takes 50-200ms
      delay: Math.floor(Math.random() * 150) + 50,
    });

    // Occasional longer pause (thinking mid-word)
    if (Math.random() < 0.04) {
      await randomDelay(200, 600);
    }
  }
}

/**
 * Types text but first clears any existing value in the field.
 */
export async function humanTypeAndClear(locator, text) {
  await locator.click();
  await locator.selectAll?.();
  await locator.fill('');   // clear field
  await microPause();
  await humanType(locator, text);
}

// ─── Scrolling ───────────────────────────────────────────────────────────────

/**
 * Scrolls down the page gradually, as a human would when reading.
 * @param {import('playwright').Page} page
 * @param {number} totalPixels
 */
export async function humanScroll(page, totalPixels = 600) {
  const steps = Math.floor(Math.random() * 6) + 4; // 4-10 scroll steps
  const pixelsPerStep = Math.floor(totalPixels / steps);

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, pixelsPerStep + Math.floor(Math.random() * 40 - 20));
    await randomDelay(80, 300);
  }
}

// ─── Mouse movement ──────────────────────────────────────────────────────────

/**
 * Moves the mouse to a target element along a slightly curved path,
 * then clicks it — mimicking natural hand movement.
 * @param {import('playwright').Page} page
 * @param {import('playwright').Locator} locator
 */
export async function humanClick(page, locator) {
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click();
    return;
  }

  // Target: slightly off-center within the element
  const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
  const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

  // Current mouse position (start from a random nearby point)
  const startX = targetX + (Math.random() * 100 - 50);
  const startY = targetY + (Math.random() * 80 - 40);

  const steps = Math.floor(Math.random() * 8) + 5;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Ease-in-out interpolation
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    await page.mouse.move(
      startX + (targetX - startX) * ease + (Math.random() * 4 - 2),
      startY + (targetY - startY) * ease + (Math.random() * 4 - 2)
    );
    await randomDelay(10, 30);
  }

  await page.mouse.move(targetX, targetY);
  await microPause();
  await page.mouse.click(targetX, targetY);
}

// ─── Random user-agent rotation ──────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Viewport randomization ──────────────────────────────────────────────────

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
];

export function randomViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}
