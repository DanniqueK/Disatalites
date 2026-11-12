import { OPQ, T, WALK, WH, WW } from '../core/constants.js';
import { G, M, P } from '../core/state.js';
import { D8, idx, inB } from '../core/util.js';

const opaque = (x, y) => OPQ.has(M.map[idx(x, y)]);
export function fov() {
  const v = M.vis;
  v.fill(0);
  const R = 12;
  v[idx(P.x, P.y)] = 1;
  G.seen[idx(P.x, P.y)] = 1;
  const ray = (tx, ty) => {
    const dx = tx - P.x,
      dy = ty - P.y,
      n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let k = 1; k <= n; k++) {
      const x = Math.round(P.x + (dx * k) / n),
        y = Math.round(P.y + (dy * k) / n);
      if (!inB(x, y)) break;
      const a = x - P.x,
        b = y - P.y;
      if (a * a + b * b > R * R + R) break;
      const i = idx(x, y);
      v[i] = 1;
      G.seen[i] = 1;
      if (opaque(x, y)) break;
    }
  };
  for (let i = -R; i <= R; i++) {
    ray(P.x + i, P.y - R);
    ray(P.x + i, P.y + R);
    ray(P.x - R, P.y + i);
    ray(P.x + R, P.y + i);
  }
}
export function los(x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 1; k < n; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / n),
      y = Math.round(y0 + ((y1 - y0) * k) / n);
    if (opaque(x, y) || M.map[idx(x, y)] === T.MACH) return false;
  }
  return true;
}
export function bfsInt(sx, sy) {
  const d = new Int16Array(WW * WH).fill(-1);
  const q = [idx(sx, sy)];
  d[q[0]] = 0;
  let h = 0;
  while (h < q.length) {
    const i = q[h++];
    const x = i % WW,
      y = (i / WW) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!inB(nx, ny)) continue;
      const j = idx(nx, ny);
      if (d[j] >= 0 || !WALK.has(M.map[j])) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  return d;
}
export function intNext(sx, sy, goal) {
  if (goal(sx, sy)) return null;
  const prev = new Int32Array(WW * WH).fill(-1);
  const s = idx(sx, sy);
  prev[s] = s;
  const q = [s];
  let h = 0;
  while (h < q.length) {
    const i = q[h++];
    const x = i % WW,
      y = (i / WW) | 0;
    if (goal(x, y)) {
      let j = i;
      while (prev[j] !== s) j = prev[j];
      return [j % WW, (j / WW) | 0];
    }
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!inB(nx, ny)) continue;
      const k = idx(nx, ny);
      if (prev[k] >= 0 || !WALK.has(M.map[k])) continue;
      prev[k] = i;
      q.push(k);
    }
  }
  return null;
}
export function pressureAt(x, y) {
  const r = M.room[idx(x, y)];
  if (r >= 0 && G.mods[r]) return G.mods[r].pressure;
  return 0;
}
export const modAtP = () => G.mods[M.room[idx(P.x, P.y)]];
