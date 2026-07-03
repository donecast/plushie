// ════════════════════════════════════════════════════════════════════
// app-catalog.js — part 2 of 9 of the former monolithic app.js.
//
// These parts are plain (non-module) scripts that SHARE ONE GLOBAL SCOPE,
// exactly as the single file did. They are split only for navigability and
// smaller merge surface — there is no import/export between them. Load order
// is fixed in index.html; the final part (app-social.js) boots the app.
//
// This part: Catalog text/lore parser and accessory-name hygiene.
// ════════════════════════════════════════════════════════════════════

// ─── Lore / Symbolism / Set-Includes parser ──────────────────────
// Walks Shopify's body_html for a product, strips the boilerplate noise
// (decorative divider images, charity banners, YouTube embeds, the
// stock 'IMPORTANT NOTE Regarding the design' paragraph, and the trailing
// copyright/trademark paragraph), then splits what's left into three
// sections:
//   * lore        — everything before the first 'Set Includes' heading
//   * symbolism   — text under a 'Symbolism:' heading (plus first
//                   distinct image per group, dupes dropped per Scott's
//                   option b)
//   * accessories — items from the 'Set Includes' list, minus the
//                   single primary plush (which is implied)
// Returns nulls / empty arrays for sections that don't exist on a given
// product, which is fine — the UI hides empty sections.
function parseBodyHtml(html, title = '') {
  const empty = { lore: null, symbolism: null, symbolismHtml: null, accessories: [], isBundle: false };
  if (!html || typeof html !== 'string') return empty;
  let doc;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); }
  catch { return empty; }
  const root = doc.body;
  if (!root) return empty;

  stripBoilerplate(root);

  // Walk nodes once, marking the offsets of section boundaries. We
  // recognize headings by text content rather than by tag — these
  // products use bold paragraphs ('<p><b>Set Includes</b></p>') just
  // as often as <h2>/<h3>. flattenBlocks unwraps structural wrapper
  // <div>s (some products nest the whole description inside a single
  // '<div class="text_exposed_show">') so headings/lists/paragraphs
  // become first-class blocks rather than being hidden one level down —
  // otherwise a wrapper's combined textContent overruns the heading
  // length guards below and 'Set Includes' is never detected.
  const blocks = flattenBlocks(root);
  // Find section headings by text. The brand's section ORDER is
  // inconsistent — some products put 'Symbolism' before 'Set Includes',
  // some after — so we record both indices and bound each section by the
  // *next* heading rather than assuming a fixed order. (Previously the
  // symbolism index was passed as the Set-Includes end boundary, so a
  // Symbolism heading sitting before Set Includes collapsed the window to
  // nothing — e.g. Chronic Pain.) The heading may also be the first line
  // of a multi-line block, so we scan lines, not just block text.
  let setIncludesIdx = -1;
  let symbolismIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    const lines = blockLines(blocks[i]);
    if (setIncludesIdx === -1 &&
        lines.some((l) => l.length < 80 && /set\s+includes/i.test(l))) setIncludesIdx = i;
    if (symbolismIdx === -1 && lines.some((l) => /^symbol(ism|ogy)\s*:?\s*$/i.test(l))) symbolismIdx = i;
  }
  const headingIdxs = [setIncludesIdx, symbolismIdx].filter((i) => i >= 0).sort((a, b) => a - b);
  const firstHeading = headingIdxs.length ? headingIdxs[0] : blocks.length;
  // End of a section = the next heading after it, else end of document.
  const sectionEnd = (idx) => {
    for (const hi of headingIdxs) if (hi > idx) return hi;
    return blocks.length;
  };

  // Lore = everything before the first section heading.
  const loreParas = [];
  for (let i = 0; i < firstHeading; i++) {
    const txt = textOf(blocks[i]);
    if (txt) loreParas.push(txt);
  }
  const lore = loreParas.length ? loreParas.join('\n\n') : null;

  // Symbolism = blocks[symbolismIdx+1 .. its section end).
  let symbolism = null;
  let symbolismHtml = null;
  if (symbolismIdx !== -1) {
    const symEnd = sectionEnd(symbolismIdx);
    const symBlocks = [];
    const seenImgSrcs = new Set();
    for (let i = symbolismIdx + 1; i < symEnd; i++) {
      const b = blocks[i];
      const t = (b.textContent || '').trim();
      // Stop at the IMPORTANT NOTE we already stripped — but if some
      // variant slipped through, stop again here.
      if (/^important\s+note/i.test(t)) break;
      // Some products list Symbolism *before* the Set Includes section, so
      // stop here too — otherwise the included items bleed into the
      // symbolism prose.
      if (/set\s+includes/i.test(t) && t.length < 80) break;
      // Dedupe identical images (the DPDR Rabbit triple-heart case).
      const img = b.querySelector ? b.querySelector('img') : null;
      if (img && img.src) {
        if (seenImgSrcs.has(img.src)) { img.remove(); }
        else { seenImgSrcs.add(img.src); }
      }
      if (b.textContent && b.textContent.trim()) {
        symBlocks.push(b.outerHTML);
      }
    }
    if (symBlocks.length) {
      symbolismHtml = symBlocks.join('');
      symbolism = stripTagsKeepNewlines(symbolismHtml);
    }
  }

  // Accessories = items under 'Set Includes' (bounded by its own section
  // end), minus the primary plush. When there's NO heading at all, fall
  // back to a run of bare 'Nx …' lines (≥2) — several products list their
  // contents as plain '1x …' lines with no heading (Dreadful Dinosaur, the
  // Victorian McGee sets).
  let accessories = [];
  if (setIncludesIdx !== -1) {
    // Headed section: bounded by the next heading, so the conservative prose
    // pass can safely pick up extras the brand wrote as sentences.
    accessories = extractSetIncludes(blocks, setIncludesIdx, sectionEnd(setIncludesIdx), title, true);
  } else {
    let firstQty = -1, qtyLines = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (symbolismIdx !== -1 && i >= symbolismIdx && i < sectionEnd(symbolismIdx)) continue;
      const hits = blockLines(blocks[i]).filter((l) => /^\d+\s*[x×]\s+/i.test(l)).length;
      if (hits) { if (firstQty === -1) firstQty = i; qtyLines += hits; }
    }
    if (qtyLines >= 2 && firstQty !== -1) {
      accessories = extractSetIncludes(blocks, firstQty - 1, blocks.length, title);
    }
  }
  // Last resort for the Victorian McGee items, which list contents as bare
  // prose with no heading, no quantities and no bullets — just the primary
  // plush's "… measures NNcm (head to toe)" line followed by its extras
  // ("Tote Bag measures 40x37cm", "Plush Knife", "\"Drink Me\" Potion").
  if (accessories.length === 0) {
    accessories = extractSpecTail(blocks, title);
  }
  // Bundle detection is tag-only now. The earlier heuristic of '2+ plush
  // items in the Set Includes' false-flagged single products like the
  // Gemini Rabbit, which legitimately ships with multiple plushie pieces.
  // The Shopify-side 'bundle' tag is the authoritative signal.
  return { lore, symbolism, symbolismHtml, accessories, isBundle: false };
}

