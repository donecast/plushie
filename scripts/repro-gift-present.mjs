// Verify the gift + present UI against the REAL app parts + markup, with a
// stubbed data layer. Drives the actual global functions the app uses.
//
//  A) card badges: 🎁 present, 💝 received-gift, 🎁→ pending-outgoing
//  B) openGiftModal renders a Coven friend picker + note + send button
//  C) renderGiftsTray renders incoming (Accept/Decline) + outgoing (Cancel)
//  D) syncPresentVisibility pins + locks the visibility select
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
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return;
  }
  try {
    const body = fs.readFileSync(path.join(ROOT, rel));
    const type = rel.endsWith('.css') ? 'text/css' : rel.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': type }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.currentUser = { id: 'me', username: 'redrambler' };
  window.runAuthGate = async () => {};
  window.removeBootSplash = () => {};
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
  window.data = { appSettings: {}, featureEnabled: () => false, isBlocked: () => false };
});
for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                 'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
  await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
}

const result = await page.evaluate(async () => {
  // ── A) card badges ──
  const bPresent = cardBadgesHtml({ id: 'p1', isPresent: true }, 'collection');
  const bGift = cardBadgesHtml({ id: 'p2', isGift: true }, 'collection');
  state.gifts = [{ id: 'g0', direction: 'out', status: 'pending', plushId: 'p3', otherUsername: 'bo' }];
  const bPendingOut = cardBadgesHtml({ id: 'p3' }, 'collection');
  const badges = {
    present: bPresent.includes('badge-present'),
    gift: bGift.includes('badge-gift') && bGift.includes('💝'),
    pendingOut: bPendingOut.includes('badge-gift-pending'),
    pendingLookup: !!giftPendingOutFor('p3') && !giftPendingOutFor('nope'),
  };

  // ── B) openGiftModal picker ──
  state.socFriends = [
    { userId: 'f1', username: 'amber', avatarUrl: null, isInner: true },
    { userId: 'f2', username: 'bo', avatarUrl: null },
  ];
  openGiftModal({ id: 'p9', name: 'Anxiety Rabbit', nickname: null });
  const body = document.getElementById('gift-modal-body');
  const modal = {
    open: !document.getElementById('gift-modal').classList.contains('hidden'),
    radios: body.querySelectorAll('input[name="gift-recipient"]').length,
    hasSend: !!body.querySelector('#gift-send'),
    hasNote: !!body.querySelector('#gift-message'),
    warns: !!body.querySelector('.gift-warn'),
    titleHasName: document.getElementById('gift-modal-title').textContent.includes('Anxiety Rabbit'),
  };

  // ── C) gifts tray ──
  state.gifts = [
    { id: 'g1', direction: 'in', status: 'pending', otherUsername: 'amber', plushName: 'Grief Rabbit', message: 'happy hatch day' },
    { id: 'g2', direction: 'out', status: 'pending', otherUsername: 'bo', plushName: 'Anxiety Rabbit' },
  ];
  const tray = renderGiftsTray();
  const trayChecks = {
    hasAccept: tray.includes('data-soc-action="gift-accept"') && tray.includes('data-gift-id="g1"'),
    hasDecline: tray.includes('data-soc-action="gift-decline"'),
    hasCancel: tray.includes('data-soc-action="gift-cancel"') && tray.includes('data-gift-id="g2"'),
    showsMessage: tray.includes('happy hatch day'),
    countBadge: tray.includes('🎁 Gifts · 1'),
    emptyWhenNone: (state.gifts = [], renderGiftsTray()) === '',
  };

  // ── D) present pins visibility ──
  // Populate the visibility select the way openModal would, then toggle present.
  const vis = document.getElementById('f-visibility');
  vis.innerHTML = Object.entries(ITEM_VIS_META).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('');
  const chk = document.getElementById('f-present');
  chk.checked = true; syncPresentVisibility();
  const lockedOn = vis.value === 'private' && vis.disabled === true;
  chk.checked = false; syncPresentVisibility();
  const freedOff = vis.disabled === false;

  return { badges, modal, trayChecks, present: { lockedOn, freedOff } };
});

console.log(JSON.stringify(result, null, 2));

const r = result;
const checks = [
  ['A: present badge 🎁', r.badges.present],
  ['A: received-gift badge 💝', r.badges.gift],
  ['A: pending-outgoing badge 🎁→', r.badges.pendingOut],
  ['A: giftPendingOutFor lookup', r.badges.pendingLookup],
  ['B: gift modal opens', r.modal.open],
  ['B: one radio per Coven friend (2)', r.modal.radios === 2],
  ['B: has send button', r.modal.hasSend],
  ['B: has note field', r.modal.hasNote],
  ['B: shows the move warning', r.modal.warns],
  ['B: title carries the plush name', r.modal.titleHasName],
  ['C: incoming Accept wired to gift id', r.trayChecks.hasAccept],
  ['C: incoming Decline present', r.trayChecks.hasDecline],
  ['C: outgoing Cancel wired to gift id', r.trayChecks.hasCancel],
  ['C: incoming shows the note', r.trayChecks.showsMessage],
  ['C: incoming count badge', r.trayChecks.countBadge],
  ['C: empty tray renders nothing', r.trayChecks.emptyWhenNone],
  ['D: present pins + locks visibility', r.present.lockedOn],
  ['D: unchecking frees visibility', r.present.freedOff],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
