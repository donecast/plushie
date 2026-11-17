// pay.mjs <checkout url> [card number] — pays a SANDBOX Stripe Checkout with a test card.
// Stripe's page hides its fields from scripts, so this drives it by screen position
// (1100x1400 viewport). If Stripe changes the layout, look at pay-before.png / pay-after.png.
import { chromium } from 'playwright';
const url = process.argv[2]; const card = process.argv[3] || '4242424242424242';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await (await browser.newContext()).newPage();
await page.setViewportSize({ width: 1100, height: 1400 });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
const click = async (x, y, ms = 500) => { await page.mouse.click(x, y); await page.waitForTimeout(ms); };
const type = async (t) => { await page.keyboard.type(t, { delay: 45 }); await page.waitForTimeout(500); };
await click(722, 371, 3000);
await click(800, 435); await type(card); await page.waitForTimeout(800);
await click(700, 474); await page.keyboard.press('Control+A'); await type('1234');
await click(870, 474); await page.keyboard.press('Control+A'); await type('123');
await click(800, 540); await page.keyboard.press('Control+A'); await type('E2E Buyer');
await click(800, 647); await page.keyboard.press('Control+A'); await type('01970');
await click(647, 693, 1200);
await page.screenshot({ path: 'pay-before.png' });
await click(800, 647); await page.keyboard.press('Enter');   // submit from the ZIP field (the Pay button moves with the method list)
try { await page.waitForURL(/localhost:8799/, { timeout: 40000 }); } catch { console.log('NO REDIRECT'); await page.screenshot({ path: 'pay-after.png' }); }
console.log('URL', page.url().slice(0, 100));
await browser.close();