// True when an element wraps block-level children (so it's a structural
// container, not a leaf paragraph). Text-content boilerplate matches must
// skip these — otherwise a wrapper <div> that merely *contains* the
// copyright trailer (e.g. '<div class="text_exposed_show">…Set Includes…
// copyright…</div>') would be removed whole, taking the real content with
// it. The offending inner leaf paragraph still matches on its own pass.
function containsBlockElements(el) {
  return [...(el.children || [])].some((c) => /^(p|ul|ol|div|h[1-6])$/i.test(c.tagName || ''));
}

function stripBoilerplate(root) {
  // Drop YouTube embeds (iframes + anchor wrappers).
  for (const el of [...root.querySelectorAll('iframe, lite-youtube, [data-youtube]')]) el.remove();
  for (const a of [...root.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]')]) {
    // Drop the entire paragraph if the only meaningful content is the link.
    const p = a.closest('p,div');
    if (p && p.textContent.trim().length < 80) p.remove();
    else a.remove();
  }
  // Drop the standard 'IMPORTANT NOTE Regarding the design' paragraph
  // and any paragraph whose text starts with it. This is the same
  // boilerplate template across every mental-health rabbit product.
  for (const el of [...root.querySelectorAll('p, div')]) {
    if (containsBlockElements(el)) continue;
    const t = (el.textContent || '').trim();
    if (/^important\s+note\b.*regarding the design/i.test(t)) el.remove();
  }
  // Drop the copyright/trademark trailer and 'Beware of imitations'.
  for (const el of [...root.querySelectorAll('p, div')]) {
    if (containsBlockElements(el)) continue;
    const t = (el.textContent || '').trim();
    if (/is copyright of mysterious llc/i.test(t)) el.remove();
    else if (/^beware of imitations/i.test(t)) el.remove();
    else if (/plushie dreadfuls is a trademark/i.test(t)) el.remove();
  }
  // Drop decorative divider images (and any paragraph whose only
  // content is one of them). Heuristic: an <img> in a paragraph where
  // the paragraph carries no text. Charity banner detection: image
  // URLs/alts mentioning 'pride', 'donat', 'twloha', 'covenant', etc.
  for (const img of [...root.querySelectorAll('img')]) {
    const src = (img.getAttribute('src') || '').toLowerCase();
    const alt = (img.getAttribute('alt') || '').toLowerCase();
    const wrap = img.closest('p, div');
    const isCharityHint = /pride|donat|covenant|twloha|charity/i.test(src + ' ' + alt);
    const isLikelyDivider = wrap && wrap.textContent.trim().length < 4;
    if (isCharityHint || isLikelyDivider) {
      if (wrap) wrap.remove();
      else img.remove();
    }
  }
  // Drop wholly-empty paragraphs left over after the strips above.
  for (const el of [...root.querySelectorAll('p, div')]) {
    if (!el.textContent.trim() && !el.querySelector('img')) el.remove();
  }
}

