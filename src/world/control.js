import { T } from '../core/constants.js';
import { log } from '../core/messages.js';
import { G, M } from '../core/state.js';
import { idx, rnd, rr } from '../core/util.js';
import { occupied } from '../sim/stats.js';
import { modCells } from './build.js';

export const modBreaches = mi => G.brk.filter(b => b.mod === mi).length;

export function claimDone(mod, via) {
  mod.ctl = true;
  for (const c of modCells(mod)) G.seen[idx(c.x, c.y)] = 1;
  const n = G.mods.filter(x => x.ctl).length;
  log(
    `${mod.name} grid accepts ${via || 'you'}. Systems, air and power in this section answer to KESTREL-9 now. (${n}/${G.mods.length} sections)`,
    'good',
  );
}

export function lockdown(mod) {
  const fl = modCells(mod).filter(
    c => c.c === '.' && !occupied(c.x, c.y) && M.map[idx(c.x, c.y)] === T.FLOOR,
  );
  for (let i = 0; i < rr(1, 2) && fl.length; i++) {
    const c = fl.splice(rnd(fl.length), 1)[0];
    G.actors.push({ id: G.nid++, type: 'feral', x: c.x, y: c.y, hp: 25, max: 25, alert: true, lost: 0 });
  }
  log(`LOCKDOWN: the ${mod.name}'s old maintenance bots wake up.`, 'bad');
}
