import { ROOM_SIZE } from '../core/data.js';

/**
 * A walled rectangle of `fw` x `fh` floor tiles with ports (doors) at the given wall cells.
 * @param {number} fw
 * @param {number} fh
 * @param {[x: number, y: number, dx: number, dy: number][]} ports in shape coordinates (walls included)
 * @param {string} kind
 */
function walledRect(fw, fh, ports, kind) {
  const w = fw + 2,
    h = fh + 2;
  const g = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.';
    g.push(row);
  }
  for (const [x, y] of ports) g[y] = g[y].slice(0, x) + 'P' + g[y].slice(x + 1);
  return { w, h, g, ports: ports.map(([x, y, dx, dy]) => ({ x, y, dx, dy })), kind };
}

/**
 * A standard room: a rectangle with one door centred on each long side (front and back).
 * @param {'S' | 'M' | 'L'} size
 */
export function roomShape(size) {
  const [fw, fh] = ROOM_SIZE[size];
  const w = fw + 2,
    h = fh + 2,
    mx = w >> 1;
  return walledRect(
    fw,
    fh,
    [
      [mx, 0, 0, -1],
      [mx, h - 1, 0, 1],
    ],
    'room_' + size,
  );
}

/**
 * Corridor pieces, three tiles wide. A `hall` runs seven tiles with a door at each end and one room
 * door centred on each side; a `hub` is a 3x3 junction with a door on every side.
 * @param {'hall' | 'hub'} kind
 */
export function hallShape(kind) {
  if (kind === 'hub')
    return walledRect(
      3,
      3,
      [
        [2, 0, 0, -1],
        [0, 2, -1, 0],
        [4, 2, 1, 0],
        [2, 4, 0, 1],
      ],
      'hub',
    );
  return walledRect(
    7,
    3,
    [
      [0, 2, -1, 0],
      [8, 2, 1, 0],
      [4, 0, 0, -1],
      [4, 4, 0, 1],
    ],
    'hall',
  );
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
