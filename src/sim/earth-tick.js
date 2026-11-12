import { T } from '../core/constants.js';
import { FAC, RC, TAGK, hasAI, rivalsOf } from '../core/data.js';
import { G, M } from '../core/state.js';
import { clamp, idx, pick, rnd, rr } from '../core/util.js';
import { endGame } from './end.js';
import { occupied } from './stats.js';
import { cellName, frontierCell, legacyTick, shares, territoryTick } from '../space/earth.js';
import { addPod, addRogue } from '../space/exterior-objects.js';
import { genStation, revealSector } from '../space/sectors.js';
import { log, queueModal } from '../ui/log-modal.js';
import { setTab } from '../ui/panels.js';
import { addBreachMod, modCells } from '../world/build.js';
import { addStock, commsOnline, hasOnline } from '../world/machines.js';

export function firstContact() {
  G.contact = true;
  G.contactTurn = G.turn;
  G.accordTurn = G.turn + 4500;
  G.timers.earth = G.turn + 50;
  G.bp.sat_WEATHER = 1;
  G.bp.sat_NAV = 1;
  G.bp.sat_RECON = 1;
  G.fac.forEach(f => {
    f.cd = rr(10, 60);
  });
  log('COMMS ONLINE. Four encrypted signals answer from under the surface.', 'good');
  queueModal(
    'C O N T A C T',
    `Four bunker powers are coming up for air. The surface is still a radioactive wasteland, and six generations of legacy defense satellites shoot at anything not in their IFF tables. That means everyone alive.

${FAC.map(f => `${f.sh}: ${f.desc}\n  Pays in: ${f.gives}`).join('\n\n')}

Rivalries: COMPACT vs COVENANT, COVENANT vs SAHEL, COMPACT vs TIDEWATER.

They have called an Accord in 4500 cycles. Every satellite you put up and every IFF table you spoof shifts the balance.

Satellite schematics received: WEATHER, NAV, RECON.`,
    [{ t: 'Open EARTH view', f: () => setTab('earth') }, { t: 'Close' }],
  );
}
function genReq(fi) {
  const F = FAC[fi],
    f = G.fac[fi];
  let type = f.nreq === 0 ? 'sat' : pick(['sat', 'sat', 'relay', 'survey', 'cargo', 'spoof']);
  const known = G.legacy.filter(L => L.known && !L.tags.includes(fi));
  if (type === 'spoof' && !known.length) type = 'relay';
  const r = { id: G.nid++, f: fi, type, deadline: G.turn + rr(600, 900) };
  if (type === 'sat') {
    const [x, y] = frontierCell(fi);
    r.sat = F.sat;
    r.cell = [x, y];
    r.text = `Put a ${F.sat} satellite over ${cellName(x, y)}.`;
  }
  if (type === 'relay') {
    r.goal = 80;
    r.prog = 0;
    r.text = 'Route our encrypted traffic: keep Comms online for 80 cycles.';
    r.deadline = G.turn + 400;
  }
  if (type === 'survey') {
    const rv = pick(rivalsOf(fi));
    r.rival = rv;
    const [x, y] = frontierCell(rv);
    r.cell = [x, y];
    r.text = `Map ${FAC[rv].sh} positions around ${cellName(x, y)}. Needs a Sensor Array.`;
  }
  if (type === 'cargo') {
    const res = fi === 2 ? 'scrap' : fi === 1 ? 'circ' : fi === 3 ? 'rat' : 'scrap';
    const amt = res === 'rat' ? 6 : res === 'circ' ? 12 : 25;
    r.need = { [res]: amt };
    r.text = `Drop ${amt} ${res === 'circ' ? 'circuits' : res === 'rat' ? 'rations' : 'scrap'} to our people. Needs a Launch Bay.`;
  }
  if (type === 'spoof') {
    const L = pick(known);
    r.lid = L.id;
    r.text = `Get us tagged as friendly in ${L.n}'s IFF tables.`;
  }
  f.nreq++;
  G.reqs.push(r);
  log(`${F.sh} REQUEST: ${r.text}`, 'info');
  G.intr = true;
}
function podFor(f) {
  const c = { scrap: 0, circ: 0, rat: 0, ammo: 0, items: [] };
  if (f === 0) {
    c.circ = rr(8, 14);
    c.scrap = rr(4, 8);
    if (Math.random() < 0.4) c.items.push(pick(['scanner', 'o2tank']));
  }
  if (f === 1) {
    c.scrap = rr(12, 20);
    c.ammo = rr(15, 30);
    if (Math.random() < 0.6) c.items.push(pick(['carbine', 'scatter', 'armor', 'cutter', 'dorm_guard']));
  }
  if (f === 2) {
    c.rat = rr(5, 9);
    c.scrap = rr(4, 8);
    if (Math.random() < 0.6) c.items.push('medkit');
  }
  if (f === 3) {
    c.scrap = rr(10, 16);
    c.circ = rr(4, 8);
    if (Math.random() < 0.5) c.items.push(pick(['magboots', 'liner', 'dorm_util', 'dorm_tug']));
  }
  return c;
}
export function changeRep(f, n) {
  G.fac[f].rep = clamp(G.fac[f].rep + n, -100, 100);
  if (G.fac[f].rep >= 30 && !G.fac[f].trusted) {
    G.fac[f].trusted = true;
    const bps = FAC[f].trustBp;
    bps.forEach(b => (G.bp[b] = 1));
    log(
      `${FAC[f].sh} now trusts you.${bps.length ? ' Schematics received: ' + bps.map(b => RC[b].n).join(', ') + '.' : ''}${f === 2 ? ' They send coordinates of an abandoned farm platform.' : ''}`,
      'good',
    );
    if (f === 2) {
      const q = G.sectors.filter(s => s.type === 'quiet' && s.id !== G.home);
      if (q.length) {
        const s = pick(q);
        s.type = 'station';
        const st = genStation(s.id, 'civil', ['hydro', 'hab'], { ice: 1, tur: 1 });
        if (st) {
          s.name = st.name;
          st.name = 'abandoned farm platform';
        }
        revealSector(s, 'SAHEL');
      }
    }
  }
}
export function completeReq(r, how) {
  G.reqs = G.reqs.filter(x => x !== r);
  const F = FAC[r.f];
  const gain = { sat: 20, relay: 8, survey: 15, cargo: 12, spoof: 18 }[r.type],
    loss = { sat: 8, relay: 3, survey: 10, cargo: 4, spoof: 12 }[r.type];
  changeRep(r.f, gain);
  for (const rv of rivalsOf(r.f)) {
    const det = r.type === 'survey' || r.type === 'spoof' ? Math.random() < 0.5 : true;
    if (det) changeRep(rv, -loss);
  }
  G.fac[r.f].boost += { sat: 4, relay: 3, survey: 5, cargo: 5, spoof: 3 }[r.type];
  if (r.type === 'survey') G.fac[r.rival].boost = Math.max(0, G.fac[r.rival].boost - 3);
  if (G.droneUnlocked) addPod(r.f, podFor(r.f));
  else {
    const c = podFor(r.f);
    ['scrap', 'circ', 'rat', 'ammo'].forEach(k => {
      if (c[k]) addStock(k, c[k]);
    });
  }
  G.stat.reqDone++;
  log(
    `${F.sh} request complete${how ? ' (' + how + ')' : ''}. +${gain} rep. ${G.droneUnlocked ? 'A supply pod is on its way up (EXTERIOR).' : 'Supplies transmitted.'}`,
    'good',
  );
}
export function earthTick() {
  if (!G.contact) return;
  const comms = commsOnline();
  G.fac.forEach((f, i) => {
    if (!comms) return;
    if (--f.cd <= 0) {
      f.cd = rr(110, 190);
      if (G.reqs.filter(r => r.f === i).length < 2) genReq(i);
    }
  });
  for (const r of G.reqs.slice()) {
    if (r.type === 'relay' && comms && ++r.prog >= r.goal) completeReq(r);
    else if (G.turn > r.deadline) {
      G.reqs = G.reqs.filter(x => x !== r);
      changeRep(r.f, -6);
      log(`${FAC[r.f].sh} request expired. -6 rep.`, 'warn');
    }
  }
  if (G.survey) {
    const r = G.reqs.find(x => x.id === G.survey.rid);
    if (!r) G.survey = null;
    else if (hasOnline('sensor') && ++G.survey.prog >= 40) {
      G.survey = null;
      completeReq(r, 'survey');
    }
  }
  if (G.spoof && comms && ++G.spoof.prog >= 30) {
    const s = G.spoof;
    G.spoof = null;
    spoofResolve(s);
  }
  if (hasOnline('sensor') && G.turn >= G.timers.reveal) {
    G.timers.reveal = G.turn + 120;
    const u = G.legacy.filter(L => !L.known);
    if (u.length) {
      const L = pick(u);
      L.known = true;
      log(`Sensor Array identified legacy satellite ${L.n} (${L.org}, ${L.yr}).`, 'info');
    }
  }
  if (G.turn >= G.timers.earth) {
    G.timers.earth = G.turn + 50;
    territoryTick();
    legacyTick();
    sabotageTick();
  }
  const sh = shares();
  if (G.turn >= G.accordTurn) endGame('accord');
  else if (sh.tot >= 24 && sh.c.some(c => c / sh.tot >= 0.7)) endGame('hegemony');
}
function sabotageTick() {
  G.fac.forEach((f, i) => {
    if (f.rep > -40 || Math.random() > 0.25) return;
    if (G.droneUnlocked && Math.random() < 0.6) {
      addRogue(i);
      addRogue(i);
      log(`${FAC[i].sh} hacked drones are inbound.`, 'bad');
    } else if (Math.random() < 0.5) {
      const mi = rnd(G.mods.length);
      const b = addBreachMod(mi);
      if (b) {
        const m = G.mods[mi];
        const fl = modCells(m).filter(
          c => c.c === '.' && !occupied(c.x, c.y) && M.map[idx(c.x, c.y)] === T.FLOOR,
        );
        if (fl.length) {
          const c = pick(fl);
          G.actors.push({
            id: G.nid++,
            type: 'boarder',
            x: c.x,
            y: c.y,
            hp: 30,
            max: 30,
            alert: true,
            lost: 0,
          });
        }
        log(`${FAC[i].sh} boarder drone cuts into the ${m.name}!`, 'bad');
      }
    } else {
      G.jam = G.turn + 40;
      log(`${FAC[i].sh} is jamming your comms.`, 'bad');
    }
  });
}
function spoofResolve(s) {
  const L = G.legacy[s.lid];
  const ch = 55 + (hasOnline('sensor') ? 20 : 0) + (hasAI('cipher') ? 15 : 0);
  if (Math.random() * 100 < ch && s.f === TAGK) {
    L.tags.push(TAGK);
    G.stat.spoofs++;
    log(`IFF spoof successful: ${L.n} now ignores KESTREL-9 drones.`, 'good');
    return;
  }
  if (Math.random() * 100 < ch) {
    L.tags.push(s.f);
    G.stat.spoofs++;
    log(
      `IFF spoof successful: ${L.n} now treats ${FAC[s.f].sh} as friendly. It still fires on everyone else.`,
      'good',
    );
    const r = G.reqs.find(x => x.type === 'spoof' && x.f === s.f && x.lid === L.id);
    if (r) completeReq(r, 'IFF');
    else {
      changeRep(s.f, 10);
      G.fac[s.f].boost += 2;
    }
    for (const rv of rivalsOf(s.f)) if (Math.random() < 0.4) changeRep(rv, -8);
  } else {
    const c = G.machines.find(m => m.type === 'comms');
    if (c) c.cond -= 25;
    log(`IFF spoof failed. ${L.n} traced the intrusion and fried the Comms Array (-25%).`, 'bad');
  }
}
export function releaseSat(type, assign) {
  const r = assign.req ? G.reqs.find(x => x.id === assign.req) : null;
  const f = r ? r.f : assign.f;
  const cell = r && r.type === 'sat' && r.sat === type ? r.cell : frontierCell(f);
  G.orbit.push({ f, type, cx: cell[0], cy: cell[1] });
  G.stat.sats++;
  G.fac[f].boost += 3;
  log(`${type} satellite released into orbit for ${FAC[f].sh} over ${cellName(cell[0], cell[1])}.`, 'good');
  if (type === 'RECON') {
    const u = G.legacy.filter(L => !L.known);
    if (u.length) {
      const L = pick(u);
      L.known = true;
      log(`RECON sweep identified legacy satellite ${L.n}.`, 'info');
    }
  }
  if (r && r.type === 'sat' && r.sat === type) completeReq(r, 'satellite');
  else {
    changeRep(f, 6);
    for (const rv of rivalsOf(f)) changeRep(rv, -3);
  }
}
