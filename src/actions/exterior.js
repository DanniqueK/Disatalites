import { T } from '../core/constants.js';
import { BR, DT, FN, FX, isHall, MC, MD, stById } from '../core/data.js';
import { log } from '../core/messages.js';
import { G, M, V } from '../core/state.js';
import { cheb, dirName, idx, inB, rr } from '../core/util.js';
import { atHatch, cargoLoad } from '../sim/exterior-tick.js';
import { refresh } from '../sim/turn.js';
import { derHit, hatchOf, objById } from '../space/exterior-objects.js';
import { hackStatus, HULL, LC, locked, tagName, travelTime, where } from '../space/sectors.js';
import { showModal } from '../ui/log-modal.js';
import { setTab } from '../ui/panels.js';
import { canDetach, fitsAt, freePorts, modById, sealedDoorAt } from '../world/build.js';
import { modBreaches } from '../world/control.js';
import { estimateText, salvageEstimate, scrapValue } from '../world/salvage.js';
import { hallShape } from '../world/shapes.js';

/** @typedef {import('../core/types.js').ModalButton} ModalButton */

export const selDrone = () => G.ext.drones.find(d => d.id === G.sel);
export function releaseTow(d) {
  if (d.task.type === 'tow' || d.task.type === 'park') {
    const o = objById(d.task.oid);
    if (o) o.tow = null;
  }
}
export function cmdDrone(d, task, msg) {
  releaseTow(d);
  d.task = task;
  if (msg) log(msg);
  refresh();
}
function portLabel(fp) {
  const m = modById(fp.mid);
  return `${m.name} (${BR[m.brand].cc}) ${dirName(fp.dx, fp.dy)} port`;
}
/** @returns {ModalButton[]} */
function scrapOpts(d, o) {
  const v = scrapValue(o.pack);
  const atHull = o.sec === HULL;
  const can = d.dt === 'util' || d.dt === 'tug';
  return [
    {
      t: atHull
        ? `Scrap it here with ${d.name} (+${v.s} scrap, +${v.c} circ, schematics, ${v.t} turns)`
        : `Scrap in place with ${d.name} (+${v.s} scrap, +${v.c} circ${d.scan ? ', scanner records schematics' : ', no schematics without a scanner'})`,
      k: 'danger',
      dis: !can,
      f: () =>
        cmdDrone(
          d,
          { type: 'scrap', oid: o.id, w: 0, need: v.t },
          `${d.name}: cutting up the ${o.pack.name}.`,
        ),
    },
  ];
}
function towMenu(d, o) {
  if (!DT[d.dt].tow) {
    log(`${d.name} is a ${DT[d.dt].n} drone and cannot tow.`, 'warn');
    return refresh();
  }
  const fps = freePorts()
    .map(fp => ({ fp, n: fitsAt(o.pack, fp).length }))
    .filter(x => x.n > 0)
    .sort((a, b) => Math.hypot(a.fp.x - o.x, a.fp.y - o.y) - Math.hypot(b.fp.x - o.x, b.fp.y - o.y));
  const desc = `${o.pack.name} section, ${BR[o.pack.brand].n} (${BR[o.pack.brand].cc}). ${o.pack.shape.ports.length} ports.\nContains: ${
    o.pack.mach
      .filter(k => k.type !== 'node' && k.type !== 'junc')
      .map(k => MD[k.type].n + (k.cond < 60 ? ' (worn)' : ''))
      .join(', ') || 'no machines'
  }.\n${estimateText(salvageEstimate(o, d))}\n\n${d.dt === 'tug' ? 'Tug tows at full speed.' : 'Utility drones tow slowly (1 tile per 3 turns).'} It docks onto a free hallway door. Scrapping it at the station (or with a drone carrying a Survey Scanner) teaches you its schematics.`;
  const park =
    o.sec !== HULL
      ? [
          {
            t: `Tow it to the hull yard (park it next to the station)`,
            f: () =>
              cmdDrone(
                d,
                { type: 'park', oid: o.id, att: o.tow === d.id ? 1 : 0, tk: 0 },
                `${d.name}: hauling the ${o.pack.name} home.`,
              ),
          },
        ]
      : [];
  showModal(
    `${o.pack.name.toUpperCase()}`,
    desc + (fps.length ? '' : '\n(No free port has room for it right now.)'),
    fps
      .slice(0, 7)
      .map(
        /** @returns {ModalButton} */ ({ fp }) => ({
          t: 'Dock at ' + portLabel(fp),
          f: () =>
            cmdDrone(
              d,
              { type: 'tow', oid: o.id, mid: fp.mid, pi: fp.pi, att: o.tow === d.id ? 1 : 0, tk: 0 },
              `${d.name}: towing ${o.pack.name} to the ${portLabel(fp)}.`,
            ),
        }),
      )
      .concat(park)
      .concat(scrapOpts(d, o))
      .concat([{ t: 'Cancel' }]),
  );
}
export function extTap(x, y) {
  if (!inB(x, y)) return;
  const home = V.sec === HULL;
  if (V.sec === G.home) {
    const [cx, cy] = LC();
    if (cheb(x, y, cx, cy) <= 2) {
      const d0 = selDrone();
      if (d0) return cmdDrone(d0, { type: 'return' }, `${d0.name}: heading back to the hull.`);
      return;
    }
  }
  const dr = G.ext.drones.find(d => d.sec === V.sec && d.x === x && d.y === y);
  if (dr && dr.id !== G.sel) {
    G.sel = dr.id;
    return refresh();
  }
  const d = selDrone();
  const objs = G.ext.objs.filter(o => o.sec === V.sec && o.seen !== false);
  const big = o => o.kind === 'platform' || o.kind === 'sci';
  const o =
    objs.find(o => o.kind !== 'der' && cheb(o.x, o.y, x, y) <= (big(o) ? 1 : 0)) ||
    objs.find(o => o.kind === 'der' && derHit(o, x, y)) ||
    objs.find(o => o.kind !== 'der' && cheb(o.x, o.y, x, y) <= 1);
  if (o && o.kind === 'platform') {
    const L = G.legacy[o.lid];
    return showModal(
      L.n,
      `${L.org} defense platform, launched ${L.yr}.\nWeapon range ${o.r}. Too armored to destroy.\nIFF friendly: ${L.tags.length ? L.tags.map(tagName).join(', ') : 'nobody'}.\n\nIt fires on any of your drones in range unless KESTREL-9 is tagged in its tables. Spoof its IFF from the EARTH tab (needs Comms).`,
      [{ t: 'Open EARTH view', dis: !G.contact, f: () => setTab('earth') }, { t: 'Close' }],
    );
  }
  if (!d) {
    log(G.ext.drones.length ? 'Select a drone first.' : 'No drones yet. Activate one at a Drone Rack.');
    return refresh();
  }
  if (home) {
    const h = hatchOf(d);
    if (h && x === h[0] && y === h[1])
      return cmdDrone(d, { type: 'return' }, `${d.name}: returning to the hatch.`);
  }
  const t = home ? M.map[idx(x, y)] : T.VOID;
  if (t === T.BREACH) {
    const b = G.brk.find(b => b.x === x && b.y === y);
    if (d.dt !== 'util') {
      log('Only Utility drones can patch hull.', 'warn');
      return refresh();
    }
    if (G.stock.scrap < 3) {
      log('Patching needs 3 scrap.', 'warn');
      return refresh();
    }
    G.stock.scrap -= 3;
    return cmdDrone(d, { type: 'patch', bid: b.id, w: 0 }, `${d.name}: patching a breach.`);
  }
  if (t === T.PORT) {
    const fp = freePorts().find(p => p.x === x && p.y === y);
    if (!fp) {
      log('That hatch is blocked from outside.', 'warn');
      return refresh();
    }
    if (d.task.type === 'tow' && d.task.att) {
      const ob = objById(d.task.oid);
      if (ob && fitsAt(ob.pack, fp).length)
        return cmdDrone(
          d,
          { type: 'tow', oid: ob.id, mid: fp.mid, pi: fp.pi, att: 1, tk: 0 },
          `${d.name}: bringing ${ob.pack.name} to the ${portLabel(fp)}.`,
        );
      log('The section does not fit there.', 'warn');
      return refresh();
    }
    const onHall = isHall(G.mods[fp.mi].fn);
    return showModal(
      'DOOR TO SPACE',
      `${portLabel(fp)}.\n\nBuild a corridor piece here with a Utility drone: a hallway segment (7 long, a room door on each side) or a junction hub (a door on every side). Rooms only dock onto hallway doors.\n\nSeal: weld the door shut (3 scrap). It can be opened again later.`,
      [
        ...CORRIDOR.map(c => {
          const kit = c.piece === 'hall' && G.kits > 0;
          const fits = fitsAt({ fn: c.piece, shape: hallShape(c.piece) }, fp).length > 0;
          return {
            t: `Build a ${c.n} (${kit ? '1 hallway kit' : `${c.s} scrap, ${c.c} circ`}, ${c.t} turns)${fits ? '' : ' [no room]'}`,
            dis: !fits || d.dt !== 'util' || (!kit && (G.stock.scrap < c.s || G.stock.circ < c.c)),
            f: () => {
              const paid = kit ? { s: 0, c: 0, k: 1 } : { s: c.s, c: c.c, k: 0 };
              G.stock.scrap -= paid.s;
              G.stock.circ -= paid.c;
              G.kits -= paid.k;
              cmdDrone(
                d,
                { type: 'build', piece: c.piece, mid: fp.mid, pi: fp.pi, w: 0, need: c.t, paid },
                `${d.name}: building a ${c.n} on the ${portLabel(fp)}.`,
              );
            },
          };
        }),
        {
          t: onHall
            ? `Construct a room here from a schematic... (${(G.schem || []).length} known)`
            : 'Construct a room here [rooms only dock onto hallway doors]',
          dis: !onHall || !(G.schem || []).length,
          f: () => constructMenu(d, fp),
        },
        {
          t: `Seal this door with ${d.name} (3 scrap)`,
          k: 'danger',
          dis: d.dt !== 'util' || G.stock.scrap < 3,
          f: () => {
            G.stock.scrap -= 3;
            cmdDrone(
              d,
              { type: 'seal', mid: fp.mid, pi: fp.pi, w: 0 },
              `${d.name}: welding the ${portLabel(fp)} shut.`,
            );
          },
        },
        { t: 'Close' },
      ],
    );
  }
  if (o) {
    const far = d.sec !== V.sec ? ` (travels from ${d.sec < 0 ? 'transit' : where(d.sec)} first)` : '';
    if (o.kind === 'debris')
      return salvageMenu(
        d,
        o,
        'DEBRIS',
        d.dt !== 'util' ? `${DT[d.dt].n} drones cannot carry salvage.` : null,
        () => cmdDrone(d, { type: 'salvage', oid: o.id }, `${d.name}: salvaging debris${far}.`),
      );
    if ((o.kind === 'der' || o.kind === 'core' || o.kind === 'sci') && o.st != null && locked(o))
      return stationMenu(d, stById(o.st));
    if (o.kind === 'null') {
      log('Null pocket. Drones path around known ones.', 'warn');
      return refresh();
    }
    if (o.kind === 'pod' || o.kind === 'wreck' || o.kind === 'sci' || o.kind === 'raft') {
      const what =
        o.kind === 'wreck'
          ? DT[o.dt].n + ' wreck'
          : o.kind === 'sci'
            ? 'data core'
            : o.kind === 'raft'
              ? 'lifeboat'
              : 'pod';
      return salvageMenu(
        d,
        o,
        what.toUpperCase(),
        d.dt === 'guard'
          ? 'Guard drones cannot carry cargo.'
          : locked(o)
            ? 'Defense turrets still cover it. Send a Guard drone at the turrets (T) first.'
            : null,
        () => cmdDrone(d, { type: 'fetch', oid: o.id }, `${d.name}: retrieving the ${what}${far}.`),
      );
    }
    if (o.kind === 'rogue' || o.kind === 'turret')
      return cmdDrone(
        d,
        { type: 'attack', oid: o.id },
        `${d.name}: engaging ${o.kind === 'turret' ? 'defense turret' : 'rogue drone'}${far}.`,
      );
    if (o.kind === 'der') {
      if (locked(o)) {
        log(`The ${o.pack.name} is still covered by defense turrets. Take them out first.`, 'warn');
        return refresh();
      }
      return towMenu(d, o);
    }
  }
  if (home) {
    const mi = M.own[idx(x, y)];
    if (mi >= 0 && G.mods[mi]) {
      const m = G.mods[mi];
      const why = canDetach(mi);
      return showModal(
        `${m.name.toUpperCase()}`,
        `${BR[m.brand].n} (${BR[m.brand].cc}) ${m.shape.kind} section.\nPressure ${Math.round(m.pressure)}%. Links: ${Object.keys(m.links).length}/${m.shape.ports.length} ports.\n\nA Tug drone can unbolt this section so you can dock it somewhere else.${why ? '\nCannot detach right now: ' + why : ''}`,
        /** @type {ModalButton[]} */ ([
          {
            t: 'Detach with this drone',
            k: 'danger',
            dis: !!why || d.dt !== 'tug',
            f: () =>
              cmdDrone(
                d,
                { type: 'detach', mid: m.id, w: 0 },
                `${d.name}: moving in to unbolt the ${m.name}.`,
              ),
          },
        ])
          .concat(unsealOpt(d, x, y))
          .concat(ifaceOpts(d, m, mi))
          .concat([
            {
              t: `Scrap this section with ${d.name} (schematics + materials)`,
              k: 'danger',
              dis: !!why || (d.dt !== 'util' && d.dt !== 'tug'),
              f: () =>
                cmdDrone(
                  d,
                  { type: 'scrapmod', mid: m.id, w: 0 },
                  `${d.name}: moving in to cut the ${m.name} apart.`,
                ),
            },
            { t: 'Close' },
          ]),
      );
    }
  }
  if (!home || M.map[idx(x, y)] === T.VOID)
    return cmdDrone(
      d,
      { type: 'goto', x, y, sec: V.sec },
      `${d.name}: moving to position${d.sec !== V.sec ? ' in ' + where(V.sec) : ''}.`,
    );
}
/**
 * Show what a salvage target probably holds and what threatens it, with one button to send the drone.
 * @param {string | null} blocked Why this drone cannot do it, if it cannot.
 */
