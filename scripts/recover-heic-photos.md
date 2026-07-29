# Recovering the .heic photos that got into R2 before HEIC uploads worked

Two `.heic` files reached the catalogue on 2026-07-28/29, both submitted by
@nini, before HEIC support shipped (PR #216). They render as broken images for
anyone not on Safari.

R2 **reads** are public, but **writes** need a verified Supabase JWT (see the
auth model in `worker/r2-storage.js`), so the re-upload has to run from a
signed-in browser. Everything else — finding them, converting, repointing the
DB rows — is doable from outside.

| Item | Shopify id | R2 object | Recoverable |
|---|---|---|---|
| Puck Dreadful Rabbit plush puppet | 8989579018472 | `catalog/suggestions/8989579018472-tnuh8r8h.heic` (2.2 MB, 4284×5712) | **yes** |
| Bunny Hourglass accessory | 8991251988712 | `catalog/suggestions/8991251988712-vrtm1k71.heic` | **no — 404, bytes are gone** |

## Puck Rabbit — the repair

Signed in as an admin on https://plushcrypt.com, paste this into the console.
It reuses the app's own `compressImage()` (which now decodes HEIC) and its own
`data._uploadToStorage()`, so the result is identical to what the upload would
have produced had HEIC worked at submit time.

```js
// STEP 1 — convert + upload alongside the original (nothing is destroyed yet)
(async () => {
  const SRC = 'suggestions/8989579018472-tnuh8r8h.heic';
  const DST = 'suggestions/8989579018472-tnuh8r8h.jpg';
  const r = await fetch(`${window.R2_BASE}/catalog/${SRC}`);
  if (!r.ok) throw new Error('fetch failed: ' + r.status);
  const jpeg = await compressImage(new File([await r.blob()], 'puck.heic', { type: 'image/heic' }));
  console.log('converted →', jpeg.type, jpeg.size, 'bytes');
  console.log('uploaded →', await data._uploadToStorage('catalog', DST, jpeg));
})();
```

Then the DB rows get repointed at the `.jpg` (three of them — the approved
suggestion, the `catalog_photos` gallery row that is this item's primary cover,
and the `catalog_overrides.image` cover URL).

```js
// STEP 2 — only after the rows are repointed: drop the orphaned .heic
// (rejected/replaced catalog photos must not linger in R2)
(async () => {
  const { data: s } = await sb.auth.getSession();
  const resp = await fetch(`${window.R2_BASE}/catalog/suggestions/8989579018472-tnuh8r8h.heic`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${s.session.access_token}` },
  });
  console.log('delete →', resp.status);
})();
```

## Converting offline

`scripts/heic-to-jpeg.mjs` runs the same conversion locally (headless Chrome
driving the real `app-core.js` + `vendor/libheif-bundle.js`):

```
node scripts/heic-to-jpeg.mjs in.heic out.jpg [maxDim]
```

Verified on the Puck file: 4284×5712 HEIC → 600×800 JPEG, 47 KB, correct
orientation and colour.
