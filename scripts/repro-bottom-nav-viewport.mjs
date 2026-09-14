// Wifeosaurus (Slack, 2026-09-13): "The bottom bar is not sticky and it keeps
// moving up to the middle" — screenshot of the Home feed with the phone's
// bottom nav floating half-way up the screen, page NOT zoomed, no keyboard.
//
// That's the layout-viewport-vs-visual-viewport gap: `position: fixed` pins
// the bar to the layout viewport, and on iOS (installed PWA especially) the
// visual viewport can be left scrolled inside it after the keyboard closes.
// syncBottomNavToViewport() measures that gap and shifts the bar to the
// visual bottom edge. We can't run iOS here, so:
//
//   phase 1 drives the sync with a controllable stand-in for
//           window.visualViewport through the exact states iOS produces
//           (clean → keyboard up → stuck after close → recovered);
//   phase 2 uses Chrome's REAL visualViewport under a pinch-zoom, where fixed
//           elements drift the same way, and checks the bar lands on the
//           visual bottom edge with no stand-in at all.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0].replace(/^\//, '');
  if (rel === '' || rel === 'shell') {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
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

const W = 390, H = 844;   // iPhone-ish; well inside the ≤860px bottom-bar breakpoint
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });

async function bootShell(page, { fakeViewport }) {
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ url: `http://localhost:${port}/styles.css` });
  await page.evaluate((fakeViewport) => {
    document.getElementById('boot-splash')?.remove();
    window.currentUser = { id: 'me', username: 'scott' };
    window.runAuthGate = async () => {}; window.removeBootSplash = () => {};
    window.idb = { getMeta: async () => null, setMeta: async () => {} };
    window.data = {
      appSettings: {}, featureEnabled: () => false,
      isBlocked: () => false, isMyBlock: () => false, isUnblockable: () => false,
      listDmThreads: async () => [], listDmMessages: async () => [], markDmRead: async () => {},
      listPosts: async () => [], listRecentNotifications: async () => [],
      track: (event, props) => { (window.__tracked ||= []).push({ event, props }); },
    };
    if (fakeViewport) {
      // A visualViewport we can put into any state iOS would. Installed
      // BEFORE the app scripts so wireBottomNavViewport() captures it.
      const vv = new EventTarget();
      vv.offsetTop = 0; vv.offsetLeft = 0; vv.width = innerWidth; vv.height = innerHeight; vv.scale = 1;
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      window.__setVV = (offsetTop, height) => { vv.offsetTop = offsetTop; vv.height = height; vv.dispatchEvent(new Event('resize')); };
      window.__scrollToCalls = [];
      const realScrollTo = window.scrollTo.bind(window);
      window.scrollTo = (...a) => { window.__scrollToCalls.push(a); return realScrollTo(...a); };
    }
  }, fakeViewport);
  for (const f of ['app-core.js', 'app-catalog.js', 'app-collection.js', 'app-ui.js',
                   'app-trade.js', 'app-account.js', 'app-admin.js', 'app-admin-catalog.js', 'app-social.js']) {
    await page.addScriptTag({ url: `http://localhost:${port}/${f}` });
  }
  await page.evaluate(() => {
    state.tab = 'home';
    state.ready.add('social');
    // Tall content so the page can actually scroll, like a feed.
    const main = document.querySelector('main');
    main.insertAdjacentHTML('beforeend', '<div id="filler" style="height:3000px"></div>');
    wireEvents();
  });
}

// Bar geometry in layout-viewport CSS px: getBoundingClientRect includes the
// transform, so `bottom` is where the bar is actually painted.
const measure = (page) => page.evaluate(() => {
  const nav = document.querySelector('.bottom-nav');
  const panel = document.getElementById('notif-panel');
  const r = nav.getBoundingClientRect();
  const p = panel.getBoundingClientRect();
  const vv = window.visualViewport;
  return {
    navBottom: Math.round(r.bottom), navHeight: Math.round(r.height),
    panelBottom: Math.round(p.bottom),
    visualBottom: Math.round(vv.offsetTop + vv.height),
    shiftVar: document.documentElement.style.getPropertyValue('--vv-shift') || '',
    kbUp: nav.classList.contains('kb-up'),
    visible: getComputedStyle(nav).visibility === 'visible',
    display: getComputedStyle(nav).display,
  };
});

const out = {};

