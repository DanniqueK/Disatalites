import { BR, DT, isHall, MC, MD, SMALL, TAGK } from '../core/data.js';
import { log } from '../core/messages.js';
import { G } from '../core/state.js';
import { decayLeft } from '../sim/decay.js';
import { HULL } from '../space/sectors.js';
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

/**
 * What a salvage target probably holds and what threatens it. Exact for targets around the station
 * (hull yard or home sector) or when the drone carries a Survey Scanner; further out it is a range.
 * @param {any} o Exterior object (debris, pod, wreck, raft, sci or der).
 * @param {any} [d] The drone that would go.
 * @returns {{ exact: boolean, loot: string[], hazards: string[] }}
 */
export function salvageEstimate(o, d) {
  const exact = !!(d && d.scan) || o.sec === HULL || o.sec === G.home;
  const amt = v => (exact || !v ? `${v}` : `${Math.floor(v * 0.6)}-${Math.ceil(v * 1.4)}`);
  const loot = [],
    hazards = [];
  const res = (c, label) => {
    const parts = [];
    if (c.scrap) parts.push(`${amt(c.scrap)} scrap`);
    if (c.circ) parts.push(`${amt(c.circ)} circuit${exact && c.circ === 1 ? '' : 's'}`);
    if (c.rat) parts.push(`${amt(c.rat)} ration${exact && c.rat === 1 ? '' : 's'}`);
    if (c.water) parts.push(`${amt(c.water)} water (ice)`);
    if (c.ammo) parts.push(`${amt(c.ammo)} ammo`);
    if (parts.length) loot.push((label ? label + ': ' : '') + parts.join(', '));
  };
  if (o.kind === 'debris') res(o.res);
  if (o.kind === 'pod') {
    res(o.c);
    if (o.c.items && o.c.items.length)
      loot.push(`${o.c.items.length} piece${o.c.items.length > 1 ? 's' : ''} of gear`);
  }
  if (o.kind === 'wreck') loot.push(`a ${DT[o.dt].n} drone wreck (repairable into a working drone)`);
  if (o.kind === 'raft') loot.push(`${o.n} survivor${o.n > 1 ? 's' : ''} who would join your crew`);
  if (o.kind === 'sci') loot.push('a research data core');
  if (o.kind === 'der') {
    const p = o.pack;
    const v = scrapValue(p);
    res({ scrap: v.s, circ: v.c }, 'scrapped');
    const crates = p.crates.reduce(
      (a, c) => ({
        scrap: a.scrap + c.c.scrap,
        circ: a.circ + c.c.circ,
        rat: a.rat + c.c.rat,
        ammo: a.ammo + c.c.ammo,
      }),
      { scrap: 0, circ: 0, rat: 0, ammo: 0 },
    );
    res(crates, 'in its crates');
    if (p.items.length) loot.push(`${p.items.length} piece${p.items.length > 1 ? 's' : ''} of gear aboard`);
    if (p.actors.length)
      hazards.push(
        exact
          ? `${p.actors.length} hostile${p.actors.length > 1 ? 's' : ''} aboard`
          : 'possibly hostiles aboard',
      );
  }
  const left = decayLeft(o);
  if (left != null) hazards.push(`falling: burns up in about ${left} turns`);
  const near = (k, r) =>
    G.ext.objs.filter(
      q => q !== o && q.kind === k && q.sec === o.sec && Math.hypot(q.x - o.x, q.y - o.y) <= r,
    );
  const rogues = near('rogue', 10).length;
  if (rogues) hazards.push(`${rogues} rogue drone${rogues > 1 ? 's' : ''} nearby`);
  const turrets = near('turret', 8).filter(t => {
    const st = t.st != null && G.stations.find(s => s.id === t.st);
    return !st || st.state !== 'subdued';
  }).length;
  if (turrets) hazards.push(`${turrets} defense turret${turrets > 1 ? 's' : ''} in range`);
  if (near('null', 5).some(n => n.seen !== false)) hazards.push('a known null pocket close by');
  for (const pl of near('platform', 60))
    if (Math.hypot(pl.x - o.x, pl.y - o.y) <= pl.r && !G.legacy[pl.lid].tags.includes(TAGK))
      hazards.push(`inside ${G.legacy[pl.lid].n}'s weapon range`);
  return { exact, loot, hazards };
}

/** The estimate as dialog text. */
export function estimateText(e) {
  return (
    `${e.exact ? 'Survey' : 'Estimate (send a drone with a Survey Scanner for exact numbers)'}:\n` +
    (e.loot.length ? e.loot.map(l => ' + ' + l).join('\n') : ' + nothing worth taking') +
    '\n' +
    (e.hazards.length ? e.hazards.map(h => ' ! ' + h).join('\n') : ' ! no known threats')
  );
}

export function learnFrom(pack, why) {
  const got = [];
  const key =
    pack.fn + '/' + pack.brand + '/' + pack.shape.w + 'x' + pack.shape.h + '/' + pack.shape.g.join('').length;
  if (!isHall(pack.fn) && !(G.schem || []).some(h => h.key === key)) {
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
