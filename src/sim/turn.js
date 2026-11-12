import { T } from '../core/constants.js';
import { EN, hasAI, MD, mk, OBJ, RC } from '../core/data.js';
import { emit } from '../core/events.js';
import { cmb, log } from '../core/messages.js';
import { random } from '../core/rng.js';
import { save } from '../core/save.js';
import { G, M, P, V } from '../core/state.js';
import { cheb, clamp, D8, idx, inB, pick, roll } from '../core/util.js';
import { earthTick, firstContact } from './earth-tick.js';
import { ECLIPSE_WARNING, sunState } from './eclipse.js';
import { playerDied } from './end.js';
import { atHatch, extTick } from './exterior-tick.js';
import { addFx, hurtPlayer, occupied, stats } from './stats.js';
import { directorTick } from './storyteller.js';
import { watchTick } from './watch.js';
import { allyTick, crewTick, HULL } from '../space/sectors.js';
import { modIndex, removeBreach } from '../world/build.js';
import { bfsInt, fov, intNext, los, pressureAt } from '../world/fov.js';
import { addStock, commsOnline, ctlOK, dropNear, online } from '../world/machines.js';

export function endTurn(quiet) {
  G.turn++;
  powerTick();
  atmoTick();
  needsTick();
  machineTick();
  botTick();
  crewTick();
  allyTick();
  hostileTick();
  extTick();
  watchTick();
  directorTick();
  earthTick();
  objTick();
  fov();
  if (P.hp <= 0) playerDied();
  if (!quiet) refresh();
  if (G.turn % 20 === 0) save();
}
export function waitN(n) {
  if (!canAct()) return;
  G.intr = false;
  for (let i = 0; i < n; i++) {
    endTurn(true);
    if (G.over || G.intr || V.modalOpen || V.modalQ.length) break;
  }
  refresh();
}
export function refresh() {
  emit('changed');
}
export function gridTick() {
  const jOK = G.mods.map(() => true);
  for (const k of G.machines) if (k.type === 'junc' && k.mi != null && k.cond < 60) jOK[k.mi] = false;
  const src = G.mods.map((m, mi) => mi === 0);
  for (const k of G.machines)
    if ((MD[k.type].gen || MD[k.type].bat) && k.mi != null && k.cond >= 60) src[k.mi] = true;
  const on = G.mods.map(() => false),
    st = [];
  G.mods.forEach((m, mi) => {
    if (src[mi] && jOK[mi]) {
      on[mi] = true;
      st.push(mi);
    }
  });
  while (st.length) {
    const mi = st.pop();
    for (const l of Object.values(G.mods[mi].links)) {
      const o = modIndex(l.mod);
      if (o >= 0 && !on[o] && jOK[o]) {
        on[o] = true;
        st.push(o);
      }
    }
  }
  G.mods.forEach((m, mi) => {
    if (m.onGrid !== undefined && m.onGrid && !on[mi] && m.ctl)
      log(
        `${m.name} dropped off the power bus. ${jOK[mi] ? 'A junction box between it and the generators is down.' : 'Its junction box failed.'}`,
        'warn',
      );
    m.onGrid = on[mi];
    m.jOK = jOK[mi];
  });
}
export const onGrid = m => {
  const md = G.mods[m.mi];
  return !md || md.onGrid !== false;
};
export function powerTick() {
  gridTick();
  let gen = G.allies.filter(a => a.perk === 'grid').length * 5,
    cap = 30;
  const sun = sunState();
  let solar = 0;
  for (const m of G.machines) {
    const d = MD[m.type];
    const ok = m.cond >= 60 && m.on && ctlOK(m) && onGrid(m);
    if (d.gen && ok && m.type === 'solar') solar++;
    if (d.gen && ok && !(m.type === 'solar' && sun.inShadow)) gen += d.gen;
    if (d.bat && ok) cap += d.bat;
    m.powered = !d.use || (d.busyUse && !m.busy);
  }
  const cons = G.machines
    .filter(m => {
      const d = MD[m.type];
      return d.use && m.cond >= 60 && m.on && ctlOK(m) && onGrid(m) && (!d.busyUse || m.busy);
    })
    .sort((a, b) => MD[a.type].pri - MD[b.type].pri);
  let sup = gen,
    dem = 0;
  for (const m of cons) {
    const u = MD[m.type].use;
    dem += u;
    if (sup >= u) {
      sup -= u;
      m.powered = true;
    } else if (G.bat >= u - sup) {
      G.bat -= u - sup;
      sup = 0;
      m.powered = true;
    } else {
      m.powered = false;
      if (m.wasP && G.turn - (m.lastBO || -999) > 80) {
        m.lastBO = G.turn;
        log(`BROWNOUT: ${MD[m.type].n} lost power. Switch something off or add generation.`, 'warn');
      }
    }
    m.wasP = m.powered;
  }
  G.bat = Math.min(cap, G.bat + sup);
  G.pw = { gen, dem, cap };
  if (solar && !sun.inShadow && sun.untilChange === ECLIPSE_WARNING)
    log(
      `Earth's shadow in ${ECLIPSE_WARNING} turns: solar output drops to 0 for ${sun.dark} turns. Charge the batteries.`,
      'warn',
    );
  if (solar && sun.inShadow && sun.untilChange === 1)
    log('Sunlight in 1 turn: solar output returns.', 'info');
  const out = G.ext.drones.filter(d => !d.tr && (d.sec === HULL || d.sec === G.home) && !atHatch(d)).length;
  G.hot = Math.max(0, (G.hot || 0) - 1);
  G.sig = Math.round(
    3 +
      dem * 1.1 +
      out * 3 +
      (commsOnline() ? 8 : 0) +
      (G.move ? 25 : 0) +
      (G.fab ? 4 : 0) +
      (G.fscan ? 10 : 0) +
      G.hot,
  );
}
export function atmoTick() {
  let capS = 0;
  for (const m of G.machines)
    if ((m.type === 'scrubber' || m.type === 'escrub') && online(m)) capS += MD[m.type].cap;
  let area = 0;
  G.mods.forEach(m => {
    if (m.ctl) area += m.shape.g.join('').split('.').length - 1;
  });
  const rate = capS ? 4 * Math.min(1, capS / Math.max(1, area)) : 0;
  G.atmo = { cap: capS, area };
  const bc = G.mods.map(() => 0);
  for (const b of G.brk) bc[b.mod]++;
  G.mods.forEach((m, i) => {
    if (bc[i]) m.pressure = Math.max(0, m.pressure - 25);
    else if (rate && m.ctl) m.pressure = Math.min(100, m.pressure + rate);
    else m.pressure = Math.max(0, m.pressure - 0.1);
  });
}
function needsTick() {
  const S = stats(),
    pr = pressureAt(P.x, P.y);
  if (pr < 35) {
    P.o2 -= 2 * S.vacMul;
    if (!G.vw) {
      log('Low pressure: suit O2 draining.', 'warn');
      G.vw = 1;
    }
  } else {
    G.vw = 0;
    if (pr >= 60) P.o2 = Math.min(S.o2Max, P.o2 + 5);
  }
  if (P.o2 <= 0) {
    P.o2 = 0;
    P.hp -= 3;
    G.killer = 'asphyxiation';
    if (G.turn % 4 === 0) log('Suffocating!', 'bad');
  }
  P.nut -= 0.1;
  if (P.nut <= 20 && G.stock.rat > 0) {
    G.stock.rat--;
    P.nut = Math.min(100, P.nut + 45);
    log('You eat a ration pack.', 'info');
  }
  if (P.nut <= 0) {
    P.nut = 0;
    P.hp -= 0.5;
    G.killer = 'starvation';
    if (G.turn % 10 === 0) log('Starving. Find rations.', 'bad');
  }
}
function machineTick() {
  for (const m of G.machines) {
    const d = MD[m.type],
      on = online(m);
    if (on && d.tech) m.cond = Math.max(0, m.cond - 0.02);
    if (m.type === 'hydro' && on) {
      m.prog += (G.crew || []).some(c => c.role === 'botanist' && c.duty && c.at === m.id) ? 2 : 1;
      if (m.prog >= 20) {
        m.prog = 0;
        addStock('rat', 2);
      }
    }
    if (m.type === 'refinery' && on && G.stock.scrap >= 2) {
      if (++m.prog >= 10) {
        m.prog = 0;
        G.stock.scrap -= 2;
        addStock('circ', 1);
      }
    }
    if (m.type === 'med' && m.prog > 0) m.prog--;
    if (m.type === 'comms' && on && !G.contact) firstContact();
    if (m.type === 'maint' && on && !G.bot) {
      if (++m.prog >= 10) {
        m.prog = 0;
        spawnBot(m);
      }
    }
  }
  if (G.fab) {
    const f = G.machines.find(m => m.id === G.fab.mid);
    if (!f) G.fab = null;
    else {
      f.busy = true;
      if (online(f)) {
        G.fab.prog += hasAI('forge') ? 1.5 : 1;
        if (G.fab.prog >= RC[G.fab.r].t) {
          const r = G.fab.r;
          G.fab = null;
          f.busy = false;
          fabDone(r, f);
        }
      }
    }
  }
}
function spawnBot(m) {
  for (const [dx, dy] of D8) {
    const x = m.x + dx,
      y = m.y + dy;
    if (M.map[idx(x, y)] === T.FLOOR && !occupied(x, y)) {
      G.bot = { x, y, w: 0, acc: 0 };
      log('Maintenance bot online. It repairs systems and patches breaches using scrap.', 'good');
      return;
    }
  }
}
function botTick() {
  const b = G.bot;
  if (!b) return;
  const dock = G.machines.find(m => m.type === 'maint');
  if (!dock || !online(dock)) return;
  let tgt = null;
  const br = G.brk.slice().sort((p, q) => cheb(b.x, b.y, p.x, p.y) - cheb(b.x, b.y, q.x, q.y));
  if (br.length && G.stock.scrap >= 3) tgt = { k: 'b', o: br[0] };
  else {
    const ms = G.machines
      .filter(m => (MD[m.type].tech || MD[m.type].gen || MD[m.type].use) && m.cond < 80)
      .sort((p, q) => p.cond - q.cond);
    if (ms.length && G.stock.scrap >= 1) tgt = { k: 'm', o: ms[0] };
  }
  if (!tgt) return;
  const o = tgt.o;
  if (cheb(b.x, b.y, o.x, o.y) <= 1) {
    if (tgt.k === 'b') {
      if (++b.w >= 4) {
        b.w = 0;
        G.stock.scrap -= 3;
        removeBreach(o);
        log(
          `Maintenance bot patched a breach in ${G.mods[o.mod] ? G.mods[o.mod].name : 'a section'}.`,
          'good',
        );
      }
    } else {
      o.cond = Math.min(100, o.cond + 6);
      if (++b.acc >= 3) {
        b.acc = 0;
        G.stock.scrap = Math.max(0, G.stock.scrap - 1);
      }
    }
  } else {
    const n = intNext(b.x, b.y, (x, y) => cheb(x, y, o.x, o.y) <= 1);
    if (n && !occupied(n[0], n[1])) {
      b.x = n[0];
      b.y = n[1];
    }
  }
}
function hostileTick() {
  if (!G.actors.length) return;
  M.dmap = bfsInt(P.x, P.y);
  for (const a of G.actors) {
    if (a.hp <= 0) continue;
    const n = EN[a.type].fast ? 2 : 1;
    for (let k = 0; k < n && a.hp > 0 && P.hp > 0; k++) actOne(a);
  }
  G.actors = G.actors.filter(a => a.hp > 0);
}
function actOne(a) {
  const d = EN[a.type],
    dp = cheb(a.x, a.y, P.x, P.y);
  const sees = M.vis[idx(a.x, a.y)] && dp <= d.sight;
  if (sees) {
    if (!a.alert) cmb(`${d.n} spots you.`, 'warn');
    a.alert = true;
    a.lost = 0;
  } else if (a.alert && ++a.lost > 25) a.alert = false;
  const S = stats();
  if (sees && d.w.melee && dp === 1) {
    const ch = clamp(d.w.acc - S.eva, 8, 95),
      hit = random() * 100 < ch;
    cmb(`${d.n} strikes (${ch}%) ${hit ? 'Hit' : 'Miss'}`, hit ? 'bad' : '');
    if (hit) hurtPlayer(roll(d.w.d), d.n);
    return;
  }
  if (sees && d.w.r && dp <= d.w.r && los(a.x, a.y, P.x, P.y)) {
    const ch = clamp(d.w.acc - S.eva, 8, 95),
      hit = random() * 100 < ch;
    addFx({ k: 'tr', x0: a.x, y0: a.y, x1: P.x, y1: P.y, c: '#ff8a6a', dur: 200 });
    cmb(`${d.n} fires (${ch}%) ${hit ? 'Hit' : 'Miss'}`, hit ? 'bad' : '');
    if (hit) hurtPlayer(roll(d.w.d), d.n);
    return;
  }
  if (a.alert) {
    const dm = M.dmap,
      cur = dm[idx(a.x, a.y)];
    let best = null,
      bv = cur < 0 ? 1e9 : cur;
    for (const [dx, dy] of D8) {
      const nx = a.x + dx,
        ny = a.y + dy;
      if (!inB(nx, ny)) continue;
      const v = dm[idx(nx, ny)];
      if (v >= 0 && v < bv && !occupied(nx, ny)) {
        bv = v;
        best = [nx, ny];
      }
    }
    if (best) {
      a.x = best[0];
      a.y = best[1];
    }
  } else if (random() < 0.4) {
    const [dx, dy] = pick(D8);
    const nx = a.x + dx,
      ny = a.y + dy;
    if (
      inB(nx, ny) &&
      M.map[idx(nx, ny)] === T.FLOOR &&
      !occupied(nx, ny) &&
      M.room[idx(nx, ny)] === M.room[idx(a.x, a.y)]
    ) {
      a.x = nx;
      a.y = ny;
    }
  }
}
function objTick() {
  while (G.obj < OBJ.length - 1 && OBJ[G.obj].ok()) {
    G.obj++;
    addStock('scrap', 4);
    addStock('circ', 2);
    log(`OBJECTIVE COMPLETE (+4 scrap, +2 circuits). Next: ${OBJ[G.obj].t}`, 'good');
  }
}

