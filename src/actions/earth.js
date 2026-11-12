import { EGW } from '../core/constants.js';
import { FAC, TAGK, isRival } from '../core/data.js';
import { G, V } from '../core/state.js';
import { shuffle } from '../core/util.js';
import { changeRep, completeReq } from '../sim/earth-tick.js';
import { endTurn, refresh } from '../sim/turn.js';
import { isHome, nbrs, ownedCells } from '../space/earth.js';
import { tagName } from '../space/sectors.js';
import { log, showModal } from '../ui/log-modal.js';
import { commsOnline, hasOnline } from '../world/machines.js';

export function startSurvey(rid) {
  if (!hasOnline('sensor')) {
    log('Needs an online Sensor Array.', 'warn');
    return refresh();
  }
  G.survey = { rid, prog: 0 };
  log('Sensor Array: survey started (40 turns).');
  refresh();
}
export function launchCargo(r) {
  if (!hasOnline('launch')) {
    log('Needs an online Launch Rail.', 'warn');
    return refresh();
  }
  const [k, n] = Object.entries(r.need)[0];
  if (G.stock[k] < n) {
    log('Not enough in stock.', 'warn');
    return refresh();
  }
  G.stock[k] -= n;
  log('Cargo capsule away.');
  completeReq(r, 'cargo');
  endTurn();
}
export function spoofMenu(lid) {
  const L = G.legacy[lid];
  if (!commsOnline()) {
    log('Comms must be online.', 'warn');
    return refresh();
  }
  if (G.spoof) {
    log('An IFF spoof is already running.', 'warn');
    return refresh();
  }
  const ch = 55 + (hasOnline('sensor') ? 20 : 0);
  showModal(
    `IFF SPOOF: ${L.n}`,
    `${L.n}, ${L.org} (${L.yr}). Strike radius ${L.r}.\nTagged friendly: ${L.tags.length ? L.tags.map(tagName).join(', ') : 'nobody'}\n\nInjecting a faction's ID into its IFF table makes it stop firing on that faction. It keeps firing on everyone else, so it becomes their weapon against rivals.\n\nCost: 6 circuits, 30 turns of comms time. Success ${ch}%${hasOnline('sensor') ? ' (Sensor Array bonus)' : ''}. Failure damages the Comms Array. Rivals may notice.`,
    FAC.map((F, fi) => ({
      t: `Tag ${F.sh}`,
      dis: L.tags.includes(fi) || G.stock.circ < 6,
      f: () => {
        G.stock.circ -= 6;
        G.spoof = { lid, f: fi, prog: 0 };
        log(`IFF spoof on ${L.n} for ${F.sh} started.`);
        refresh();
      },
    })).concat([
      {
        t: 'Tag KESTREL-9 (your drones fly safe near it)',
        dis: L.tags.includes(TAGK) || G.stock.circ < 6,
        f: () => {
          G.stock.circ -= 6;
          G.spoof = { lid, f: TAGK, prog: 0 };
          log(`IFF spoof on ${L.n} for KESTREL-9 started.`);
          refresh();
        },
      },
      { t: 'Cancel' },
    ]),
  );
}

export function strikeMenu(fi) {
  const F = FAC[fi];
  showModal(
    `MASS DRIVER: ${F.sh}`,
    `Drop kinetic rounds on ${F.n} positions at the edge of their territory. Bunker cores are too deep to hit.\n\nCost: 15 ammo. ${F.sh} loses up to 3 settled cells and will hate you for it (-35 rep). Their rivals cheer (+8). Everyone else gets nervous (-5): nobody likes a station that can do this.`,
    [
      {
        t: 'Fire',
        dis: G.stock.ammo < 15 || !hasOnline('driver'),
        f: () => {
          G.stock.ammo -= 15;
          G.hot = (G.hot || 0) + 40;
          const own = ownedCells(fi).filter(i => !isHome(fi, i) && nbrs(i).some(n => G.owner[n] !== fi));
          let hit = 0;
          for (const i of shuffle(own).slice(0, 3)) {
            G.owner[i] = -1;
            hit++;
            V.strikes.push({ x: i % EGW, y: (i / EGW) | 0, t0: performance.now() });
          }
          changeRep(fi, -35);
          G.fac[fi].boost = Math.max(0, G.fac[fi].boost - 5);
          for (let f = 0; f < 4; f++) {
            if (f === fi) continue;
            changeRep(f, isRival(f, fi) ? 8 : -5);
          }
          log(
            `MASS DRIVER FIRES. ${hit} ${F.sh} position${hit === 1 ? '' : 's'} erased. The surface noticed.`,
            'warn',
          );
          endTurn();
        },
      },
      { t: 'Cancel' },
    ],
  );
}
