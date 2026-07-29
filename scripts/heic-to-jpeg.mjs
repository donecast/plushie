// Convert a HEIC/HEIF file to JPEG using the app's OWN code path — the real
// app-core.js compressImage() and the real vendor/libheif-bundle.js, driven in
// headless Chrome. Written to re-encode the handful of .heic files that got
// into R2 before HEIC uploads were supported, so the recovered photo is
// byte-for-byte what the app would have produced had it worked at upload time.
//
//   node scripts/heic-to-jpeg.mjs <in.heic> <out.jpg> [maxDim]
//
// maxDim defaults to 800, matching compressImage()'s default — which is what
// uploadCatalogSuggestionImage / the collection uploader feed it.
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [inPath, outPath, maxDimArg] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node scripts/heic-to-jpeg.mjs <in.heic> <out.jpg> [maxDim]');
  process.exit(2);
}
const maxDim = Number(maxDimArg) || 800;

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0].replace(/^\//, '');
  if (rel === '' || rel === 'shell') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><html><body></body></html>');
    return;
  }
  let body;
  try { body = fs.readFileSync(path.join(ROOT, rel)); }
  catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/javascript' });
  res.end(body);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/shell`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  window.data = { featureEnabled: () => false, appSettings: {} };
  window.idb = { getMeta: async () => null, setMeta: async () => {} };
});
await page.addScriptTag({ url: `http://localhost:${port}/app-core.js` });

const src = fs.readFileSync(inPath);
const out = await page.evaluate(async ({ b64, name, maxDim }) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], name, { type: 'image/heic' });

  const before = await decodeImageFile(file);           // original dimensions
  const blob = await compressImage(file, maxDim);
  const after = await createImageBitmap(blob);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return {
    b64: btoa(s),
    type: blob.type,
    srcW: before.width, srcH: before.height,
    outW: after.width, outH: after.height,
  };
}, { b64: src.toString('base64'), name: path.basename(inPath), maxDim });

await browser.close();
server.close();

fs.writeFileSync(outPath, Buffer.from(out.b64, 'base64'));
console.log(`${inPath} (${out.srcW}x${out.srcH}, ${src.length} bytes)`);
console.log(`  -> ${outPath} (${out.outW}x${out.outH}, ${fs.statSync(outPath).size} bytes, ${out.type})`);
