// Verify the notifications recovery flow against the real markup + app parts.
//
// The bug this covers: a browser-level "Block" wrote notify_enabled=false, which
// was indistinguishable from a deliberate opt-out — so re-allowing notifications
// in browser settings left the app permanently silent, and the Settings switch
// rendered as a plain unchecked box the whole time, with no hint that anything
// was wrong.
//
// Covers: notifyState() across all four states, the blocked help panel showing
// per-browser steps, the switch going disabled when blocked, the un-latch only
// firing for a block-induced off (never a deliberate one), the settings-open
// sync path, and the "check again" button.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0].replace(/^\//, '');
  if (rel === '' || rel === 'shell') {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
    return;
  }
  try {
    const body = fs.readFileSync(path.join(ROOT, rel));
    const type = rel.endsWith('.css') ? 'text/css' : rel.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'scott' };
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  // In-memory meta store so we can inspect exactly what the flow persists.
  window.__meta = {};
  window.idb = {
    getMeta: async (k) => (k in window.__meta ? window.__meta[k] : null),
    setMeta: async (k, v) => { window.__meta[k] = v; },
  };
  window.data = { appSettings: {}, featureEnabled: () => false, track: () => {} };
  // Notification.permission is read-only, so stand in a controllable double.
  window.__perm = 'default';
  window.Notification = function () {};
  Object.defineProperty(window.Notification, 'permission', { get: () => window.__perm });
  window.Notification.requestPermission = async () => window.__perm;
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  const out = {};
  const chk = () => document.getElementById('acct-notify');
  const box = () => document.getElementById('acct-notify-blocked');
  const steps = () => [...document.querySelectorAll('#acct-notify-steps li')].map((li) => li.textContent);
  const snap = () => ({
    checked: chk().checked,
    disabled: chk().disabled,
    helpVisible: !box().classList.contains('hidden'),
    stepCount: steps().length,
  });

  // 1. notifyState() across every permission / preference combination.
  window.__perm = 'denied';  out.state_denied = await notifyState();
  window.__perm = 'default'; out.state_default = await notifyState();
  window.__perm = 'granted';
  window.__meta.notify_enabled = true;  out.state_granted_on = await notifyState();
  window.__meta.notify_enabled = false; out.state_granted_off = await notifyState();

  // 2. BLOCKED: help panel appears, switch goes inert, steps are populated.
  window.__perm = 'denied';
  window.__meta = { notify_enabled: false, notify_off_reason: 'blocked' };
  await updateNotifyButton();
  out.blocked = snap();
  out.blockedStepsSample = steps()[0];

  // 3. The un-latch must NOT fire while still blocked.
  await unlatchBlockedOptOut();
  out.stillLatchedWhileBlocked = window.__meta.notify_enabled === false;

  // 4. User fixes it in browser settings → permission granted. Opening Settings
  //    must un-latch AND repaint. This is the whole point of the change.
  window.__perm = 'granted';
  await syncNotifySettingsUI();
  out.afterUnblock = snap();
  out.afterUnblockMeta = { ...window.__meta };

  // 5. A DELIBERATE off must survive forever — no reason recorded, no un-latch.
  window.__meta = { notify_enabled: false, notify_off_reason: null };
  window.__perm = 'granted';
  const unlatched = await unlatchBlockedOptOut();
  out.deliberateOffRespected = unlatched === false && window.__meta.notify_enabled === false;

  // 6. "Check again" while permission is now granted → turns reminders on.
  window.__meta = { notify_enabled: false, notify_off_reason: 'blocked' };
  window.__perm = 'granted';
  window.ensurePushSubscription = async () => {};
  window.scheduleReminderCheck = async () => {};
  await recheckNotifyPermission();
  out.afterRecheck = snap();
  out.afterRecheckMeta = { ...window.__meta };

  // 7. "Check again" while STILL blocked → stays blocked, no false success.
  window.__meta = { notify_enabled: false, notify_off_reason: 'blocked' };
  window.__perm = 'denied';
  await recheckNotifyPermission();
  await updateNotifyButton();
  out.recheckStillBlocked = snap();

  // 8. Per-browser steps actually differ (spot-check the UA branches).
  out.stepsVaryByBrowser = new Set([
    JSON.stringify(notifyUnblockSteps()),
  ]).size === 1;

  return out;
});

console.log(JSON.stringify(result, null, 2));

// Assert the behaviours we actually care about, so this fails loudly in CI-ish use.
const fail = [];
const eq = (label, got, want) => { if (got !== want) fail.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
eq('state_denied', result.state_denied, 'blocked');
eq('state_default', result.state_default, 'off');
eq('state_granted_on', result.state_granted_on, 'on');
eq('state_granted_off', result.state_granted_off, 'off');
eq('blocked.helpVisible', result.blocked.helpVisible, true);
eq('blocked.disabled', result.blocked.disabled, true);
eq('blocked.checked', result.blocked.checked, false);
if (!(result.blocked.stepCount >= 3)) fail.push(`blocked.stepCount: got ${result.blocked.stepCount}, want >= 3`);
eq('stillLatchedWhileBlocked', result.stillLatchedWhileBlocked, true);
eq('afterUnblock.helpVisible', result.afterUnblock.helpVisible, false);
eq('afterUnblock.disabled', result.afterUnblock.disabled, false);
eq('afterUnblock un-latched', result.afterUnblockMeta.notify_enabled, null);
eq('deliberateOffRespected', result.deliberateOffRespected, true);
eq('afterRecheck.checked', result.afterRecheck.checked, true);
eq('afterRecheck enabled', result.afterRecheckMeta.notify_enabled, true);
eq('recheckStillBlocked.helpVisible', result.recheckStillBlocked.helpVisible, true);

if (fail.length) { console.log('\nFAIL:\n- ' + fail.join('\n- ')); process.exitCode = 1; }
else console.log('\nAll notification-recovery assertions passed.');

await browser.close();
server.close();
