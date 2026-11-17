// Shared: open the REAL app on localhost signed in as a test account (auth.js's dev_login).
import { chromium } from 'playwright';
import fs from 'node:fs';
export const BASE = 'http://localhost:8799/';
export async function openApp(role, { w = 1280, h = 950, hash = '' } = {}) {
  const creds = JSON.parse(fs.readFileSync(new URL('./creds.json', import.meta.url)))[role];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  await ctx.addInitScript((c) => { try { localStorage.setItem('dev_login', JSON.stringify(c)); } catch {} }, creds);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.currentUser && !document.getElementById('boot-splash'), null, { timeout: 40000 });
  await page.waitForTimeout(4000);
  return { browser, page, errs };
}
export const saleText = (page) => page.evaluate(() => (document.querySelector('#subtab-sale') || document.body).innerText.replace(/\n{2,}/g, '\n'));
export const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('.toast, #toast, [class*=toast]')].map((t) => t.innerText.trim()).filter(Boolean));
export async function goSale(page, filter) {
  await page.locator('[data-tab="trade"]:visible').first().click();
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#trade-view button')].find((x) => /^For Sale/.test(x.innerText.trim())); b && b.click(); });
  await page.waitForTimeout(1500);
  if (filter) { await page.click(`#subtab-sale [data-action="mkt-filter"][data-filter="${filter}"]`); await page.waitForTimeout(1200); }
}
// A real (noisy) photo so the stock-image check has something genuine to look at.
export function noisePng(file) {
  return import('node:zlib').then((zlib) => {
    const w = 320, h = 320, raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = (x * 7 + y * 3 + ((x * y) >> 3)) & 255; raw[i + 1] = (x * y + 91 * (x >> 4)) & 255; raw[i + 2] = (y * 11 + 37 * (y >> 5)) & 255; }
    const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    return file;
  });
}