/** True when the player may act: a game is running and no dialog is open. */
export const canAct = () => G && !G.over && !V.modalOpen;

export function fabDone(k, m) {
  if (k.startsWith('drone_')) {
    dropNear(m.x, m.y, mk('dorm_' + k.slice(6)));
    log(`Fabricator: ${RC[k].n} assembled (dormant). Carry it to a Drone Rack.`, 'good');
  } else if (k === 'tube') {
    G.kits++;
    log(
      'Fabricator: hallway kit ready. A Utility drone can build a hallway segment at a free door (EXTERIOR).',
      'good',
    );
  } else if (k.startsWith('sat_')) {
    const s = k.slice(4);
    G.sats[s]++;
    log(`Fabricator: ${s} satellite ready. Deploy it with a drone or the Launch Rail.`, 'good');
  } else if (k === 'ammo') {
    addStock('ammo', 20);
    log('Fabricator: +20 ammo.', 'good');
  } else if (k === 'slot') {
    P.cap.suit = Math.min(4, P.cap.suit + 1);
    log('Fabricator: suit hardpoint fitted. +1 suit slot.', 'good');
  } else if (k === 'scanmod') {
    const d = G.ext.drones.find(d => !d.scan && atHatch(d)) || G.ext.drones.find(d => !d.scan);
    if (d) {
      d.scan = true;
      log(
        `Fabricator: Survey Scanner fitted to ${d.name}. Sections it scraps in the field still teach you their schematics.`,
        'good',
      );
    } else {
      G.scanSpare = (G.scanSpare || 0) + 1;
      log('Fabricator: Survey Scanner ready. It will be fitted to the next drone you activate.', 'good');
    }
  } else if (k === 'iface') {
    const d = G.ext.drones.find(d => !d.iface && atHatch(d)) || G.ext.drones.find(d => !d.iface);
    if (d) {
      d.iface = true;
      log(
        `Fabricator: Interface Module fitted to ${d.name}. It can now jack into grid nodes from outside the hull.`,
        'good',
      );
    } else {
      G.ifaceSpare = (G.ifaceSpare || 0) + 1;
      log('Fabricator: Interface Module ready. It will be fitted to the next drone you activate.', 'good');
    }
  } else if (k === 'thrust') {
    G.thrust = true;
    log('Fabricator: drone thrusters fitted. The fleet moves faster.', 'good');
  } else {
    dropNear(m.x, m.y, mk(k));
    log(`Fabricator: ${RC[k].n} ready, placed next to the fabricator.`, 'good');
  }
}
