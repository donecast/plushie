// Verify compressImage() accepts the picture formats people actually have,
// against the real app-core.js in a real browser.
//
// The one that mattered: someone uploaded .heic files. Only Safari decodes
// HEIC/HEIF natively, so in Chrome the file failed both createImageBitmap()
// and <img> — and the callers' `.catch(() => photoFile)` quietly uploaded the
// original, which then rendered as a broken image for everyone else.
//
// Checks here:
//   1. a real HEIC decodes (via the lazily-loaded vendor/libheif-bundle.js)
//      and comes out the other side as a JPEG blob
//   2. the decoder is NOT fetched when a plain PNG is uploaded
//   3. downscaling still applies to a HEIC (maxDim is respected)
//   4. a file that genuinely isn't an image rejects loudly instead of
//      sneaking through
//
// fixtures/sample.heic is hevc32.heif from the libheif project's corpus
// (strukturag/libheif, fuzzing/data/corpus) — a real 32×32 HEVC-in-HEIF, 523
// bytes, so the whole decode path is exercised without a megabyte fixture.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const fetched = [];
const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0].replace(/^\//, '');
  fetched.push(rel);
  if (rel === '' || rel === 'shell') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><body></body></html>');
    return;
  }
  try {
    const body = fs.readFileSync(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': rel.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
// app-core.js runs top-level code that expects the rest of the app; stub the
// few globals it touches on load so we can exercise compressImage in isolation.
await page.evaluate(() => {
  window.data = { featureEnabled: () => false, appSettings: {} };
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
});
await page.addScriptTag({ url: `http://localhost:${port}/app-core.js` });

const heic = fs.readFileSync(path.join(ROOT, 'scripts/fixtures/sample.heic'));
// A 1×1 PNG — a format every browser decodes natively.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const results = await page.evaluate(async ({ heicB64, pngB64 }) => {
  const toFile = (b64, name, type) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type });
  };
  const out = {};

  // 1. Native format still works, and must not pull in the HEIC decoder.
  const pngOut = await compressImage(toFile(pngB64, 'shot.png', 'image/png'));
  out.png = { type: pngOut.type, size: pngOut.size };
  out.decoderLoadedAfterPng = !!window.libheif;

  // 2. A HEIC with the MIME the OS usually supplies.
  const heicOut = await compressImage(toFile(heicB64, 'IMG_4021.HEIC', 'image/heic'));
  out.heic = { type: heicOut.type, size: heicOut.size };

  // 3. A HEIC that Windows/Linux handed us with an empty MIME type.
  const bareOut = await compressImage(toFile(heicB64, 'IMG_4022.heic', ''));
  out.heicNoMime = { type: bareOut.type, size: bareOut.size };

  // 4. Downscale applies to HEIC too (32×32 source, cap at 16).
  const smallBlob = await compressImage(toFile(heicB64, 'x.heic', 'image/heic'), 16);
  const small = await createImageBitmap(smallBlob);
  out.scaled = { w: small.width, h: small.height };

  // 5. Junk must reject, not silently pass through.
  try {
    await compressImage(new File([new Uint8Array([1, 2, 3, 4])], 'notes.txt', { type: 'text/plain' }));
    out.junk = 'RESOLVED (bad)';
  } catch (e) { out.junk = 'rejected: ' + e.message; }

  return out;
}, { heicB64: heic.toString('base64'), pngB64: png.toString('base64') });

await browser.close();
server.close();

const decoderRequests = fetched.filter((f) => f.includes('libheif')).length;
console.log(JSON.stringify(results, null, 2));
console.log('vendor/libheif-bundle.js requests:', decoderRequests);

const checks = [
  ['png stays jpeg', results.png.type === 'image/jpeg' && results.png.size > 0],
  ['png did not load the heic decoder', results.decoderLoadedAfterPng === false],
  ['heic -> jpeg', results.heic.type === 'image/jpeg' && results.heic.size > 0],
  ['heic with no mime -> jpeg', results.heicNoMime.type === 'image/jpeg' && results.heicNoMime.size > 0],
  ['heic downscaled to 16px', results.scaled.w === 16 && results.scaled.h === 16],
  ['non-image rejects', results.junk.startsWith('rejected')],
  ['decoder fetched exactly once', decoderRequests === 1],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
