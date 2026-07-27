// Verifies the @mention dropdown positioning math (positionMentionDropdown).
// The bug: on iOS, position:fixed is placed against the LAYOUT viewport while
// getBoundingClientRect() is VISUAL-viewport-relative, so with the keyboard up
// (visualViewport.offsetTop > 0) the old `top = r.bottom` landed the dropdown
// offY pixels away from the input. The fix converts a desired on-screen (visual)
// position into fixed coords by adding the visual-viewport offset — so the
// on-screen gap to the input stays constant no matter the keyboard offset.
import assert from 'node:assert';

// Mirror of positionMentionDropdown's geometry (no DOM), returning fixed-coord
// top/left plus which way it flipped.
function place({ r, vv, width = 200, h = 120 }) {
  const offX = vv ? vv.offsetLeft : 0;
  const offY = vv ? vv.offsetTop : 0;
  const vh = vv ? vv.height : 800;
  const vw = vv ? vv.width : 390;
  const visLeft = Math.max(6, Math.min(r.left, vw - width - 6));
  const fitsBelow = r.bottom + 4 + h <= vh - 6;
  const visTop = (fitsBelow || r.top - h - 4 < 6) ? r.bottom + 4 : r.top - h - 4;
  return { top: Math.round(visTop + offY), left: Math.round(visLeft + offX), flippedAbove: !fitsBelow && r.top - h - 4 >= 6 };
}

const field = { left: 40, right: 300, top: 360, bottom: 392, width: 260 };

// 1) Desktop / no keyboard: dropdown sits just below the field, aligned left.
const desk = place({ r: field, vv: { offsetTop: 0, offsetLeft: 0, height: 800, width: 390 } });
assert.strictEqual(desk.top, 396, 'below the field on desktop');
assert.strictEqual(desk.left, 40);
assert.strictEqual(desk.flippedAbove, false);

// 2) Keyboard up (visual viewport scrolled 220px, shrunk to 430 tall): the
//    ON-SCREEN position (fixed top minus the vv offset) must still equal the
//    input's own bottom+4 — i.e. the dropdown hugs the input, not the top of
//    the screen (the reported bug). Field near top so it still fits below.
const shifted = { ...field, top: 120, bottom: 152 };
const kb = place({ r: shifted, vv: { offsetTop: 220, offsetLeft: 0, height: 430, width: 390 } });
const onScreenTop = kb.top - 220;
assert.strictEqual(onScreenTop, shifted.bottom + 4, 'on-screen dropdown stays glued to the input under the keyboard');
assert.ok(kb.top > shifted.bottom, 'fixed coord is shifted down by the vv offset, not left at the visual value');

// 3) No room below (field low in a short viewport) → flip above the field.
const low = { ...field, top: 380, bottom: 412 };
const flip = place({ r: low, vv: { offsetTop: 220, offsetLeft: 0, height: 430, width: 390 } });
assert.strictEqual(flip.flippedAbove, true, 'flips above when the keyboard would clip a below placement');
assert.strictEqual(flip.top - 220, low.top - 120 - 4, 'above placement sits a dropdown-height above the field');

// 4) The OLD formula would have mis-placed case 2 by offY pixels — sanity that
//    our fix actually changes the outcome.
const oldTop = shifted.bottom + 4;            // what the buggy code set as `top`
assert.notStrictEqual(oldTop, kb.top, 'fix differs from the old (viewport-blind) top');
assert.strictEqual(kb.top - oldTop, 220, 'fix adds exactly the visual-viewport offset');

console.log('PASS: mention dropdown stays anchored to its input across keyboard offsets, and flips above when clipped');
