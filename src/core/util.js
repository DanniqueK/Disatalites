import { WH, WW } from './constants.js';
import { random } from './rng.js';

export const rnd = n => Math.floor(random() * n);
export const rr = (a, b) => a + rnd(b - a + 1);
export const pick = a => a[rnd(a.length)];
export const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const idx = (x, y) => y * WW + x;
export const inB = (x, y) => x >= 0 && y >= 0 && x < WW && y < WH;
export const cheb = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));
export const roll = d => rr(d[0], d[1]);
export const pad5 = n => String(n).padStart(5, '0');
export const D8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
export const D4 = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
export const esc = s =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const pickW = (arr, wf) => {
  let s = 0;
  for (const a of arr) s += wf(a);
  if (s <= 0) return null;
  let r = random() * s;
  for (const a of arr) {
    r -= wf(a);
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
};
/** "a" or "an" for a word: an('Emergency Scrubber') === 'an'. */
export const an = word => (/^[aeiou]/i.test(word) ? 'an' : 'a');
export const dirName = (dx, dy) => (dy < 0 ? 'north' : dy > 0 ? 'south' : dx < 0 ? 'west' : 'east');
