import { SAVE_VERSION, T, WH, WW } from '../core/constants.js';
import { BR, BRANDS, EN, FAC, mk } from '../core/data.js';
import { log } from '../core/messages.js';
import { G, M, P, setG, setP } from '../core/state.js';
import { cheb, D8, idx, pick, rnd, rr, shuffle } from '../core/util.js';
import { initEarth } from '../space/earth.js';
import { addDebris } from '../space/exterior-objects.js';
import { genSectors, initSectors } from '../space/sectors.js';
import { addBreachMod, dockPack, fitsAt, freePorts, modCells } from './build.js';
import { fov } from './fov.js';
import { dropItem } from './machines.js';
import { makePack, packFree } from './packs.js';

export function newGame(start) {
  setG({
    v: SAVE_VERSION,
    start,
    turn: 0,
    nid: 1,
    mods: [],
    machines: [],
    brk: [],
    items: {},
    crates: {},
    actors: [],
    bot: null,
    bat: 30,
    stock: { scrap: 0, circ: 0, rat: 1, ammo: start === 'cryo' ? 12 : 0 },
    sats: { COMMS: 0, WEATHER: 0, NAV: 0, RECON: 0 },
    kits: 0,
    bp: {
      drone_util: 1,
      drone_tug: 1,
      tube: 1,
      iface: 1,
      scanmod: 1,
      sat_COMMS: 1,
      ammo: 1,
      medkit: 1,
      armor: 1,
      pistol: 1,
      o2tank: 1,
    },
    fab: null,
    droneUnlocked: false,
    contact: false,
    contactTurn: 0,
    accordTurn: 0,
    ext: { objs: [], drones: [] },
    fac: FAC.map(() => ({ rep: 0, boost: 0, cd: 0, nreq: 0, trusted: false })),
    reqs: [],
    orbit: [],
    owner: [],
    hab: [],
    legacy: [],
    stat: {
      salvaged: 0,
      docked: 0,
      reqDone: 0,
      sats: 0,
      spoofs: 0,
      kills: 0,
      deaths: 0,
      lost: 0,
      detached: 0,
      redocked: 0,
    },
    obj: 0,
    log: [],
    cmb: [],
    seen: [],
    target: null,
    sel: null,
    home: 0,
    sectors: [],
    stations: [],
    sig: 5,
    silent: false,
    crew: [],
    allies: [],
    move: null,
    crewFood: 0,
    jam: 0,
    survey: null,
    spoof: null,
    timers: { earth: 0, reveal: 0, debris: 120, secscan: 150 },
    dir: { tension: 0, rest: 150, recent: {} },
    over: false,
    lore: 0,
    thrust: false,
    pw: { gen: 0, dem: 0, cap: 30 },
  });
  setP({
    x: 0,
    y: 0,
    hp: start === 'clone' ? 70 : 100,
    hpMax: start === 'clone' ? 70 : 100,
    o2: 100,
    nut: 75,
    eq: {
      tool: [mk('multitool', 0.7)],
      weap: start === 'cryo' ? [mk('pistol', 0.8)] : [],
      suit: start === 'cryo' ? [mk('armor', 0.7)] : [mk('o2tank', 0.8)],
    },
    cap: { tool: 1, weap: 2, suit: 2 },
    inv: [],
  });
  M.map = new Uint8Array(WW * WH);
  const conds = {
    pod: 45,
    cryo: 100,
    terminal: 100,
    locker: 100,
    rack: 25,
    escrub: 40,
    reactor: 25,
    battery: 55,
    scrubber: 30,
    fab: 40,
    bunk: 100,
    hydro: 30,
  };
  const cf = t => conds[t] ?? 30;
  const podFn = start === 'clone' ? 'pod_clone' : 'pod_cryo';
  const p0 = makePack(podFn, pick(BRANDS), { cond: cf, pressure: 75 });
  const cx = Math.floor(WW / 2) - Math.floor(p0.shape.w / 2),
    cy = Math.floor(WH / 2) - Math.floor(p0.shape.h / 2);
  dockPack(p0, null, { rot: rnd(4), pi: -1, ox: cx, oy: cy }, true);
  const order = shuffle(['junction', 'power', 'storage', 'life', 'workshop', 'hab']);
  if (Math.random() < 0.5) order.push('hydro');
  for (let k = 0; k < rr(1, 2); k++) order.splice(rr(1, order.length), 0, 'tube');
  const hay = shuffle(['life', 'workshop', 'hab', 'hydro']).slice(0, 2);
  for (const fn of order) {
    const pk = makePack(fn, fn === 'tube' ? pick(['scav', 'aster', 'volkov']) : pick(BRANDS), {
      cond: t =>
        t === 'node'
          ? Math.random() < 0.3
            ? rr(30, 50)
            : rr(60, 75)
          : t === 'junc'
            ? fn === 'tube'
              ? rr(55, 85)
              : Math.random() < 0.5
                ? rr(30, 55)
                : rr(60, 80)
            : cf(t),
      pressure: rr(30, 60),
    });
    pk.ctl = fn === 'tube';
    pk.haywire = hay.includes(fn);
    if (hay.includes(fn) && fn !== 'hydro' && Math.random() < 0.7) {
      const f = packFree(pk).find(([x, y]) => pk.shape.ports.every(p => cheb(p.x, p.y, x, y) > 3));
      if (f) pk.actors.push({ type: 'feral', lx: f[0], ly: f[1], hp: EN.feral.hp });
    }
    const fps = shuffle(freePorts());
    let done = false;
    for (const fp of fps) {
      const f = fitsAt(pk, fp);
      if (f.length) {
        dockPack(pk, fp, pick(f), true);
        done = true;
        break;
      }
    }
    if (!done) return newGame(start);
  }
  for (const m of G.mods) for (const l of Object.values(m.links)) l.br = 2;
  G.mods[0].ctl = true;
  for (const k of G.machines)
    if ((k.type === 'node' || k.type === 'junc') && k.mod === G.mods[0].id) k.cond = 100;
  const mOf = fn => G.mods.find(m => m.fn === fn);
  const floorsOf = m =>
    modCells(m)
      .filter(c => c.c === '.' && !G.machines.some(k => k.x === c.x && k.y === c.y))
      .map(c => [c.x, c.y]);
  const st = mOf('storage');
  const sf = shuffle(floorsOf(st));
  const loot = [
    { scrap: 6, circ: 2 },
    { scrap: 5, circ: 2, rat: 2 },
    { scrap: 4, circ: 1, ammo: 8 },
    { scrap: 3, circ: 1, rat: 1 },
  ];
  loot.forEach((c, i) => {
    if (sf[i]) G.crates[idx(sf[i][0], sf[i][1])] = c;
  });
  if (sf[5]) dropItem(sf[5][0], sf[5][1], mk('dorm_util'));
  if (start === 'clone' && sf[6]) dropItem(sf[6][0], sf[6][1], mk('pistol', 0.6));
  addBreachMod(G.mods.indexOf(pick([mOf('power'), mOf('junction'), mOf('life')])));
  if (Math.random() < 0.5) addBreachMod(G.mods.indexOf(mOf('hab')));
  for (const a of G.actors) a.room = -1;
  const pod = G.machines.find(m => m.type === 'pod' || m.type === 'cryo');
  for (const [dx, dy] of D8) {
    const x = pod.x + dx,
      y = pod.y + dy;
    if (M.map[idx(x, y)] === T.FLOOR) {
      P.x = x;
      P.y = y;
      break;
    }
  }
  G.seen = new Array(WW * WH).fill(0);
  initStars();
  initSectors();
  // the drifting essentials
  for (let i = 0; i < 5; i++) addDebris(true);
  initEarth();
  genSectors();
  if (start === 'clone') {
    log('CLONE POD 2: growth cycle aborted at 71%. Memory integrity 61%.', 'warn');
    log('Your hands are shaking. The pod light flickers.');
  } else {
    log('CRYO POD 1: thaw complete. Stasis duration: [COUNTER OVERFLOW].', 'warn');
    log('Frost on the glass. The station is very quiet.');
  }
  log(
    'Only this pod section answers to you. Every other section runs its own grid node, and none of them know who you are.',
    'warn',
  );
  log(
    `This core is a patchwork: ${[...new Set(G.mods.map(m => BR[m.brand].n))].join(', ')} hardware, all bolted together.`,
    'info',
  );
  fov();
}
export function initStars() {
  M.stars = new Float32Array(WW * WH);
  for (let i = 0; i < WW * WH; i++) if (Math.random() < 0.07) M.stars[i] = 0.2 + Math.random() * 0.8;
}