// Linearise the description into a flat sequence of content blocks.
// Most products are already flat (top-level <p>/<ul>/heading paragraphs),
// but some wrap everything in a structural <div> (e.g. Facebook's old
// '<div class="text_exposed_show">'), which buries the 'Set Includes'
// heading and its list a level down. We unwrap any <div> that contains
// block-level children so those inner blocks surface; a <div> with no
// block children is itself a paragraph-like block and is kept as-is.
function flattenBlocks(root) {
  const out = [];
  const visit = (el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'div' && containsBlockElements(el)) {
      for (const c of el.children) visit(c); return;
    }
    out.push(el);
  };
  for (const child of root.children) visit(child);
  return out;
}

// Split a block into visual lines, treating <br> as a line break. Some
// products pack several "1x …" entries into ONE paragraph separated by
// <br> (e.g. "1x Super Soft Puppet<br><br>1x Totebag"); raw textContent
// would run them together ("1x Super Soft Puppet1x Totebag") into a
// single garbled accessory, so we split on the breaks first.
function blockLines(el) {
  if (!el || !el.cloneNode) return [(el && el.textContent || '').trim()].filter(Boolean);
  const clone = el.cloneNode(true);
  for (const br of [...clone.querySelectorAll('br')]) br.replaceWith('\n');
  return (clone.textContent || '')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Length of the leading bullet glyph(s) on a line — list markers (•·▪),
// dingbats, arrows, and emoji (incl. surrogate-pair emoji like 💖 and the
// ❤️/⚓️ the brand favours), plus the variation-selector / ZWJ / whitespace
// that travels with them. Returns 0 when the line starts with real text.
function leadingBulletLen(s) {
  let i = 0, sawGlyph = false;
  while (i < s.length) {
    const c = s.codePointAt(i);
    const ws = c === 0x20 || c === 0x09;
    const glyph =
      c === 0x2022 || c === 0x00B7 || c === 0x2023 || c === 0x2043 || c === 0x2219 ||
      c === 0x25AA || c === 0x25CF || c === 0x25E6 || c === 0x2043 ||
      (c >= 0x2190 && c <= 0x21FF) ||   // arrows
      (c >= 0x2600 && c <= 0x27BF) ||   // misc symbols + dingbats
      (c >= 0x2B00 && c <= 0x2BFF) ||   // stars/arrows (⭐)
      c === 0x2693 || c === 0x2764 ||   // ⚓ ❤
      c === 0xFE0F || c === 0x200D || c === 0x20E3 ||  // VS16 / ZWJ / keycap
      (c >= 0x1F000 && c <= 0x1FAFF);   // emoji blocks
    if (ws) { i += 1; continue; }
    if (glyph) { sawGlyph = true; i += c > 0xFFFF ? 2 : 1; continue; }
    break;
  }
  return sawGlyph ? i : 0;
}

// Lines inside a 'Set Includes' block that are notes/footnotes, not items.
const NOISE_LINE_RE = /^(please note\b|note:|n\.?b\.?\b|fits most|mask only|regular siz|full siz|big chesh|other plushies|materials for|pictures? are|design featur)|not included\b|sold separately|shown for scale/i;

// Pull one item name from a Set-Includes line, or null. Accepts a quantity
// prefix ('1x …') or a leading bullet glyph (❤️/⚓️/•/⭐). Plain prose lines
// (no marker) are rejected so lore sentences don't leak in.
function setIncludesLineItem(line) {
  let s = (line || '').trim();
  if (!s) return null;
  let ok = false;
  // Quantity prefix '1x …' / '3× …'. The space after the x is optional so the
  // brand's no-space typo ('1xMini Beehive of Bees') still parses as one item,
  // while a bare digit after the x keeps real dimensions ('10x10cm') out.
  if (/^\d+\s*[x×](?:\s+|(?=["'“(\[A-Za-z]))/i.test(s)) {
    ok = true;
  } else {
    const n = leadingBulletLen(s);
    if (n > 0) { s = s.slice(n).trim(); ok = true; }
  }
  // A short "<name> measures <dims>" line is a sized item, not prose — this
  // is how Victorian McGee lists tote bags etc. ("Tote Bag measures
  // 40x37cm") with no quantity or bullet. The measurement is trimmed off
  // the name later in canonicalizeAccessoryName. Bounded to a short lead so
  // a lore sentence that happens to contain "measures" isn't swept in.
  if (!ok && /^.{2,45}?\s+measures?\s+\d/i.test(s) && !/\b(head to toe|ears? to toes?)\b/i.test(s)) {
    ok = true;
  }
  if (!ok || !s || NOISE_LINE_RE.test(s)) return null;
  // A question is brand patter, not an item ("Can (maybe) be convinced to
  // guard the gates to your home? Try carrots?").
  if (/\?/.test(s)) return null;
  return s;
}

// A conversational lead-in the brand uses when it lists an included extra as a
// sentence instead of a '1x …' line — stripped so the item reads cleanly
// ("Full of Bees." → "Bees", "Comes with a canvas bag" → "a canvas bag").
const PROSE_LEADIN_RE = /^(comes?\s+with|includes?|including|complete\s+with|along\s+with|featuring|full\s+of)\s+/i;
// Lines that open with an interjection or conjunction are brand patter, never
// an item ("Yes Literally Bees.", "And those abs", "Why the blood run hold").
const PROSE_INTERJECTION_RE = /^(yes|yeah|ok|okay|no|nope|well|oh|hey|wow|psst|hmm|maybe|just|honestly|literally|and|but|so|why|when|because)\b/i;

// Second-pass extractor for the (headed) 'Set Includes' section: catches extras
// the brand wrote as plain prose rather than the canonical '1x …' line — e.g.
// ADHD Bat's "Full of Bees.", or "Custom designed lace collar". setIncludesLineItem
// rejects all unmarked prose (so lore can't leak in via the no-heading fallback),
// but inside a section already bounded by the next heading that guard is too
// strict and silently eats real accessories. This accepts a *short noun-phrase*
// line while still rejecting questions, notes/disclaimers (NOISE_LINE_RE),
// interjection fragments, and anything sentence-length. Returns null otherwise.
function proseSetIncludesItem(line) {
  let s = (line || '').trim();
  // A footnote asterisk marks brand patter ("I'm planking right now actually*").
  if (!s || /\?/.test(s) || /\*/.test(s) || NOISE_LINE_RE.test(s)) return null;
  // Drop a numbered-list ordinal ("1. Strait Jacket Hoodie" → "Strait Jacket …").
  s = s.replace(/^\d+\.\s+/, '').trim();
  const stripped = s.replace(PROSE_LEADIN_RE, '').trim();
  const hadLeadIn = stripped !== s;
  s = stripped.replace(/[\s.;:,!]+$/, '').trim();
  if (!s) return null;
  // A bare interjection/conjunction fragment isn't an item — but if we already
  // stripped a lead-in ("Full of …") the remainder is, so don't re-reject it.
  if (!hadLeadIn && PROSE_INTERJECTION_RE.test(s)) return null;
  // First/second-person prose is patter or song lyrics, never an item
  // ("I don't need no one to understand", "we cannot stop dancing").
  if (/\b(i|i'?m|i'?ve|you|your|we|we'?re|me|my|us|our)\b/i.test(s)) return null;
  // A '… Features' / 'Collector Edition' line is a sub-heading / note, not an item.
  if (/\b(features?|edition)$/i.test(s)) return null;
  if (/\bto boot\b/i.test(s)) return null;
  // Spec / size / materials / sizing / superlative fragments aren't accessories:
  // a size descriptor ("feet to top of ears", "… to toes"), a materials/made/
  // design/features lead, a sizing note ("one size", "fitting", "EU 42"), or a
  // superlative fur pitch ("our softest most luxurious fur yet").
  if (/\b(feet|tip|ears?|head)\s+to\b|\bto\s+(top|toes?)\b/i.test(s)) return null;
  if (/^(materials|made|design|features?)\b/i.test(s)) return null;
  if (/\bone size\b|\bfitting\b|\beu\s*\d/i.test(s)) return null;
  if (/\b(softest|luxurious|luxury|cuddliest|huggable)\b/i.test(s)) return null;
  // Items are short noun phrases; a sentence-length line is prose, not an item.
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 7 || s.length > 60) return null;
  if (!/[a-z]/i.test(s)) return null;
  return s;
}

// Significant tokens of a name, minus brand/format filler — used to spot
// the line that restates the primary plush (named after the product).
function primaryTokens(str) {
  return new Set(String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(the|and|plush|plushie|dreadful|dreadfuls|stuffed|animal|toy|mini|super|soft|edition|limited|victorian|mcgees|mcgee|set|includes|with|cryptid)$/.test(w)));
}

// Collapse runs of the same character so doubled-letter misspellings compare
// equal ('oppossum' → 'oposum', matching 'opossum'). The brand mistypes the
// primary's name in Set Includes often enough that an exact token match
// misses it ('Panicked Oppossum' under the '… Opossum' product).
function collapseDoubles(s) {
  return String(s || '').replace(/(.)\1+/g, '$1');
}

function extractSetIncludes(blocks, startIdx, endIdx, title = '', allowProse = false) {
  const items = [];
  // Stop is a soft cap: the next-section heading may share a block with the
  // last item line (e.g. '1x Tote Bag<br>Symbolism:'), so we iterate up to
  // and *including* the boundary block and stop at the heading LINE — not
  // the block — or we'd drop that trailing item.
  const isHeadingLine = (s) => /^(symbol(ism|ogy)|important note|fun fact)/i
    .test((s || '').replace(/^[^\p{L}\p{N}]+/u, ''));
  const cap = endIdx === -1 ? blocks.length - 1 : Math.min(endIdx, blocks.length - 1);
  outer:
  for (let i = startIdx + 1; i <= cap; i++) {
    const b = blocks[i];
    if (!b) break;
    const lis = b.querySelectorAll('li');
    if (lis.length) {
      for (const li of lis) {
        const name = (li.textContent || '').trim().replace(/^[•·]\s*/, '');
        if (isHeadingLine(name)) break outer;
        if (name && !NOISE_LINE_RE.test(name) && !/\?/.test(name)) items.push({ name });
      }
    } else {
      for (const line of blockLines(b)) {
        if (isHeadingLine(line)) break outer;
        let name = setIncludesLineItem(line);
        if (!name && allowProse) name = proseSetIncludesItem(line);
        if (name) items.push({ name });
      }
    }
  }
  // Strip the primary plush so accessories are *just* the extras. The
  // primary is either the first line that reads as a plush ('Super Soft
  // Rabbit', 'Plush Alice Bunny') OR the first line that restates the
  // product title ('Putti Cherub Bun', 'Pourfect Bunny Teapot') — the
  // latter catches animals the plush-word list misses (bun/hare/cat/owl).
  // Either way only the FIRST qualifying line is dropped, and never an
  // obvious accessory (bag/sticker/patch), so companion minis survive.
  const titleTok = primaryTokens(title);
  let primaryDropped = false;
  const filtered = items.filter((it) => {
    if (primaryDropped) return true;
    if (/\b(bag|tote|backpack|patch|sticker|standee|purse|pin|card)\b/i.test(it.name)) return true;
    const byWord = /\b(rabbit|bunny|puppet|plush|dinosaur)\b/i.test(it.name);
    let byTitle = false;
    if (!byWord && titleTok.size) {
      const itTok = primaryTokens(canonicalizeAccessoryName(it.name));
      // Compare with doubled-letter tolerance so a misspelled restatement of
      // the primary still matches the title.
      const titleCol = new Set([...titleTok].map(collapseDoubles));
      let shared = 0;
      for (const w of itTok) if (titleCol.has(collapseDoubles(w))) shared++;
      // The title's last significant word is the animal noun ('Opossum',
      // 'Mouse'); a first item that restates it is the primary plush even
      // when it shares nothing else with the title ('Panicked Opossum' under
      // 'Social Phobia Opossum'). Obvious accessories already returned above,
      // so this only ever catches a plush restatement.
      const titleWords = [...titleTok];
      const headCol = collapseDoubles(titleWords[titleWords.length - 1] || '');
      const byHead = !!headCol && [...itTok].some((w) => collapseDoubles(w) === headCol);
      byTitle = shared >= 2 || (itTok.size > 0 && shared === itTok.size) || byHead;
    }
    if (byWord || byTitle) { primaryDropped = true; return false; }
    return true;
  });
  // Canonicalize: each accessory carries both a display name (clean,
  // human) and a key (lowercase, used to match between catalog and
  // collection rows). Without canonicalization the saved
  // missing_accessories array would drift whenever Plushie Dreadfuls
  // re-words their Set Includes line.
  return filtered
    .map((it) => {
      const display = canonicalizeAccessoryName(it.name);
      return { name: display, key: accessoryKey(display) };
    })
    // Canonicalization can reduce a line to nothing (e.g. a bare quantity or a
    // trimmed-away clause) — drop those so an empty chip never renders.
    .filter((it) => it.name && it.name.trim());
}

// Victorian McGee's plushes mostly skip the whole "Set Includes" convention:
// no heading, no quantities, no bullets. The contents are just bare lines at
// the end of the description — the primary plush's size line ("X measures
// NNcm (head to toe)") followed by its extras ("Tote Bag measures 40x37cm",
// "Plush Knife", "\"Drink Me\" Potion"). We anchor on the primary's
// head-to-toe / ears-to-toes size line (that phrasing is unique to the
// primary, never an accessory) and treat the short item-like lines that
// follow, up to the copyright trailer, as the extras. Only used as a last
// resort when every structured path came up empty, so it can't disturb the
// products that do use a real Set Includes list.
function extractSpecTail(blocks, title = '') {
  const lines = [];
  for (const b of blocks) for (const l of blockLines(b)) lines.push(l);
  const pi = lines.findIndex((l) => /\b(head to toe|ears? to toes?)\b/i.test(l));
  if (pi === -1) return [];
  const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
  const out = [];
  for (let i = pi + 1; i < lines.length && out.length < 8; i++) {
    const l = lines[i];
    // Hard stops: the copyright trailer, a section heading, or back into
    // prose (a long line / a multi-word sentence).
    if (/copyright|trademark|beware|exclusively available|important note|^symbol/i.test(l)) break;
    if (l.length > 55) break;
    if (/[.!?]$/.test(l) && wordCount(l) > 5) break;
    if (NOISE_LINE_RE.test(l) || /\?/.test(l)) continue;
    // Item-like = a sized line ("… measures 40x37cm") or a short, capitalised
    // noun phrase ("Plush Knife", "Mini Pumpkin Purse", "\"Drink Me\" Potion").
    const sized = /\bmeasures?\s+\d/i.test(l);
    const shortNoun = wordCount(l) <= 6 && /^["'“(]?[A-Z0-9]/.test(l);
    if (!sized && !shortNoun) break;
    out.push({ name: l });
  }
  return out.map((it) => {
    const display = canonicalizeAccessoryName(it.name);
    return { name: display, key: accessoryKey(display) };
  });
}

function canonicalizeAccessoryName(raw) {
  // Preserve a hard quantity of 2+ ('2x Baby Opossums') as a normalized
  // 'N× ' display prefix; a bare 1x / single is noise and is dropped. The
  // prefix is stripped back off when we derive the match key (accessoryKey),
  // so it never affects accessory identity / missing-list matching.
  const qm = String(raw || '').match(/^\s*(\d+)\s*[x×](?:\s+|(?=["'“(\[A-Za-z]))/i);
  const qty = qm && parseInt(qm[1], 10) >= 2 ? `${parseInt(qm[1], 10)}× ` : '';
  const out = (raw || '')
    // Drop the 'Nx ' or 'N× ' quantity prefix (re-added as `qty` below). The
    // space after the x is optional to absorb the brand's '1xMini …' typo.
    .replace(/^\s*\d+\s*[x×](?:\s+|(?=["'“(\[A-Za-z]))/i, '')
    // Drop a leading 'Comes with a/the …' prose lead-in ('Comes with a tote
    // bag …' → 'tote bag …'); the item name is what follows.
    .replace(/^\s*comes with\s+(?:a|an|the|one|two|your)?\s*/i, '')
    // Cut a trailing prose clause the brand tacks onto an item — a relative
    // clause ('… that attach to her face', '… which is fireproof'), a
    // material/purpose clause ('Tote made of sturdy paper', 'Tote Bag to shop
    // for goods', 'Envelope for your Love Letters'), or a predicate ('Baby
    // Opossums are detachable …'). These connectors never begin a real item
    // name, so trimming from them leaves the clean noun phrase. Anchored to a
    // leading space so a one-word item is never wiped.
    .replace(/\s+\b(?:that|which|made\s+(?:of|from|with)|to\s+(?:shop|carry|hold|store|keep|protect|match|complete|wear)|for\s+(?:your|all|the)\b)\b.*$/i, '')
    .replace(/\s+\b(?:is|are)\s+(?:detachable|removable|reversible|fireproof|made|waterproof)\b.*$/i, '')
    // '- Approximately NNcm' / '- Approx. NN' size tails (a worded variant of
    // the dash-measurement rule below).
    .replace(/\s*[-–—]\s*approx(?:\.|imately)?\b.*$/i, '')
    // Cut trailing size/measurement clauses. The brand appends these
    // inconsistently ('- measures 38cm', 'that measures 11x13 inches',
    // 'measuring 24cm', a bare '38x34cms' or '25cm diameter'). Left in,
    // they clutter the name and — worse — trip NON_ACCESSORY_RE's \d+cm
    // rule, which would drop the whole item (the lost tote bags / bracelets
    // in the capture audit).
    .replace(/\s*[-–—(]?\s*(that\s+|which\s+)?measur(es|ing)\b.*$/i, '')  // '… measures …'
    .replace(/\s*\(\s*\d.*$/, '')                            // '(33x40cm / 13"x16")' size paren
    .replace(/\s*[-–—]\s*\d.*$/, '')                         // '- 3cm wide', '- 38x34cms'
    .replace(/\s+\d+(\.\d+)?\s*[x×]\s*\d.*$/i, '')           // '11x13 inches', '38x34cms'
    .replace(/\s+\d+(\.\d+)?\s*(cm|mm|inch(es)?|in|")\b.*$/i, '')  // bare '25cmx', '9.4 inch tall'
    // Drop anything left in trailing parentheses.
    .replace(/\s*\([^)]*\)\s*[.,;]*\s*$/g, '')
    // Trailing sentence punctuation left after a clause trim ('… canvas bag.').
    .replace(/\s*[.,;:]+\s*$/, '')
    .trim();
  return qty + stripOutfitWord(out);
}

// The match key for an accessory: the canonical display name with any
// quantity prefix ('2× ') stripped and lowercased. Keys are what get stored
// in a collection row's missing_accessories, so they must stay quantity-free
// and stable even as the display name gains/loses a count.
function accessoryKey(name) {
  return String(name || '').replace(/^\s*\d+\s*[x×]\s+/i, '').toLowerCase();
}

// ─── Accessory list hygiene ──────────────────────────────────────────
// The "Set Includes" text is freeform prose, so the raw parse drags in
// three kinds of noise: product *features* (poses, articulation,
// embroidery, body construction), *measurements*, and plain duplicates of
// the same physical extra worded two ways. Strip all three so the
// checklist is just the actual included items. Only plushes/bundles get a
// list at all — see categoryHasAccessories.

// A line matching this reads as a feature/spec, not a physical accessory.
const NON_ACCESSORY_RE = new RegExp([
  'pose', 'poseable', 'articulat', 'magnetic hands?', 'connects? to',
  'attach(es|ed)? to (the )?(face|body|head)', 'embroider', 'printed',
  'stitched (on|in)', 'pouch body', 'zipper(ed)? body', 'hidden zip',
  'measures?', '\\d+\\s*cm', '\\d+\\s*(inch|in\\b|")', 'tall',
  'ears? to toes?', 'head to toe', 'machine wash', 'spot clean',
  'surface wash', 'washable', 'polyester', 'stuffing',
  'softest', 'luxurious', 'most luxurious',
].join('|'), 'i');

// Identity key for de-duping: drop counts, size/material adjectives, and
// articles so "Sturdy Cotton Tote Bag" and "Anxiety Rabbit Tote Bag" both
// reduce toward their core noun, and "Tiny Worry Bunnies" collapses with
// "Two Tiny Worry Bunnies".
const ACC_FILLER_RE = /\b(a|an|the|with|for|and|of|in|on|one|two|three|four|five|six|seven|eight|nine|ten|tiny|small|mini|little|large|big|xl|sturdy|soft|plush|cotton|cloth|fabric|fluffy|extra|set|pair|brand|new|limited|edition|official|\d+)\b/g;
function accessoryDedupKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’"“”]/g, '')
    .replace(ACC_FILLER_RE, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(\w+?)s\b/g, '$1')   // crude singularise
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean + de-dupe a parsed accessory list. Accepts strings or {name}.
// Returns the existing {name, key} shape so missing-accessories matching
// keeps working. Keeps the first (leaner) phrasing of any duplicate.
function normalizeAccessories(list) {
  const kept = [];
  for (const raw of (Array.isArray(list) ? list : [])) {
    const name = canonicalizeAccessoryName(typeof raw === 'string' ? raw : (raw && raw.name) || '');
    if (!name) continue;
    if (NON_ACCESSORY_RE.test(name)) continue;          // feature / spec, not an item
    const dk = accessoryDedupKey(name);
    if (!dk) continue;
    const tokens = dk.split(' ').filter(Boolean);
    const dup = kept.some((k) => {
      if (k.dk === dk) return true;
      // Subset merge: collapse when one phrasing's core (≥2 tokens, so we
      // never merge on a lone generic word like "bag") is wholly contained
      // in the other.
      const kt = k.dk.split(' ').filter(Boolean);
      const small = tokens.length <= kt.length ? tokens : kt;
      const big   = tokens.length <= kt.length ? kt : tokens;
      return small.length >= 2 && small.every((t) => big.includes(t));
    });
    if (dup) continue;
    kept.push({ name, key: accessoryKey(name), dk });
  }
  return kept.map(({ name, key }) => ({ name, key }));
}

// Only plushes and multi-item bundles ship with accessories. Store merch,
// minis, standees, etc. don't get a checklist at all.
function categoryHasAccessories(item) {
  const cat = catalogCategory(item);
  // Minis/keychain plushes get accessories too — they ship with (and have
  // clothing/outfits available for) them, same as full-size plushes.
  return cat === 'plush' || cat === 'bundle' || cat === 'mini';
}

function textOf(node) {
  // Plain-text dump that preserves paragraph breaks.
  return (node.textContent || '').trim().replace(/\s+/g, ' ');
}
function stripTagsKeepNewlines(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

async function refreshCatalogLive() {
  const all = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`${LIVE_CATALOG_BASE}&page=${page}`, { mode: 'cors' });
      if (!r.ok) throw new Error(`page ${page} ${r.status}`);
      const data = await r.json();
      const products = data.products || [];
      if (products.length === 0) break;
      all.push(...products.map(normalizeShopifyProduct));
      if (products.length < 250) break;
    }
  } catch (e) {
    console.info('Live catalog refresh skipped:', e.message);
    return false;
  }
  if (all.length === 0) return false;
  const shopify = expandVariants(all.filter(isPlushieCollectible));
  state.catalog = await mergeCustomCatalog(shopify);
  await idb.setMeta('last_live_refresh', Date.now());
  if (state.tab === 'catalog') render();
  maybeSyncCatalogEvents();   // change feed (Stirrings) — gated + throttled inside
  return true;
}

// refreshCatalogLive() otherwise only runs at boot, so a long-open session
// (a pinned PWA tab, a phone left on the app) never picks up new releases or
// status changes — e.g. a concept graduating out of FYC, or a restock. Poll
// the live feed on a gentle interval so those land without a manual reload.
// Re-boot safe: clears any prior timer before arming a new one, same as
// scheduleSocialCheck().
const CATALOG_REFRESH_MS = 30 * 60 * 1000;   // 30 min
function scheduleCatalogRefresh() {
  if (window._catalogTimer) clearInterval(window._catalogTimer);
  window._catalogTimer = setInterval(() => { refreshCatalogLive(); }, CATALOG_REFRESH_MS);
}

function byNewest(a, b) {
  return (b.addedAt || 0) - (a.addedAt || 0);
}

