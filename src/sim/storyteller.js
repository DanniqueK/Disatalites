import { T } from '../core/constants.js';
import { MD } from '../core/data.js';
import { log } from '../core/messages.js';
import { G, M, P } from '../core/state.js';
import { idx, pick, pickW, rnd, rr, shuffle } from '../core/util.js';
import { occupied } from './stats.js';
import { addDebris, addPod, addRogue, addWreck } from '../space/exterior-objects.js';
import { addRaft, cid, contact, det, secName } from '../space/sectors.js';
import { addBreachMod, modCells } from '../world/build.js';
import { hasOnline, online } from '../world/machines.js';

const INC = [
  {
    k: 'hunters',
    major: 1,
    can: () => G.droneUnlocked && G.sig >= 16 && G.stations.some(st => st.mad && st.state === 'hostile'),
    w: D => (G.sig - 12) / 8 + D.tension,
    run: () => {
      const st = pick(G.stations.filter(st => st.mad && st.state === 'hostile'));
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
      log(
        `${st.name} heard you. ${n} hunter drones inbound. (Signature ${G.sig}: run silent to stay hidden.)`,
        'bad',
      );
    },
  },
  {
    k: 'sweep',
    major: 1,
    can: () => G.sig >= 28 && G.turn > 400,
    w: () => (G.sig - 24) / 10,
    run: () => {
      const mi = rnd(G.mods.length);
      addBreachMod(mi);
      log(
        `A legacy platform's search radar locked onto your emissions and fired. ${G.mods[mi].name} hull breached.`,
        'bad',
      );
    },
  },
  {
    k: 'rogue',
    major: 1,
    can: () => G.droneUnlocked && G.turn > 250,
    w: D => D.tension * 2 * Math.max(0.3, G.sig / 18),
    run: () => {
      const n = G.turn < 1200 ? 1 : rr(1, 3);
      for (let i = 0; i < n; i++) addRogue();
      log(
        hasOnline('sensor')
          ? `Sensor Array: ${n} rogue drone${n > 1 ? 's' : ''} inbound.`
          : 'Proximity alarm: rogue drone contact.',
        'warn',
      );
    },
  },
  {
    k: 'micro',
    major: 1,
    can: () => G.turn > 300,
    w: D => D.tension * 1.4,
    run: () => {
      const n = rr(1, G.mods.length > 6 ? 3 : 2);
      const hit = [];
      for (let i = 0; i < n; i++) {
        const mi = rnd(G.mods.length);
        if (addBreachMod(mi)) hit.push(G.mods[mi].name);
      }
      if (hit.length) log(`Micrometeoroid shower! Hull breached: ${hit.join(', ')}.`, 'bad');
    },
  },
  {
    k: 'flare',
    major: 0,
    can: () => G.turn > 400,
    w: D => 0.6 + D.tension * 0.5,
    run: () => {
      G.bat *= 0.3;
      const t = shuffle(G.machines.filter(m => MD[m.type].tech)).slice(0, 2);
      for (const m of t) m.cond -= rr(8, 15);
      log('Solar flare. Batteries drained, electronics scorched.', 'warn');
    },
  },
  {
    k: 'fault',
    major: 0,
    can: () => G.machines.some(m => MD[m.type].tech && online(m)),
    w: () => 1.2,
    run: () => {
      const m = pick(G.machines.filter(m => MD[m.type].tech && online(m)));
      m.cond -= rr(20, 35);
      log(
        `FAULT: ${MD[m.type].n} in ${G.mods[m.mi] ? G.mods[m.mi].name : '?'} (${Math.round(m.cond)}%).`,
        'warn',
      );
    },
  },
  {
    k: 'vermin',
    major: 1,
    can: () => G.turn > 1200 && G.mods.length >= 6,
    w: D => D.tension,
    run: () => {
      const mi = rnd(G.mods.length),
        m = G.mods[mi];
      const fl = modCells(m).filter(
        c => c.c === '.' && !occupied(c.x, c.y) && M.map[idx(c.x, c.y)] === T.FLOOR,
      );
      for (let i = 0; i < rr(2, 3) && fl.length; i++) {
        const c = fl.splice(rnd(fl.length), 1)[0];
        G.actors.push({
          id: G.nid++,
          type: 'crawler',
          x: c.x,
          y: c.y,
          hp: 12,
          max: 12,
          alert: false,
          lost: 0,
        });
      }
      log(`Something is crawling out of the vents in the ${m.name}.`, 'bad');
    },
  },
  {
    k: 'bloom',
    major: 1,
    can: () => G.turn > 1500 && G.mods.length >= 5,
    w: D => D.tension * 0.8,
    run: () => {
      const mi = rnd(G.mods.length),
        m = G.mods[mi];
      addBreachMod(mi);
      const fl = modCells(m).filter(
        c => c.c === '.' && !occupied(c.x, c.y) && M.map[idx(c.x, c.y)] === T.FLOOR,
      );
      for (let i = 0; i < rr(1, 2) && fl.length; i++) {
        const c = fl.splice(rnd(fl.length), 1)[0];
        G.actors.push({ id: G.nid++, type: 'horror', x: c.x, y: c.y, hp: 45, max: 45, alert: true, lost: 0 });
      }
      log(
        `BLOOM EVENT: something tore its way out of the dark between the hull plates of the ${m.name}. It is glowing.`,
        'bad',
      );
    },
  },
  {
    k: 'haunt',
    major: 0,
    can: () => G.turn > 200,
    w: () => 0.7,
    run: () => {
      const m = pick(G.mods);
      const r = rnd(4);
      if (r === 0) {
        const c = modCells(m).find(
          c =>
            c.c === '.' &&
            !occupied(c.x, c.y) &&
            !G.crates[idx(c.x, c.y)] &&
            M.map[idx(c.x, c.y)] === T.FLOOR,
        );
        if (c) {
          G.crates[idx(c.x, c.y)] = { scrap: rr(2, 5), circ: rr(1, 2) };
          log(
            `A crate is sitting in the ${m.name} that was not there an hour ago. Nobody put it there.`,
            'lore',
          );
        }
      } else
        log(
          pick([
            `The lights in the ${m.name} dim to a slow pulse, like breathing. Then they stop.`,
            `A camera feed from the ${m.name} shows a shape at the edge of frame. The next frame is empty.`,
            `Somewhere in the ${m.name} a hatch cycles open and shut. The log says it never moved.`,
            `The station hums a note nobody programmed. It sounds almost like a name.`,
          ]),
          'lore',
        );
    },
  },
  {
    k: 'raft',
    major: 0,
    can: () => G.droneUnlocked,
    w: (D, str) => 0.6 + (G.crew.length < 2 ? 0.6 : 0),
    run: () => {
      const opts = G.sectors.filter(s => s.type !== 'weapon');
      const s = pick(opts);
      addRaft(s.id);
      if (!s.known) s.known = true;
      log(
        `Faint distress ping from ${secName(s)}${s.id === G.home ? ' (home sector)' : ''}: a stealth lifeboat, hiding from something.`,
        'info',
      );
    },
  },
  {
    k: 'signal',
    major: 0,
    can: () => G.sectors.some(s => !det(s)),
    w: () => 0.6,
    run: () => {
      const s = pick(G.sectors.filter(s => !det(s)));
      contact(s);
      log(
        `Old beacon handshake from ${cid(s)}. It knows an old KESTREL ident, but sends nothing else.`,
        'info',
      );
    },
  },
  {
    k: 'wreck',
    major: 0,
    can: () => G.droneUnlocked && G.ext.objs.filter(o => o.kind === 'wreck').length < 2,
    w: (D, str) => 0.8 + (G.ext.drones.length < 3 ? 0.8 : 0),
    run: () => {
      addWreck();
      log('Sensors: a dead drone tumbles past. It might be salvageable.', 'info');
    },
  },
  {
    k: 'debris',
    major: 0,
    can: () => true,
    w: (D, str) => 1 + (str ? 2 : 0) + (G.stock.scrap < 10 ? 1 : 0),
    run: () => {
      for (let i = 0; i < 3; i++) addDebris(true);
      log('A cloud of fresh debris drifts into range.', 'info');
    },
  },
  {
    k: 'cache',
    major: 0,
    can: () => G.droneUnlocked && G.turn > 200,
    w: (D, str) => (str ? 1.5 : 0.3),
    run: () => {
      addPod(-1, {
        scrap: rr(6, 12),
        circ: rr(3, 6),
        rat: rr(1, 3),
        ammo: rr(0, 10),
        items: Math.random() < 0.4 ? ['medkit'] : [],
      });
      log('An old supply cache from a dead launch program is in range.', 'info');
    },
  },
];
export function directorTick() {
  const D = G.dir;
  const size = G.mods.length;
  D.tension += 0.004 * (1 + size * 0.12 + G.turn / 2000) * (0.4 + (G.sig || 5) / 25);
  if (G.turn >= G.timers.debris) {
    G.timers.debris = G.turn + rr(100, 160);
    if (G.ext.objs.filter(o => o.kind === 'debris').length < 4) addDebris(true);
  }
  if (G.turn < D.rest) return;
  if (Math.random() > 0.015 + D.tension * 0.02) return;
  const str = P.hp < P.hpMax * 0.4 || G.stock.scrap < 5 || G.stock.rat < 1;
  const inc = pickW(
    INC.filter(i => i.can()),
    i =>
      i.w(D, str) *
      (D.recent[i.k] != null && G.turn - D.recent[i.k] < 300 ? 0.3 : 1) *
      (i.major && str ? 0.2 : 1),
  );
  if (!inc) return;
  inc.run();
  D.recent[inc.k] = G.turn;
  if (inc.major) {
    D.tension = Math.max(0, D.tension - 1.2);
    D.rest = G.turn + rr(140, 260);
  } else {
    D.tension = Math.max(0, D.tension - 0.25);
    D.rest = G.turn + rr(30, 80);
  }
}
