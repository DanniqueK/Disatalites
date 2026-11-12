import { T, WH, WW } from '../core/constants.js';
import { DT } from '../core/data.js';
import { random } from '../core/rng.js';
import { G, M } from '../core/state.js';
import { cheb, idx, inB, pickW, rnd, rr } from '../core/util.js';
import { HULL, LC } from './sectors.js';
import { online } from '../world/machines.js';

export const extFree = (x, y) => inB(x, y) && M.map[idx(x, y)] === T.VOID;
export function stationBox() {
  let x0 = WW,
    y0 = WH,
    x1 = 0,
    y1 = 0;
  for (let i = 0; i < WW * WH; i++)
    if (M.map[i] !== T.VOID) {
      const x = i % WW,
        y = (i / WW) | 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
export function randSpace(minD, maxD) {
  const [cx, cy] = LC();
  const b = { x0: cx - 2, x1: cx + 2, y0: cy - 2, y1: cy + 2 };
  for (let k = 0; k < 600; k++) {
    const x = rr(3, WW - 4),
      y = rr(3, WH - 4);
    const d = Math.max(
      x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0,
      y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0,
    );
    if (d < (minD || 4) || d > (maxD || 99)) continue;
    if (G.ext.objs.some(o => o.sec === G.home && cheb(o.x, o.y, x, y) < 4)) continue;
    return [x, y];
  }
  return [3, 3];
}
export function addDebris(near) {
  const [x, y] = randSpace(4, near ? 18 : 30);
  G.ext.objs.push({
    id: G.nid++,
    sec: G.home,
    kind: 'debris',
    x,
    y,
    res: { scrap: rr(5, 12), circ: rr(1, 5), rat: random() < 0.25 ? rr(1, 3) : 0 },
  });
}
export function addWreck(dt) {
  const [x, y] = randSpace(5, 24);
  G.ext.objs.push({
    id: G.nid++,
    sec: G.home,
    kind: 'wreck',
    x,
    y,
    dt: dt || pickW(['util', 'tug', 'guard'], k => ({ util: 3, tug: 2, guard: 2 })[k]),
  });
}
export function addPod(f, c) {
  const [x, y] = randSpace(6, 22);
  G.ext.objs.push({ id: G.nid++, sec: G.home, kind: 'pod', x, y, f, c });
}
export function addRogue(tag) {
  if (G.ext.objs.filter(o => o.kind === 'rogue').length >= 5) return;
  const side = rnd(4);
  let x, y;
  if (side === 0) {
    x = 1;
    y = rnd(WH);
  } else if (side === 1) {
    x = WW - 2;
    y = rnd(WH);
  } else if (side === 2) {
    x = rnd(WW);
    y = 1;
  } else {
    x = rnd(WW);
    y = WH - 2;
  }
  G.ext.objs.push({
    id: G.nid++,
    sec: G.home,
    kind: 'rogue',
    x,
    y,
    hp: 18,
    tm: null,
    tag: tag == null ? null : tag,
    born: G.turn,
  });
}
export const objById = id => G.ext.objs.find(o => o.id === id);
export const removeObj = o => {
  G.ext.objs = G.ext.objs.filter(x => x !== o);
};
export function spawnDrone(dt, rack) {
  const n = G.ext.drones.length + 1;
  rack = rack || G.machines.find(k => k.type === 'rack' && k.hatch);
  const h = rack && rack.hatch ? rack.hatch : [2, 2];
  const D = DT[dt];
  G.ext.drones.push({
    id: G.nid++,
    name: `${D.n.toUpperCase().slice(0, 4)}-${n}`,
    dt,
    sec: HULL,
    x: h[0],
    y: h[1],
    hp: D.hp,
    max: D.hp,
    task: { type: 'idle' },
    cargo: { scrap: 0, circ: 0, rat: 0 },
    pod: null,
    home: rack ? rack.id : null,
  });
  if (G.ifaceSpare > 0) {
    G.ifaceSpare--;
    G.ext.drones[G.ext.drones.length - 1].iface = true;
  }
  if (G.scanSpare > 0) {
    G.scanSpare--;
    G.ext.drones[G.ext.drones.length - 1].scan = true;
  }
  G.droneUnlocked = true;
  if (!G.sel) G.sel = G.ext.drones[G.ext.drones.length - 1].id;
}
export function hatchOf(d) {
  let r = G.machines.find(k => k.id === d.home && online(k) && k.hatch);
  if (!r) {
    r = G.machines.find(k => k.type === 'rack' && online(k) && k.hatch);
    if (r) d.home = r.id;
  }
  return r ? r.hatch : null;
}

export function derHit(o, x, y) {
  const sh = o.pack.shape;
  const ox = o.x - Math.floor(sh.w / 2),
    oy = o.y - Math.floor(sh.h / 2);
  return x >= ox && y >= oy && x < ox + sh.w && y < oy + sh.h;
}
