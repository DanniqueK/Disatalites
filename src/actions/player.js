import { releaseTow } from './exterior.js';
import { T, WALK } from '../core/constants.js';
import { BR, CHAT, DT, EN, FAC, FN, GEAR_ROOMS, IT, LORE, MC, MD, RC, SATS, SMALL } from '../core/data.js';
import { cmb, log } from '../core/messages.js';
import { random } from '../core/rng.js';
import { G, M, P, V } from '../core/state.js';
import { an, cheb, clamp, D8, idx, inB, pick, roll, rr } from '../core/util.js';
import { homeInLowOrbit, reboost, REBOOST_COST } from '../sim/decay.js';
import { releaseSat } from '../sim/earth-tick.js';
import { actorAt, addFx, damageActor, stats } from '../sim/stats.js';
import { canAct, endTurn, onGrid, refresh } from '../sim/turn.js';
import { cellName } from '../space/earth.js';
import { spawnDrone } from '../space/exterior-objects.js';
import { machAt } from '../space/sectors.js';
import { machinePlate, showModal } from '../ui/log-modal.js';
import { setTab } from '../ui/panels.js';
import { removeBreach } from '../world/build.js';
import { claimDone, lockdown, modBreaches } from '../world/control.js';
import { los } from '../world/fov.js';
import { addStock, ctlOK, droneCap, dropItem, dropNear, machineStatus, online } from '../world/machines.js';
import { placeGear, placeProblem, removeMachine } from '../world/placement.js';

/** @typedef {import('../core/types.js').ModalButton} ModalButton */

export function playerMove(dx, dy) {
  if (!canAct()) return;
  if (dx === 0 && dy === 0) return endTurn();
  const nx = P.x + dx,
    ny = P.y + dy;
  if (!inB(nx, ny)) return;
  const a = actorAt(nx, ny);
  if (a) return playerMelee(a);
  if (G.bot && G.bot.x === nx && G.bot.y === ny) {
    G.bot.x = P.x;
    G.bot.y = P.y;
    P.x = nx;
    P.y = ny;
    return endTurn();
  }
  const cm = G.crew.find(c => c.x === nx && c.y === ny);
  if (cm) {
    cm.x = P.x;
    cm.y = P.y;
    P.x = nx;
    P.y = ny;
    if (random() < 0.25) log(`${cm.name}: "${pick(CHAT[cm.role])}"`, 'lore');
    return endTurn();
  }
  const t = M.map[idx(nx, ny)];
  if (t === T.MACH) {
    const m = G.machines.find(m => m === machAt(nx, ny));
    if (m) {
      V.bumped = [nx, ny];
      if (V.hintAt !== idx(nx, ny)) {
        V.hintAt = idx(nx, ny);
        log(
          `${MD[m.type].n}${m.type === 'node' || m.type === 'junc' ? '' : ' (' + machineStatus(m).toLowerCase() + ')'}. Click it, or press U, to use it.`,
          'info',
        );
      }
      return refresh();
    }
  }
  if (t === T.BREACH) {
    const b = G.brk.find(b => b.x === nx && b.y === ny);
    if (b) {
      V.bumped = [nx, ny];
      if (V.hintAt !== idx(nx, ny)) {
        V.hintAt = idx(nx, ny);
        log('Hull breach. Click it, or press U, to patch it.', 'info');
      }
      return refresh();
    }
  }
  if (t === T.PORT) {
    const own = G.mods[M.own[idx(nx, ny)]];
    log(
      `Sealed ${own ? BR[own.brand].cc + ' ' : ''}docking hatch. Build a hallway segment here with a drone, or tow a room to it (EXTERIOR).`,
      'info',
    );
    return refresh();
  }
  if (!WALK.has(t)) return;
  const prevMod = M.room[idx(P.x, P.y)];
  P.x = nx;
  P.y = ny;
  const i = idx(nx, ny);
  const nm = M.room[i];
  if (nm >= 0 && nm !== prevMod && G.mods[nm] && t === T.FLOOR) {
    const m = G.mods[nm];
    if (!m.visited) {
      m.visited = 1;
      log(
        `Entering ${m.name}: ${BR[m.brand].n} (${BR[m.brand].cc}) hardware. Pressure ${Math.round(m.pressure)}%.`,
        'info',
      );
    }
  }
  const c = G.crates[i];
  if (c) {
    delete G.crates[i];
    const parts = [];
    for (const k of ['scrap', 'circ', 'rat', 'ammo'])
      if (c[k]) {
        addStock(k, c[k]);
        parts.push(`+${c[k]} ${{ scrap: 'scrap', circ: 'circuits', rat: 'rations', ammo: 'ammo' }[k]}`);
      }
    log(`Crate: ${parts.join(', ') || 'empty'}.`, 'good');
  }
  if (G.items[i] && G.items[i].length)
    log(`Here: ${G.items[i].map(it => IT[it.key].n).join(', ')}  [G / GET]`, 'info');
  endTurn();
}
function playerMelee(a) {
  let wd = { n: 'Fists', d: [2, 4] },
    best = 0;
  for (const it of P.eq.weap.concat(P.eq.tool)) {
    const d = IT[it.key];
    if (d.s === 'weap' && !d.melee) continue;
    const av = (d.d[0] + d.d[1]) / 2;
    if (av > best) {
      best = av;
      wd = d;
    }
  }
  const e = EN[a.type].eva,
    ch = clamp(75 - e, 10, 95),
    hit = random() * 100 < ch;
  cmb(`${wd.n} (75-${e}=${ch}%) ${hit ? 'Hit' : 'Miss'}`, hit ? 'good' : '');
  if (hit) damageActor(a, roll(wd.d));
  endTurn();
}
export const visHostiles = () =>
  G.actors
    .filter(a => a.hp > 0 && M.vis[idx(a.x, a.y)])
    .sort((p, q) => cheb(p.x, p.y, P.x, P.y) - cheb(q.x, q.y, P.x, P.y));
