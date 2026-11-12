import { CONN, connShape, derHit, hullNear, learnFrom, scrapValue } from '../actions/exterior.js';
import { claimDone, lockdown, modBreaches } from '../actions/player.js';
import { T, WH, WW } from '../core/constants.js';
import { DT, FX, IT, TAGK, hasAI, hasCrew, mk, stById } from '../core/data.js';
import { G, M, P, V } from '../core/state.js';
import { D4, D8, cheb, clamp, idx, inB, pick, roll, rr } from '../core/util.js';
import { releaseSat } from './earth-tick.js';
import { addFx } from './stats.js';
import { extFree, hatchOf, objById, removeObj, stationBox } from '../space/exterior-objects.js';
import {
  HULL,
  LC,
  addCrew,
  arriveSector,
  hackInit,
  hackTurn,
  locked,
  relocateHome,
  sciReward,
  sensorTick,
  startTransfer,
  subdueStation,
  updateSight,
} from '../space/sectors.js';
import { cmb, log } from '../ui/log-modal.js';
import {
  addBreachMod,
  buildTube,
  canDetach,
  cutSpot,
  doCut,
  doSeal,
  dockPack,
  fitsAt,
  freePorts,
  modById,
  modCells,
  modIndex,
  nearestVoid,
  packModule,
  packModule0,
  removeBreach,
  setBrace,
} from '../world/build.js';
import { addStock, dropNear, online } from '../world/machines.js';
import { makePack } from '../world/packs.js';

