import { T, WALK, WH, WW } from '../core/constants.js';
import { BR, EN, isHall } from '../core/data.js';
import { log } from '../core/messages.js';
import { G, M, P } from '../core/state.js';
import { D4, D8, dirName, idx, inB, pick } from '../core/util.js';
import { HULL } from '../space/sectors.js';
import { online } from './machines.js';
import { cloneShape, portWorld, rotD, rotDims, rotP, setCell, toLocal, toWorld } from './shapes.js';

export const modById = id => G.mods.find(m => m.id === id);
export const modIndex = id => G.mods.findIndex(m => m.id === id);
export function modCells(m) {
  const o = [];
  const sh = m.shape;
  for (let y = 0; y < sh.h; y++)
    for (let x = 0; x < sh.w; x++) {
      const c = sh.g[y][x];
      if (c === ' ') continue;
      const [wx, wy] = toWorld(m, x, y);
      o.push({ x: wx, y: wy, c, lx: x, ly: y });
    }
  return o;
}
function portAtLocal(m, lx, ly) {
  return m.shape.ports.findIndex(p => p.x === lx && p.y === ly && !p.sealed);
}
export function rebuildMap() {
  const map = new Uint8Array(WW * WH),
    own = new Int16Array(WW * WH).fill(-1),
    fa = new Int16Array(WW * WH).fill(-1);
  G.mods.forEach((m, mi) => {
    for (const c of modCells(m)) {
      if (!inB(c.x, c.y)) continue;
      const i = idx(c.x, c.y);
      own[i] = mi;
      if (c.c === '.') {
        map[i] = T.FLOOR;
        fa[i] = mi;
      } else if (c.c === '#') {
        if (map[i] !== T.FLOOR) map[i] = T.WALL;
      } else {
        const pi = portAtLocal(m, c.lx, c.ly);
        map[i] = m.links[pi] != null ? T.DOOR : T.PORT;
        fa[i] = mi;
      }
    }
  });
  const outer = (x, y) => D4.some(([dx, dy]) => inB(x + dx, y + dy) && map[idx(x + dx, y + dy)] === T.VOID);
  for (const m of G.mods)
    for (const [lx, ly] of m.wins) {
      const [x, y] = toWorld(m, lx, ly);
      if (inB(x, y) && map[idx(x, y)] === T.WALL && outer(x, y)) map[idx(x, y)] = T.WINDOW;
    }
  G.brk = [];
  G.mods.forEach((m, mi) => {
    m.breaches = m.breaches.filter(b => {
      const [x, y] = toWorld(m, b.lx, b.ly);
      const t = map[idx(x, y)];
      if ((t === T.WALL || t === T.WINDOW) && outer(x, y)) {
        map[idx(x, y)] = T.BREACH;
        G.brk.push({ id: b.id, x, y, mod: mi });
        return true;
      }
      return false;
    });
  });
  M.mat = new Map();
  for (const k of G.machines) {
    const mi = modIndex(k.mod);
    if (mi < 0) continue;
    const md = G.mods[mi];
    k.mi = mi;
    if (k.fx) {
      const cells = [];
      for (let j = 0; j < k.fh; j++)
        for (let i = 0; i < k.fw; i++) {
          const [x, y] = toWorld(md, k.lx + i, k.ly + j);
          cells.push([x, y]);
          map[idx(x, y)] = T.MACH;
          M.mat.set(idx(x, y), k);
        }
      const xs = cells.map(c => c[0]),
        ys = cells.map(c => c[1]);
      k.bb = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      k.cells = cells;
      const cx = (k.bb.x0 + k.bb.x1) / 2,
        cy = (k.bb.y0 + k.bb.y1) / 2;
      const an = cells
        .slice()
        .sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))[0];
      k.x = an[0];
      k.y = an[1];
      k.wdW = k.wd ? rotD(k.wd[0], k.wd[1], md.rot) : null;
    } else {
      const [x, y] = toWorld(md, k.lx, k.ly);
      k.x = x;
      k.y = y;
      k.cells = null;
      map[idx(x, y)] = T.MACH;
      M.mat.set(idx(x, y), k);
    }
  }
  for (const k of G.machines)
    if (k.wall) {
      k.face = null;
      for (const [dx, dy] of D4)
        if (
          inB(k.x + dx, k.y + dy) &&
          WALK.has(map[idx(k.x + dx, k.y + dy)]) &&
          fa[idx(k.x + dx, k.y + dy)] === k.mi
        ) {
          k.face = [dx, dy];
          break;
        }
    }
  M.map = map;
  M.own = own;
  M.room = fa;
  if (G.ext) clearDocking();
  // drone hatches
  const fps = freePorts(true);
  for (const k of G.machines)
    if (k.type === 'rack') {
      let best = null,
        bd = 1e9;
      for (const p of fps) {
        const d = Math.hypot(p.x - k.x, p.y - k.y) + (p.mi === k.mi ? 0 : 6);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      k.hatch = best ? [best.x + best.dx, best.y + best.dy] : null;
    }
}
export function nearestVoid(x, y, ok) {
  ok = ok || ((a, b) => M.map[idx(a, b)] === T.VOID);
  const seen = new Uint8Array(WW * WH);
  const q = [[x, y]];
  seen[idx(x, y)] = 1;
  while (q.length) {
    const [a, b] = q.shift();
    if (ok(a, b)) return [a, b];
    for (const [dx, dy] of D8) {
      const nx = a + dx,
        ny = b + dy;
      if (!inB(nx, ny) || seen[idx(nx, ny)]) continue;
      seen[idx(nx, ny)] = 1;
      q.push([nx, ny]);
    }
  }
  return null;
}
export function derFits(o, cx, cy) {
  const sh = o.pack.shape,
    ox = cx - Math.floor(sh.w / 2),
    oy = cy - Math.floor(sh.h / 2);
  if (ox < 1 || oy < 1 || ox + sh.w > WW - 1 || oy + sh.h > WH - 1) return false;
  for (let y = -1; y <= sh.h; y++)
    for (let x = -1; x <= sh.w; x++) {
      const wx = ox + x,
        wy = oy + y;
      if (inB(wx, wy) && M.map[idx(wx, wy)] !== T.VOID) return false;
    }
  return true;
}
function clearDocking() {
  // drones caught inside new hull get pushed out to open space
  for (const d of G.ext.drones) {
    if (d.tr || d.sec !== HULL) continue;
    if (M.map[idx(d.x, d.y)] === T.VOID) continue;
    const n = nearestVoid(d.x, d.y);
    if (n) {
      d.x = n[0];
      d.y = n[1];
      if (!d.bumped || G.turn - d.bumped > 20) {
        d.bumped = G.turn;
        log(`${d.name} gets shoved clear of the new hull.`);
      }
    }
  }
  // loose sections overlapped by the station drift out to clear space
  for (const o of G.ext.objs) {
    if (o.kind !== 'der' || o.sec !== HULL || o.st != null) continue;
    if (derFits(o, o.x, o.y)) continue;
    const n = nearestVoid(o.x, o.y, (a, b) => derFits(o, a, b));
    if (n) {
      o.x = n[0];
      o.y = n[1];
      if (o.tow) {
        const d = G.ext.drones.find(d => d.id === o.tow);
        if (d && M.map[idx(d.x, d.y)] !== T.VOID) {
          const v = nearestVoid(d.x, d.y);
          if (v) {
            d.x = v[0];
            d.y = v[1];
          }
        }
      }
    }
  }
}
export function freePorts(any) {
  const o = [];
  G.mods.forEach((m, mi) =>
    m.shape.ports.forEach((p, pi) => {
      if (m.links[pi] != null || p.sealed) return;
      const w = portWorld(m, pi);
      const ox = w.x + w.dx,
        oy = w.y + w.dy;
      if (!inB(ox, oy)) return;
      if (M.map && M.map[idx(ox, oy)] !== T.VOID) return;
      o.push({ mi, mid: m.id, pi, ...w });
    }),
  );
  return o;
}
/** Ways `pack` can dock at free port `fp`. Rooms only dock onto corridor pieces, never onto other rooms. */
export function fitsAt(pack, fp) {
  const res = [],
    sh = pack.shape;
  const target = fp && modById(fp.mid);
  if (target && !isHall(pack.fn) && !isHall(target.fn)) return res;
  for (let rot = 0; rot < 4; rot++) {
    const [rw, rh] = rotDims(sh, rot);
    sh.ports.forEach((p, pi) => {
      if (p.sealed) return;
      const [dx, dy] = rotD(p.dx, p.dy, rot);
      if (dx !== -fp.dx || dy !== -fp.dy) return;
      const [rx, ry] = rotP(p.x, p.y, rot, sh.w, sh.h);
      const ox = fp.x + fp.dx - rx,
        oy = fp.y + fp.dy - ry;
      if (ox < 2 || oy < 2 || ox + rw > WW - 2 || oy + rh > WH - 2) return;
      for (let y = 0; y < sh.h; y++)
        for (let x = 0; x < sh.w; x++) {
          if (sh.g[y][x] === ' ') continue;
          const [a, b] = rotP(x, y, rot, sh.w, sh.h);
          if (M.map[idx(ox + a, oy + b)] !== T.VOID) return;
        }
      res.push({ rot, pi, ox, oy });
    });
  }
  return res;
}
export function dockPack(pack, fp, fit, quiet) {
  fit = fit || pick(fitsAt(pack, fp));
  if (!fit) return null;
  const m = {
    id: G.nid++,
    fn: pack.fn,
    brand: pack.brand,
    shape: cloneShape(pack.shape),
    rot: fit.rot,
    ox: fit.ox,
    oy: fit.oy,
    pressure: pack.pressure || 0,
    name: pack.name,
    links: {},
    wins: pack.wins,
    breaches: [],
    ctl: pack.ctl !== false,
    haywire: !!pack.haywire,
  };
  G.mods.push(m);
  if (fp) {
    m.links[fit.pi] = { mod: fp.mid, pi: fp.pi };
    modById(fp.mid).links[fp.pi] = { mod: m.id, pi: fit.pi };
  }
  for (const k of pack.mach)
    G.machines.push({
      id: G.nid++,
      mod: m.id,
      type: k.type,
      lx: k.lx,
      ly: k.ly,
      cond: k.cond,
      on: k.on !== false,
      prog: k.prog || 0,
      wall: !!k.wall,
      fx: !!k.fx,
      fw: k.fw,
      fh: k.fh,
      wd: k.wd,
      powered: false,
      busy: false,
    });
  rebuildMap();
  for (const c of pack.crates) {
    const [x, y] = toWorld(m, c.lx, c.ly);
    G.crates[idx(x, y)] = c.c;
  }
  for (const c of pack.items) {
    const [x, y] = toWorld(m, c.lx, c.ly);
    (G.items[idx(x, y)] || (G.items[idx(x, y)] = [])).push(c.it);
  }
  for (const a of pack.actors) {
    const [x, y] = toWorld(m, a.lx, a.ly);
    G.actors.push({
      id: G.nid++,
      type: a.type,
      x,
      y,
      hp: a.hp,
      max: EN[a.type].hp,
      alert: false,
      mod: m.id,
      lost: 0,
    });
  }
  for (const b of pack.breaches) {
    if (b) m.breaches.push({ id: G.nid++, lx: b.lx, ly: b.ly });
    else addBreachMod(G.mods.length - 1, true);
  }
  rebuildMap();
  if (!quiet) {
    G.stat.docked++;
    log(
      `SECTION DOCKED: ${m.name} (${BR[m.brand].n}) on the ${fp ? dirName(fp.dx, fp.dy) : ''} port of ${fp ? modById(fp.mid).name : 'the station'}.${pack.pressure ? '' : ' It is in vacuum.'}${pack.actors.length ? ' Something moves inside.' : ''}`,
      'good',
    );
  }
  return m;
}
export function packModule0(m) {
  return { fn: m.fn, brand: m.brand, shape: m.shape, mach: G.machines.filter(k => k.mod === m.id) };
}
export function packModule(mi) {
  const m = G.mods[mi];
  const cells = modCells(m);
  const set = new Set(cells.map(c => idx(c.x, c.y)));
  const pack = {
    fn: m.fn,
    brand: m.brand,
    shape: m.shape,
    name: m.name,
    mach: [],
    crates: [],
    items: [],
    actors: [],
    breaches: [],
    wins: m.wins,
    pressure: m.pressure,
    ctl: m.ctl,
    haywire: m.haywire,
  };
  for (const k of G.machines.filter(k => k.mod === m.id))
    pack.mach.push({
      type: k.type,
      lx: k.lx,
      ly: k.ly,
      cond: k.cond,
      on: k.on,
      prog: k.prog,
      wall: k.wall,
      fx: k.fx,
      fw: k.fw,
      fh: k.fh,
      wd: k.wd,
    });
  G.machines = G.machines.filter(k => k.mod !== m.id);
  for (const key of Object.keys(G.crates)) {
    const i = +key;
    if (set.has(i)) {
      const [lx, ly] = toLocal(m, i % WW, (i / WW) | 0);
      pack.crates.push({ lx, ly, c: G.crates[key] });
      delete G.crates[key];
    }
  }
  for (const key of Object.keys(G.items)) {
    const i = +key;
    if (set.has(i)) {
      const [lx, ly] = toLocal(m, i % WW, (i / WW) | 0);
      for (const it of G.items[key]) pack.items.push({ lx, ly, it });
      delete G.items[key];
    }
  }
  for (const a of G.actors.filter(a => set.has(idx(a.x, a.y)))) {
    const [lx, ly] = toLocal(m, a.x, a.y);
    pack.actors.push({ type: a.type, lx, ly, hp: a.hp });
  }
  G.actors = G.actors.filter(a => !set.has(idx(a.x, a.y)));
  for (const b of m.breaches) pack.breaches.push({ lx: b.lx, ly: b.ly });
  for (const l of Object.values(m.links)) {
    const o = modById(l.mod);
    if (o) delete o.links[l.pi];
  }
  if (G.bot && set.has(idx(G.bot.x, G.bot.y))) G.bot = null;
  const cx = m.ox + Math.floor(rotDims(m.shape, m.rot)[0] / 2),
    cy = m.oy + Math.floor(rotDims(m.shape, m.rot)[1] / 2);
  G.mods.splice(mi, 1);
  rebuildMap();
  return { pack, cx, cy };
}
export function doSeal(m, pi) {
  const p = m.shape.ports[pi];
  if (!p || m.links[pi] != null) return false;
  p.sealed = true;
  setCell(m.shape, p.x, p.y, '#');
  rebuildMap();
  return true;
}
/** The sealed door at world tile (x, y), if any, as { m, pi }. Only doors that open onto space count. */
export function sealedDoorAt(x, y) {
  const mi = M.own[idx(x, y)];
  const m = G.mods[mi];
  if (!m) return null;
  const [lx, ly] = toLocal(m, x, y);
  const pi = m.shape.ports.findIndex(p => p.sealed && p.x === lx && p.y === ly);
  if (pi < 0) return null;
  const [dx, dy] = rotD(m.shape.ports[pi].dx, m.shape.ports[pi].dy, m.rot);
  if (!inB(x + dx, y + dy) || M.map[idx(x + dx, y + dy)] !== T.VOID) return null;
  return { m, pi };
}
export function doUnseal(m, pi) {
  const p = m.shape.ports[pi];
  if (!p || !p.sealed) return false;
  p.sealed = false;
  setCell(m.shape, p.x, p.y, 'P');
  m.wins = m.wins.filter(([a, b]) => a !== p.x || b !== p.y);
  rebuildMap();
  return true;
}
export function canDetach(mi) {
  const m = G.mods[mi];
  if (M.room[idx(P.x, P.y)] === mi || M.own[idx(P.x, P.y)] === mi) return 'You are standing inside it.';
  const racks = G.machines.filter(k => k.type === 'rack' && online(k));
  if (racks.length && racks.every(k => k.mod === m.id)) return 'It holds your only working Drone Rack.';
  const rest = G.mods.filter(x => x !== m);
  if (!rest.length) return 'It is the whole station.';
  const start = G.mods[M.room[idx(P.x, P.y)]] || G.mods[M.own[idx(P.x, P.y)]];
  if (!start) return 'Stand inside the station first.';
  const seen = new Set([start.id]);
  const st = [start];
  while (st.length) {
    const a = st.pop();
    for (const l of Object.values(a.links)) {
      if (l.mod === m.id || seen.has(l.mod)) continue;
      seen.add(l.mod);
      const b = modById(l.mod);
      if (b) st.push(b);
    }
  }
  if (seen.size !== rest.length) return 'Removing it would cut the station in two.';
  if (
    !modCells(m).some(c =>
      D8.some(([dx, dy]) => inB(c.x + dx, c.y + dy) && M.map[idx(c.x + dx, c.y + dy)] === T.VOID),
    )
  )
    return 'No part of its hull faces open space, so a drone cannot reach its clamps. Detach a neighbour first.';
  return null;
}
export function addBreachMod(mi, noRebuild) {
  const m = G.mods[mi];
  if (!m) return null;
  const c = [];
  for (const cell of modCells(m)) {
    if (cell.c !== '#') continue;
    const t = M.map[idx(cell.x, cell.y)];
    if (t !== T.WALL && t !== T.WINDOW) continue;
    if (
      D4.some(
        ([dx, dy]) => inB(cell.x + dx, cell.y + dy) && M.map[idx(cell.x + dx, cell.y + dy)] === T.VOID,
      ) &&
      D4.some(([dx, dy]) => inB(cell.x + dx, cell.y + dy) && M.map[idx(cell.x + dx, cell.y + dy)] === T.FLOOR)
    )
      c.push(cell);
  }
  if (!c.length) return null;
  const cell = pick(c);
  const b = { id: G.nid++, lx: cell.lx, ly: cell.ly };
  m.breaches.push(b);
  if (!noRebuild) rebuildMap();
  return b;
}
export function removeBreach(b) {
  for (const m of G.mods) m.breaches = m.breaches.filter(x => x.id !== b.id);
  rebuildMap();
}

export function hullNear(m, x, y) {
  let best = null,
    bd = 1e9;
  for (const c of modCells(m)) {
    if (c.c !== '#') continue;
    if (!D4.some(([dx, dy]) => inB(c.x + dx, c.y + dy) && M.map[idx(c.x + dx, c.y + dy)] === T.VOID))
      continue;
    const dd = Math.hypot(c.x - x, c.y - y);
    if (dd < bd) {
      bd = dd;
      best = [c.x, c.y];
    }
  }
  return best;
}