function salvageMenu(d, o, title, blocked, go) {
  const eta =
    d.sec !== o.sec ? ` (travel about ${travelTime(d.sec < 0 ? G.home : d.sec, o.sec)} turns first)` : '';
  showModal(title, `${estimateText(salvageEstimate(o, d))}${blocked ? `\n\n${blocked}` : ''}`, [
    { t: `Send ${d.name}${eta}`, dis: !!blocked, f: go },
    { t: 'Cancel' },
  ]);
}
/**
 * Corridor pieces a Utility drone can build at a free door. A hallway kit pays for a hallway segment.
 * @type {{ piece: 'hall' | 'hub', n: string, s: number, c: number, t: number }[]}
 */
const CORRIDOR = [
  { piece: 'hall', n: 'hallway segment', s: 10, c: 1, t: 6 },
  { piece: 'hub', n: 'junction hub', s: 8, c: 1, t: 5 },
];
/** @returns {ModalButton[]} */
function unsealOpt(d, x, y) {
  const sd = sealedDoorAt(x, y);
  if (!sd) return [];
  return [
    {
      t: `Open this sealed door again with ${d.name} (2 scrap, 4 turns)`,
      dis: d.dt !== 'util' || G.stock.scrap < 2,
      f: () => {
        G.stock.scrap -= 2;
        cmdDrone(
          d,
          { type: 'unseal', mid: sd.m.id, pi: sd.pi, w: 0 },
          `${d.name}: cutting the sealed door on the ${sd.m.name} open.`,
        );
      },
    },
  ];
}
const buildCost = h => {
  const fx = FN[h.fn].m.filter(t => FX[t] && MC[t]);
  return {
    s: h.fl + 4 + fx.reduce((a, t) => a + Math.round(MC[t][0] * 0.4), 0),
    c: 3 + fx.reduce((a, t) => a + Math.round(MC[t][1] * 0.4), 0),
    t: 6 + Math.ceil(h.fl / 4),
  };
};
function constructMenu(d, fp) {
  const opts = (G.schem || [])
    .map(h => ({ h, fit: fitsAt({ fn: h.fn, shape: h.shape }, fp) }))
    .filter(o => o.fit.length);
  if (!opts.length) {
    showModal(
      'NO FIT',
      isHall(G.mods[fp.mi].fn)
        ? 'None of your room schematics fit at this door. Try another hallway door, or extend the hallway first.'
        : 'Rooms only dock onto hallway doors. Build a hallway segment here first.',
      [{ t: 'OK' }],
    );
    return;
  }
  showModal(
    'CONSTRUCT SECTION',
    `Builds the room with its built-in machine frame (at 40%, needs repairs), a grid node and a junction box. Install small gear afterwards.\nPort: ${portLabel(fp)}.`,
    opts
      .slice(0, 8)
      .map(({ h, fit }) => {
        const c = buildCost(h);
        return {
          t: `${h.name} (${BR[h.brand].cc}, ${h.fl} floor) · ${c.s}s ${c.c}c · ${c.t}t`,
          dis: d.dt !== 'util' || G.stock.scrap < c.s || G.stock.circ < c.c,
          f: () => {
            G.stock.scrap -= c.s;
            G.stock.circ -= c.c;
            cmdDrone(
              d,
              { type: 'build', key: h.key, mid: fp.mid, pi: fp.pi, w: 0, need: c.t, paid: c },
              `${d.name}: assembling a ${h.name} hull on the ${portLabel(fp)}.`,
            );
          },
        };
      })
      .concat([{ t: 'Cancel' }]),
  );
}
/** @returns {ModalButton[]} */
function ifaceOpts(d, m, mi) {
  const node = G.machines.find(k => k.type === 'node' && k.mi === mi);
  if (!node || isHall(m.fn)) return [];
  const tag = d.iface ? '' : ' [needs Interface Module]';
  const nb = modBreaches(mi);
  const o = [];
  if (!m.ctl)
    o.push({
      t: `Remote claim via ${d.name} (1 circ)${tag}${nb ? ' [seal breach first]' : node.cond < 60 ? ' [node broken]' : ''}`,
      dis: !d.iface || nb > 0 || node.cond < 60 || G.stock.circ < 1,
      f: () => {
        G.stock.circ--;
        cmdDrone(
          d,
          {
            type: 'iface',
            mid: m.id,
            mode: 'claim',
            w: 0,
            need: Math.round((node.claimNeed || rr(6, 12)) * 1.5),
          },
          `${d.name}: jacking into the ${m.name} node from outside.`,
        );
      },
    });
  if (m.haywire && !m.ctl)
    o.push({
      t: `Reboot node security via ${d.name} (1 circ)${tag}`,
      dis: !d.iface || node.cond < 60 || G.stock.circ < 1,
      f: () => {
        G.stock.circ--;
        cmdDrone(
          d,
          { type: 'iface', mid: m.id, mode: 'reboot', w: 0, need: 12 },
          `${d.name}: power-cycling the ${m.name} security layer.`,
        );
      },
    });
  return o;
}
function stationMenu(d, st) {
  const tur = G.ext.objs.filter(o => o.st === st.id && o.kind === 'turret').length;
  const core = G.ext.objs.find(o => o.st === st.id && o.kind === 'core');
  showModal(
    st.name.toUpperCase(),
    `${BR[st.brand].n} (${BR[st.brand].cc}) ${st.kind} station. Security level ${st.ice}.
Status: ${st.alert ? 'ALERT, turrets firing at range' : 'passive, turrets only fire up close'}. Turrets: ${tur}. Core integrity: ${core ? core.hp + '/' + core.max : '?'}.
Intrusion: ${hackStatus(st) || 'not started'}.

HACK (Utility drone): park against the hull and work through its security layers in the intrusion console. Quiet, but trace builds up, and at 100% the link burns and the station goes to alert. Success keeps every section intact, may free prisoners, and lets you recruit or wipe its AI.

BRUTE FORCE (Guard drones): kill the turrets and the core. Loud. About a third of its sections break apart into debris, and the AI dies with the core.`,
    [
      {
        t: `Hack with ${d.name}`,
        dis: d.dt !== 'util',
        f: () => cmdDrone(d, { type: 'hack', st: st.id }, `${d.name}: moving in to hack the ${st.name}.`),
      },
      {
        t: `Attack the core with ${d.name}`,
        dis: !core,
        f: () => {
          if (!st.alert) {
            st.alert = true;
            log(`${st.name} goes to alert.`, 'bad');
          }
          cmdDrone(d, { type: 'attack', oid: core.id }, `${d.name}: attacking the security core.`);
        },
      },
      { t: 'Close' },
    ],
  );
}
export function cycleDrone(n) {
  if (!G.ext.drones.length) return;
  const i = G.ext.drones.findIndex(d => d.id === G.sel);
  G.sel = G.ext.drones[(i + n + G.ext.drones.length) % G.ext.drones.length].id;
  refresh();
}
export function taskText(d) {
  const t = d.task;
  if (d.tr) return `to ${where(d.tr.to)}, ${d.tr.eta}t`;
  const w = d.sec === HULL ? '' : d.sec === G.home ? '[local] ' : `[${where(d.sec)}] `;
  return w + taskText2(d, t);
}
function taskText2(d, t) {
  switch (t.type) {
    case 'idle':
      return atHatch(d) ? 'docked' : hatchOf(d) ? 'returning' : 'no signal';
    case 'goto':
      return 'holding position';
    case 'return':
      return 'returning';
    case 'salvage':
      return `salvaging (${cargoLoad(d)}/${DT[d.dt].cargo})`;
    case 'fetch':
      return 'retrieving';
    case 'patch':
      return 'patching hull';
    case 'seal':
      return `sealing a door ${t.w}/4`;
    case 'unseal':
      return `opening a sealed door ${t.w}/4`;
    case 'scrap':
      return `scrapping ${t.w}/${t.need}`;
    case 'scrapmod':
      return `scrapping a section ${t.w}/${t.need || '?'}`;
    case 'build':
      return `building ${t.piece === 'hub' ? 'a hub' : t.piece ? 'a hallway' : 'a room'} ${t.w}/${t.need}`;
    case 'park':
      return t.att ? 'hauling a section home' : 'moving to section';
    case 'iface':
      return `${t.mode === 'claim' ? 'remote claim' : 'rebooting node'} ${t.w}/${t.need}`;
    case 'detach':
      return 'detaching section';
    case 'tow': {
      const o = objById(t.oid);
      return t.att
        ? t.mid
          ? 'towing ' + (o ? o.pack.name : '')
          : 'holding ' + (o ? o.pack.name : '') + ' (pick a port)'
        : 'moving to section';
    }
    case 'deploy':
      return `deploying ${t.sat}`;
    case 'attack':
      return 'attacking';
    case 'hack': {
      const st = stById(t.st);
      if (t.on && st && st.hk)
        return `hacking L${st.hk.i + 1}/${st.hk.L.length} trace ${Math.round(st.hk.trace)}%${t.auto ? ' (script)' : ''}`;
      return 'hacking';
    }
  }
  return t.type;
}