export function cycleTarget() {
  if (!canAct()) return;
  const v = visHostiles();
  if (!v.length) {
    G.target = null;
    log('Nothing to target.');
    return refresh();
  }
  const i = v.findIndex(a => a.id === G.target);
  G.target = v[(i + 1) % v.length].id;
  refresh();
}
export function fire() {
  if (!canAct()) return;
  let t = G.actors.find(a => a.id === G.target && a.hp > 0 && M.vis[idx(a.x, a.y)]);
  if (!t) {
    t = visHostiles()[0];
    if (t) G.target = t.id;
  }
  if (!t) {
    log('No hostile in view.');
    return refresh();
  }
  const ws = P.eq.weap.filter(w => !IT[w.key].melee);
  if (!ws.length) {
    log('No ranged weapon equipped.', 'warn');
    return refresh();
  }
  const dd = cheb(P.x, P.y, t.x, t.y);
  let fired = 0;
  for (const w of ws) {
    const d = IT[w.key];
    if (dd > d.r) {
      cmb(`${d.n}: out of range (${d.r})`);
      continue;
    }
    if (G.stock.ammo < d.am) {
      cmb(`${d.n}: no ammo`, 'warn');
      continue;
    }
    if (!los(P.x, P.y, t.x, t.y)) {
      cmb('No clear line of fire.');
      continue;
    }
    G.stock.ammo -= d.am;
    fired++;
    G.hot = (G.hot || 0) + 2;
    const e = EN[t.type].eva,
      ch = clamp(65 + (d.acc || 0) - e, 8, 95);
    let hits = 0;
    for (let s = 0; s < (d.shots || 1); s++) {
      if (t.hp <= 0) break;
      if (random() * 100 < ch) {
        hits++;
        damageActor(t, roll(d.d));
      }
    }
    addFx({ k: 'tr', x0: P.x, y0: P.y, x1: t.x, y1: t.y, c: '#ffe080', dur: 200 });
    cmb(
      `${d.n} (65${d.acc ? '+' + d.acc : ''}-${e}=${ch}%) ${d.shots ? hits + '/' + d.shots + ' ' : ''}${hits ? 'Hit' : 'Miss'}`,
      hits ? 'good' : '',
    );
    if (t.hp <= 0) break;
  }
  if (fired) endTurn();
  else refresh();
}
export function pickup() {
  if (!canAct()) return;
  const i = idx(P.x, P.y),
    arr = G.items[i];
  if (!arr || !arr.length) {
    log('Nothing here to pick up.');
    return refresh();
  }
  const it = arr[arr.length - 1],
    d = IT[it.key];
  if (d.s !== 'use' && d.s !== 'drone' && d.s !== 'kit' && P.eq[d.s].length < P.cap[d.s]) {
    arr.pop();
    P.eq[d.s].push(it);
    log(`Equipped ${d.n}.`, 'good');
  } else if (P.inv.length < 8) {
    arr.pop();
    P.inv.push(it);
    log(`Picked up ${d.n}.${d.s === 'drone' ? ' Carry it to a Drone Rack and click the rack.' : ''}`);
  } else {
    log('Inventory full (8/8).', 'warn');
    return refresh();
  }
  if (!arr.length) delete G.items[i];
  endTurn();
}
export function eat() {
  if (!canAct()) return;
  if (G.stock.rat < 1) {
    log('No rations left.', 'warn');
    return refresh();
  }
  if (P.nut > 85) {
    log('You are not hungry.');
    return refresh();
  }
  G.stock.rat--;
  P.nut = Math.min(100, P.nut + 45);
  log('You eat a ration pack.');
  endTurn();
}
export function itemMenu(i) {
  if (!canAct()) return;
  const it = P.inv[i];
  if (!it) return;
  const d = IT[it.key];
  const b = [];
  if (d.s === 'use')
    b.push({
      t: 'Use',
      f: () => {
        P.hp = Math.min(P.hpMax, P.hp + d.heal);
        P.inv.splice(i, 1);
        log(`Med Kit: +${d.heal} body.`, 'good');
        endTurn();
      },
    });
  else if (d.s !== 'drone' && d.s !== 'kit') b.push({ t: 'Equip', f: () => equipItem(i) });
  if (d.s === 'kit') {
    b.push({ t: 'Install next to you...', f: () => installMenu(i) });
    const v = stripValue(d.mt, it.cond || 100);
    b.push({
      t: `Scrap the kit (+${v.s} scrap${v.c ? ', +' + v.c + ' circ' : ''})`,
      k: 'danger',
      f: () => {
        P.inv.splice(i, 1);
        addStock('scrap', v.s);
        addStock('circ', v.c);
        if (!G.bp['k_' + d.mt]) {
          G.bp['k_' + d.mt] = 1;
          log(`SCHEMATIC learned: ${MD[d.mt].n}.`, 'good');
        }
        log(`Scrapped the ${d.n}.`, 'good');
        endTurn();
      },
    });
  }
  b.push(
    {
      t: 'Drop',
      f: () => {
        P.inv.splice(i, 1);
        dropItem(P.x, P.y, it);
        log(`Dropped ${d.n}.`);
        endTurn();
      },
    },
    { t: 'Cancel' },
  );
  showModal(d.n.toUpperCase(), itemDesc(it), b);
}
function equipItem(i) {
  const it = P.inv[i],
    d = IT[it.key],
    sl = d.s;
  if (P.eq[sl].length < P.cap[sl]) {
    P.inv.splice(i, 1);
    P.eq[sl].push(it);
    log(`Equipped ${d.n}.`, 'good');
    return endTurn();
  }
  const b = P.eq[sl].map((e, j) => ({
    t: `Swap out ${IT[e.key].n}`,
    f: () => {
      P.eq[sl][j] = it;
      P.inv[i] = e;
      log(`Swapped in ${d.n}.`);
      P.o2 = Math.min(P.o2, stats().o2Max);
      endTurn();
    },
  }));
  b.push({ t: 'Cancel' });
  showModal('NO FREE SLOT', 'Replace which part?', b);
}
export function partMenu(sl, j) {
  if (!canAct()) return;
  const it = P.eq[sl][j];
  showModal(IT[it.key].n.toUpperCase(), itemDesc(it), [
    {
      t: 'Unequip to inventory',
      dis: P.inv.length >= 8,
      f: () => {
        P.eq[sl].splice(j, 1);
        P.inv.push(it);
        P.o2 = Math.min(P.o2, stats().o2Max);
        endTurn();
      },
    },
    {
      t: 'Drop',
      f: () => {
        P.eq[sl].splice(j, 1);
        dropItem(P.x, P.y, it);
        P.o2 = Math.min(P.o2, stats().o2Max);
        endTurn();
      },
    },
    { t: 'Cancel' },
  ]);
}
function itemDesc(it) {
  const d = IT[it.key],
    L = [];
  if (d.s === 'kit')
    return `${MD[d.mt].desc}\n\nCondition: ${Math.round(it.cond || 100)}%.\nStand next to a free spot in a room you control and use Install (3 turns).`;
  if (d.s === 'drone')
    return `A powered-down ${DT[d.dt].n} drone (${DT[d.dt].desc}).\nCarry it to a working Drone Rack and click the rack to activate it (2 scrap, 1 circuit).`;
  L.push('Slot: ' + { tool: 'TOOL', weap: 'WEAPON', suit: 'SUIT', use: 'CONSUMABLE' }[d.s]);
  if (d.hp) L.push(`Integrity: ${it.hp}/${d.hp}   Coverage: ${d.cov}`);
  if (d.rep) L.push(`Repair: +${d.rep}% per action`);
  if (d.d)
    L.push(
      `Damage: ${d.d[0]}-${d.d[1]}${d.shots ? ' x' + d.shots : ''}${d.melee || d.s === 'tool' ? ' melee' : ''}`,
    );
  if (d.r) L.push(`Range ${d.r}, ammo/shot ${d.am}`);
  if (d.acc) L.push(`Accuracy +${d.acc}%`);
  if (d.o2) L.push(`Suit O2 +${d.o2}`);
  if (d.vac) L.push('Halves O2 loss in vacuum');
  if (d.scan) L.push(`Shows hostiles within ${d.scan} through walls`);
  if (d.eva) L.push(`Evasion +${d.eva}%`);
  if (d.heal) L.push(`Heals ${d.heal}`);
  L.push('\nDamage you take is spread over your body and every equipped part.');
  return L.join('\n');
}
const repairCost = m => ({ s: 2, c: MD[m.type].tech ? 1 : 0 });
function repairOnce(m) {
  const c = repairCost(m);
  if (G.stock.scrap < c.s || G.stock.circ < c.c) {
    log(`Not enough materials (needs ${c.s} scrap${c.c ? ', ' + c.c + ' circuit' : ''}).`, 'warn');
    return false;
  }
  G.stock.scrap -= c.s;
  G.stock.circ -= c.c;
  const before = m.cond;
  m.cond = Math.min(100, m.cond + stats().rep);
  cmb(`Repair ${MD[m.type].n}: ${Math.round(before)}% > ${Math.round(m.cond)}%`, 'good');
  if (before < 60 && m.cond >= 60)
    log(`${MD[m.type].n} repaired.${MD[m.type].use ? ' It needs power to run.' : ''}`, 'good');
  return true;
}
function repairFull(m) {
  G.intr = false;
  while (m.cond < 100 && canAct()) {
    if (!repairOnce(m)) break;
    endTurn(true);
    if (G.intr || visHostiles().length || G.over) break;
  }
  refresh();
}
function activateDrone(rack, i) {
  const it = P.inv[i];
  const dt = IT[it.key].dt;
  if (G.stock.scrap < 2 || G.stock.circ < 1) {
    log('Activation needs 2 scrap and 1 circuit.', 'warn');
    return refresh();
  }
  if (!rack.hatch) {
    log('No free docking port for drones to launch from.', 'warn');
    return refresh();
  }
  G.stock.scrap -= 2;
  G.stock.circ -= 1;
  P.inv.splice(i, 1);
  spawnDrone(dt, rack);
  log(`${DT[dt].n} drone wakes up and slips out through the hatch. EXTERIOR view unlocked.`, 'good');
  endTurn();
}
const cap = s => s[0].toUpperCase() + s.slice(1);
const DIR8 = {
  '-1,-1': 'north-west',
  '0,-1': 'north',
  '1,-1': 'north-east',
  '-1,0': 'west',
  '1,0': 'east',
  '-1,1': 'south-west',
  '0,1': 'south',
  '1,1': 'south-east',
};
/** Offer every tile around the player where the kit in inventory slot `i` can be installed. */
function installMenu(i) {
  const it = P.inv[i];
  if (!it) return;
  const t = IT[it.key].mt;
  const spots = [],
    why = new Set();
  for (const [dx, dy] of D8) {
    const problem = placeProblem(t, P.x + dx, P.y + dy);
    if (problem) why.add(problem);
    else spots.push([dx, dy]);
  }
  const b = spots.map(
    /** @returns {ModalButton} */ ([dx, dy]) => ({
      t: `Install to the ${DIR8[dx + ',' + dy]} (3 turns)`,
      f: () => {
        P.inv.splice(i, 1);
        for (let k = 0; k < 2 && canAct(); k++) endTurn(true);
        const m = placeGear(t, P.x + dx, P.y + dy, it.cond || 100);
        log(
          `${MD[t].n} installed in the ${G.mods[m.mi].name}.${MD[t].use ? ' It needs power from the bus.' : ''}`,
          'good',
        );
        endTurn();
      },
    }),
  );
  b.push({ t: 'Cancel' });
  const where =
    GEAR_ROOMS[t] === '*' ? 'any room you control' : `a ${GEAR_ROOMS[t].map(f => FN[f].n).join(', ')}`;
  showModal(
    `INSTALL ${MD[t].n.toUpperCase()}`,
    spots.length
      ? `Pick a spot next to you. ${cap(an(MD[t].n))} ${MD[t].n} belongs in ${where}${t === 'turret' ? ', on an outer wall' : ''}.`
      : `There is no spot next to you for it: ${[...why].join('; ')}.\n\n${cap(an(MD[t].n))} ${MD[t].n} belongs in ${where}${t === 'turret' ? ', on an outer wall' : ''}. Doorways and the walkway through the room stay clear.`,
    b,
  );
}
function giveItem(it) {
  if (P.inv.length < 8) P.inv.push(it);
  else {
    dropNear(P.x, P.y, it);
    log('Inventory full: it is on the floor next to you.', 'warn');
  }
}
function uninstall(m) {
  if (G.fab && G.fab.mid === m.id) {
    G.fab = null;
    log('Fabrication cancelled.', 'warn');
  }
  for (let k = 0; k < 2 && canAct(); k++) endTurn(true);
  const it = { key: 'k_' + m.type, cond: Math.round(m.cond) };
  const nm = MD[m.type].n;
  removeMachine(m);
  giveItem(it);
  log(`${nm} unbolted and packed into a kit. Install it anywhere it belongs.`, 'good');
  endTurn();
}
function stripValue(t, cond) {
  const base = MC[t] || (t === 'cryo' ? [14, 3] : t === 'terminal' ? [6, 4] : [6, 1]);
  const q = 0.5 + Math.min(100, cond) / 200;
  return { s: Math.max(2, Math.round(base[0] * 0.4 * q)), c: Math.round(base[1] * 0.3 * q) };
}
const NOSTRIP = ['node', 'junc'];
/** @returns {ModalButton[]} */
function stripOpt(m, locked) {
  if (NOSTRIP.includes(m.type) || m.type === 'terminal') return [];
  const v = stripValue(m.type, m.cond);
  if (m.fx) {
    if (m.cond < 5) return [];
    return [
      {
        t: `Gut it for parts (+${v.s} scrap${v.c ? ', +' + v.c + ' circ' : ''}, ${locked ? 5 : 3} turns; it drops to 0%)`,
        k: 'danger',
        f: () => {
          const nm = MD[m.type].n;
          if (G.fab && G.fab.mid === m.id) G.fab = null;
          for (let k = 0; k < (locked ? 4 : 2) && canAct(); k++) endTurn(true);
          m.cond = 0;
          addStock('scrap', v.s);
          addStock('circ', v.c);
          log(
            `You pull the guts out of the ${nm}: +${v.s} scrap${v.c ? ', +' + v.c + ' circuits' : ''}. The frame stays bolted in; it can be rebuilt with repairs.`,
            'good',
          );
          endTurn();
        },
      },
    ];
  }
  return [
    {
      t: `Strip it for parts (+${v.s} scrap${v.c ? ', +' + v.c + ' circ' : ''}, ${locked ? 5 : 3} turns)`,
      k: 'danger',
      f: () => {
        const nm = MD[m.type].n,
          t = m.type;
        if (G.fab && G.fab.mid === m.id) G.fab = null;
        for (let k = 0; k < (locked ? 4 : 2) && canAct(); k++) endTurn(true);
        removeMachine(m);
        addStock('scrap', v.s);
        addStock('circ', v.c);
        if (SMALL.includes(t) && !G.bp['k_' + t]) {
          G.bp['k_' + t] = 1;
          log(`SCHEMATIC learned from taking it apart: ${nm}.`, 'good');
        }
        log(`You strip the ${nm} for parts: +${v.s} scrap${v.c ? ', +' + v.c + ' circuits' : ''}.`, 'good');
        endTurn();
      },
    },
  ];
}
export function machineMenu(m) {
  const mod = G.mods[m.mi];
  if (m.type === 'node') return nodeMenu(m);
  if (!ctlOK(m)) {
    showModal(
      'ACCESS DENIED',
      `${MD[m.type].n} in the ${mod ? mod.name : '?'} (${mod ? BR[mod.brand].n : ''}).\n\nThe local grid does not recognize you. The panel just shows the ${mod ? BR[mod.brand].cc : ''} maker logo and a login prompt you cannot answer.\n\nFind this section's Grid Node (N), repair it if needed, and claim it. Or skip the login and pry it apart for parts: the grid cannot stop a crowbar.`,
      stripOpt(m, true).concat([{ t: 'Close' }]),
      false,
      false,
      machinePlate(m, 'ACCESS DENIED'),
    );
    return;
  }
  const d = MD[m.type],
    c = repairCost(m);
  const body = `${d.desc}${m.type === 'fab' && G.fab ? `\nBuilding: ${RC[G.fab.r].n} ${G.fab.prog}/${RC[G.fab.r].t}` : ''}${m.type === 'med' && m.prog ? `\nRecharging: ${m.prog} turns` : ''}${m.type === 'junc' ? `\nSection on power bus: ${mod && mod.onGrid ? 'yes' : 'no'}` : ''}${(d.use || d.gen) && !onGrid(m) ? `\nThis section is cut off from the power bus. Fix its Junction Box (J), or the ones on the way to a generator.` : ''}${m.type === 'rack' ? `\nFleet: ${G.ext.drones.length}/${droneCap()}${m.hatch ? '' : '\nNo free docking port nearby: drones cannot launch.'}` : ''}`;
  const b = [];
  if (m.cond < 100 && !['terminal', 'locker', 'cryo', 'bunk'].includes(m.type)) {
    b.push({
      t: `Repair +${stats().rep}% (${c.s} scrap${c.c ? ', ' + c.c + ' circ' : ''})`,
      f: () => {
        if (repairOnce(m)) endTurn();
        else refresh();
      },
    });
    b.push({ t: 'Repair until done', f: () => repairFull(m) });
  }
  if (d.use || d.gen)
    b.push({
      t: m.on ? 'Switch OFF (save power)' : 'Switch ON',
      f: () => {
        m.on = !m.on;
        log(`${d.n} switched ${m.on ? 'on' : 'off'}.`);
        endTurn();
      },
    });
  if (online(m)) {
    if (m.type === 'fab') b.push({ t: 'Fabricate...', f: () => fabMenu(m) });
    if (m.type === 'comms') b.push({ t: 'Open EARTH view', f: () => setTab('earth') });
    if (m.type === 'rack') {
      P.inv.forEach((it, i) => {
        if (IT[it.key].s === 'drone')
          b.push({
            t: `Activate ${IT[it.key].n} (2 scrap, 1 circ)`,
            dis: G.ext.drones.length >= droneCap(),
            f: () => activateDrone(m, i),
          });
      });
      if (G.droneUnlocked) b.push({ t: 'Open EXTERIOR view', f: () => setTab('ext') });
    }
    if (m.type === 'launch') b.push({ t: 'Launch satellite', f: () => deployFlow('rail') });
    if (m.type === 'med')
      b.push({
        t: m.prog ? 'Recharging...' : 'Heal fully',
        dis: !!m.prog,
        f: () => {
          P.hp = P.hpMax;
          m.prog = 120;
          log('Med pod restores your body.', 'good');
          endTurn();
        },
      });
  } else if (m.type === 'rack' && P.inv.some(it => IT[it.key].s === 'drone'))
    b.push({ t: 'Activate drone (rack must be repaired and powered)', dis: true });
  if (SMALL.includes(m.type) && mod && mod.ctl)
    b.push({ t: 'Uninstall into a kit (2 turns)', k: 'danger', f: () => uninstall(m) });
  for (const o of stripOpt(m, false)) b.push(o);
  if (m.type === 'terminal')
    b.push({
      t: 'Read logs',
      f: () => {
        log('LOG: ' + LORE[G.lore++ % LORE.length], 'lore');
        endTurn();
      },
    });
  if (m.type === 'bunk')
    b.push({
      t: 'Rest (heal, up to 40 turns)',
      f: () => {
        G.intr = false;
        for (let k = 0; k < 40 && P.hp < P.hpMax; k++) {
          P.hp = Math.min(P.hpMax, P.hp + 1);
          endTurn(true);
          if (G.intr || visHostiles().length || G.over) break;
        }
        log('You get up from the bunk.');
        refresh();
      },
    });
  if (m.type === 'thruster' && homeInLowOrbit())
    b.push({
      t: `Reboost the orbit (${REBOOST_COST} battery, loud) · altitude ${Math.round(G.alt ?? 100)}%`,
      dis: !online(m) || G.bat < REBOOST_COST,
      f: () => {
        const why = reboost();
        if (why) {
          log(why, 'warn');
          return refresh();
        }
        endTurn();
      },
    });
  b.push({ t: 'Close' });
  showModal(d.n.toUpperCase(), body, b, false, false, machinePlate(m));
}
function nodeMenu(m) {
  const mod = G.mods[m.mi];
  const c = repairCost(m);
  const n = G.mods.filter(x => x.ctl).length;
  const nb = modBreaches(m.mi);
  const body = `Grid node for the ${mod.name}, ${BR[mod.brand].n} firmware.\nCondition: ${Math.round(m.cond)}%${m.cond < 60 ? ' (too damaged to talk to)' : ''}\nControl: ${mod.ctl ? 'YOURS' : 'locked'}${mod.haywire && !mod.ctl ? '\nThe security layer here is twitchy. Claiming it may wake its old maintenance bots. A drone with an Interface Module can reboot it from outside.' : ''}${!mod.ctl && nb ? `\nHULL BREACHED (${nb}). The node refuses to hand over a section that is venting. Seal the breach${nb > 1 ? 'es' : ''} (x) first.` : ''}\n\nSections under your control: ${n}/${G.mods.length}.`;
  const b = [];
  if (m.cond < 100)
    b.push({
      t: `Repair +${stats().rep}% (${c.s} scrap, ${c.c} circ)`,
      f: () => {
        if (repairOnce(m)) endTurn();
        else refresh();
      },
    });
  if (!mod.ctl)
    b.push({
      t: `Claim this section (1 circuit, ${m.claimNeed || '~8'} turns)`,
      dis: m.cond < 60 || G.stock.circ < 1 || nb > 0,
      f: () => claimNode(m),
    });
  b.push({ t: 'Close' });
  showModal('GRID NODE', body, b, false, false, machinePlate(m));
}
function claimNode(m) {
  const mod = G.mods[m.mi];
  if (!m.claimNeed) {
    m.claimNeed = rr(6, 12) + (BR[mod.brand].cc === '??' ? 3 : 0);
    G.stock.circ--;
  }
  log(`Jacking into the ${BR[mod.brand].n} node. Their firmware argues with yours.`, 'info');
  G.intr = false;
  while ((m.claimP || 0) < m.claimNeed && canAct()) {
    m.claimP = (m.claimP || 0) + 1;
    if (modBreaches(m.mi)) {
      log('Claim halted: the section is venting again.', 'warn');
      break;
    }
    if (mod.haywire && !m.lock && random() < 0.06) {
      m.lock = 1;
      lockdown(mod);
    }
    endTurn(true);
    if (G.intr || visHostiles().length || G.over) break;
  }
  if (m.claimP >= m.claimNeed && !mod.ctl) claimDone(mod);
  else if (!mod.ctl)
    log(`Claim interrupted at ${m.claimP}/${m.claimNeed}. Click the node to continue.`, 'warn');
  refresh();
}
export function toggleSilent() {
  if (!G) return;
  G.silent = !G.silent;
  const keep = [
    'scrubber',
    'escrub',
    'pod',
    'node',
    'rack',
    'battery',
    'reactor',
    'solar',
    'locker',
    'terminal',
    'cryo',
    'bunk',
  ];
  if (G.silent) {
    for (const m of G.machines)
      if (!keep.includes(m.type) && m.on) {
        m.on = false;
        m.silOff = 1;
      }
    log('SILENT RUNNING. Non-essential systems off, emissions down. Things out there hunt by noise.', 'info');
  } else {
    for (const m of G.machines)
      if (m.silOff) {
        m.on = true;
        m.silOff = 0;
      }
    log('Silent running ended. Systems back up.', 'info');
  }
  refresh();
}
export function patchMenu(b) {
  showModal(
    'HULL BREACH',
    `A hole in the ${G.mods[b.mod] ? G.mods[b.mod].name : ''} hull. The section cannot hold pressure until it is sealed.\nPatch from inside: 3 scrap, 2 turns. Or send a drone from outside.`,
    [
      {
        t: 'Patch it (3 scrap)',
        dis: G.stock.scrap < 3,
        f: () => {
          G.stock.scrap -= 3;
          endTurn(true);
          removeBreach(b);
          log('Breach sealed.', 'good');
          endTurn();
        },
      },
      { t: 'Close' },
    ],
  );
}
function fabMenu(m) {
  const b = [];
  if (G.fab)
    b.push({
      t: `Cancel ${RC[G.fab.r].n} (refund half)`,
      f: () => {
        const r = RC[G.fab.r];
        addStock('scrap', r.s >> 1);
        addStock('circ', r.c >> 1);
        G.fab = null;
        m.busy = false;
        log('Fabrication cancelled.');
        refresh();
      },
    });
  else
    for (const k in RC) {
      if (!G.bp[k]) continue;
      const r = RC[k];
      let dis = G.stock.scrap < r.s || G.stock.circ < r.c;
      if (k === 'slot' && P.cap.suit >= 4) dis = true;
      if (k === 'thrust' && G.thrust) dis = true;
      b.push({
        t: `${r.n}  [${r.s}s ${r.c}c, ${r.t}t]`,
        dis,
        f: () => {
          G.stock.scrap -= r.s;
          G.stock.circ -= r.c;
          G.fab = { r: k, prog: 0, mid: m.id };
          m.busy = true;
          log(`Fabricator: building ${r.n}.`);
          endTurn();
        },
      });
    }
  b.push({ t: 'Close' });
  showModal(
    'FABRICATOR',
    G.fab
      ? `Working on ${RC[G.fab.r].n}: ${G.fab.prog}/${RC[G.fab.r].t}`
      : `Stock: ${G.stock.scrap} scrap, ${G.stock.circ} circuits. Uses 4 power while working.\nDrones come out dormant: carry them to a Drone Rack.`,
    b,
  );
}
export function deployFlow(via, droneId) {
  const types = SATS.filter(s => G.sats[s] > 0);
  if (!types.length) {
    showModal('NO SATELLITES', 'Build satellites at a Fabricator first.', [{ t: 'OK' }]);
    return;
  }
  showModal(
    'DEPLOY SATELLITE',
    'Which satellite?',
    types
      .map(
        /** @returns {ModalButton} */ s => ({
          t: `${s} (${G.sats[s]} in stock)`,
          f: () => {
            const opts = [];
            for (const r of G.reqs.filter(r => r.type === 'sat' && r.sat === s))
              opts.push({
                t: `Fulfil ${FAC[r.f].sh} request: over ${cellName(r.cell[0], r.cell[1])}`,
                a: { req: r.id },
              });
            if (G.contact)
              FAC.forEach((F, fi) =>
                opts.push({ t: `Give to ${F.sh} (no request, smaller reward)`, a: { f: fi } }),
              );
            if (!opts.length) {
              showModal('NO CONTACT', 'Bring a Comms Array online first so you know who to put it up for.', [
                { t: 'OK' },
              ]);
              return;
            }
            showModal(
              `${s} SATELLITE`,
              'Assign it to:',
              opts
                .map(
                  /** @returns {ModalButton} */ o => ({
                    t: o.t,
                    f: () => {
                      G.sats[s]--;
                      if (via === 'rail') {
                        log(`Launch Rail fires. ${s} satellite climbing.`, 'good');
                        endTurn(true);
                        releaseSat(s, o.a);
                        endTurn();
                      } else {
                        const d = G.ext.drones.find(x => x.id === droneId);
                        if (!d) {
                          G.sats[s]++;
                          return;
                        }
                        releaseTow(d);
                        d.task = { type: 'deploy', sat: s, assign: o.a };
                        log(`${d.name} carries the ${s} satellite out to release distance.`);
                        refresh();
                      }
                    },
                  }),
                )
                .concat([{ t: 'Cancel' }]),
            );
          },
        }),
      )
      .concat([{ t: 'Cancel' }]),
  );
}
