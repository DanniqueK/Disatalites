import { D4, D8, rr, shuffle } from '../core/util.js';

export function genShape(kind) {
  for (let tries = 0; tries < 60; tries++) {
    const S = 28,
      fl = new Uint8Array(S * S);
    const set = (x, y) => {
      if (x > 1 && y > 1 && x < S - 2 && y < S - 2) fl[x + y * S] = 1;
    };
    const unset = (x, y) => {
      if (x >= 0 && y >= 0 && x < S && y < S) fl[x + y * S] = 0;
    };
    const rect = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y);
    };
    switch (kind) {
      case 'rect':
        rect(3, 3, rr(4, 7), rr(3, 5));
        break;
      case 'tube':
        rect(3, 3, rr(6, 10), 3);
        break;
      case 'truss':
        rect(3, 3, rr(4, 8), 1);
        break;
      case 'L': {
        const w = rr(5, 7),
          h = rr(2, 3);
        rect(3, 3, w, h);
        rect(3, 3 + h, rr(2, 3), rr(2, 4));
        break;
      }
      case 'plus': {
        const a = rr(1, 3);
        rect(3 + a, 3, 3, 3 + 2 * a);
        rect(3, 3 + a, 3 + 2 * a, 3);
        if (Math.random() < 0.4) rect(3 + a - 1, 3 + a - 1, 5, 5);
        break;
      }
      case 'oct': {
        const w = rr(5, 8),
          h = rr(5, 6);
        rect(3, 3, w, h);
        for (const [cx, cy, sx, sy] of [
          [3, 3, 1, 1],
          [3 + w - 1, 3, -1, 1],
          [3, 3 + h - 1, 1, -1],
          [3 + w - 1, 3 + h - 1, -1, -1],
        ]) {
          unset(cx, cy);
          unset(cx + sx, cy);
          unset(cx, cy + sy);
        }
        break;
      }
      case 'round': {
        const r = rr(2, 3),
          c = 3 + r;
        for (let y = 3; y <= c + r; y++)
          for (let x = 3; x <= c + r; x++) {
            const dx = x - c,
              dy = y - c;
            if (dx * dx + dy * dy <= r * r + r * 0.6) set(x, y);
          }
        break;
      }
      case 'blob': {
        let px = 6,
          py = 6,
          pw = rr(3, 5),
          ph = rr(3, 4);
        rect(px, py, pw, ph);
        const n = rr(1, 2);
        for (let k = 0; k < n; k++) {
          const w = rr(3, 5),
            h = rr(3, 4);
          const nx = px + rr(-w + 2, pw - 2),
            ny = py + rr(-h + 2, ph - 2);
          rect(nx, ny, w, h);
          px = nx;
          py = ny;
          pw = w;
          ph = h;
        }
        break;
      }
    }
    // bounds
    let x0 = S,
      y0 = S,
      x1 = -1,
      y1 = -1,
      cnt = 0;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++)
        if (fl[x + y * S]) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
          cnt++;
        }
    if (!cnt) continue;
    // connectivity
    {
      const st = [];
      let f = -1;
      for (let i = 0; i < S * S; i++)
        if (fl[i]) {
          f = i;
          break;
        }
      const seen = new Uint8Array(S * S);
      st.push(f);
      seen[f] = 1;
      let c = 0;
      while (st.length) {
        const i = st.pop();
        c++;
        const x = i % S,
          y = (i / S) | 0;
        for (const [dx, dy] of D4) {
          const j = x + dx + (y + dy) * S;
          if (fl[j] && !seen[j]) {
            seen[j] = 1;
            st.push(j);
          }
        }
      }
      if (c !== cnt) continue;
    }
    const w = x1 - x0 + 3,
      h = y1 - y0 + 3;
    const g = [];
    for (let y = 0; y < h; y++) {
      let row = [];
      for (let x = 0; x < w; x++) {
        const sx = x + x0 - 1,
          sy = y + y0 - 1;
        row.push(fl[sx + sy * S] ? '.' : ' ');
      }
      g.push(row);
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (g[y][x] !== ' ') continue;
        let n = false;
        for (const [dx, dy] of D8) {
          const a = x + dx,
            b = y + dy;
          if (a >= 0 && b >= 0 && a < w && b < h && g[b][a] === '.') {
            n = true;
            break;
          }
        }
        if (n) g[y][x] = '#';
      }
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? g[y][x] : ' ');
    const cands = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (g[y][x] !== '#') continue;
        for (const [dx, dy] of D4) {
          if (
            at(x - dx, y - dy) === '.' &&
            at(x + dx, y + dy) === ' ' &&
            at(x + dy, y + dx) === '#' &&
            at(x - dy, y - dx) === '#'
          ) {
            cands.push({ x, y, dx, dy });
            break;
          }
        }
      }
    if (cands.length < 2) continue;
    const want = kind === 'truss' ? 2 : rr(2, 4);
    const ports = [];
    shuffle(cands);
    if (kind === 'truss') {
      const ends = cands.filter(c => c.dx !== 0);
      if (ends.length >= 2) ports.push(ends[0], ends[1]);
    }
    for (const c of cands) {
      if (ports.length >= want) break;
      if (
        ports.some(
          p =>
            Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < 4 ||
            (p.dx === c.dx &&
              p.dy === c.dy &&
              ports.length < 2 &&
              cands.some(q => q.dx !== c.dx || q.dy !== c.dy)),
        )
      )
        continue;
      ports.push(c);
    }
    if (ports.length < 2) continue;
    for (const p of ports) g[p.y][p.x] = 'P';
    return {
      w,
      h,
      g: g.map(r => r.join('')),
      ports: ports.map(p => ({ x: p.x, y: p.y, dx: p.dx, dy: p.dy })),
      kind,
    };
  }
  return genShape('rect');
}
export function rotDims(sh, rot) {
  return rot % 2 ? [sh.h, sh.w] : [sh.w, sh.h];
}
export function rotP(x, y, rot, w, h) {
  switch (rot) {
    case 0:
      return [x, y];
    case 1:
      return [h - 1 - y, x];
    case 2:
      return [w - 1 - x, h - 1 - y];
    default:
      return [y, w - 1 - x];
  }
}
export function rotD(dx, dy, rot) {
  for (let i = 0; i < rot; i++) {
    const t = dx;
    dx = -dy;
    dy = t;
  }
  return [dx, dy];
}
export function toWorld(m, lx, ly) {
  const [rx, ry] = rotP(lx, ly, m.rot, m.shape.w, m.shape.h);
  return [m.ox + rx, m.oy + ry];
}
export function toLocal(m, wx, wy) {
  const [rw, rh] = rotDims(m.shape, m.rot);
  return rotP(wx - m.ox, wy - m.oy, (4 - m.rot) % 4, rw, rh);
}
export function cloneShape(sh) {
  return {
    kind: sh.kind,
    w: sh.w,
    h: sh.h,
    g: sh.g.map(r => (typeof r === 'string' ? r : r.join(''))),
    ports: sh.ports.map(p => ({ ...p })),
  };
}
export function setCell(sh, x, y, c) {
  const r = sh.g[y];
  sh.g[y] = typeof r === 'string' ? r.substring(0, x) + c + r.substring(x + 1) : ((r[x] = c), r);
}
export function portWorld(m, pi) {
  const p = m.shape.ports[pi];
  const [x, y] = toWorld(m, p.x, p.y);
  const [dx, dy] = rotD(p.dx, p.dy, m.rot);
  return { x, y, dx, dy };
}
export function shapeFloors(sh) {
  const o = [];
  for (let y = 0; y < sh.h; y++) for (let x = 0; x < sh.w; x++) if (sh.g[y][x] === '.') o.push([x, y]);
  return o;
}
