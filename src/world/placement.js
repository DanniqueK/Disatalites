// Free placement of small gear (lockers, bunks, emergency scrubbers, turrets) inside rooms.
import { T, WW } from '../core/constants.js';
import { gearAllowedIn, isHall, MD } from '../core/data.js';
import { G, M } from '../core/state.js';
import { an, D4, D8, idx, inB } from '../core/util.js';
import { occupied } from '../sim/stats.js';
import { modCells, rebuildMap } from './build.js';
import { toLocal } from './shapes.js';

const isOuter = (x, y) => D4.some(([dx, dy]) => inB(x + dx, y + dy) && M.map[idx(x + dx, y + dy)] === T.VOID);

/** Would the room's free floor still be one area you can cross with straight moves if (bx, by) were filled? */
function walkwayOk(mi, bx, by) {
  const free = new Set();
  for (const c of modCells(G.mods[mi])) {
    const i = idx(c.x, c.y);
    if (M.map[i] === T.FLOOR && M.room[i] === mi && !(c.x === bx && c.y === by)) free.add(i);
  }
  if (!free.size) return false;
  const [first] = free;
  const seen = new Set([first]);
  const st = [first];
  while (st.length) {
    const i = st.pop();
    const cx = i % WW,
      cy = (i / WW) | 0;
    for (const [dx, dy] of D4) {
      const j = idx(cx + dx, cy + dy);
      if (free.has(j) && !seen.has(j)) {
        seen.add(j);
        st.push(j);
      }
    }
  }
  return seen.size === free.size;
}

/**
 * Why gear of `type` cannot be placed at (x, y), or null if it can.
 * @param {string} type
 * @param {number} x
 * @param {number} y
 */
export function placeProblem(type, x, y) {
  if (!inB(x, y)) return 'that is outside the station';
  const i = idx(x, y);
  const mi = M.own[i];
  const mod = G.mods[mi];
  if (!mod) return 'that is outside the station';
  if (isHall(mod.fn)) return 'hallways stay clear';
  if (!mod.ctl) return `the ${mod.name} does not answer to you yet`;
  if (!gearAllowedIn(type, mod.fn))
    return `${an(MD[type].n)} ${MD[type].n} does not belong in the ${mod.name}`;
  const t = M.map[i];
  if (type === 'turret') {
    if ((t !== T.WALL && t !== T.WINDOW) || !isOuter(x, y)) return 'a turret goes on an outer wall';
    const inside = D4.some(([dx, dy]) => {
      const j = idx(x + dx, y + dy);
      return inB(x + dx, y + dy) && M.map[j] === T.FLOOR && M.room[j] === mi;
    });
    if (!inside) return 'the wall has to face into the room';
    return null;
  }
  if (t !== T.FLOOR || M.room[i] !== mi) return 'it needs a free floor tile';
  if (G.crates[i] || (G.items[i] || []).length || occupied(x, y)) return 'something is in the way';
  if (D8.some(([dx, dy]) => [T.DOOR, T.PORT].includes(M.map[idx(x + dx, y + dy)])))
    return 'doorways stay clear';
  if (!walkwayOk(mi, x, y)) return 'it would block the walkway';
  return null;
}

/** Place gear at (x, y). Check placeProblem first. */
export function placeGear(type, x, y, cond = 100) {
  const mod = G.mods[M.own[idx(x, y)]];
  const [lx, ly] = toLocal(mod, x, y);
  const m = {
    id: G.nid++,
    mod: mod.id,
    type,
    lx,
    ly,
    cond,
    on: true,
    prog: 0,
    wall: type === 'turret',
    fx: false,
    powered: false,
    busy: false,
  };
  G.machines.push(m);
  rebuildMap();
  return m;
}

/** Take a machine out of the station entirely. */
export function removeMachine(m) {
  const i = G.machines.indexOf(m);
  if (i >= 0) G.machines.splice(i, 1);
  if (G.fab && G.fab.mid === m.id) G.fab = null;
  rebuildMap();
}
