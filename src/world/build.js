import { T, WALK, WH, WW } from '../core/constants.js';
import { BR, EN } from '../core/data.js';
import { G, M, P } from '../core/state.js';
import { D4, D8, cheb, dirName, idx, inB, pick } from '../core/util.js';
import { addFx } from '../sim/stats.js';
import { HULL } from '../space/sectors.js';
import { log } from '../ui/log-modal.js';
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
export function fitsAt(pack, fp) {
  const res = [],
    sh = pack.shape;
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
/* ---------- hull editing ---------- */
export function cutSpot(m, lx, ly) {
  const sh = m.shape,
    g = (x, y) => (sh.g[y] || '')[x] || ' ';
  if (g(lx, ly) !== '#') return null;
  if (G.machines.some(k => k.mod === m.id && k.lx === lx && k.ly === ly)) return null;
  if (m.breaches.some(b => b.lx === lx && b.ly === ly)) return null;
  for (const [dx, dy] of D4) {
    if (
      g(lx - dx, ly - dy) === '.' &&
      g(lx + dx, ly + dy) === ' ' &&
      g(lx + dy, ly + dx) === '#' &&
      g(lx - dy, ly - dx) === '#'
    ) {
      if (sh.ports.some(p => !p.sealed && Math.abs(p.x - lx) + Math.abs(p.y - ly) < 3)) return null;
      const [wx, wy] = toWorld(m, lx, ly);
      const [wdx, wdy] = rotD(dx, dy, m.rot);
      if (!inB(wx + wdx, wy + wdy) || M.map[idx(wx + wdx, wy + wdy)] !== T.VOID) return null;
      if (M.own[idx(wx, wy)] !== modIndex(m.id)) return null;
      return { dx, dy, ox: wx + wdx, oy: wy + wdy };
    }
  }
  return null;
}
export function doCut(m, lx, ly) {
  const c = cutSpot(m, lx, ly);
  if (!c) return false;
  const sp = m.shape.ports.find(p => p.x === lx && p.y === ly);
  if (sp) {
    sp.sealed = false;
    sp.dx = c.dx;
    sp.dy = c.dy;
  } else m.shape.ports.push({ x: lx, y: ly, dx: c.dx, dy: c.dy });
  setCell(m.shape, lx, ly, 'P');
  m.wins = m.wins.filter(([a, b]) => a !== lx || b !== ly);
  rebuildMap();
  return true;
}
export function doSeal(m, pi) {
  const p = m.shape.ports[pi];
  if (!p || m.links[pi] != null) return false;
  p.sealed = true;
  setCell(m.shape, p.x, p.y, '#');
  rebuildMap();
  return true;
}
const linkBr = (m, pi) => (m.links[pi] && m.links[pi].br) || 0;
export function setBrace(m, pi) {
  const l = m.links[pi];
  if (!l) return;
  l.br = (l.br || 0) + 1;
  const o = modById(l.mod);
  if (o && o.links[l.pi]) o.links[l.pi].br = l.br;
}
const modMass = m =>
  m.shape.g.join('').split('.').length -
  1 +
  G.machines.filter(k => k.mod === m.id && k.type !== 'mount' && !k.wall).length * 4;
const JCAP = b => 110 + 80 * b;
export function jointLoads() {
  const n = G.mods.length,
    idOf = {};
  G.mods.forEach((m, i) => (idOf[m.id] = i));
  const edges = [];
  G.mods.forEach((m, i) => {
    for (const [pi, l] of Object.entries(m.links)) {
      const j = idOf[l.mod];
      if (j == null || j < i) continue;
      edges.push({ a: i, b: j, pa: +pi, pb: l.pi });
    }
  });
  const adj = G.mods.map(() => []);
  edges.forEach((e, k) => {
    adj[e.a].push([e.b, k]);
    adj[e.b].push([e.a, k]);
  });
  const disc = new Array(n).fill(-1),
    low = new Array(n).fill(0),
    par = new Array(n).fill(-1),
    sub = new Array(n).fill(0),
    mass = G.mods.map(modMass);
  let t = 0;
  const bridge = new Set();
  const order = [];
  const dfs = (u, pe) => {
    disc[u] = low[u] = t++;
    order.push(u);
    sub[u] = mass[u];
    for (const [v, k] of adj[u]) {
      if (k === pe) continue;
      if (disc[v] < 0) {
        par[v] = u;
        dfs(v, k);
        sub[u] += sub[v];
        low[u] = Math.min(low[u], low[v]);
        if (low[v] > disc[u]) bridge.add(k);
      } else low[u] = Math.min(low[u], disc[v]);
    }
  };
  if (n) dfs(0, -1);
  const mv = G.move ? 1.5 : 1;
  return edges.map((e, k) => {
    const ma = G.mods[e.a];
    let load = 0,
      child = -1;
    if (bridge.has(k)) {
      child = par[e.b] === e.a ? e.b : e.a;
      load = Math.round(sub[child] * mv);
    }
    const br = linkBr(ma, e.pa),
      w = portWorld(ma, e.pa);
    return { ...e, load, cap: JCAP(br), br, child, x: w.x, y: w.y, loop: !bridge.has(k) };
  });
}
function addBreachAt(mi, x, y) {
  const m = G.mods[mi];
  if (!m) return null;
  let best = null,
    bd = 1e9;
  for (const cell of modCells(m)) {
    if (cell.c !== '#') continue;
    const t = M.map[idx(cell.x, cell.y)];
    if (t !== T.WALL && t !== T.WINDOW) continue;
    if (
      !D4.some(([dx, dy]) => inB(cell.x + dx, cell.y + dy) && M.map[idx(cell.x + dx, cell.y + dy)] === T.VOID)
    )
      continue;
    const d = Math.hypot(cell.x - x, cell.y - y);
    if (d < bd) {
      bd = d;
      best = cell;
    }
  }
  if (!best) return addBreachMod(mi);
  const b = { id: G.nid++, lx: best.lx, ly: best.ly };
  m.breaches.push(b);
  rebuildMap();
  return b;
}
export function stressTick() {
  G.joints = jointLoads();
  if (G.turn % 10) return;
  for (const j of G.joints) {
    if (!j.load) continue;
    const r = j.load / j.cap;
    if (r <= 1) continue;
    if (Math.random() < Math.min(0.5, (r - 1) * 0.35)) {
      const ch = G.mods[j.child];
      if (!ch) continue;
      const ci = j.child;
      if (r > 2.2 && Object.keys(ch.links).length === 1 && canDetach(ci) === null && Math.random() < 0.4) {
        const { pack, cx, cy } = packModule(ci);
        pack.redock = true;
        G.ext.objs.push({ id: G.nid++, sec: HULL, kind: 'der', x: cx, y: cy, pack, tow: null });
        log(
          `JOINT FAILURE: the ${pack.name} shears off the station and tumbles free. A tug can bring it back.`,
          'bad',
        );
        return;
      }
      addBreachAt(ci, j.x, j.y);
      const jb = G.machines.find(k => k.type === 'junc' && k.mod === ch.id);
      if (jb) jb.cond = Math.max(0, jb.cond - 15);
      log(
        `The joint to the ${ch.name} cracks under load (${j.load}/${j.cap}). Hull breach. Brace it or add a second connection to spread the load.`,
        'bad',
      );
      addFx({ k: 'boom', x: j.x, y: j.y, dur: 400, view: 'ext' });
    }
  }
}
/* tube planner: path from a free port to open space or to another free port */
export function planTube(fp, tx, ty) {
  const ports = freePorts();
  const fp2 = ports.find(
    p =>
      !(p.mid === fp.mid && p.pi === fp.pi) &&
      ((p.x + p.dx === tx && p.y + p.dy === ty) || (p.x === tx && p.y === ty)),
  );
  const s = [fp.x + fp.dx, fp.y + fp.dy];
  let E;
  if (fp2) E = [fp2.x + fp2.dx, fp2.y + fp2.dy];
  else E = [tx, ty];
  if (!inB(E[0], E[1]) || M.map[idx(E[0], E[1])] !== T.VOID)
    return { err: 'The end point must be open space or a free port.' };
  const nearEnd = (x, y) => cheb(x, y, s[0], s[1]) <= 1 || cheb(x, y, E[0], E[1]) <= 1;
  const ok = (x, y) => {
    if (x < 3 || y < 3 || x > WW - 4 || y > WH - 4) return false;
    if (M.map[idx(x, y)] !== T.VOID) return false;
    if (nearEnd(x, y)) return true;
    for (const [dx, dy] of D8) if (M.map[idx(x + dx, y + dy)] !== T.VOID) return false;
    return true;
  };
  const DI = d => D4.findIndex(([a, b]) => a === d[0] && b === d[1]);
  const N = WW * WH * 4,
    dist = new Float32Array(N).fill(1e9),
    prv = new Int32Array(N).fill(-1);
  const key = (x, y, d) => (idx(x, y) << 2) | d;
  const f1 = [s[0] + fp.dx, s[1] + fp.dy];
  if (!ok(f1[0], f1[1])) return { err: 'No room right outside that port.' };
  const d0 = DI([fp.dx, fp.dy]);
  const buckets = [];
  const push = (k, c) => {
    (buckets[c] || (buckets[c] = [])).push(k);
  };
  const k0 = key(f1[0], f1[1], d0);
  dist[k0] = 1;
  push(k0, 1);
  let goal = -1;
  const last = fp2 ? [E[0] + fp2.dx, E[1] + fp2.dy] : null;
  for (let c = 0; c < buckets.length && c < 220 && goal < 0; c++) {
    const B = buckets[c];
    if (!B) continue;
    for (const k of B) {
      if (dist[k] !== c) continue;
      const d = k & 3,
        i = k >> 2,
        x = i % WW,
        y = (i / WW) | 0;
      if (fp2) {
        if (x === last[0] && y === last[1]) {
          goal = k;
          break;
        }
      } else if (x === E[0] && y === E[1]) {
        goal = k;
        break;
      }
      for (let nd = 0; nd < 4; nd++) {
        const [dx, dy] = D4[nd];
        if (dx === -D4[d][0] && dy === -D4[d][1]) continue;
        const nx = x + dx,
          ny = y + dy;
        if (fp2 && nx === E[0] && ny === E[1]) continue;
        if (!ok(nx, ny)) continue;
        const nc = c + 1 + (nd === d ? 0 : 4);
        const nk = key(nx, ny, nd);
        if (nc < dist[nk]) {
          dist[nk] = nc;
          prv[nk] = k;
          push(nk, nc);
        }
      }
    }
  }
  if (goal < 0)
    return { err: 'No clear route. Tubes need a 3-wide free lane and cannot pass right next to other hull.' };
  const cells = [];
  for (let k = goal; k >= 0; k = prv[k]) {
    const i = k >> 2;
    cells.unshift([i % WW, (i / WW) | 0]);
  }
  let endDir;
  if (fp2) {
    cells.push([E[0], E[1]]);
    endDir = [-fp2.dx, -fp2.dy];
  } else {
    endDir = D4[goal & 3];
    const ax = E[0] + endDir[0],
      ay = E[1] + endDir[1];
    if (!inB(ax, ay) || M.map[idx(ax, ay)] !== T.VOID)
      return { err: 'The open end needs space in front of it.' };
  }
  cells.unshift(s);
  if (cells.length < 3) return { err: 'Too short. Pick a point further out.' };
  if (cells.length > 44) return { err: 'Too long (max about 40 tiles). Add a section in between.' };
  const xs = cells.map(c => c[0]),
    ys = cells.map(c => c[1]);
  const ox = Math.min(...xs) - 1,
    oy = Math.min(...ys) - 1,
    w = Math.max(...xs) - ox + 2,
    h = Math.max(...ys) - oy + 2;
  const g = [];
  for (let y = 0; y < h; y++) g.push(new Array(w).fill(' '));
  const L = c => [c[0] - ox, c[1] - oy];
  cells.forEach((c, i) => {
    const [x, y] = L(c);
    g[y][x] = i === 0 || i === cells.length - 1 ? 'P' : '.';
  });
  cells.forEach((c, i) => {
    const [x, y] = L(c);
    if (g[y][x] === '.') {
      for (const [dx, dy] of D8) {
        const a = x + dx,
          b = y + dy;
        if (g[b] && g[b][a] === ' ') g[b][a] = '#';
      }
    }
  });
  const pDir = [[-fp.dx, -fp.dy], endDir];
  [cells[0], cells[cells.length - 1]].forEach((c, k) => {
    const [x, y] = L(c);
    const [dx, dy] = pDir[k];
    for (const [px, py] of [
      [dy, dx],
      [-dy, -dx],
    ]) {
      const a = x + px,
        b = y + py;
      if (g[b] && g[b][a] === ' ') g[b][a] = '#';
    }
  });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = g[y][x];
      if (ch === ' ') continue;
      const t = M.map[idx(ox + x, oy + y)];
      if (t === T.VOID) continue;
      if (ch === '#' && t === T.WALL) continue;
      return { err: 'The tube would cut into existing hull.' };
    }
  const shape = {
    kind: 'tube',
    w,
    h,
    g: g.map(r => r.join('')),
    ports: [
      { x: s[0] - ox, y: s[1] - oy, dx: -fp.dx, dy: -fp.dy },
      {
        x: cells[cells.length - 1][0] - ox,
        y: cells[cells.length - 1][1] - oy,
        dx: endDir[0],
        dy: endDir[1],
      },
    ],
  };
  const len = cells.length - 2;
  return {
    shape,
    ox,
    oy,
    len,
    cells,
    mid: fp.mid,
    pi: fp.pi,
    mid2: fp2 ? fp2.mid : null,
    pi2: fp2 ? fp2.pi : null,
    cost: { s: len * 2, c: 1 },
  };
}
export function buildTube(plan) {
  const fp = freePorts().find(p => p.mid === plan.mid && p.pi === plan.pi);
  if (!fp) return null;
  const sh = plan.shape;
  let jx = -1,
    jy = -1;
  const p0 = sh.ports[0];
  const f1 = [p0.x - p0.dx, p0.y - p0.dy];
  for (const [dx, dy] of D4) {
    const a = f1[0] + dx,
      b = f1[1] + dy;
    if ((sh.g[b] || '')[a] === '#') {
      jx = a;
      jy = b;
      break;
    }
  }
  const pack = {
    fn: 'tube',
    brand: pick(['scav', 'aster', 'volkov', 'kibo']),
    shape: sh,
    name: 'Connector Tube',
    mach: jx >= 0 ? [{ type: 'junc', lx: jx, ly: jy, wall: true, cond: 100 }] : [],
    crates: [],
    items: [],
    actors: [],
    breaches: [],
    wins: [],
    pressure: 0,
    ctl: true,
  };
  const m = dockPack(pack, fp, { rot: 0, pi: 0, ox: plan.ox, oy: plan.oy }, true);
  if (!m) return null;
  G.stat.docked++;
  G.stat.tubes = (G.stat.tubes || 0) + 1;
  if (plan.mid2 != null) {
    const o = modById(plan.mid2);
    if (o && o.links[plan.pi2] == null) {
      m.links[1] = { mod: o.id, pi: plan.pi2 };
      o.links[plan.pi2] = { mod: m.id, pi: 1 };
      rebuildMap();
    }
  }
  return m;
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
