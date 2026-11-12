import { BR, BRANDS, EN, FN, FX, XTRA, mk } from '../core/data.js';
import { D4, D8, cheb, pick, rnd, rr, shuffle } from '../core/util.js';
import { cloneShape, genShape, setCell, shapeFloors } from './shapes.js';

function shapeFloodOk(sh, blocked) {
  const fl = shapeFloors(sh).filter(([x, y]) => !blocked.has(x + ',' + y));
  if (!fl.length) return false;
  const set = new Set(fl.map(([x, y]) => x + ',' + y));
  const st = [fl[0]],
    seen = new Set([fl[0].join(',')]);
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of D8) {
      const k = x + dx + ',' + (y + dy);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        st.push([x + dx, y + dy]);
      }
    }
  }
  return seen.size === set.size;
}
export function makePack(fn, brand, opts) {
  opts = opts || {};
  brand = brand || pick(BRANDS);
  const f = FN[fn];
  let sh;
  if (opts.shape) {
    sh = cloneShape(opts.shape);
    sh.ports.forEach(p => {
      if (p.sealed) {
        p.sealed = false;
        setCell(sh, p.x, p.y, 'P');
      }
    });
  } else {
    const need = f.m.reduce((a, t) => a + (FX[t] ? FX[t].s[0][0] * FX[t].s[0][1] * 2 : 2), 0) + 10;
    for (let k = 0; k < 40; k++) {
      sh = genShape(fn === 'tube' ? 'truss' : pick(BR[brand].shapes));
      if (shapeFloors(sh).length >= need || fn === 'tube') break;
    }
  }
  const pack = {
    fn,
    brand,
    shape: sh,
    name: f.n,
    mach: [],
    crates: [],
    items: [],
    actors: [],
    breaches: [],
    wins: [],
    pressure: opts.pressure || 0,
  };
  const portInner = sh.ports.map(p => [p.x - p.dx, p.y - p.dy]);
  const blocked = new Set();
  const cands = shuffle(shapeFloors(sh));
  const fill = opts.fill || (opts.cond ? 'set' : 'derelict');
  let want = [];
  const smalls = f.m.filter(t => !FX[t] && t !== 'terminal');
  if (fill === 'set') want = smalls.slice();
  else if (fill !== 'shell') {
    const P1 = fill === 'station' ? 0.8 : 0.55;
    for (const t of smalls) if (Math.random() < P1) want.push(t);
    if (fn !== 'tube' && Math.random() < (fill === 'station' ? 0.45 : 0.3))
      want.push(pick(XTRA[opts.kind] || XTRA.any));
  }
  const nMount = fn === 'tube' ? 0 : want.length + rr(1, 2);
  const condOf = t => {
    if (opts.cond) return opts.cond(t);
    if (fill === 'shell') return FX[t] ? rr(25, 40) : 100;
    const wk = fill === 'station' ? 0.5 : 0.25;
    return Math.random() < wk ? rr(62, 92) : rr(10, 55);
  };
  // big fixtures first
  {
    const g = (x, y) => (sh.g[y] || '')[x] || ' ';
    let failed = false;
    for (const t of f.m.filter(t => FX[t])) {
      const F = FX[t];
      let best = null;
      for (const [a, b] of F.s) {
        const opts2 = [];
        const dirs = F.p === 'w' ? D4 : [[0, 0]];
        for (const [wx, wy] of dirs) {
          const fw = F.p === 'w' && wx !== 0 ? b : a,
            fh = F.p === 'w' && wx !== 0 ? a : b;
          for (let y = 1; y < sh.h - fh; y++)
            for (let x = 1; x < sh.w - fw; x++) {
              let ok = true;
              const cells = [];
              for (let j = 0; j < fh && ok; j++)
                for (let i = 0; i < fw && ok; i++) {
                  const cx = x + i,
                    cy = y + j;
                  if (
                    g(cx, cy) !== '.' ||
                    blocked.has(cx + ',' + cy) ||
                    portInner.some(([px, py]) => cheb(px, py, cx, cy) <= 1)
                  )
                    ok = false;
                  else cells.push([cx, cy]);
                }
              if (!ok) continue;
              if (F.p === 'w') {
                for (const [cx, cy] of cells) {
                  const nx = cx + wx,
                    ny = cy + wy;
                  if (nx >= x && nx < x + fw && ny >= y && ny < y + fh) continue;
                  if (g(nx, ny) !== '#') {
                    ok = false;
                    break;
                  }
                }
                if (!ok) continue;
              }
              for (const [cx, cy] of cells) blocked.add(cx + ',' + cy);
              const fl = shapeFloodOk(sh, blocked);
              for (const [cx, cy] of cells) blocked.delete(cx + ',' + cy);
              if (!fl) continue;
              let sc = Math.random();
              if (F.p === 'c') {
                for (let j = -1; j <= fh; j++)
                  for (let i = -1; i <= fw; i++) {
                    if (i >= 0 && i < fw && j >= 0 && j < fh) continue;
                    if (g(x + i, y + j) === '.') sc += 1;
                  }
              }
              sc += Math.min(4, ...portInner.map(([px, py]) => cheb(px, py, x, y))) * 0.3;
              opts2.push({ x, y, fw, fh, wd: F.p === 'w' ? [wx, wy] : null, cells, sc });
            }
        }
        if (opts2.length) {
          opts2.sort((p, q) => q.sc - p.sc);
          best = opts2[0];
          break;
        }
      }
      if (!best) {
        failed = true;
        break;
      }
      for (const [cx, cy] of best.cells) blocked.add(cx + ',' + cy);
      pack.mach.push({
        type: t,
        lx: best.x,
        ly: best.y,
        fw: best.fw,
        fh: best.fh,
        wd: best.wd,
        fx: true,
        cond: condOf(t),
        on: true,
        prog: 0,
      });
    }
    if (failed && !opts.shape && (opts._try || 0) < 25)
      return makePack(fn, brand, { ...opts, _try: (opts._try || 0) + 1 });
  }
  const front = new Set();
  {
    const g = (x, y) => (sh.g[y] || '')[x];
    const used = [];
    const spots = score => {
      const o = [];
      for (let y = 0; y < sh.h; y++)
        for (let x = 0; x < sh.w; x++) {
          if (g(x, y) !== '#' || used.some(u => cheb(u[0], u[1], x, y) < 2)) continue;
          for (const [dx, dy] of D4) {
            const fx = x + dx,
              fy = y + dy;
            if (g(fx, fy) !== '.' || blocked.has(fx + ',' + fy)) continue;
            if (pack.mach.some(m => m.lx === fx && m.ly === fy)) continue;
            const side = [
              [dy, dx],
              [-dy, -dx],
            ].filter(([a, b]) => g(x + a, y + b) === '#').length;
            const pd = Math.min(99, ...sh.ports.map(p => cheb(p.x, p.y, x, y)));
            const sc = score(pd, side);
            if (sc != null) o.push({ x, y, fx, fy, sc: sc + Math.random() });
          }
        }
      o.sort((a, b) => b.sc - a.sc);
      return o[0];
    };
    const cnd = t => (opts.cond ? opts.cond(t) : rr(10, 40));
    if (fn !== 'tube') {
      const w = spots((pd, side) => (pd <= 2 ? null : side * 2));
      const w2 = w || spots((pd, side) => (pd < 1 ? null : side * 2 - (pd <= 2 ? 6 : 0))) || spots(() => 0);
      if (w2) {
        used.push([w2.x, w2.y]);
        front.add(w2.fx + ',' + w2.fy);
        pack.mach.push({
          type: 'node',
          lx: w2.x,
          ly: w2.y,
          wall: true,
          cond: cnd('node'),
          on: true,
          prog: 0,
        });
      }
    }
    if (f.m.includes('terminal')) {
      const tp = spots((pd, side) => (pd < 1 ? null : side * 2)) || spots(() => 0);
      if (tp) {
        used.push([tp.x, tp.y]);
        front.add(tp.fx + ',' + tp.fy);
        pack.mach.push({ type: 'terminal', lx: tp.x, ly: tp.y, wall: true, cond: 100, on: true, prog: 0 });
      }
    }
    const j = spots((pd, side) => -Math.abs(pd - 2) * 3 + side);
    if (j) {
      used.push([j.x, j.y]);
      front.add(j.fx + ',' + j.fy);
      pack.mach.push({ type: 'junc', lx: j.x, ly: j.y, wall: true, cond: cnd('junc'), on: true, prog: 0 });
    }
    let wi = 0;
    for (let k = 0; k < nMount; k++) {
      const c = cands.find(
        ([x, y]) =>
          !blocked.has(x + ',' + y) &&
          !front.has(x + ',' + y) &&
          !portInner.some(([a, b]) => cheb(a, b, x, y) <= 1) &&
          !pack.mach.some(m => cheb(m.lx, m.ly, x, y) < 2) &&
          (() => {
            blocked.add(x + ',' + y);
            const ok = shapeFloodOk(sh, blocked);
            if (!ok) blocked.delete(x + ',' + y);
            return ok;
          })(),
      );
      if (!c) break;
      const t = wi < want.length ? want[wi++] : 'mount';
      pack.mach.push({
        type: t,
        lx: c[0],
        ly: c[1],
        cond: t === 'mount' ? 100 : condOf(t),
        on: true,
        prog: 0,
      });
    }
    if (fill === 'set' && wi < want.length && !opts.shape && (opts._try || 0) < 25)
      return makePack(fn, brand, { ...opts, _try: (opts._try || 0) + 1 });

    // hardpoints: straight outer wall cells facing space
    if (fn !== 'tube') {
      const hc = [];
      for (let y = 0; y < sh.h; y++)
        for (let x = 0; x < sh.w; x++) {
          if (g(x, y) !== '#' || used.some(u => cheb(u[0], u[1], x, y) < 2)) continue;
          if (sh.ports.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 3)) continue;
          for (const [dx, dy] of D4)
            if (
              g(x - dx, y - dy) === '.' &&
              (g(x + dx, y + dy) || ' ') === ' ' &&
              g(x + dy, y + dx) === '#' &&
              g(x - dy, y - dx) === '#' &&
              !pack.mach.some(m => m.lx === x - dx && m.ly === y - dy)
            ) {
              hc.push([x, y]);
              break;
            }
        }
      shuffle(hc);
      let nh =
        fn === 'defense'
          ? rr(2, 3)
          : opts.kind === 'military' || opts.kind === 'rogue'
            ? Math.random() < 0.6
              ? 1
              : 0
            : Math.random() < 0.35
              ? 1
              : 0;
      for (const [x, y] of hc) {
        if (nh <= 0) break;
        if (used.some(u => cheb(u[0], u[1], x, y) < 3)) continue;
        used.push([x, y]);
        nh--;
        const arm =
          fill !== 'shell' &&
          (fn === 'defense'
            ? Math.random() < 0.8
            : opts.kind === 'military' || opts.kind === 'rogue'
              ? Math.random() < 0.6
              : false);
        pack.mach.push({
          type: arm ? 'turret' : 'hp',
          lx: x,
          ly: y,
          wall: true,
          cond: arm ? condOf('turret') : 100,
          on: true,
          prog: 0,
        });
      }
    }
  }
  // windows
  const walls = [];
  for (let y = 0; y < sh.h; y++)
    for (let x = 0; x < sh.w; x++)
      if (sh.g[y][x] === '#') {
        const nb = D4.map(([dx, dy]) => (sh.g[y + dy] || '')[x + dx]);
        if ((nb.includes(' ') || nb.includes(undefined)) && !pack.mach.some(m => m.lx === x && m.ly === y))
          walls.push([x, y]);
      }
  const nw = fn === 'tube' ? 0 : rr(0, 2);
  for (let k = 0; k < nw && walls.length; k++) pack.wins.push(pick(walls));
  return pack;
}
export function packFree(pack) {
  const occ = new Set(
    pack.mach
      .map(m => m.lx + ',' + m.ly)
      .concat(pack.crates.map(c => c.lx + ',' + c.ly))
      .concat(pack.items.map(c => c.lx + ',' + c.ly))
      .concat(pack.actors.map(c => c.lx + ',' + c.ly)),
  );
  const pi = pack.shape.ports.map(p => [p.x - p.dx, p.y - p.dy]);
  return shuffle(
    shapeFloors(pack.shape).filter(
      ([x, y]) => !occ.has(x + ',' + y) && !pi.some(([a, b]) => a === x && b === y),
    ),
  );
}
export function fillDerelict(pack, first) {
  const loot = (FN[pack.fn].loot || 1) + rnd(2);
  for (let k = 0; k < loot; k++) {
    const f = packFree(pack)[0];
    if (f)
      pack.crates.push({
        lx: f[0],
        ly: f[1],
        c: {
          scrap: rr(3, 9),
          circ: rr(1, 4),
          rat: Math.random() < 0.4 ? rr(1, 3) : 0,
          ammo: Math.random() < 0.3 ? rr(5, 12) : 0,
        },
      });
  }
  if (Math.random() < 0.55) {
    const f = packFree(pack)[0];
    if (f)
      pack.items.push({
        lx: f[0],
        ly: f[1],
        it: mk(
          pick(['scatter', 'cutter', 'liner', 'scanner', 'magboots', 'armor', 'o2tank', 'medkit', 'carbine']),
          0.4 + Math.random() * 0.5,
        ),
      });
  }
  if (Math.random() < 0.18) {
    const f = packFree(pack)[0];
    if (f)
      pack.items.push({
        lx: f[0],
        ly: f[1],
        it: mk(pick(['dorm_util', 'dorm_util', 'dorm_tug', 'dorm_guard'])),
      });
  }
  const nh = first ? 0 : rr(0, 3);
  for (let k = 0; k < nh; k++) {
    const f = packFree(pack).find(([x, y]) => pack.shape.ports.every(p => cheb(p.x, p.y, x, y) > 3));
    if (f) {
      const t = Math.random() < 0.35 ? 'crawler' : 'feral';
      pack.actors.push({ type: t, lx: f[0], ly: f[1], hp: EN[t].hp });
    }
  }
  pack.breaches.push(null);
  return pack;
}
