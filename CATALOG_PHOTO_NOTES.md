# Catalog community-photo notes

Working notes from the catalog photos pilot (`catalog_photos`, slot scheme:
numbered = official PD, lettered "Picture A" = community). Not user-facing.

## Picture A coverage (131 items, all in DB — no committed seed)

- **10 from redrambler** (`source = 'owner:redrambler'`) — vetted, watermark-free
  owner photos copied into R2 `catalog/community/`. (commit ff0dd66)
- **121 NOT from any site user** (`source = 'web'`) — copied into R2 `catalog/web/`:
  - 8 earliest: depression, dreadful-demon-forest-spirit, insomnia-moth,
    schizophrenia-rabbit-ii, ocd, borderline-personality-disorder, adhd-rabbit,
    bipolar-ii (sources: PD Okendo customer-review photos, eBay, Mercari, Poshmark).
  - 2 next: narcissistic-personality-disorder-rabbit, avoidant-personality-disorder-rabbit.
  - **111 in the full "do the rest" sweep**: every remaining `type=plush` catalog
    item that had Okendo customer-review photos. Best single front-facing shot per
    item chosen by vision (14 parallel selector agents). All `credit='Customer
    review photo'`, `source='web'`, mirrored into `catalog_overrides.image`.

Result: 131 of 132 `type=plush` items now have a community Picture A. The rest are
sourced from Plushie Dreadfuls' own Okendo customer reviews — genuine owner photos,
never a PlushCrypt site user.

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

- **Plague and War Set** (`plushie-dreadfuls-plague-and-war-set`) — a Picture A WAS
  inserted in the sweep then **pulled**: the only photo Okendo associated with this
  product was a single pink bunny that doesn't match a "Plague and War" set (likely
  a mis-tagged review). No reliable owner photo of the actual set — needs a hand-
  picked image or skip.

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
