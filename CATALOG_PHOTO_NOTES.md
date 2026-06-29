# Catalog community-photo notes

Working notes from the catalog photos pilot (`catalog_photos`, slot scheme:
numbered = official PD, lettered "Picture A" = community). Not user-facing.

## Picture A coverage so far (20 items, all in DB — no committed seed)

- **10 from redrambler** (`source = 'owner:redrambler'`) — vetted, watermark-free
  owner photos copied into R2 `catalog/community/`. (commit ff0dd66)
- **10 NOT from any site user** (`source = 'web'`) — copied into R2 `catalog/web/`:
  - 8 earlier: depression, dreadful-demon-forest-spirit, insomnia-moth,
    schizophrenia-rabbit-ii, ocd, borderline-personality-disorder, adhd-rabbit,
    bipolar-ii (sources: PD Okendo customer-review photos, eBay, Mercari, Poshmark).
  - 2 added this session: **narcissistic-personality-disorder-rabbit** and
    **avoidant-personality-disorder-rabbit** — both from PD's own Okendo
    customer-review photos (genuine owner shots, not a PlushCrypt user).

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

### Checked and NOT a problem (already covered)
- "Dyslexic Rabbit" seen on Mercari is just a seller's informal name for our
  **Dyslexia Rabbit** (`plushie-dreadfuls-dyslexia-rabbit-plush-stuffed-animal`),
  which we already have. Dyscalculia, Dyspraxia, and Deafness rabbits are all in
  the catalog too.
