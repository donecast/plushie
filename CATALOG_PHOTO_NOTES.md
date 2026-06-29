# Catalog community-photo notes

Working notes from the catalog photos pilot (`catalog_photos`, slot scheme:
numbered = official PD, lettered "Picture A" = community). Not user-facing.

## WHY THIS EXISTS (read first)

Goal is **legal, not cosmetic**: replace Plushie Dreadfuls' own product images
(`cdn.shopify.com` studio shots) with genuine non-PD photos so PlushCrypt holds as
little PD-owned material as possible if PD ever sends a C&D. **Dream: 0 PD images used.**
Replacement **priority: Plush > Minis > Clothing > Bundles > Everything Else** — which is
why even "dumb" merch is worth covering: every replaced image lowers exposure. Metric that
matters: "items still rendering a `cdn.shopify.com` cover" (= uncovered items).

## Picture A coverage (444 / 702 items, all in DB — no committed seed)

- **10 from redrambler** (`source = 'owner:redrambler'`) — vetted, watermark-free
  owner photos copied into R2 `catalog/community/`. (commit ff0dd66)
- **434 NOT from any site user** (`source = 'web'`) — copied into R2 `catalog/web/`:
  - 8 earliest + 2 (narcissistic, avoidant) — mixed PD-Okendo / eBay / Mercari / Poshmark.
  - **111 — "do the rest" sweep over `type=plush`** (14 vision selectors).
  - **209 — "can we get more" beyond `type=plush`**: 212 plush-SHAPED items
    (`toy` full-size plushies, `Keychain` minis, a few `Plush Accessory`/`stuffed Toy`/
    `grab bag`), minus dropped (18 vision selectors, color-matched).
  - **104 — "the dumb stuff" sweep (C&D lower tiers)**: clothing (34), bundles (4, incl.
    plague-and-war-set recovered with a proper both-bunsmen shot), accessories (8),
    other/merch (58) — 9 vision selectors, lower curation bar (any clear genuine photo).

Coverage by tier (covered / still-PD): **plush 280/111, mini 45/6, clothing 34/39,
bundle 10/8, accessory 17/12, other 58/82.** Coverable-now pool is **exhausted** — every
remaining still-PD item has NO customer photo yet (coming-soon/FYC/no-review) or is a
variant-parent. Plush & minis are maxed on available photos.

All web photos sourced from Plushie Dreadfuls' own Okendo customer reviews — genuine
owner shots, never a PlushCrypt site user. Merch types (sticker, tote, bracelet, pin,
mousepad, card deck, etc.) were deliberately SKIPPED — a community "cover" adds nothing
there. The `_raw` Okendo asset for a photo occasionally 404s/AccessDenies; pick another
candidate from the same product's review set (that's how deafness-rabbit & massive-star
were recovered).

## ⚠️ Variant products — one cover can't represent multiple variants

A multi-variant collectible (one `color`/`type`/etc. option, ≥2 values) is expanded
by `expandVariants` into one card PER variant, all sharing the parent handle, each
with its own `featured_image`. `catalog_overrides`/`catalog_photos` key by handle —
so a single Picture A painted EVERY variant with the same shot (e.g. the Orange
"Understim" Sensory Processing jellyfish showed the Blue "Overstim" photo).

- **Code fix** (app-core `applyCatalogOverrides`): a by-handle `image` cover no
  longer overwrites an expanded variant child (`isVariant`) — variants keep their
  own per-variant image; the cover only lands on the hidden parent + genuine single
  cards. Regression test in `test/units.test.js`. (app-*.js v=136, sw CACHE v169)
- **Data**: 3 of my sweep handles are variant-parents, so their community photo was
  pulled (row + R2 + override image nulled) — they need PER-VARIANT photos, which the
  current by-handle model can't store. To do later (target by variant id, or a new
  `catalog_photos.target_variant`): `plushie-dreadfuls-sensory-processing-disorder-jellybun`
  (Blue/Orange), `plushie-dreadfuls-taurus-rabbit`, `plushie-dreadfuls-anxiety-bunnies-set-of-5`.
  (The other 21 variant-parents in the PD feed never had a community photo.)

### How the non-site-user photos were sourced (reproducible)
PD uses **Okendo** reviews. Subscriber id: `6ac55ea6-967a-48aa-a7d9-0cd454ae4e18`.
Per-product review photos (incl. full-res) come from:
`https://api.okendo.io/v1/stores/<sub>/products/shopify-<productId>/reviews?limit=100`
→ `reviews[].media[]` where `type=="image"`; full-res URL is
`media-dynamic.okendo.io/images/<sub>/<imageId>.jpg?d=1600x1600`.
Get `<productId>` from `https://plushiedreadfuls.com/products/<handle>.json`.
Marketplaces (eBay/Mercari/Poshmark) are bot-blocked for direct fetch.

## ⚠️ Variants to go over later — "we don't have / doesn't really exist"

> Scott's standing note: some variants don't exist as real products / aren't
> truly on the site. Log them here when found instead of forcing a photo.

- **Agoraphobia Rabbit** (`plushie-dreadfuls-agoraphobia-rabbit`) — IN our catalog
  and has a PD product page, BUT it's an unreleased **placeholder/prototype**
  ("currently being considered for prototyping; the design shown is a
  placeholder"). No real product was made, so **no genuine owner photo exists**
  anywhere — can't get a community Picture A for it. Decide whether to keep it
  in the catalog or mark it as concept/unreleased.

### Plush items with NO pullable photo (skipped in the sweep)
These 10 `type=plush` items returned **zero** Okendo customer-review photos — i.e.
coming-soon / FYC / limited / collab / mis-typed, nothing to pull (matches Scott's
"coming soon and FYC will not have any pictures" rule):
`acrylic-standee-set-series-1` (not a plush), `gemini-rabbit-plush-keychain`
(keychain), `blueplaid-pirate-cove-bundle`, `emily-the-strange-plush-rabbit` (oos
collab), `autism-spectrum-rabbit-goth-edition` (oos), `scoliosis-rabbit-pink-edition`
(oos), `year-of-the-horse` (new/coming-soon), `anxiety-rabbit-purple-limited-edition`
(oos dup), `vasculitis-rabbit` (new/FYC), `intermittent-explosive-disorder-rabbit`
(new/FYC). Revisit if/when reviews appear or a known-good photo surfaces.

### Checked and NOT a problem (already covered)
- "Dyslexic Rabbit" seen on Mercari is just a seller's informal name for our
  **Dyslexia Rabbit** (`plushie-dreadfuls-dyslexia-rabbit-plush-stuffed-animal`),
  which we already have. Dyscalculia, Dyspraxia, and Deafness rabbits are all in
  the catalog too.
