// Text helpers: CJK-aware word splitting and a "decode" (scramble) effect.

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;

/**
 * Wrap every word of every text node under `root` in <span class="w">.
 * Uses Intl.Segmenter so Chinese text is split into words instead of one giant "word".
 * Inline elements (e.g. <mark>) are preserved. Returns the created spans in order.
 */
export function splitWords(root) {
  const spans = [];
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        if (!text) return;
        const frag = document.createDocumentFragment();
        const parts = segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
        parts.forEach((part) => {
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          const span = document.createElement('span');
          span.className = 'w';
          span.textContent = part;
          frag.appendChild(span);
          spans.push(span);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
        walk(child);
      }
    });
  };
  walk(root);
  return spans;
}

const NARROW = '!<>-_\\/[]{}=+*^?#01';
const WIDE = '░▒▓█▚▞■□◆◇＃＊％＆';
const isWide = (ch) => ch.charCodeAt(0) > 0x2e80;

/**
 * Turn an element whose text is the final string into a decode animation.
 * The final text stays in the DOM (transparent) so the layout never jumps and
 * assistive tech still reads the real sentence; an aria-hidden overlay shows the scramble.
 */
export function prepareScramble(el) {
  if (el.querySelector('.sc-live')) return;
  const text = el.dataset.text || el.textContent;
  el.textContent = '';
  const final = document.createElement('span');
  final.className = 'sc-final';
  final.textContent = text;
  const live = document.createElement('span');
  live.className = 'sc-live';
  live.setAttribute('aria-hidden', 'true');
  live.textContent = '';
  el.append(final, live);
}

export function scramble(el, { duration = 1.2, delay = 0 } = {}) {
  const final = el.querySelector('.sc-final');
  const live = el.querySelector('.sc-live');
  if (!final || !live) return;
  const text = final.textContent;
  const chars = Array.from(text);
  const t0 = performance.now() + delay * 1000;
  const total = duration * 1000;
  const tick = (now) => {
    const p = Math.max(0, Math.min(1, (now - t0) / total));
    live.textContent = chars
      .map((c, i) => {
        if (c === ' ' || c === '\n') return c;
        if (i / chars.length < p * 1.12) return c;
        const set = isWide(c) ? WIDE : NARROW;
        return set[(Math.random() * set.length) | 0];
      })
      .join('');
    if (p < 1) requestAnimationFrame(tick);
    else live.textContent = text;
  };
  requestAnimationFrame(tick);
}
