import { T, WALK, WH, WW } from '../core/constants.js';
import {
  AILINES,
  AIN,
  altOf,
  bandOf,
  BR,
  BRANDS,
  CHAT,
  CREWN,
  CREWS,
  FAC,
  hasAI,
  hasCrew,
  HK,
  MD,
  OC,
  OG,
  PERK,
  RC,
  RINGS,
  ROLE,
  SEC_T,
  stById,
  STN,
  TAGK,
} from '../core/data.js';
import { emit } from '../core/events.js';
import { log, queueModal } from '../core/messages.js';
import { random } from '../core/rng.js';
import { G, M, P, V } from '../core/state.js';
import { cheb, clamp, D8, idx, inB, pick, pickW, rnd, rr, shuffle } from '../core/util.js';
import { killDrone } from '../sim/exterior-tick.js';
import { occupied } from '../sim/stats.js';
import { endTurn, refresh } from '../sim/turn.js';
import { addRogue, objById, randSpace, removeObj, stationBox } from './exterior-objects.js';
import { addBreachMod, derFits, nearestVoid, removeBreach } from '../world/build.js';
import { pressureAt } from '../world/fov.js';
import { addStock, commsOnline, hasOnline, online } from '../world/machines.js';
import { fillDerelict, makePack } from '../world/packs.js';

export const HULL = 999;
export const SEC = id => (id === HULL ? G.sectors[G.home] : G.sectors[id]);
export const where = id =>
  id === HULL ? 'the hull' : id === G.home ? 'local space' : secName(G.sectors[id]);
export const LC = () => [WW >> 1, WH >> 1];
export const secName = s => (!s ? 'transit' : `${RINGS[s.ring].n}-${String(s.slot + 1).padStart(2, '0')}`);
export const secCoord = s =>
  `${Math.abs(s.lon).toFixed(0)}°${s.lon < 0 ? 'W' : 'E'} · ${altOf(s.ring, s.rad).toLocaleString('en-US')} km`;
