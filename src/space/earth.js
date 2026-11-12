import { EGH, EGW } from '../core/constants.js';
import { ANCH, BLOBS, FAC, isRival, LEGACY } from '../core/data.js';
import { emit } from '../core/events.js';
import { log } from '../core/messages.js';
import { random } from '../core/rng.js';
import { G, M } from '../core/state.js';
import { cheb, clamp, D4, pick, rnd, rr, shuffle } from '../core/util.js';

function lonlat(x, y) {
  return [-180 + ((x + 0.5) * 360) / EGW, 80 - ((y + 0.5) * 150) / EGH];
}
export function cellOf(lon, lat) {
  return [
    clamp(Math.floor(((lon + 180) / 360) * EGW), 0, EGW - 1),
    clamp(Math.floor(((80 - lat) / 150) * EGH), 0, EGH - 1),
  ];
}
function noise(x, y, s) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}
export function initLand() {
  M.land = new Uint8Array(EGW * EGH);
  for (let y = 0; y < EGH; y++)
    for (let x = 0; x < EGW; x++) {
      const [lo, la] = lonlat(x, y);
      let l = la < -66;
      for (const [cx, cy, rx, ry] of BLOBS) {
        const dx = (lo - cx) / rx,
          dy = (la - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          l = true;
          break;
        }
      }
      M.land[x + y * EGW] = l ? 1 : 0;
    }
}
export function initEarth() {
  initLand();
  G.owner = new Array(EGW * EGH).fill(-1);
  G.hab = new Array(EGW * EGH).fill(0);
  const seed = random() * 100;
  for (let i = 0; i < EGW * EGH; i++) {
    if (!M.land[i]) continue;
    const x = i % EGW,
      y = (i / EGW) | 0;
    const [, la] = lonlat(x, y);
    if (la < -62) continue;
    if (noise(x >> 1, y >> 1, seed) * 0.6 + noise(x, y, seed + 3) * 0.4 > 0.72) G.hab[i] = 1;
  }
  FAC.forEach((F, fi) => {
    const [hx, hy] = cellOf(F.home[0], F.home[1]);
    for (let y = hy - 2; y <= hy + 2; y++)
      for (let x = hx - 2; x <= hx + 2; x++) {
        const xx = (x + EGW) % EGW;
        if (y < 0 || y >= EGH) continue;
        const i = xx + y * EGW;
        if (!M.land[i]) continue;
        const d = cheb(x, y, hx, hy);
        if (d <= 1 || random() < 0.5) {
          G.hab[i] = 1;
          if (d <= 1) G.owner[i] = fi;
        }
      }
  });
  G.legacy = LEGACY.map(([n, o, yr], i) => ({
    id: i,
    n,
    org: o,
    yr,
    x: rnd(EGW),
    y: rr(4, EGH - 6),
    spd: pick([1, 1, 2, -1]),
    r: rr(4, 6),
    tags: [],
    known: i < 2,
  }));
}
export const cellName = (x, y) => {
  const [lo, la] = lonlat(x, y);
  let b = null,
    bd = 1e9;
  for (const [n, ax, ay] of ANCH) {
    let dx = Math.abs(lo - ax);
    dx = Math.min(dx, 360 - dx);
    const d = dx * dx + (la - ay) * (la - ay) * 2;
    if (d < bd) {
      bd = d;
      b = n;
    }
  }
  return b;
};
export const ownedCells = f => {
  const o = [];
  for (let i = 0; i < EGW * EGH; i++) if (G.owner[i] === f) o.push(i);
  return o;
};
export function nbrs(i) {
  const x = i % EGW,
    y = (i / EGW) | 0,
    o = [];
  for (const [dx, dy] of D4) {
    const nx = (x + dx + EGW) % EGW,
      ny = y + dy;
    if (ny >= 0 && ny < EGH) o.push(nx + ny * EGW);
  }
  return o;
}
export function frontierCell(f) {
  const own = ownedCells(f);
  if (!own.length) return cellOf(FAC[f].home[0], FAC[f].home[1]);
  const fr = own.filter(i => nbrs(i).some(n => M.land[n] && G.owner[n] !== f));
  const i = pick(fr.length ? fr : own);
  return [i % EGW, (i / EGW) | 0];
}
function satNear(f, i, types) {
  const x = i % EGW,
    y = (i / EGW) | 0;
  return G.orbit.filter(s => s.f === f && (!types || types.includes(s.type)) && cheb(s.cx, s.cy, x, y) <= 6)
    .length;
}
export function power(f) {
  return 6 + G.fac[f].boost + G.orbit.filter(s => s.f === f).length * 3;
}
export function shares() {
  const c = [0, 0, 0, 0];
  let tot = 0;
  for (const o of G.owner)
    if (o >= 0) {
      c[o]++;
      tot++;
    }
  return { c, tot, hab: G.hab.reduce((a, b) => a + b, 0) };
}
export function isHome(f, i) {
  const [hx, hy] = cellOf(FAC[f].home[0], FAC[f].home[1]);
  return cheb(i % EGW, (i / EGW) | 0, hx, hy) <= 1;
}
export function territoryTick() {
  for (const f of shuffle([0, 1, 2, 3])) {
    const own = ownedCells(f);
    if (!own.length) continue;
    const tries = 1 + Math.floor(power(f) / 14);
    for (let k = 0; k < tries; k++) {
      const i = pick(own);
      const n = pick(nbrs(i));
      if (!M.land[n]) continue;
      if (!G.hab[n]) {
        if (satNear(f, n, ['WEATHER']) && random() < 0.12) G.hab[n] = 1;
        continue;
      }
      const o = G.owner[n];
      if (o < 0) {
        if (random() < 0.3 + satNear(f, n) * 0.06) G.owner[n] = f;
      } else if (o !== f && isRival(f, o) && !isHome(o, n)) {
        const atk = power(f) + satNear(f, n, ['RECON', 'COMMS']) * 6 + rnd(14),
          def = power(o) + satNear(o, n, ['RECON', 'COMMS']) * 6 + rnd(14) + 6;
        if (atk > def) G.owner[n] = f;
      }
    }
    G.fac[f].boost *= 0.97;
  }
  let healed = 0;
  for (let k = 0; k < 40; k++) {
    const i = rnd(EGW * EGH);
    if (!M.land[i] || G.hab[i]) continue;
    const [, la] = lonlat(i % EGW, (i / EGW) | 0);
    if (la < -62) continue;
    const nb = nbrs(i).some(n => G.hab[n] || G.owner[n] >= 0);
    if (!nb) continue;
    const w = FAC.some((F, f) => satNear(f, i, ['WEATHER']));
    if (random() < (w ? 0.35 : 0.08)) {
      G.hab[i] = 1;
      healed++;
    }
  }
  if (healed >= 3 && random() < 0.3)
    log('Surface report: the dead zones are shrinking. Grass where there was glass.', 'info');
}
export function legacyTick() {
  for (const L of G.legacy) {
    L.x = (L.x + L.spd + EGW) % EGW;
    const hits = [];
    for (let i = 0; i < EGW * EGH; i++) {
      const o = G.owner[i];
      if (o < 0 || L.tags.includes(o) || isHome(o, i)) continue;
      const x = i % EGW,
        y = (i / EGW) | 0;
      let dx = Math.abs(x - L.x);
      dx = Math.min(dx, EGW - dx);
      if (Math.max(dx, Math.abs(y - L.y)) <= L.r) hits.push(i);
    }
    if (hits.length && random() < 0.3) {
      const i = pick(hits),
        o = G.owner[i];
      G.owner[i] = -1;
      if (random() < 0.3) G.hab[i] = 0;
      emit('strike', { x: i % EGW, y: (i / EGW) | 0 });
      if (L.known)
        log(`${L.n} strikes a ${FAC[o].sh} settlement in ${cellName(i % EGW, (i / EGW) | 0)}.`, 'warn');
    }
    for (const s of G.orbit.slice()) {
      if (L.tags.includes(s.f)) continue;
      let dx = Math.abs(s.cx - L.x);
      dx = Math.min(dx, EGW - dx);
      if (Math.max(dx, Math.abs(s.cy - L.y)) <= L.r && random() < 0.07) {
        G.orbit = G.orbit.filter(o => o !== s);
        G.stat.lost++;
        log(
          `${L.known ? L.n : 'An unidentified legacy satellite'} shot down a ${FAC[s.f].sh} ${s.type} satellite.`,
          'bad',
        );
      }
    }
  }
}
