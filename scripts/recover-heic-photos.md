# The .heic photos that landed before HEIC uploads worked

Record of the two `.heic` files that reached the catalogue on 2026-07-28/29,
both submitted by @nini, before HEIC support shipped (PR #216). They render as
broken images for anyone not on Safari.

| Item | Shopify id | R2 object |
|---|---|---|
| Puck Dreadful Rabbit plush puppet | 8989579018472 | `catalog/suggestions/8989579018472-tnuh8r8h.heic` — present, 2.2 MB, 4284×5712 |
| Bunny Hourglass accessory | 8991251988712 | `catalog/suggestions/8991251988712-vrtm1k71.heic` — **404, bytes gone** |

The Hourglass suggestion row is marked `approved` but no `catalog_photos` row
was ever created for it and the object isn't in R2, so the approve ran only
half-way. There's no audit table, so the cause isn't recoverable after the
fact.

Resolved by re-uploading both through the admin UI — which, post-#216, accepts
the original `.heic` directly and transcodes it.

## Leftovers to sweep after a re-upload

Re-uploading creates *new* rows at new random paths, so the broken ones stay
behind unless cleared:

- `catalog_photos` 6040282a — the Puck primary, `image_path` still the `.heic`
- `catalog_photo_suggestions` 7607bce8 / 33b193b3 — both `approved`, both
  pointing at `.heic` paths
- `catalog_overrides.image` for the Puck handle — the cover URL. Its
  `image_credit` is already `@nini`, so attribution survives an image swap.
- the orphaned `.heic` object in R2 (rejected/replaced catalog photos should
  not linger — see PR #184)

Deleting the R2 object needs a signed-in session; R2 reads are public but
writes require a verified Supabase JWT (`worker/r2-storage.js`). From the
console on plushcrypt.com:

```js
(async () => {
  const { data: s } = await sb.auth.getSession();
  const resp = await fetch(`${window.R2_BASE}/catalog/suggestions/8989579018472-tnuh8r8h.heic`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${s.session.access_token}` },
  });
  console.log('delete →', resp.status);
})();
```

## Converting a HEIC offline

`scripts/heic-to-jpeg.mjs` runs the conversion locally through the app's own
code path — headless Chrome driving the real `app-core.js` and
`vendor/libheif-bundle.js` — so the output matches what the uploader produces:

```
node scripts/heic-to-jpeg.mjs in.heic out.jpg [maxDim]
```

Verified on the Puck file: 4284×5712 HEIC → 600×800 JPEG, 47 KB, orientation
and colour correct.