export const tagName = f => (f === TAGK ? 'KESTREL-9' : FAC[f].sh);
export function initSectors() {
  G.sectors = [];
  let id = 0;
  RINGS.forEach((b, r) => {
    const off = random() * Math.PI * 2;
    for (let k = 0; k < b.cnt; k++) {
      const ang = off + ((k + 0.5 + (random() - 0.5) * 0.5) / b.cnt) * Math.PI * 2;
      const rad = b.r0 + 1.5 + random() * (b.r1 - b.r0 - 3);
      G.sectors.push({
        id: id++,
        ring: r,
        slot: k,
        ang,
        rad,
        ox: Math.round(OC + Math.cos(ang) * rad),
        oy: Math.round(OC + Math.sin(ang) * rad),
        lon: (((ang * 180) / Math.PI + 540) % 360) - 180,
        type: 'quiet',
        known: false,
        name: '',
      });
    }
  });
  const home = pick(G.sectors.filter(s => s.ring === 1));
  home.type = 'home';
  home.known = true;
  home.name = 'KESTREL-9';
  G.home = home.id;
  const rest = shuffle(G.sectors.filter(s => s.type !== 'home'));
  rest
    .filter(s => s.ring >= 1)
    .slice(0, 6)
    .forEach(s => (s.type = 'weapon'));
  rest
    .filter(s => s.ring >= 2 && s.type === 'quiet')
    .slice(0, 3)
    .forEach(s => (s.type = 'rogueai'));
  const pool = shuffle([
    'junk',
    'junk',
    'junk',
    'junk',
    'junk',
    'station',
    'station',
    'station',
    'station',
    'station',
    'station',
    'military',
    'military',
    'military',
    'science',
    'science',
    'science',
    'graveyard',
    'graveyard',
    'graveyard',
    'quiet',
    'quiet',
  ]);
  for (const s of rest) if (s.type === 'quiet' && pool.length) s.type = pool.pop();
  const dist = (a, b) => Math.hypot(a.ox - b.ox, a.oy - b.oy);
  G.sectors
    .filter(s => s !== home && s.type !== 'rogueai')
    .sort((a, b) => dist(a, home) - dist(b, home))
    .slice(0, 4)
    .forEach((s, i) => {
      if (i === 0) s.known = true;
      else contact(s);
    });
  buildRegions();
}
export function buildRegions() {
  M.oreg = new Int16Array(OG * OG).fill(-1);
  for (let y = 0; y < OG; y++)
    for (let x = 0; x < OG; x++) {
      const dx = x + 0.5 - OC,
        dy = y + 0.5 - OC,
        r = Math.hypot(dx, dy);
      const b = bandOf(r);
      if (b < 0) continue;
      const a = Math.atan2(dy, dx);
      let best = -1,
        bd = 9;
      for (const s of G.sectors) {
        if (s.ring !== b) continue;
        let d = Math.abs(a - s.ang) % (Math.PI * 2);
        d = Math.min(d, Math.PI * 2 - d);
        if (d < bd) {
          bd = d;
          best = s.id;
        }
      }
      M.oreg[x + y * OG] = best;
    }
}
function rsp(sec, cx, cy, r) {
  for (let k = 0; k < 300; k++) {
    const x = clamp(Math.round(cx + (random() * 2 - 1) * r), 3, WW - 4),
      y = clamp(Math.round(cy + (random() * 2 - 1) * r), 3, WH - 4);
    if (G.ext.objs.some(o => o.sec === sec && cheb(o.x, o.y, x, y) < 3)) continue;
    return [x, y];
  }
  return [cx, cy];
}
function addObj(o) {
  o.id = G.nid++;
  G.ext.objs.push(o);
  return o;
}
function rectFreeHome(x, y, w, h) {
  const [cx, cy] = LC();
  return x + w < cx - 6 || x > cx + 6 || y + h < cy - 6 || y > cy + 6;
}
export function genStation(sec, kind, fns, opts) {
  opts = opts || {};
  const K = STN[kind];
  const brand = opts.brand || pick(BRANDS);
  const ring = G.sectors[sec].ring;
  const ice = clamp(opts.ice || rr(K.ice[0], K.ice[1]) + (ring === 2 ? 1 : 0), 1, 6);
  const st = {
    id: G.nid++,
    sec,
    kind,
    brand,
    ice,
    name: opts.name || `${BR[brand].cc} ${pick(K.n)}`,
    state: 'hostile',
    alert: false,
    known: false,
    hackp: 0,
    ai: { n: pick(AIN) + '-' + rr(2, 9), perk: pick(Object.keys(PERK)) },
  };
  G.stations.push(st);
  const home = sec === G.home;
  const [cx, cy] = opts.at || [WW >> 1, WH >> 1];
  const rects = [];
  const fl = fns || shuffle(K.fns.slice()).slice(0, rr(2, 4));
  for (const fn of fl) {
    const pk = fillDerelict(makePack(fn, brand, { fill: 'station', kind }), !!opts.calm);
    pk.pressure = rr(15, 55);
    pk.ctl = false;
    pk.haywire = random() < 0.4;
    pk.crates.forEach(c => {
      c.c.scrap += 2;
    });
    const w = pk.shape.w,
      h = pk.shape.h;
    let pos = null;
    for (let k = 0; k < 80 && !pos; k++) {
      let x, y;
      if (!rects.length) {
        x = cx - (w >> 1) + rr(-1, 1);
        y = cy - (h >> 1) + rr(-1, 1);
      } else {
        const r = pick(rects),
          side = rnd(4);
        if (side === 0) {
          x = r.x + r.w;
          y = r.y + rr(-h + 3, r.h - 3);
        } else if (side === 1) {
          x = r.x - w;
          y = r.y + rr(-h + 3, r.h - 3);
        } else if (side === 2) {
          y = r.y + r.h;
          x = r.x + rr(-w + 3, r.w - 3);
        } else {
          y = r.y - h;
          x = r.x + rr(-w + 3, r.w - 3);
        }
      }
      if (x < 3 || y < 3 || x + w > WW - 3 || y + h > WH - 3) continue;
      if (rects.some(q => x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + h > q.y)) continue;
      if (home && !rectFreeHome(x, y, w, h)) continue;
      pos = { x, y };
    }
    if (!pos) continue;
    rects.push({ x: pos.x, y: pos.y, w, h });
    addObj({
      sec,
      kind: 'der',
      x: pos.x + (w >> 1),
      y: pos.y + (h >> 1),
      pack: pk,
      tow: null,
      st: st.id,
      seen: false,
    });
  }
  if (!rects.length) {
    G.stations.pop();
    return null;
  }
  const bx0 = Math.min(...rects.map(r => r.x)),
    by0 = Math.min(...rects.map(r => r.y)),
    bx1 = Math.max(...rects.map(r => r.x + r.w)),
    by1 = Math.max(...rects.map(r => r.y + r.h));
  st.cx = (bx0 + bx1) >> 1;
  st.cy = (by0 + by1) >> 1;
  const r0 = pick(rects);
  addObj({
    sec,
    kind: 'core',
    x: r0.x + (r0.w >> 1),
    y: r0.y + (r0.h >> 1),
    hp: 40 + ice * 15,
    max: 40 + ice * 15,
    st: st.id,
    seen: false,
  });
  if (kind === 'science' && rects.length > 1) {
    const r1 = rects.find(r => r !== r0);
    addObj({ sec, kind: 'sci', x: r1.x + (r1.w >> 1), y: r1.y + (r1.h >> 1), st: st.id, seen: false });
  }
  const nt = opts.tur ?? rr(K.tur[0], K.tur[1]);
  for (let k = 0; k < nt; k++) {
    for (let t = 0; t < 60; t++) {
      const x = rr(bx0 - 3, bx1 + 2),
        y = rr(by0 - 3, by1 + 2);
      if (x >= bx0 - 1 && x <= bx1 && y >= by0 - 1 && y <= by1) continue;
      if (!inB(x, y) || (home && cheb(x, y, ...LC()) < 6)) continue;
      addObj({ sec, kind: 'turret', x, y, hp: 22 + ice * 4, r: 6, st: st.id, seen: false });
      break;
    }
  }
  return st;
}
export function addRaft(sec, x, y, n, seen) {
  if (x == null) {
    [x, y] = sec === G.home ? randSpace(8, 30) : [rr(8, WW - 9), rr(8, WH - 9)];
  }
  return addObj({ sec, kind: 'raft', x, y, n: n || rr(1, 2), seen: !!seen });
}
export function genSectors() {
  const wp = G.sectors.filter(s => s.type === 'weapon');
  G.legacy.forEach((L, i) => {
    const s = wp[i % wp.length];
    L.sec = s.id;
    if (s.known) L.known = true;
  });
  const cx = Math.floor(WW / 2),
    cy = Math.floor(WH / 2);
  const adj = shuffle(
    G.sectors.filter(s => s.known && s.id !== G.home && s.type !== 'weapon' && s.type !== 'rogueai'),
  );
  if (adj[0]) {
    adj[0].type = 'station';
    adj[0].comms = true;
  }
  for (const s of G.sectors) {
    const id = s.id;
    const deb = (n, r, rich) => {
      for (let k = 0; k < n; k++) {
        const [x, y] = rsp(id, cx, cy, r);
        addObj({
          sec: id,
          kind: 'debris',
          x,
          y,
          res: {
            scrap: rr(6, 14) * (rich ? 2 : 1),
            circ: rr(2, 6) * (rich ? 2 : 1),
            rat: random() < 0.3 ? rr(1, 3) : 0,
          },
          seen: false,
        });
      }
    };
    if (id === G.home) {
      const [x, y] = randSpace(17, 24);
      const st = genStation(id, 'civil', ['hydro', 'cargo', 'solar'], {
        ice: 1,
        tur: 1,
        at: [x, y],
        calm: true,
      });
      if (st) {
        st.name = `${BR[st.brand].cc} supply depot`;
      }
      const [wx, wy] = randSpace(12, 22);
      addObj({ sec: id, kind: 'wreck', x: wx, y: wy, dt: 'util', seen: false });
      continue;
    }
    if (s.type === 'junk') {
      s.name = 'Junk field';
      deb(rr(10, 15), 34);
      for (let k = 0; k < rr(1, 2); k++) {
        const [x, y] = rsp(id, cx, cy, 30);
        addObj({ sec: id, kind: 'wreck', x, y, dt: pick(['util', 'tug', 'guard']), seen: false });
      }
      const n = rr(3, 5),
        [sx, sy] = rsp(id, cx, cy, 25);
      for (let k = 0; k < n; k++)
        addObj({
          sec: id,
          kind: 'rogue',
          x: clamp(sx + rr(-3, 3), 2, WW - 3),
          y: clamp(sy + rr(-3, 3), 2, WH - 3),
          hp: 14,
          tag: 'swarm',
          seen: false,
        });
      if (random() < 0.35) addRaft(id);
    }
    if (s.type === 'station') {
      const st = s.comms
        ? genStation(id, 'civil', ['comms', 'solar', 'hab'], { ice: 2, tur: 1 })
        : genStation(id, 'civil');
      s.name = st ? st.name : 'Foreign station';
      deb(3, 30);
      if (random() < 0.2) addRaft(id);
    }
    if (s.type === 'military') {
      const st = genStation(id, 'military');
      s.name = st ? st.name : 'Military station';
      deb(4, 30, true);
    }
    if (s.type === 'rogueai') {
      const st = genStation(id, 'rogue');
      if (st) {
        st.mad = true;
        st.alert = true;
        st.name = `${pick(AIN)} "${pick(['THE CHOIR', 'SAINT OF RUST', 'MOTHER ENGINE', 'THE GARDENER', 'HYMNAL', 'THE LISTENER'])}"`;
        s.name = st.name;
      }
      deb(5, 30, true);
      for (let k = 0; k < 3; k++) {
        const [x, y] = rsp(id, cx, cy, 20);
        addObj({ sec: id, kind: 'rogue', x, y, hp: 26, tag: 'hunter', seen: false, born: 1e9 });
      }
    }
    if (s.type === 'science') {
      const st = genStation(id, 'science');
      s.name = st ? st.name : 'Science station';
      deb(3, 26);
    }
    if (s.type === 'weapon') {
      const L = G.legacy.find(L => L.sec === id);
      s.name = L ? L.n : 'Weapon platform';
      addObj({ sec: id, kind: 'platform', x: cx, y: cy, lid: L ? L.id : 0, r: 14 });
      deb(rr(7, 10), 12, true);
    }
    if (s.type === 'graveyard') {
      s.name = 'Drone graveyard';
      for (let k = 0; k < rr(4, 6); k++) {
        const [x, y] = rsp(id, cx, cy, 30);
        addObj({
          sec: id,
          kind: 'wreck',
          x,
          y,
          dt: pickW(['util', 'tug', 'guard'], q => ({ util: 3, tug: 2, guard: 2 })[q]),
          seen: false,
        });
      }
      deb(5, 30);
      for (let k = 0; k < rr(2, 3); k++) {
        const [x, y] = rsp(id, cx, cy, 28);
        addObj({ sec: id, kind: 'null', x, y, seen: false });
      }
    }
    if (s.type === 'quiet') {
      s.name = 'Quiet orbit';
      deb(3, 30);
      if (random() < 0.4) addRaft(id);
    }
  }
}
export function hackInit(st) {
  if (st.hk) return;
  const L = [];
  for (let k = 0; k < st.ice; k++) {
    const kd = pick(['AUTH', 'FIREWALL', 'WATCHDOG', 'ICE']);
    const hp = { AUTH: rr(4, 6), FIREWALL: rr(8, 12), WATCHDOG: rr(5, 7), ICE: rr(6, 9) }[kd];
    L.push({ k: kd, hp, max: hp, known: false });
  }
  const ch = 6 + st.ice * 2 + (st.mad ? 4 : 0);
  L.push({ k: 'CORE', hp: ch, max: ch, known: true });
  st.hk = {
    L,
    i: 0,
    trace: st.alert ? 30 : 0,
    probed: false,
    lines: ['> link up. ' + st.name.toUpperCase()],
  };
}
function hkLine(st, t) {
  st.hk.lines.push('> ' + t);
  if (st.hk.lines.length > 6) st.hk.lines.shift();
}
function hkTrace(st, n) {
  const k = n > 0 && hasCrew('hacker') ? 0.7 : 1;
  st.hk.trace = clamp(st.hk.trace + n * k, 0, 100);
}
export function hackTurn(d, st, t) {
  const H = st.hk;
  if (!H) return;
  const cur = H.L[H.i];
  let cmd = t.cmd;
  t.cmd = null;
  if (!cmd && t.auto) cmd = H.trace > 65 ? 'dark' : !cur.known && H.trace < 30 ? 'probe' : 'brute';
  const dmg = n => {
    cur.hp -= n + (hasAI('cipher') ? 1 : 0);
  };
  if (cmd === 'probe') {
    cur.known = true;
    H.probed = true;
    hkTrace(st, 3);
    hkLine(st, `probe: layer ${H.i + 1} is ${HK[cur.k].n}. ${HK[cur.k].d}`);
  } else if (cmd === 'spoof') {
    if (G.stock.circ < 1) {
      hkLine(st, 'spoof: no circuits to forge a token');
    } else {
      G.stock.circ--;
      if (cur.k === 'AUTH') {
        cur.hp = 0;
        hkLine(st, 'spoof: handshake accepted. gate open.');
      } else {
        dmg(1);
        hkTrace(st, 6);
        hkLine(st, `spoof: ${cur.known ? HK[cur.k].n : 'layer'} does not care about handshakes. trace up.`);
      }
    }
  } else if (cmd === 'brute') {
    let n = rr(2, 4);
    if (cur.k === 'FIREWALL') n = Math.ceil(n / 2);
    if (H.probed) n *= 2;
    H.probed = false;
    dmg(n);
    hkTrace(st, cur.k === 'WATCHDOG' ? 12 : 8);
    if (cur.k === 'ICE') {
      d.hp -= 3;
      hkLine(st, `brute: -${n}. black ice bites back, ${d.name} hull -3.`);
      if (d.hp <= 0) {
        killDrone(d, 'black ice');
        return;
      }
    } else hkLine(st, `brute force: -${n}${cur.known ? '' : ' on an unknown layer'}.`);
  } else if (cmd === 'worm') {
    if (G.stock.circ < 1) hkLine(st, 'worm: no circuits to build one');
    else {
      G.stock.circ--;
      const n = cur.k === 'FIREWALL' ? 7 : 5;
      dmg(n);
      hkTrace(st, 5);
      hkLine(st, `worm injected: -${n}.`);
    }
  } else if (cmd === 'dark') {
    hkTrace(st, cur.k === 'WATCHDOG' ? -8 : -15);
    hkLine(st, 'going dark. trace falling.');
  }
  if (cur.k === 'WATCHDOG' && cmd !== 'dark') hkTrace(st, 3);
  if (cur.k === 'CORE' && st.mad && random() < 0.12) {
    hkTrace(st, 12);
    hkLine(st, '!! something on the other end reaches back up the link');
    if (H.trace >= 80 && random() < 0.5) {
      log(`${st.name} reaches back down the link. ${d.name} goes quiet, then turns on you.`, 'bad');
      G.ext.drones = G.ext.drones.filter(x => x !== d);
      if (G.sel === d.id) G.sel = G.ext.drones[0] ? G.ext.drones[0].id : null;
      addObj({ sec: d.sec, kind: 'rogue', x: d.x, y: d.y, hp: 26, tag: 'hunter', born: 1e9 });
      V.hackOpen = null;
      return;
    }
  }
  if (cur.hp <= 0) {
    hkLine(st, `layer ${H.i + 1} (${HK[cur.k].n}) down.`);
    H.i++;
    H.probed = false;
    if (H.i >= H.L.length) {
      V.hackOpen = null;
      subdueStation(st, 'hack');
      d.task = { type: 'idle' };
      return;
    }
  }
  if (H.trace >= 100) {
    st.alert = true;
    cur.hp = cur.max;
    H.trace = 40;
    d.hp -= 8;
    t.on = 0;
    d.task = { type: 'idle' };
    V.hackOpen = null;
    log(
      `${st.name}: TRACE COMPLETE. The link is burned, ${d.name} takes a power surge, and its turrets wake up.`,
      'bad',
    );
    if (d.hp <= 0) killDrone(d, 'a power surge');
  }
}
export function subdueStation(st, how) {
  st.state = 'subdued';
  st.alert = false;
  G.stat.subdued = (G.stat.subdued || 0) + 1;
  const own = G.ext.objs.filter(o => o.st === st.id);
  for (const o of own) if (o.kind === 'turret' || o.kind === 'core') removeObj(o);
  if (how === 'force') {
    let lost = 0;
    for (const o of own.filter(o => o.kind === 'der' && !['comms', 'life', 'workshop'].includes(o.pack.fn))) {
      if (random() < 0.35) {
        removeObj(o);
        lost++;
        G.ext.objs.push({
          id: G.nid++,
          sec: o.sec,
          kind: 'debris',
          x: o.x,
          y: o.y,
          res: { scrap: rr(12, 22), circ: rr(4, 9), rat: 0 },
        });
      }
    }
    log(
      `${st.name}: security core destroyed. The station is yours${lost ? ', but ' + lost + ' section' + (lost > 1 ? 's' : '') + ' broke apart in the fighting' : ''}. Its sections can now be cut free and towed.`,
      'good',
    );
  } else {
    for (const o of own) if (o.kind === 'der') o.pack.ctl = true;
    log(
      `${st.name}: security core cracked. Its systems answer to KESTREL-9 now, and its sections arrive already claimed. They can be cut free and towed.`,
      'good',
    );
    if (random() < 0.3 + st.ice * 0.06) {
      addRaft(
        st.sec,
        clamp(st.cx + rr(-6, 6), 3, WW - 4),
        clamp(st.cy + rr(5, 9), 3, WH - 4),
        rr(1, 2),
        true,
      );
      log('Its brig held prisoners. They are waiting in an escape pod for pickup.', 'info');
    }
    if (st.mad) {
      sciReward();
      addStock('circ', 10);
      addStock('scrap', 20);
      log(
        `Inside the core there is only static and one repeating phrase. You wipe it. Its archives are yours, and the hunters stop coming from here.`,
        'warn',
      );
    } else
      queueModal(
        `${st.ai.n} // ${st.name.toUpperCase()}`,
        `The station's AI is still running inside the cracked core.\n\n"${pick(AILINES)}"\n\nRecruit it: ${st.ai.n} moves into KESTREL-9's grid as a ${PERK[st.ai.perk].n} ally (${PERK[st.ai.perk].d}).\nWipe it: strip the core for a schematic, circuits and its archives.`,
        [
          {
            t: `Recruit ${st.ai.n}`,
            f: () => {
              G.allies.push({ n: st.ai.n, perk: st.ai.perk });
              log(
                `${st.ai.n} uploads itself into KESTREL-9. ${PERK[st.ai.perk].n} ally online: ${PERK[st.ai.perk].d}.`,
                'good',
              );
            },
          },
          {
            t: 'Wipe it for data',
            f: () => {
              sciReward();
              addStock('circ', 7);
              log(`${st.ai.n} goes quiet. You keep its archives.`, 'warn');
            },
          },
        ],
      );
  }
  for (const o of G.ext.objs) if (o.st === st.id) o.seen = true;
  st.known = true;
}
export function updateSight() {
  const [lcx, lcy] = LC();
  const hb = { x0: lcx - 2, x1: lcx + 2, y0: lcy - 2, y1: lcy + 2 };
  const R = 11 + (hasOnline('sensor') ? 12 : 0) + (hasAI('lantern') ? 8 : 0);
  for (const o of G.ext.objs) {
    if (o.seen !== false) continue;
    if (o.kind === 'platform') {
      if (G.sectors[o.sec].known) o.seen = true;
      continue;
    }
    const lim =
      o.kind === 'null' ? (hasAI('lantern') ? 4 : 1) : o.kind === 'raft' ? 5 : o.kind === 'der' ? 11 : 9;
    let vis = false;
    if (o.sec === G.home && o.kind !== 'null' && o.kind !== 'raft') {
      const dx = Math.max(hb.x0 - o.x, 0, o.x - hb.x1),
        dy = Math.max(hb.y0 - o.y, 0, o.y - hb.y1);
      if (Math.max(dx, dy) <= R) vis = true;
    }
    if (!vis)
      for (const d of G.ext.drones) {
        if (d.sec === o.sec && cheb(d.x, d.y, o.x, o.y) <= lim) {
          vis = true;
          break;
        }
      }
    if (!vis) continue;
    o.seen = true;
    if (o.st != null) {
      const st = stById(o.st);
      if (st && !st.known) {
        st.known = true;
        for (const q of G.ext.objs) if (q.st === st.id) q.seen = true;
        log(
          `CONTACT: ${st.name}, ${BR[st.brand].n} build. Security level ${st.ice}. Its defenses are live.`,
          'warn',
        );
      }
    } else if (o.kind === 'raft')
      log(
        'A faint distress ping: a stealth lifeboat tucked into the drift. Someone is alive in there.',
        'info',
      );
    else if (o.kind === 'null')
      log('Gravimetric anomaly: a null pocket. Anything that drifts into it does not come back.', 'warn');
    else if (o.kind === 'rogue' && o.tag === 'swarm') {
      for (const q of G.ext.objs)
        if (q.kind === 'rogue' && q.tag === 'swarm' && q.sec === o.sec) q.seen = true;
      log('A reclaimer swarm is grazing here. It will strip drones for parts.', 'warn');
    }
  }
}
function crewPath(c, goal, avoid) {
  const vac = c.role === 'engineer';
  const seen = new Int32Array(WW * WH).fill(-1);
  const s0 = idx(c.x, c.y);
  seen[s0] = s0;
  const q = [s0];
  let h = 0;
  while (h < q.length && h < 4000) {
    const i = q[h++];
    const x = i % WW,
      y = (i / WW) | 0;
    if (i !== s0 && goal(x, y)) {
      let j = i;
      while (seen[j] !== s0) j = seen[j];
      return [j % WW, (j / WW) | 0];
    }
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!inB(nx, ny)) continue;
      const k = idx(nx, ny);
      if (seen[k] >= 0 || !WALK.has(M.map[k])) continue;
      if (dx && dy && (!WALK.has(M.map[idx(x + dx, y)]) || !WALK.has(M.map[idx(x, y + dy)]))) continue;
      if (!vac && pressureAt(nx, ny) < 35 && !goal(nx, ny)) continue;
      if (avoid && (occupied(nx, ny) || G.crew.some(o => o !== c && o.x === nx && o.y === ny))) continue;
      seen[k] = i;
      q.push(k);
    }
  }
  return null;
}
function crewStep(c, goal) {
  c.head = true;
  if (goal(c.x, c.y)) {
    c.head = false;
    return true;
  }
  let n = crewPath(c, goal);
  if (!n) {
    c.fail = (c.fail || 0) + 1;
    return false;
  }
  c.fail = 0;
  const o = G.crew.find(o => o !== c && o.x === n[0] && o.y === n[1]);
  if (o && !o.duty && !o.head) {
    o.x = c.x;
    o.y = c.y;
    c.x = n[0];
    c.y = n[1];
    return goal(c.x, c.y);
  }
  if (o || occupied(n[0], n[1])) {
    c.blk = (c.blk || 0) + 1;
    if (c.blk < 3) return false;
    n = crewPath(c, goal, true);
    if (!n) return false;
  }
  c.blk = 0;
  c.x = n[0];
  c.y = n[1];
  return goal(c.x, c.y);
}
export const machAt = (x, y) => (M.mat ? M.mat.get(idx(x, y)) : null);
const nearM = (m, x, y) =>
  m.cells
    ? m.cells.some(c => cheb(c[0], c[1], x, y) <= 1) && !m.cells.some(c => c[0] === x && c[1] === y)
    : cheb(x, y, m.x, m.y) <= 1 && !(x === m.x && y === m.y);
