// "Can you read it?" checks for a page open in a test browser (used by tools/browser-check.js).
// Finds text that is too small on screen, text that overlaps other text, and text cut off by
// the edge of the screen. Sizes are measured as they really appear, after the game board is
// scaled to fit the window. Left out: decorations (aria-hidden), passing effects (the effects
// layer, pop-up numbers) and anything mid-animation, since those are meant to move and overlap.
// Text below the bottom edge only counts when nothing can scroll to it.
//   const { readability } = require('./readability');
//   const report = await readability(page);   // { small: [...], overlap: [...], offscreen: [...] }
const MIN_PX = 9;        // smallest comfortable text on screen, in CSS pixels (about 9pt on a phone)
const MIN_BOARD_PX = 10; // smallest text on the game board as designed, before the board is scaled.
                         // The whole board (#stage, 1440x1000) shrinks to fit the window, so on a
                         // phone all of it is small; that is reported once as boardScale instead.

async function readability(page, { minPx = MIN_PX, minBoardPx = MIN_BOARD_PX } = {}) {
  return page.evaluate(([minPx, minBoardPx]) => {
    const W = innerWidth, H = innerHeight;
    // pieces moving right now (a card flying to the table, a pop-up), measured mid-flight
    const moving = new Set(document.getAnimations()
      .filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)
      .map(a => a.effect?.target).filter(Boolean));
    const skip = el => {
      for (let p = el; p; p = p.parentElement) {
        if (p.getAttribute('aria-hidden') === 'true' || p.id === 'fx-layer' || moving.has(p)) return true;
      }
      return false;
    };
    const scrollsY = el => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll' || p === document.scrollingElement || p === document.body) && p.scrollHeight > p.clientHeight + 1) return true;
      }
      return document.scrollingElement.scrollHeight > H + 1;
    };
    const shown = el => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false;
      for (let p = el; p; p = p.parentElement) { const ps = getComputedStyle(p); if (+ps.opacity === 0 || ps.display === 'none') return false; }
      return true;
    };
    const name = el => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '';
      return `${el.tagName.toLowerCase()}${cls} "${t}"`;
    };
    // every element that holds text of its own
    const texts = [];
    for (const el of document.querySelectorAll('body *')) {
      if (['SCRIPT', 'STYLE', 'svg', 'SVG'].includes(el.tagName)) continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own || skip(el) || !shown(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      // where the words themselves are (a wide box with centred words only counts its words)
      const range = document.createRange(); range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > H || r.left > W) continue;   // not on screen at all (a closed panel)
      texts.push({ el, r, box });
    }
    const stage = document.getElementById('stage');
    const stageScale = stage && stage.offsetWidth && stage.getBoundingClientRect().width ? stage.getBoundingClientRect().width / stage.offsetWidth : 0;
    const small = [], overlap = [], offscreen = [];
    let handMin = Infinity;
    for (const { el, r, box } of texts) {
      const scale = el.offsetWidth ? box.width / el.offsetWidth : 1;
      const own = parseFloat(getComputedStyle(el).fontSize);
      const onBoard = el.closest('#stage');
      if (el.closest('#hand-layer')) { handMin = Math.min(handMin, own * scale / (stageScale || 1)); continue; }   // hand cards grow when hovered or tapped
      if (onBoard ? own * (stageScale ? scale / stageScale : 1) < minBoardPx - 0.05 : own * scale < minPx - 0.05)
        small.push(`${name(el)} ${onBoard ? (own * scale / stageScale).toFixed(1) + 'px on the board' : (own * scale).toFixed(1) + 'px'}`);
      if (r.left < -1 || r.right > W + 1 || ((r.top < -1 || r.bottom > H + 1) && !scrollsY(el))) offscreen.push(name(el));
    }
    // overlapping text: two separate text pieces whose boxes cross by more than a sliver.
    // Pieces inside the same card are skipped (a card is drawn as one picture), and so are
    // cards fanned in the hand, which overlap on purpose.
    const cardOf = el => el.closest('.card, .field-card, [data-uid]');
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ca = cardOf(a.el), cb = cardOf(b.el);
      if (ca && (ca === cb || (ca.closest('#hand-layer') && cb?.closest('#hand-layer')))) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 4 && h > 4) {
        // only if one is actually drawn over the other at the overlap's centre
        const x = Math.max(a.r.left, b.r.left) + w / 2, y = Math.max(a.r.top, b.r.top) + h / 2;
        const top = document.elementFromPoint(x, y);
        if (top && (a.el.contains(top) || b.el.contains(top) || top.contains(a.el) || top.contains(b.el)))
          overlap.push(`${name(a.el)} and ${name(b.el)}`);
      }
    }
    return { handSmallest: handMin < Infinity ? +handMin.toFixed(1) : null, boardScale: stageScale && stage.getBoundingClientRect().width > 0 ? +stageScale.toFixed(2) : null, small, overlap, offscreen };
  }, [minPx, minBoardPx]);
}
module.exports = { readability, MIN_PX, MIN_BOARD_PX };