// ─────────────── Phase 1: the iOS states, driven ───────────────
{
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  await bootShell(page, { fakeViewport: true });

  // 1. Clean: the bar is on the screen's bottom edge and nothing is shifted.
  out.clean = await measure(page);

  // 2. Keyboard opens: iOS keeps the layout viewport at H, shrinks the visual
  //    one by ~300px and scrolls it 120px up to reveal the field.
  await page.evaluate(() => window.__setVV(120, 544));
  out.keyboardUp = await measure(page);

  // 3. Keyboard closes but the visual viewport stays scrolled 300px inside the
  //    layout one — the WebKit standalone bug. `bottom: 0` alone now paints
  //    the bar 300px above the screen's bottom edge: Wifeosaurus's screenshot.
  await page.evaluate(() => window.__setVV(300, 844));
  await page.waitForTimeout(50);   // let the rAF re-sync after the nudge run
  // Open the Alerts sheet so it has geometry to measure — it sits on the bar.
  await page.evaluate(() => document.getElementById('notif-panel').classList.remove('hidden'));
  out.stuck = await measure(page);
  out.stuckNudged = await page.evaluate(() => window.__scrollToCalls.length);
  // Where the bar WOULD have been with only the CSS (layout-viewport coords,
  // so the screen's bottom edge is at visualBottom): prove the bug existed.
  out.stuckWithoutSync = await page.evaluate(() => {
    document.documentElement.style.setProperty('--vv-shift', '0px');
    const b = Math.round(document.querySelector('.bottom-nav').getBoundingClientRect().bottom);
    document.documentElement.style.setProperty('--vv-shift', '300px');
    return b;
  });

  out.driftRecords = await page.evaluate(() => (window.__tracked || []).filter((t) => t.event === 'bottom_nav_drift'));

  // 3b. Some iOS transitions fire NO visualViewport event. Mutate the stand-in
  //     silently and only blur a field: the focusout settle timers must catch it.
  await page.evaluate(() => {
    const vv = window.visualViewport; vv.offsetTop = 0; vv.height = 844;   // silently back to clean
    const inp = document.createElement('input'); document.body.appendChild(inp); inp.focus();
    vv.offsetTop = 200;                                                    // silently stuck at 200
    inp.blur();
  });
  await page.waitForTimeout(1000);
  out.afterSilentBlur = await measure(page);

  // 4. Safari eventually re-clamps (or the user scrolls): back to clean.
  await page.evaluate(() => window.__setVV(0, 844));
  out.recovered = await measure(page);

  // 5. Half-scrolled feed + the same stuck state: the shift is about the
  //    viewport, not the page, so page scroll must not change the answer.
  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.evaluate(() => window.__setVV(300, 844));
  await page.waitForTimeout(50);
  out.stuckScrolled = await measure(page);
  out.pageScrollKept = await page.evaluate(() => Math.round(window.scrollY));

  // 6. Wide screen: no bar, so no shift is written (desktop must stay untouched).
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.evaluate(() => window.__setVV(300, 900));
  out.desktop = await measure(page);
  await page.close();
}

// ─────────────── Phase 2: Chrome's real visual viewport ───────────────
// A pinch-zoom makes the visual viewport smaller than the layout one and lets
// it scroll inside it — the same geometry as the iOS bug — and Chrome, like
// Safari, keeps position:fixed on the layout viewport. No stand-in here.
{
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  await bootShell(page, { fakeViewport: false });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  // Drag the zoomed viewport downwards so the visual one sits inside the
  // layout one at a non-zero offset.
  // Coordinates are in the (now half-size) visual viewport.
  await cdp.send('Input.synthesizeScrollGesture', { x: W / 4, y: H / 4, yDistance: -300, speed: 4000 });
  await page.waitForTimeout(150);
  out.realZoom = await measure(page);
  out.realZoomOffsetTop = await page.evaluate(() => Math.round(window.visualViewport.offsetTop));
  await page.close();
}

await browser.close();
server.close();

console.log(JSON.stringify(out, null, 2));
const onEdge = (m) => m.navBottom === m.visualBottom;
const checks = [
  ['clean: bar sits on the screen bottom, no shift written', onEdge(out.clean) && out.clean.navBottom === H && out.clean.shiftVar === '' && !out.clean.kbUp && out.clean.visible],
  ['keyboard up: bar tucks away instead of hovering over the field', out.keyboardUp.kbUp && !out.keyboardUp.visible && out.keyboardUp.shiftVar === ''],
  ['stuck after keyboard: CSS alone WOULD paint the bar 300px above the screen edge (the bug)', out.stuckWithoutSync === out.stuck.visualBottom - 300],
  ['stuck after keyboard: bar is back on the screen bottom edge', onEdge(out.stuck) && out.stuck.visible && !out.stuck.kbUp && out.stuck.shiftVar === '300px'],
  ['stuck after keyboard: the Alerts sheet moved with it', out.stuck.panelBottom === out.stuck.visualBottom - 66],
  ['keyboard close with a leftover offset nudges Safari with a no-op scroll', out.stuckNudged >= 1],
  ['a drift is recorded once, with the geometry, for the analytics table', out.driftRecords.length === 1 && out.driftRecords[0].props.shift === 300 && out.driftRecords[0].props.vvTop === 300 && out.driftRecords[0].props.v === 234],
  ['a silent drift (no viewport event) is caught by the focusout settle', onEdge(out.afterSilentBlur) && out.afterSilentBlur.shiftVar === '200px'],
  ['recovered: shift cleared, bar back at bottom: 0', onEdge(out.recovered) && out.recovered.shiftVar === '' && out.recovered.navBottom === H],
  ['stuck while the feed is scrolled: still on the edge, page scroll untouched', onEdge(out.stuckScrolled) && out.pageScrollKept === 1200],
  ['desktop: bar hidden, no shift written', out.desktop.display === 'none' && out.desktop.shiftVar === ''],
  ['real Chrome pinch-zoom: visual viewport really did offset', out.realZoomOffsetTop > 0],
  ['real Chrome pinch-zoom: bar lands on the real visual bottom edge', Math.abs(out.realZoom.navBottom - out.realZoom.visualBottom) <= 1 && out.realZoom.shiftVar !== ''],
];
let ok = true;
for (const [label, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`); if (!pass) ok = false; }
console.log(ok ? `\nALL ${checks.length} PASS` : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
