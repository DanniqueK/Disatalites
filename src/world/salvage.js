import { BR, MC, MD, SMALL } from '../core/data.js';
import { log } from '../core/messages.js';
import { G } from '../core/state.js';
import { cloneShape } from './shapes.js';

export function scrapValue(pack) {
  const fl = pack.shape.g.join('').split('.').length - 1;
  let sc = Math.round(fl * 0.6),
    ci = 1;
  for (const k of pack.mach) {
    if (!MC[k.type]) continue;
    const q = k.cond >= 60 ? 0.5 : 0.3;
    sc += Math.round(MC[k.type][0] * q);
    ci += Math.round(MC[k.type][1] * q);
  }
  return { s: sc, c: ci, t: 4 + Math.ceil(fl / 6) };
}

export function learnFrom(pack, why) {
  const got = [];
  const key =
    pack.fn + '/' + pack.brand + '/' + pack.shape.w + 'x' + pack.shape.h + '/' + pack.shape.g.join('').length;
  if (pack.fn !== 'tube' && !(G.schem || []).some(h => h.key === key)) {
    (G.schem = G.schem || []).push({
      key,
      fn: pack.fn,
      brand: pack.brand,
      name: pack.name,
      shape: cloneShape(pack.shape),
      fl: pack.shape.g.join('').split('.').length - 1,
    });
    got.push(`${pack.name} hull (${BR[pack.brand].cc})`);
  }
  for (const k of pack.mach) {
    if (!SMALL.includes(k.type) || G.bp['k_' + k.type]) continue;
    G.bp['k_' + k.type] = 1;
    got.push(MD[k.type].n);
  }
  if (got.length) log(`SCHEMATICS ${why}: ${got.join(', ')}.`, 'good');
  return got;
}