function extNext(sx, sy, goal, sec) {
  const home = sec == null || sec === HULL;
  const prev = new Int32Array(WW * WH).fill(-1);
  const nulls = G.ext.objs.filter(o => o.kind === 'null' && o.seen && o.sec === (sec == null ? HULL : sec));
  const s = idx(sx, sy);
  prev[s] = s;
  const q = [s];
  let h = 0;
  while (h < q.length) {
    const i = q[h++];
    const x = i % WW,
      y = (i / WW) | 0;
    if (i !== s && goal(x, y)) {
      let j = i;
      while (prev[j] !== s) j = prev[j];
      return [j % WW, (j / WW) | 0];
    }
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!inB(nx, ny)) continue;
      const k = idx(nx, ny);
      if (prev[k] >= 0 || (home && M.map[k] !== T.VOID)) continue;
      if (nulls.length && nulls.some(o => cheb(o.x, o.y, nx, ny) <= 1)) continue;
      prev[k] = i;
      q.push(k);
    }
  }
  return null;
}
function moveTo(d, goal, steps) {
  if (goal(d.x, d.y)) return false;
  let moved = false;
  for (let k = 0; k < steps && !goal(d.x, d.y); k++) {
    const n = extNext(d.x, d.y, goal, d.sec);
    if (!n) break;
    d.x = n[0];
    d.y = n[1];
    moved = true;
  }
  return moved;
}
const spd = d => DT[d.dt].spd + (G.thrust ? 1 : 0);
const adjTo = (tx, ty) => (x, y) => cheb(x, y, tx, ty) <= 1;
export const atHatch = d => {
  const h = hatchOf(d);
  return h && d.x === h[0] && d.y === h[1];
};
export const cargoLoad = d => d.cargo.scrap + d.cargo.circ + d.cargo.rat;
function deposit(d) {
  const c = d.cargo,
    n = cargoLoad(d);
  if (n) {
    addStock('scrap', c.scrap);
    addStock('circ', c.circ);
    addStock('rat', c.rat);
    G.stat.salvaged += n;
    log(
      `${d.name} unloads: ${c.scrap} scrap, ${c.circ} circuits${c.rat ? ', ' + c.rat + ' rations' : ''}.`,
      'good',
    );
    d.cargo = { scrap: 0, circ: 0, rat: 0 };
  }
  if (d.pod) {
    const p = d.pod;
    const rack = G.machines.find(k => k.id === d.home) || G.machines.find(k => k.type === 'rack');
    if (p.raft) {
      addCrew(p.raft);
    } else if (p.sci) {
      sciReward();
    } else if (p.wreck) {
      dropNear(rack.x, rack.y, mk('dorm_' + p.wreck));
      log(
        `${d.name} hauls a dead ${DT[p.wreck].n} drone aboard. It is lying next to the Drone Rack in the ${G.mods[rack.mi].name}.`,
        'good',
      );
    } else {
      ['scrap', 'circ', 'rat', 'ammo'].forEach(k => {
        if (p[k]) addStock(k, p[k]);
      });
      for (const it of p.items || []) dropNear(rack.x, rack.y, mk(it));
      log(
        `Supply pod opened: ${['scrap', 'circ', 'rat', 'ammo']
          .filter(k => p[k])
          .map(k => p[k] + ' ' + { scrap: 'scrap', circ: 'circuits', rat: 'rations', ammo: 'ammo' }[k])
          .join(
            ', ',
          )}${p.items && p.items.length ? '. Gear left by the Drone Rack: ' + p.items.map(i => IT[i].n).join(', ') : ''}.`,
        'good',
      );
    }
    d.pod = null;
  }
}
function mine(d, o) {
  for (let k = 0; k < 2; k++) {
    const ks = ['scrap', 'circ', 'rat'].filter(q => o.res[q] > 0);
    if (!ks.length || cargoLoad(d) >= DT[d.dt].cargo) break;
    const q = pick(ks);
    o.res[q]--;
    d.cargo[q]++;
  }
  if (!['scrap', 'circ', 'rat'].some(q => o.res[q] > 0)) removeObj(o);
}
export function killDrone(d, by) {
  log(`${d.name} destroyed${by ? ' by ' + by : ''}.`, 'bad');
  const n = cargoLoad(d);
  if (n) G.ext.objs.push({ id: G.nid++, sec: d.sec, kind: 'debris', x: d.x, y: d.y, res: { ...d.cargo } });
  if (d.task.type === 'tow' || d.task.type === 'park') {
    const o = objById(d.task.oid);
    if (o) o.tow = null;
  }
  if (d.task.type === 'deploy') log(`The ${d.task.sat} satellite it carried is lost.`, 'bad');
  if (Math.random() < 0.5 && d.sec >= 0)
    G.ext.objs.push({ id: G.nid++, sec: d.sec, kind: 'wreck', x: d.x, y: d.y, dt: d.dt });
  G.ext.drones = G.ext.drones.filter(x => x !== d);
  if (G.sel === d.id) G.sel = G.ext.drones[0] ? G.ext.drones[0].id : null;
}
function goHome(d) {
  const h = hatchOf(d);
  if (!h) return;
  moveTo(d, (x, y) => x === h[0] && y === h[1], spd(d));
}
function droneAct(d) {
  const t = d.task,
    D = DT[d.dt];
  if (d.tr) {
    if (--d.tr.eta > 0) return;
    arriveSector(d);
    return;
  }
  if (!hatchOf(d)) {
    if (G.turn % 60 === 0 && G.ext.drones[0] === d)
      log('Drones have no control signal: repair or power a Drone Rack.', 'warn');
    return;
  }
  const needHome =
    [
      'idle',
      'return',
      'patch',
      'tube',
      'detach',
      'iface',
      'cut',
      'seal',
      'brace',
      'tube2',
      'scrapmod',
      'build',
    ].includes(t.type) ||
    (t.type === 'park' && t.att) ||
    (t.type === 'tow' && t.att && t.mid);
  if (needHome && d.sec !== HULL) {
    startTransfer(d, HULL, (t.type === 'tow' || t.type === 'park') && t.att ? objById(t.oid) : null);
    return;
  }
  const tgo =
    t.oid != null && t.type !== 'tow' ? objById(t.oid) : t.type === 'tow' && !t.att ? objById(t.oid) : null;
  if (tgo && tgo.sec >= 0 && tgo.sec !== d.sec) {
    startTransfer(d, tgo.sec, null);
    return;
  }
  if (t.type === 'goto' && t.sec != null && t.sec !== d.sec) {
    startTransfer(d, t.sec, null);
    return;
  }
  if (t.type === 'hack') {
    const st = stById(t.st);
    if (st && st.sec !== d.sec) {
      startTransfer(d, st.sec, null);
      return;
    }
  }
  const hostileObj = o =>
    o.sec === d.sec &&
    (o.kind === 'rogue' ||
      ((o.kind === 'turret' || o.kind === 'core') &&
        (() => {
          const st = stById(o.st);
          return st && st.state === 'hostile';
        })()));
  const adjR = G.ext.objs.find(
    o => hostileObj(o) && cheb(o.x, o.y, d.x, d.y) <= 1 && (o.kind !== 'core' || t.type === 'attack'),
  );
  if (adjR && t.type !== 'tow' && t.type !== 'hack' && !atHatch(d)) {
    if (adjR.st != null) {
      const st = stById(adjR.st);
      if (st && !st.alert) {
        st.alert = true;
        log(`${st.name} goes to alert. Every turret is awake now.`, 'bad');
      }
    }
    if (Math.random() < 0.7) {
      adjR.hp -= roll(D.dmg) + (hasAI('warden') ? 3 : 0) + (hasCrew('gunner') ? 2 : 0);
      if (adjR.kind === 'core' && adjR.hp <= 0) {
        addFx({ k: 'boom', x: adjR.x, y: adjR.y, dur: 500, view: 'ext', sec: d.sec });
        subdueStation(stById(adjR.st), 'force');
        return;
      }
      addFx({ k: 'tr', x0: d.x, y0: d.y, x1: adjR.x, y1: adjR.y, c: '#4ae0ff', dur: 180, view: 'ext' });
      if (adjR.hp <= 0) {
        removeObj(adjR);
        log(`${d.name} destroyed a ${adjR.kind === 'turret' ? 'defense turret' : 'rogue drone'}.`, 'good');
        if (adjR.kind === 'turret' && !G.ext.objs.some(o => o.kind === 'turret' && o.grp === adjR.grp))
          log('All defenses in this group are down. The sections can be cut free.', 'good');
        addFx({ k: 'boom', x: adjR.x, y: adjR.y, dur: 400, view: 'ext' });
        if (Math.random() < 0.3)
          G.ext.objs.push({
            id: G.nid++,
            sec: d.sec,
            kind: 'wreck',
            x: adjR.x,
            y: adjR.y,
            dt: pick(['util', 'guard']),
          });
        else
          G.ext.objs.push({
            id: G.nid++,
            sec: d.sec,
            kind: 'debris',
            x: adjR.x,
            y: adjR.y,
            res: { scrap: rr(2, 5), circ: rr(1, 3), rat: 0 },
          });
      }
    }
    return;
  }
  switch (t.type) {
    case 'idle':
      if (!atHatch(d)) goHome(d);
      else {
        d.hp = Math.min(d.max, d.hp + 1);
        if (cargoLoad(d) || d.pod) deposit(d);
      }
      break;
    case 'goto':
      moveTo(d, (x, y) => x === t.x && y === t.y, spd(d));
      break;
    case 'return':
      if (atHatch(d)) {
        deposit(d);
        d.task = t.after || { type: 'idle' };
      } else goHome(d);
      break;
    case 'salvage': {
      const o = objById(t.oid);
      const load = cargoLoad(d);
      if (!o || load >= D.cargo) {
        if (load > 0 || !o)
          d.task = { type: 'return', after: o ? { type: 'salvage', oid: o.id } : { type: 'idle' } };
        break;
      }
      if (cheb(d.x, d.y, o.x, o.y) <= 1) mine(d, o);
      else moveTo(d, adjTo(o.x, o.y), spd(d));
      break;
    }
    case 'fetch': {
      const o = objById(t.oid);
      if (!o) {
        d.task = { type: 'return' };
        break;
      }
      if (cheb(d.x, d.y, o.x, o.y) <= 1) {
        if (locked(o)) {
          log(`${d.name}: target still defended.`, 'warn');
          d.task = { type: 'idle' };
          break;
        }
        d.pod =
          o.kind === 'wreck'
            ? { wreck: o.dt }
            : o.kind === 'sci'
              ? { sci: 1 }
              : o.kind === 'raft'
                ? { raft: o.n }
                : o.c;
        removeObj(o);
        log(
          `${d.name} grabbed the ${o.kind === 'wreck' ? DT[o.dt].n + ' drone wreck' : o.kind === 'sci' ? 'research data core' : o.kind === 'raft' ? 'lifeboat. Survivors aboard: ' + o.n : 'supply pod'}.`,
        );
        d.task = { type: 'return' };
      } else moveTo(d, adjTo(o.x, o.y), spd(d));
      break;
    }
    case 'iface': {
      const m = modById(t.mid);
      const mi = modIndex(t.mid);
      const node = G.machines.find(k => k.type === 'node' && k.mi === mi);
      if (!m || !node || (t.mode === 'claim' && m.ctl)) {
        d.task = { type: 'idle' };
        break;
      }
      const h = hullNear(m, node.x, node.y);
      if (!h) {
        d.task = { type: 'idle' };
        break;
      }
      if (cheb(d.x, d.y, h[0], h[1]) <= 1) {
        if (t.mode === 'claim' && modBreaches(mi)) {
          log(`${d.name}: the ${m.name} is venting. The node will not talk until it is sealed.`, 'warn');
          d.task = { type: 'idle' };
          break;
        }
        if (t.mode === 'claim' && m.haywire && !node.lock && Math.random() < 0.05) {
          node.lock = 1;
          lockdown(m);
        }
        if (++t.w >= t.need) {
          if (t.mode === 'claim') claimDone(m, d.name);
          else {
            m.haywire = false;
            log(
              `${d.name} rebooted the ${m.name} security layer. Its maintenance bots will stay asleep now.`,
              'good',
            );
          }
          d.task = { type: 'idle' };
        }
      } else moveTo(d, adjTo(h[0], h[1]), spd(d));
      break;
    }
    case 'park': {
      const o = objById(t.oid);
      if (!o) {
        d.task = { type: 'idle' };
        break;
      }
      if (!t.att) {
        if (cheb(d.x, d.y, o.x, o.y) <= 1) {
          if (locked(o)) {
            d.task = { type: 'idle' };
            break;
          }
          t.att = 1;
          o.tow = d.id;
          log(`${d.name} clamps onto the ${o.pack.name}.`);
        } else moveTo(d, adjTo(o.x, o.y), spd(d));
        break;
      }
      if (o.sec === HULL) {
        o.tow = null;
        d.task = { type: 'idle' };
        log(`${d.name} parked the ${o.pack.name} in the hull yard.`, 'good');
        break;
      }
      break;
    }
    case 'scrap': {
      const o = objById(t.oid);
      if (!o || o.kind !== 'der') {
        d.task = { type: 'idle' };
        break;
      }
      if (locked(o)) {
        d.task = { type: 'idle' };
        break;
      }
      if (
        derHit(o, d.x, d.y) ||
        cheb(d.x, d.y, o.x, o.y) <= Math.max(o.pack.shape.w, o.pack.shape.h) / 2 + 1
      ) {
        if (++t.w >= t.need) {
          const v = scrapValue(o.pack);
          removeObj(o);
          if (o.sec === HULL || d.scan)
            learnFrom(
              o.pack,
              o.sec === HULL ? 'from scrapping at the station' : `recorded by ${d.name}'s scanner`,
            );
          if (o.sec === HULL) {
            addStock('scrap', v.s);
            addStock('circ', v.c);
            log(`${d.name} scrapped the ${o.pack.name}: +${v.s} scrap, +${v.c} circuits.`, 'good');
          } else {
            G.ext.objs.push({
              id: G.nid++,
              sec: o.sec,
              kind: 'debris',
              x: o.x,
              y: o.y,
              res: { scrap: v.s, circ: v.c, rat: 0 },
            });
            log(
              `${d.name} cut the ${o.pack.name} into salvage. The pieces float there as debris to haul home.${d.scan ? '' : ' Without a scanner, its design is lost.'}`,
              'good',
            );
          }
          d.task = { type: 'idle' };
        }
      } else moveTo(d, adjTo(o.x, o.y), spd(d));
      break;
    }
    case 'scrapmod': {
      const mi = modIndex(t.mid);
      if (mi < 0) {
        d.task = { type: 'idle' };
        break;
      }
      const near = (x, y) => modCells(G.mods[mi]).some(c => cheb(c.x, c.y, x, y) <= 1);
      if (near(d.x, d.y)) {
        const why = canDetach(mi);
        if (why) {
          log(`Scrap aborted: ${why}`, 'warn');
          d.task = { type: 'idle' };
          break;
        }
        if (!t.need) t.need = scrapValue(packModule0(G.mods[mi])).t;
        if (++t.w >= t.need) {
          const { pack } = packModule(mi);
          const v = scrapValue(pack);
          learnFrom(pack, 'from scrapping at the station');
          addStock('scrap', v.s);
          addStock('circ', v.c);
          for (const it of pack.items) dropNear(P.x, P.y, it.it);
          log(`${d.name} scrapped the ${pack.name}: +${v.s} scrap, +${v.c} circuits.`, 'good');
          d.task = { type: 'idle' };
        }
      } else moveTo(d, near, spd(d));
      break;
    }
    case 'build': {
      const h = t.conn
        ? {
            fn: 'tube',
            brand:
              t.brand ||
              (t.brand = pick(['scav', 'aster', 'volkov', 'kibo', 'columbus', 'bharat', 'tianhe'])),
            shape: connShape(t.conn),
            name: CONN[t.conn].n,
          }
        : (G.schem || []).find(h => h.key === t.key);
      const fp = freePorts().find(p => p.mid === t.mid && p.pi === t.pi);
      const pk =
        h && makePack(h.fn, h.brand, { shape: h.shape, fill: 'shell', cond: t => (FX[t] ? 40 : 100) });
      if (pk && t.conn) pk.name = CONN[t.conn].n;
      const fits = fp && pk ? fitsAt(pk, fp) : [];
      if (!fits.length) {
        addStock('scrap', t.paid.s);
        addStock('circ', t.paid.c);
        log(`${d.name}: no room for the new hull there any more. Materials refunded.`, 'warn');
        d.task = { type: 'idle' };
        break;
      }
      const ox = fp.x + fp.dx,
        oy = fp.y + fp.dy;
      if (cheb(d.x, d.y, ox, oy) <= 2) {
        if (++t.w >= t.need) {
          pk.pressure = 0;
          pk.ctl = true;
          pk.breaches = [];
          dockPack(pk, fp, fits[0], true);
          G.stat.docked++;
          G.stat.built = (G.stat.built || 0) + 1;
          if (t.conn) G.stat.tubes = (G.stat.tubes || 0) + 1;
          log(
            t.conn
              ? `${d.name} welded a ${h.name.toLowerCase()} in place.`
              : `${d.name} finished a new ${h.name} hull. Repair its main machine and fit small gear on its mounts.`,
            'good',
          );
          d.task = { type: 'idle' };
        }
      } else moveTo(d, (a, b) => cheb(a, b, ox, oy) <= 2, spd(d));
      break;
    }
    case 'cut': {
      const m = modById(t.mid);
      const c = m && cutSpot(m, t.lx, t.ly);
      if (!c) {
        addStock('scrap', 4);
        log(`${d.name}: that wall cannot take a port any more. Scrap refunded.`, 'warn');
        d.task = { type: 'idle' };
        break;
      }
      if (cheb(d.x, d.y, c.ox, c.oy) <= 1) {
        if (++t.w >= 6) {
          doCut(m, t.lx, t.ly);
          log(`${d.name} cut a new port into the ${m.name}.`, 'good');
          d.task = { type: 'idle' };
        }
      } else moveTo(d, adjTo(c.ox, c.oy), spd(d));
      break;
    }
    case 'seal': {
      const m = modById(t.mid);
      const fp = m && freePorts().find(p => p.mid === t.mid && p.pi === t.pi);
      if (!fp) {
        d.task = { type: 'idle' };
        break;
      }
      const ox = fp.x + fp.dx,
        oy = fp.y + fp.dy;
      if (cheb(d.x, d.y, ox, oy) <= 1) {
        if (++t.w >= 4) {
          doSeal(m, t.pi);
          log(`${d.name} welded the port shut on the ${m.name}.`, 'good');
          d.task = { type: 'idle' };
        }
      } else moveTo(d, adjTo(ox, oy), spd(d));
      break;
    }
    case 'brace': {
      const m = modById(t.mid);
      if (!m || !m.links[t.pi]) {
        d.task = { type: 'idle' };
        break;
      }
      if (cheb(d.x, d.y, t.x, t.y) <= 2) {
        if (++t.w >= 6) {
          setBrace(m, t.pi);
          log(`${d.name} finished a truss brace on the ${m.name} joint.`, 'good');
          d.task = { type: 'idle' };
        }
      } else moveTo(d, (a, b) => cheb(a, b, t.x, t.y) <= 2, spd(d));
      break;
    }
    case 'tube2': {
      const pl = t.plan;
      const s0 = pl.cells[0];
      const fp = freePorts().find(p => p.mid === pl.mid && p.pi === pl.pi);
      const stillOk =
        fp &&
        pl.shape.g.every((r, y) =>
          [...r].every(
            (ch, x) =>
              ch === ' ' ||
              M.map[idx(pl.ox + x, pl.oy + y)] === T.VOID ||
              (ch === '#' && M.map[idx(pl.ox + x, pl.oy + y)] === T.WALL) ||
              (ch !== '#' && false),
          ),
        );
      if (!stillOk) {
        addStock('scrap', pl.paid.s);
        G.kits += pl.paid.k;
        addStock('circ', 1);
        log(`${d.name}: the tube route is blocked now. Materials refunded.`, 'warn');
        d.task = { type: 'idle' };
        break;
      }
      if (cheb(d.x, d.y, s0[0], s0[1]) <= 2) {
        if (++t.w >= t.need) {
          const m = buildTube(pl);
          if (m) log(`${d.name} finished a ${pl.len}-tile connector tube.`, 'good');
          else {
            addStock('scrap', pl.paid.s);
            G.kits += pl.paid.k;
            addStock('circ', 1);
          }
          d.task = { type: 'idle' };
        }
      } else moveTo(d, (a, b) => cheb(a, b, s0[0], s0[1]) <= 2, spd(d));
      break;
    }
    case 'patch': {
      const b = G.brk.find(b => b.id === t.bid);
      if (!b) {
        d.task = { type: 'idle' };
        break;
      }
      if (cheb(d.x, d.y, b.x, b.y) <= 1) {
        if (++t.w >= 4) {
          const nm = G.mods[b.mod] ? G.mods[b.mod].name : '';
          removeBreach(b);
          log(`${d.name} welded a hull patch on ${nm}.`, 'good');
          d.task = { type: 'idle' };
        }
      } else moveTo(d, adjTo(b.x, b.y), spd(d));
      break;
    }
    case 'tube': {
      const m = modById(t.mid);
      const fp = m ? freePorts().find(p => p.mid === t.mid && p.pi === t.pi) : null;
      if (!fp) {
        d.task = { type: 'idle' };
        G.kits++;
        log('Tube build cancelled: that port is no longer free. Kit returned.', 'warn');
        break;
      }
      const ox = fp.x + fp.dx,
        oy = fp.y + fp.dy;
      if (cheb(d.x, d.y, ox, oy) <= 1) {
        if (++t.w >= 5) {
          const pk = makePack('tube', pick(['scav', 'aster', 'volkov', 'kibo']), {
            pressure: 0,
            cond: () => 100,
          });
          pk.breaches = [];
          const fits = fitsAt(pk, fp);
          if (fits.length) {
            const nx = freeNear(d.x, d.y, 8);
            dockPack(pk, fp, pick(fits), true);
            G.stat.docked++;
            if (nx) {
              d.x = nx[0];
              d.y = nx[1];
            }
            log(`${d.name} welded a connector tube onto the ${m.name}.`, 'good');
          } else {
            G.kits++;
            log('Not enough room to build a tube there. Kit returned.', 'warn');
          }
          d.task = { type: 'idle' };
        }
      } else moveTo(d, adjTo(ox, oy), spd(d));
      break;
    }
    case 'tow': {
      const o = objById(t.oid);
      if (!o) {
        d.task = { type: 'idle' };
        break;
      }
      if (!t.att) {
        if (cheb(d.x, d.y, o.x, o.y) <= 1) {
          if (locked(o)) {
            log(`${d.name}: the ${o.pack.name} is still covered by turrets.`, 'warn');
            d.task = { type: 'idle' };
            break;
          }
          t.att = 1;
          o.tow = d.id;
          log(`${d.name} clamps onto the ${o.pack.name} section.`);
        } else moveTo(d, adjTo(o.x, o.y), spd(d));
        break;
      }
      if (!t.mid) {
        t.tk = (t.tk || 0) + 1;
        break;
      }
      const fp = freePorts().find(p => p.mid === t.mid && p.pi === t.pi);
      if (!fp || !fitsAt(o.pack, fp).length) {
        o.tow = null;
        d.task = { type: 'idle' };
        log('Tow aborted: that port is blocked now. Pick another.', 'warn');
        break;
      }
      const tx = fp.x + fp.dx * 2,
        ty = fp.y + fp.dy * 2;
      if (cheb(d.x, d.y, tx, ty) <= 1) {
        const fits = fitsAt(o.pack, fp);
        removeObj(o);
        dockPack(o.pack, fp, pick(fits));
        if (o.pack.redock) G.stat.redocked++;
        const nx = freeNear(d.x, d.y, 10);
        if (nx) {
          d.x = nx[0];
          d.y = nx[1];
        }
        d.task = { type: 'idle' };
        break;
      }
      if (++t.tk % D.tow === 0) {
        const ox = d.x,
          oy = d.y;
        if (moveTo(d, (x, y) => cheb(x, y, tx, ty) <= 1, 1)) {
          o.x = ox;
          o.y = oy;
        }
      }
      break;
    }
    case 'detach': {
      const mi = modIndex(t.mid);
      if (mi < 0) {
        d.task = { type: 'idle' };
        break;
      }
      const near = (x, y) => modCells(G.mods[mi]).some(c => cheb(c.x, c.y, x, y) <= 1);
      if (near(d.x, d.y)) {
        if (++t.w >= 6) {
          const why = canDetach(mi);
          if (why) {
            log(`Detach aborted: ${why}`, 'warn');
            d.task = { type: 'idle' };
            break;
          }
          const { pack, cx, cy } = packModule(mi);
          pack.redock = true;
          const o = { id: G.nid++, sec: HULL, kind: 'der', x: cx, y: cy, pack, tow: d.id };
          G.ext.objs.push(o);
          G.stat.detached++;
          d.task = { type: 'tow', oid: o.id, att: 1, tk: 0 };
          log(
            `${d.name} unbolts the ${pack.name} and holds it. Tap a free port... or tap the section again to choose where it goes.`,
            'good',
          );
        }
      } else moveTo(d, near, spd(d));
      break;
    }
    case 'deploy': {
      if (d.x <= 1 || d.y <= 1 || d.x >= WW - 2 || d.y >= WH - 2) {
        releaseSat(t.sat, t.assign);
        d.task = { type: 'return' };
        break;
      }
      moveTo(d, (x, y) => x <= 1 || y <= 1 || x >= WW - 2 || y >= WH - 2, spd(d));
      break;
    }
    case 'attack': {
      const o = objById(t.oid);
      if (!o) {
        d.task = { type: 'idle' };
        break;
      }
      moveTo(d, adjTo(o.x, o.y), spd(d));
      break;
    }
    case 'hack': {
      const st = stById(t.st);
      if (!st || st.state !== 'hostile') {
        d.task = { type: 'idle' };
        break;
      }
      const parts = G.ext.objs.filter(o => o.st === st.id && o.kind === 'der');
      const near = (x, y) =>
        parts.some(o => {
          const sh = o.pack.shape,
            ox = o.x - (sh.w >> 1),
            oy = o.y - (sh.h >> 1);
          return x >= ox - 1 && y >= oy - 1 && x <= ox + sh.w && y <= oy + sh.h;
        });
      if (!near(d.x, d.y)) {
        moveTo(d, near, spd(d));
        break;
      }
      if (!t.on) {
        t.on = 1;
        hackInit(st);
        log(
          `${d.name} jacks into a maintenance port on the ${st.name}. Old corp firmware: the engineers always left a back door.`,
          'info',
        );
        if (!t.auto) V.hackOpen = d.id;
      }
      hackTurn(d, st, t);
      break;
    }
  }
  const np = G.ext.objs.find(o => o.kind === 'null' && o.sec === d.sec && cheb(o.x, o.y, d.x, d.y) <= 1);
  if (np) {
    np.seen = true;
    log(`${d.name} drifted into a null pocket. Signal lost. Nothing came back.`, 'bad');
    G.ext.drones = G.ext.drones.filter(x => x !== d);
    if (d.task.type === 'tow') {
      const o = objById(d.task.oid);
      if (o) o.tow = null;
    }
    if (G.sel === d.id) G.sel = G.ext.drones[0] ? G.ext.drones[0].id : null;
  }
}
function freeNear(x, y, r) {
  for (let k = 1; k <= r; k++)
    for (const [dx, dy] of D8) {
      const nx = x + dx * k,
        ny = y + dy * k;
      if (extFree(nx, ny)) return [nx, ny];
    }
  return null;
}
function swarmAct(r) {
  const dr = G.ext.drones
    .filter(d => d.sec === r.sec && !d.tr && cheb(d.x, d.y, r.x, r.y) <= 6)
    .sort((a, b) => cheb(a.x, a.y, r.x, r.y) - cheb(b.x, b.y, r.x, r.y))[0];
  if (dr) {
    if (cheb(dr.x, dr.y, r.x, r.y) <= 1) {
      if (Math.random() < 0.5) {
        dr.hp -= rr(2, 4);
        if (dr.hp <= 0) killDrone(dr, 'a reclaimer swarm');
      }
    } else moveTo(r, adjTo(dr.x, dr.y), 1);
    return;
  }
  const db = G.ext.objs.find(o => o.kind === 'debris' && o.sec === r.sec && cheb(o.x, o.y, r.x, r.y) <= 1);
  if (db && Math.random() < 0.2) {
    const k = pick(['scrap', 'circ']);
    if (db.res[k] > 0) db.res[k]--;
    return;
  }
  if (Math.random() < 0.5) {
    const [dx, dy] = pick(D8);
    const nx = clamp(r.x + dx, 2, WW - 3),
      ny = clamp(r.y + dy, 2, WH - 3);
    if (r.sec !== HULL || extFree(nx, ny)) {
      r.x = nx;
      r.y = ny;
    }
  }
}
function rogueAct(r) {
  if (r.tag === 'swarm' || (r.sec !== HULL && r.sec !== G.home)) return swarmAct(r);
  if (r.sec === G.home) {
    const [cx, cy] = LC();
    if (G.turn - (r.born || 0) > 100) {
      removeObj(r);
      return;
    }
    const dr0 = G.ext.drones.filter(d => d.sec === r.sec && !d.tr && cheb(d.x, d.y, r.x, r.y) <= 5)[0];
    if (dr0) {
      if (cheb(dr0.x, dr0.y, r.x, r.y) <= 1) {
        if (Math.random() < 0.6) {
          dr0.hp -= r.tag === 'hunter' ? rr(5, 9) : rr(3, 7);
          addFx({
            k: 'tr',
            x0: r.x,
            y0: r.y,
            x1: dr0.x,
            y1: dr0.y,
            c: '#ff5a5a',
            dur: 180,
            view: 'ext',
            sec: r.sec,
          });
          if (dr0.hp <= 0) killDrone(dr0, 'a rogue drone');
        }
      } else moveTo(r, adjTo(dr0.x, dr0.y), 1);
      return;
    }
    if (cheb(r.x, r.y, cx, cy) <= 3) {
      r.sec = HULL;
      const b = stationBox();
      const a = Math.random() * Math.PI * 2;
      const p = nearestVoid(
        clamp(Math.round(b.cx + Math.cos(a) * (Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 8)), 2, WW - 3),
        clamp(Math.round(b.cy + Math.sin(a) * (Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2 + 8)), 2, WH - 3),
      );
      if (p) {
        r.x = p[0];
        r.y = p[1];
      }
      log(`Proximity alarm: a ${r.tag === 'hunter' ? 'hunter' : 'rogue drone'} is at the hull.`, 'bad');
      return;
    }
    moveTo(r, adjTo(cx, cy), 1);
    return;
  }
  if (r.tag === 'hunter' && G.silent && Math.random() < 0.05) {
    removeObj(r);
    log('A hunter loses your trail in the silence and drifts off.', 'info');
    return;
  }
  if (G.turn - (r.born || 0) > 100) {
    removeObj(r);
    log('A rogue drone breaks off and drifts away.', 'info');
    return;
  }
  const dr = G.ext.drones
    .filter(d => d.sec === r.sec && !d.tr && !atHatch(d) && cheb(d.x, d.y, r.x, r.y) <= 6)
    .sort((a, b) => cheb(a.x, a.y, r.x, r.y) - cheb(b.x, b.y, r.x, r.y))[0];
  if (dr) {
    if (cheb(dr.x, dr.y, r.x, r.y) <= 1) {
      if (Math.random() < 0.6) {
        dr.hp -= r.tag === 'hunter' ? rr(5, 9) : rr(3, 7);
        addFx({ k: 'tr', x0: r.x, y0: r.y, x1: dr.x, y1: dr.y, c: '#ff5a5a', dur: 180, view: 'ext' });
        if (dr.hp <= 0) killDrone(dr, 'a rogue drone');
      }
    } else moveTo(r, adjTo(dr.x, dr.y), 1);
    return;
  }
  if (r.tm == null || !modById(r.tm)) r.tm = pick(G.mods).id;
  const m = modById(r.tm);
  const mi = modIndex(m.id);
  const near = (x, y) => modCells(m).some(c => cheb(c.x, c.y, x, y) <= 1);
  if (near(r.x, r.y)) {
    if (Math.random() < 0.08 && m.breaches.length < 2) {
      if (addBreachMod(mi)) {
        log(`A rogue drone cuts into the ${m.name} hull! Breach.`, 'bad');
        addFx({ k: 'boom', x: r.x, y: r.y, dur: 400, view: 'ext' });
      }
    }
  } else moveTo(r, near, 1);
}
function turretTick() {
  const ts = G.machines.filter(m => m.type === 'turret' && online(m));
  if (!ts.length) return;
  const foes = G.ext.objs.filter(o => o.kind === 'rogue' && o.sec === HULL);
  if (!foes.length) return;
  for (const tu of ts) {
    const out = D4.map(([dx, dy]) => [tu.x + dx, tu.y + dy]).find(
      ([a, b]) => inB(a, b) && M.map[idx(a, b)] === T.VOID,
    );
    if (!out) continue;
    const t = foes
      .filter(o => G.ext.objs.includes(o) && cheb(o.x, o.y, out[0], out[1]) <= 12)
      .sort((a, b) => cheb(a.x, a.y, out[0], out[1]) - cheb(b.x, b.y, out[0], out[1]))[0];
    if (!t) continue;
    if (G.stock.ammo < 1) {
      if (G.turn - (G.dryLog || -99) > 60) {
        G.dryLog = G.turn;
        log('Hull turrets are dry: no ammo in storage. Fabricate ammo.', 'warn');
      }
      return;
    }
    if (Math.random() > 0.65) continue;
    G.stock.ammo--;
    const hit = Math.random() < (hasCrew('gunner') ? 0.85 : 0.7);
    addFx({
      k: 'tr',
      x0: out[0],
      y0: out[1],
      x1: t.x,
      y1: t.y,
      c: '#ffb070',
      dur: 180,
      view: 'ext',
      sec: HULL,
    });
    if (hit) {
      t.hp -= rr(7, 12) + (hasCrew('gunner') ? 3 : 0) + (hasAI('warden') ? 3 : 0);
      if (t.hp <= 0) {
        removeObj(t);
        G.stat.kills++;
        log('A hull turret shot down a hostile drone.', 'good');
      }
    }
  }
}
export function extTick() {
  sensorTick();
  updateSight();
  if (G.move && --G.move.eta <= 0) relocateHome(G.move.to);
  if (!G.droneUnlocked) return;
  for (const d of G.ext.drones.slice()) if (G.ext.drones.includes(d)) droneAct(d);
  for (const r of G.ext.objs.filter(o => o.kind === 'rogue')) if (G.ext.objs.includes(r)) rogueAct(r);
  turretTick();
  const pd = G.machines.find(m => m.type === 'defense' && online(m));
  if (pd) {
    const t = G.ext.objs.filter(
      o => o.kind === 'rogue' && o.sec === HULL && cheb(o.x, o.y, pd.x, pd.y) <= 18,
    )[0];
    if (t && Math.random() < 0.5) {
      t.hp -= rr(8, 14) + (hasAI('warden') ? 4 : 0);
      addFx({ k: 'tr', x0: pd.x, y0: pd.y, x1: t.x, y1: t.y, c: '#ff5050', dur: 200, view: 'ext' });
      cmb('Point defense fires.', 'good');
      if (t.hp <= 0) {
        removeObj(t);
        log('Point defense destroyed a rogue drone.', 'good');
      }
    }
  }
  for (const g of G.ext.drones.filter(d => d.dt === 'guard' && d.task.type === 'idle' && !d.tr)) {
    const r = G.ext.objs.find(o => o.kind === 'rogue' && o.sec === g.sec && cheb(o.x, o.y, g.x, g.y) <= 14);
    if (r) g.task = { type: 'attack', oid: r.id };
  }
  for (const o of G.ext.objs) {
    if (o.kind !== 'turret' && o.kind !== 'platform' && o.kind !== 'core') continue;
    let range = o.r;
    if (o.kind === 'platform') {
      const L = G.legacy[o.lid];
      if (L.tags.includes(TAGK)) continue;
    } else {
      const st = stById(o.st);
      if (!st || st.state !== 'hostile') continue;
      range = o.kind === 'core' ? (st.alert ? 5 : 0) : st.alert ? o.r : 3;
      if (!range) continue;
    }
    const tgt = G.ext.drones
      .filter(d => d.sec === o.sec && !d.tr && cheb(d.x, d.y, o.x, o.y) <= range)
      .sort((a, b) => cheb(a.x, a.y, o.x, o.y) - cheb(b.x, b.y, o.x, o.y))[0];
    if (tgt && Math.random() < (o.kind === 'platform' ? 0.7 : 0.45)) {
      const dm = o.kind === 'platform' ? rr(8, 14) : rr(3, 6);
      tgt.hp -= dm;
      addFx({
        k: 'tr',
        x0: o.x,
        y0: o.y,
        x1: tgt.x,
        y1: tgt.y,
        c: o.kind === 'platform' ? '#ffffff' : '#ff7040',
        dur: 200,
        view: 'ext',
        sec: o.sec,
      });
      cmb(
        `${o.kind === 'platform' ? G.legacy[o.lid].n : o.kind === 'core' ? 'Security core' : 'Turret'} hits ${tgt.name} (${dm})`,
        'bad',
      );
      if (o.st != null) {
        const st = stById(o.st);
        if (st && !st.alert) {
          st.alert = true;
          log(`${st.name} opens fire. It is on alert now.`, 'bad');
        }
      }
      if (tgt.hp <= 0) killDrone(tgt, o.kind === 'platform' ? G.legacy[o.lid].n : 'a defense turret');
    }
  }
}