const workAdj = m => (x, y) =>
  m.wall
    ? m.face && x === m.x + m.face[0] && y === m.y + m.face[1]
    : nearM(m, x, y) && WALK.has(M.map[idx(x, y)]);
function engTarget(c) {
  c.skip = c.skip || {};
  const sk = id => (c.skip[id] || 0) > G.turn;
  const brk = G.brk.find(
    b =>
      G.mods[b.mod] &&
      G.mods[b.mod].ctl &&
      !sk('b' + b.id) &&
      !G.crew.some(o => o !== c && o.job && o.job.b === b.id),
  );
  if (brk && G.stock.scrap >= 3) return { b: brk.id, txt: 'patching a breach' };
  const ms = G.machines
    .filter(
      m =>
        m.type !== 'mount' &&
        m.type !== 'hp' &&
        m.cond < 100 &&
        G.mods[m.mi] &&
        (G.mods[m.mi].ctl || m.type === 'node' || m.type === 'junc') &&
        !sk('m' + m.id) &&
        !G.crew.some(o => o !== c && o.job && o.job.m === m.id),
    )
    .sort((a, b) => (a.cond < 60 ? 0 : 1) - (b.cond < 60 ? 0 : 1) || a.cond - b.cond);
  const m = ms[0];
  return m && G.stock.scrap > 0 ? { m: m.id, txt: 'repairing the ' + MD[m.type].n } : null;
}
export function crewTick() {
  if (!G.crew.length) return;
  G.crewFood += 0.04 * G.crew.length;
  if (G.crewFood >= 1) {
    G.crewFood -= 1;
    if (G.stock.rat > 0) {
      G.stock.rat--;
      G.crew.forEach(c => (c.starve = 0));
    } else G.crew.forEach(c => (c.starve = (c.starve || 0) + 25));
  }
  const foes = G.ext.objs.some(o => o.kind === 'rogue' && o.sec === HULL);
  for (const c of G.crew.slice()) {
    if (c.starve > 200) {
      G.crew = G.crew.filter(x => x !== c);
      log(`${c.name} took a lifeboat and left. There was no food.`, 'bad');
      continue;
    }
    c.duty = false;
    c.at = null;
    c.head = false;
    if (c.starve > 50) {
      c.jobTxt = 'too hungry to work';
      c.job = null;
      continue;
    }
    if (c.role === 'engineer') {
      if (
        !c.job ||
        (c.job.m && !G.machines.some(m => m.id === c.job.m && m.cond < 100)) ||
        (c.job.b && !G.brk.some(b => b.id === c.job.b)) ||
        G.turn % 20 === 0
      )
        c.job = engTarget(c);
      if (!c.job) {
        c.jobTxt = 'idle: nothing to fix' + (G.stock.scrap ? '' : ' (no scrap)');
        wander(c);
        continue;
      }
      c.jobTxt = c.job.txt;
      if ((c.fail || 0) > 2) {
        c.skip[c.job.b ? 'b' + c.job.b : 'm' + c.job.m] = G.turn + 60;
        c.job = null;
        c.fail = 0;
        continue;
      }
      if (c.job.b) {
        const b = G.brk.find(b => b.id === c.job.b);
        if (crewStep(c, (x, y) => cheb(x, y, b.x, b.y) <= 1 && WALK.has(M.map[idx(x, y)]))) {
          c.duty = true;
          c.job.w = (c.job.w || 0) + 1;
          if (c.job.w >= 3 && G.stock.scrap >= 3) {
            G.stock.scrap -= 3;
            removeBreach(b);
            log(`${c.name} patched a hull breach.`, 'good');
            c.job = null;
          }
        }
      } else {
        const m = G.machines.find(m => m.id === c.job.m);
        if (m && crewStep(c, workAdj(m))) {
          c.duty = true;
          c.job.w = (c.job.w || 0) + 1;
          if (c.job.w % 3 === 0) {
            if (G.stock.scrap < 1) {
              c.job = null;
              continue;
            }
            G.stock.scrap--;
          }
          const b = m.cond;
          m.cond = Math.min(100, m.cond + 4);
          if (b < 60 && m.cond >= 60) log(`${c.name} got the ${MD[m.type].n} working again.`, 'good');
        }
      }
      continue;
    }
    const ws = ROLE[c.role].ws;
    const cand = G.machines.filter(
      m =>
        ws.includes(m.type) &&
        G.mods[m.mi] &&
        G.mods[m.mi].ctl &&
        !G.crew.some(o => o !== c && o.post === m.id),
    );
    if (c.role === 'gunner' && foes) {
      const fo = G.ext.objs.filter(o => o.kind === 'rogue' && o.sec === HULL);
      cand.sort(
        (a, b) =>
          Math.min(...fo.map(o => cheb(o.x, o.y, a.x, a.y))) -
          Math.min(...fo.map(o => cheb(o.x, o.y, b.x, b.y))),
      );
    }
    if (c.post && !cand.some(m => m.id === c.post)) c.post = null;
    if (!c.post || (c.role === 'gunner' && foes && G.turn % 10 === 0)) {
      const m = cand.find(m => m.type === 'turret') || cand[0];
      c.post = m ? m.id : null;
    }
    const m = G.machines.find(m => m.id === c.post);
    if (!m) {
      c.jobTxt = `idle: needs a ${ws.map(t => MD[t].n).join(' or ')} in a claimed section`;
      wander(c);
      continue;
    }
    if ((c.fail || 0) > 3) {
      c.post = null;
      c.fail = 0;
      c.jobTxt = `cannot reach the ${MD[m.type].n} (vacuum or blocked)`;
      wander(c);
      continue;
    }
    if (crewStep(c, workAdj(m))) {
      c.at = m.id;
      c.duty = online(m) || m.type === 'terminal';
      c.jobTxt = c.duty ? `on duty at the ${MD[m.type].n}` : `waiting: the ${MD[m.type].n} is not running`;
    } else c.jobTxt = `heading to the ${MD[m.type].n}`;
    if (random() < 1 / 500) log(`${c.name}: "${pick(CHAT[c.role])}"`, 'lore');
  }
  if (hasCrew('medic')) {
    P.hp = Math.min(P.hpMax, P.hp + 0.08);
  }
}
function wander(c) {
  if (random() < 0.3) {
    const [dx, dy] = pick(D8);
    const nx = c.x + dx,
      ny = c.y + dy;
    if (
      inB(nx, ny) &&
      M.map[idx(nx, ny)] === T.FLOOR &&
      !occupied(nx, ny) &&
      !G.crew.some(o => o !== c && o.x === nx && o.y === ny) &&
      pressureAt(nx, ny) >= 35
    ) {
      c.x = nx;
      c.y = ny;
    }
  }
}
export function allyTick() {
  if (hasAI('mender') && G.turn % 4 === 0 && G.stock.scrap > 0) {
    const m = G.machines
      .filter(m => (MD[m.type].tech || MD[m.type].gen || MD[m.type].use) && m.cond < 100)
      .sort((a, b) => a.cond - b.cond)[0];
    if (m) {
      m.cond = Math.min(100, m.cond + 3);
      if (G.turn % 12 === 0) G.stock.scrap--;
    }
  }
  if (G.allies.length && random() < 1 / 600) {
    const a = pick(G.allies);
    log(
      `${a.n}: "${pick(['Grid stable. You are welcome.', 'I rerouted three relays while you slept. You do sleep, right?', 'There is something in the lower conduits that does not show up on my sensors. Probably fine.', 'I have named the drones. Please do not tell them.', 'Another station is pinging us. Old handshake. I did not answer.'])}"`,
      'lore',
    );
  }
}
export function addCrew(n) {
  for (let i = 0; i < n; i++) {
    const c = {
      id: G.nid++,
      name: `${pick(CREWN)} ${pick(CREWS)}`,
      role: pick(Object.keys(ROLE)),
      starve: 0,
      x: P.x,
      y: P.y,
    };
    const rack = G.machines.find(k => k.type === 'rack') || G.machines[0];
    let placed = false;
    for (let r = 1; r < 8 && !placed; r++)
      for (const [dx, dy] of D8) {
        const x = rack.x + dx * r,
          y = rack.y + dy * r;
        if (inB(x, y) && M.map[idx(x, y)] === T.FLOOR && !occupied(x, y)) {
          c.x = x;
          c.y = y;
          placed = true;
          break;
        }
      }
    G.crew.push(c);
    log(`${c.name} (${ROLE[c.role].n}) joins the crew. ${ROLE[c.role].d}.`, 'good');
  }
}
export function relocateHome(to) {
  const old = G.home,
    os = G.sectors[old],
    ns = G.sectors[to];
  ns.prevType = ns.type;
  ns.type = 'home';
  os.type = os.prevType || 'quiet';
  os.name = os.name === 'KESTREL-9' ? SEC_T[os.type].n : os.name;
  G.home = to;
  const [lcx, lcy] = LC();
  for (const o of G.ext.objs.filter(o => o.sec === to)) {
    if (cheb(o.x, o.y, lcx, lcy) <= 6) {
      const [x, y] = randSpace(8, 30);
      o.x = x;
      o.y = y;
    }
  }
  if (V.sec === old) V.sec = to;
  G.move = null;
  if (!ns.known) ns.known = true;
  log(`KESTREL-9 arrives at ${secName(ns)} (${secCoord(ns)}). New neighbors, new problems.`, 'good');
}
/* ---------- sensors ---------- */
export const det = s => (s.known || s.id === G.home ? 2 : s.det || 0);
export function contact(s) {
  if (det(s)) return false;
  s.det = 1;
  const a = random() * Math.PI * 2,
    r = 1 + random() * 2.2;
  s.fz = [Math.cos(a) * r, Math.sin(a) * r];
  return true;
}
export const cid = s => 'C-' + String(((s.id * 7) % 89) + 10).padStart(2, '0');
export const SIGN = {
  home: ['-', '-'],
  junk: ['diffuse cloud of small returns', 'none, but something moves in it'],
  station: ['large structured mass', 'faint beacon'],
  military: ['large, dense mass', 'encrypted traffic'],
  science: ['large structured mass', 'narrowband telemetry'],
  rogueai: ['large mass, irregular', 'strong and patterned. It sounds almost like singing'],
  weapon: ['small, very dense', 'periodic targeting pulses'],
  graveyard: ['scattered small returns', 'none'],
  quiet: ['nothing solid', 'none'],
};
export const passR = () => 14 + (hasOnline('sensor') ? 14 : 0) + (hasAI('lantern') ? 8 : 0);
export const sweepR = () => 30 + (hasOnline('sensor') ? 22 : 0);
export const scanOK = () => hasOnline('sensor') || commsOnline();
export const sdist = (a, b) => Math.hypot(a.ox - b.ox, a.oy - b.oy);
export function sensorTick() {
  const h = G.sectors[G.home];
  if (!h) return;
  for (const st of G.stations)
    if (
      st.hk &&
      st.hk.trace > 0 &&
      !G.ext.drones.some(d => d.task.type === 'hack' && d.task.st === st.id && d.task.on)
    )
      st.hk.trace = Math.max(0, st.hk.trace - 1);
  if (G.turn % 15 === 0) {
    const R = passR();
    for (const s of G.sectors) {
      if (det(s)) continue;
      const d = sdist(s, h);
      const loud = ['rogueai', 'military', 'weapon'].includes(s.type) || s.comms;
      if ((d <= R && loud && random() < 0.3) || (d <= R * 0.5 && random() < 0.15)) {
        contact(s);
        log(`Passive sensors: new contact ${cid(s)}, ${SIGN[s.type][1]}.`, 'info');
      }
    }
  }
  for (const L of G.legacy)
    if (L.aware && L.aware > G.turn && !L.tags.includes(TAGK) && random() < 1 / 70) {
      const m = pick(G.mods.filter(m => m.ctl)) || G.mods[0];
      const mi = G.mods.indexOf(m);
      addBreachMod(mi);
      log(
        `KINETIC STRIKE: ${L.known ? L.n : 'an unidentified platform'} is still tracking us since the sweep. A slug punched through the ${m.name}.`,
        'bad',
      );
    }
  const f = G.fscan;
  if (f) {
    const s = G.sectors[f.sid];
    if (!s || det(s) >= 2 || !scanOK()) {
      if (!scanOK()) log('Focused scan dropped: no working Sensor Array or Comms Array.', 'warn');
      G.fscan = null;
      return;
    }
    f.w++;
    G.hot = (G.hot || 0) + 2;
    if (s.type === 'weapon' && random() < 0.04) {
      const L = G.legacy.find(L => L.sec === s.id);
      if (L && !L.tags.includes(TAGK) && !(L.aware > G.turn)) {
        L.aware = G.turn + 300;
        log(`${cid(s)} is painting us back. Whatever it is, it has a lock now.`, 'bad');
      }
    }
    if (s.type === 'rogueai' && random() < 0.04 && !f.heard) {
      f.heard = 1;
      hunted(s);
    }
    if (s.type === 'military' && random() < 0.03) {
      const st = G.stations.find(st => st.sec === s.id);
      if (st && !st.alert) {
        st.alert = true;
        log(`${cid(s)} noticed the scan. Its traffic goes quiet, then its turrets spin up.`, 'warn');
      }
    }
    if (f.w >= f.need) {
      G.fscan = null;
      revealSector(s, 'Focused scan');
    }
  }
}
function hunted(s) {
  const st = G.stations.find(st => st.sec === s.id && st.mad && st.state === 'hostile');
  const n = rr(2, 3);
  for (let i = 0; i < n; i++) {
    addRogue();
    const r = G.ext.objs[G.ext.objs.length - 1];
    if (r && r.kind === 'rogue') {
      r.tag = 'hunter';
      r.hp = 26;
      r.born = G.turn + 60;
    }
  }
  log(`${st ? st.name : cid(s)} heard us. ${n} hunters are coming.`, 'bad');
}
export function activeSweep() {
  if (G.bat < 8) {
    log('Not enough battery for an active sweep (needs 8).', 'warn');
    return refresh();
  }
  if ((G.timers.sweep || 0) > G.turn) {
    log(`Sweep emitters still cooling: ${G.timers.sweep - G.turn} turns.`, 'warn');
    return refresh();
  }
  G.bat -= 8;
  G.timers.sweep = G.turn + 30;
  G.hot = (G.hot || 0) + 35;
  const h = G.sectors[G.home],
    R = sweepR();
  let n = 0,
    woke = 0;
  for (const s of G.sectors) {
    if (s.id === G.home || sdist(s, h) > R) continue;
    if (contact(s)) n++;
    if (s.type === 'weapon') {
      const L = G.legacy.find(L => L.sec === s.id);
      if (L && !L.tags.includes(TAGK) && random() < 0.5) {
        L.aware = G.turn + 300;
        woke++;
      }
    }
    if (s.type === 'rogueai' && random() < 0.6) hunted(s);
  }
  emit('sweep', { R });
  log(
    `ACTIVE SWEEP: ${n} new contact${n === 1 ? '' : 's'}. Everything in ${Math.round(R * 1400)} km just heard us.${woke ? ` ${woke} dormant platform${woke > 1 ? 's' : ''} lit up a targeting radar.` : ''}`,
    n ? 'good' : 'info',
  );
  endTurn();
}
export function startFocus(s) {
  if (!scanOK()) return;
  const h = G.sectors[G.home];
  G.fscan = { sid: s.id, w: 0, need: Math.round(8 + sdist(s, h) / 5) };
  log(`Focused scan on ${cid(s)}: ${G.fscan.need} turns of steady emission.`, 'info');
  refresh();
}
export function revealSector(s, by) {
  if (s.known) return;
  s.known = true;
  if (s.type === 'weapon') {
    const L = G.legacy.find(L => L.sec === s.id);
    if (L) L.known = true;
  }
  log(
    `${by}: ${secName(s)} (${secCoord(s)}) is a ${SEC_T[s.type].n.toLowerCase()}${s.name && s.name !== SEC_T[s.type].n ? ': ' + s.name : ''}.`,
    'info',
  );
}
export function travelTime(a, b) {
  if (a === HULL && b === HULL) return 0;
  const ea = Number(a === HULL) + Number(b === HULL);
  const ra = a === HULL ? G.home : a,
    rb = b === HULL ? G.home : b;
  if (ra === rb) return 2;
  const A = G.sectors[ra],
    B = G.sectors[rb];
  return Math.round(10 + Math.hypot(A.ox - B.ox, A.oy - B.oy) * 1.6) + ea * 2;
}
export function startTransfer(d, to, carry) {
  if (d.sec === to || d.sec < 0) return;
  let eta = travelTime(d.sec, to) * (carry ? (d.dt === 'tug' ? 2 : 3) : 1);
  if (G.thrust) eta /= 1.5;
  if (hasCrew('pilot')) eta *= 0.8;
  eta = Math.ceil(eta);
  d.tr = { from: d.sec, to, eta, total: eta, carry: carry ? carry.id : null };
  if (carry) carry.sec = -1;
  log(
    `${d.name} ${to === HULL || (d.sec === HULL && to === G.home) ? 'heads for' : 'burns for'} ${where(to)}${carry ? ' with the ' + carry.pack.name + ' in tow' : ''}. ETA ${eta} turns.`,
  );
  d.sec = -1;
}
export function arriveSector(d) {
  const to = d.tr.to,
    from = d.tr.from,
    carry = d.tr.carry;
  d.tr = null;
  d.sec = to;
  let x, y;
  if (to === HULL) {
    const b = stationBox();
    const a = random() * Math.PI * 2;
    const r = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 10;
    const p = nearestVoid(
      clamp(Math.round(b.cx + Math.cos(a) * r), 2, WW - 3),
      clamp(Math.round(b.cy + Math.sin(a) * r), 2, WH - 3),
    ) || [2, 2];
    x = p[0];
    y = p[1];
  } else if (to === G.home && from === HULL) {
    const [cx, cy] = LC();
    x = cx + rr(-3, 3);
    y = cy + (random() < 0.5 ? -4 : 4);
  } else {
    const side = rnd(4);
    if (side === 0) {
      x = 2;
      y = rr(5, WH - 6);
    } else if (side === 1) {
      x = WW - 3;
      y = rr(5, WH - 6);
    } else if (side === 2) {
      x = rr(5, WW - 6);
      y = 2;
    } else {
      x = rr(5, WW - 6);
      y = WH - 3;
    }
  }
  d.x = x;
  d.y = y;
  const s = SEC(to);
  if (to !== HULL && to !== G.home) G.stat.expeditions = (G.stat.expeditions || 0) + 1;
  if (carry) {
    const o = objById(carry);
    if (o) {
      o.sec = to;
      o.x = clamp(x + (x < 10 ? 4 : x > WW - 10 ? -4 : 0), 3, WW - 4);
      o.y = clamp(y + (y < 10 ? 3 : y > WH - 10 ? -3 : 0), 3, WH - 4);
      if (to === HULL) {
        const p = nearestVoid(o.x, o.y, (a, b) => derFits(o, a, b));
        if (p) {
          o.x = p[0];
          o.y = p[1];
        }
      }
    }
  }
  if (to === HULL || (to === G.home && from === HULL)) return;
  if (!s.known) revealSector(s, d.name);
  else log(`${d.name} arrives at ${where(to)}${to === G.home ? '' : ': ' + s.name}.`);
}
export const locked = o => {
  if (!o) return false;
  if (o.st != null) {
    const st = stById(o.st);
    return !!st && st.state === 'hostile';
  }
  return o.grp != null && G.ext.objs.some(t => t.kind === 'turret' && t.grp === o.grp && t.hp > 0);
};
export function sciReward() {
  const pool = ['welder', 'nano', 'slot', 'thrust', 'drone_guard'].filter(k => !G.bp[k]);
  addStock('circ', 8);
  if (pool.length) {
    const k = pick(pool);
    G.bp[k] = 1;
    log(`Research data decrypted: schematic for ${RC[k].n}. +8 circuits.`, 'good');
  } else log('Research data decrypted: +8 circuits, nothing new.', 'good');
  log(
    'DATA CORE: ' +
      pick([
        'Last entry: "Beacon still says the ground is hot. Staying up here."',
        'Experiment log: soil cultures survive 40% longer under filtered WEATHER-band data.',
        'Crew note: the old platforms never retired. They just kept their target lists.',
        'Telescope cache: 112 objects in GEO still transmitting IFF challenges.',
      ]),
    'lore',
  );
}
