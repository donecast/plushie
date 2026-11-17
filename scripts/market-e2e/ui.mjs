// ui.mjs <role> <hash> <w> <h> [js to eval after load] — loads the REAL app on localhost against the real backend.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [role, hash = '#trade-sale', w = '1280', h = '900', js] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync('creds.json'))[role];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, serviceWorkers: 'block' });
await ctx.addInitScript((c) => { try { localStorage.setItem('dev_login', JSON.stringify(c)); } catch {} }, creds);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
page.on('requestfailed', (r) => errs.push('reqfailed: ' + r.url().slice(0, 120)));
await page.goto(`http://localhost:8799/${hash}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
if (await page.locator('#auth-first-name').isVisible().catch(() => false)) {
  await page.fill('#auth-first-name', 'Test'); await page.fill('#auth-last-name', role[0].toUpperCase() + role.slice(1));
  await page.click('#auth-name-form button[type=submit]'); console.log('filled name gate');
}
await page.waitForFunction(() => window.currentUser && !document.getElementById('boot-splash'), null, { timeout: 30000 }).catch(() => errs.push('boot timeout'));
await page.waitForTimeout(6000);
if (js) { try { console.log('eval →', JSON.stringify(await page.evaluate(js))); } catch (e) { console.log('eval FAIL', e.message.split('\n')[0]); } await page.waitForTimeout(3000); }
console.log('user', await page.evaluate(() => window.currentUser?.username), '| market', await page.evaluate(() => window.data?.featureEnabled?.('feature.market')), '| tab', await page.evaluate(() => `${(typeof state !== 'undefined' ? state.tab : '?')}/${(typeof state !== 'undefined' ? state.tradeSubTab : '?')}`));
const text = await page.evaluate(() => (document.querySelector('#trade-view:not(.hidden)') || document.querySelector('.view:not(.hidden)') || document.body).innerText.replace(/\n{2,}/g, '\n').slice(0, 3500));
console.log(text);
console.log('--- errors', JSON.stringify(errs.slice(0, 15), null, 1));
await page.screenshot({ path: `ui-${role}-${w}.png`, fullPage: false });
await browser.close();
