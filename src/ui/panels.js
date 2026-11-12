import { cmdDrone, cycleDrone, selDrone, taskText } from '../actions/exterior.js';
import { hackConsole } from '../actions/hack.js';
import { cycleTarget, deployFlow, eat, fire, pickup, playerMove, toggleSilent } from '../actions/player.js';
import { BR, DT, FAC, IT, MD, OBJ, PERK, RC, ROLE, SATS, SEC_T, TAGK } from '../core/data.js';
import { log } from '../core/messages.js';
import { G, P, V } from '../core/state.js';
import { clamp, esc, pad5 } from '../core/util.js';
import { zoomAt } from '../main.js';
import { homeInLowOrbit } from '../sim/decay.js';
import { sunState } from '../sim/eclipse.js';
import { atHatch } from '../sim/exterior-tick.js';
import { stats } from '../sim/stats.js';
import { refresh, waitN } from '../sim/turn.js';
import { watchName } from '../sim/watch.js';
import { power, shares } from '../space/earth.js';
import { activeSweep, hackStatus, HULL, locked, SEC, secName, tagName } from '../space/sectors.js';
import { $ } from './dom.js';
import { showHelp } from './help-title.js';
import { showLog } from './log-modal.js';
import { C } from './palette.js';
import { cssH, cssW, cycTags, focusOrbit, render, toggleRooms, uiOrbit } from './render.js';
import { freePorts } from '../world/build.js';
import { modAtP, pressureAt } from '../world/fov.js';
import { caps, commsOnline, droneCap, hasOnline, machineStatus } from '../world/machines.js';

function bar(label, v, m, col) {
  return `<div class="bar"><div class="f" style="width:${clamp(v / m, 0, 1) * 100}%;background:${col}"></div><div class="l2">${label}</div></div>`;
}
function ibar(v, m) {
  const n = 10,
    f = Math.round(clamp(v / m, 0, 1) * n);
  const col = v / m > 0.66 ? C.good : v / m > 0.33 ? C.warn : C.bad;
  return `<span class="ib" style="color:${col}">${'|'.repeat(f)}</span><span class="ib" style="color:#123a18">${'|'.repeat(n - f)}</span>`;
}
export function setTab(t) {
  if (t === 'orbit' && !G.droneUnlocked) {
    log('ORBIT map needs drone control: activate a drone first.', 'warn');
    return refresh();
  }
  if (t === 'ext' && !G.droneUnlocked) {
    log('EXTERIOR offline: activate a drone at a Drone Rack first.', 'warn');
    return refresh();
  }
  if (t === 'earth' && !G.contact) {
    log('EARTH offline: dock and repair a Comms Array first.', 'warn');
    return refresh();
  }
  V.tab = t;
  V.hover = null;
  refresh();
}
function fillScroll(el, html) {
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  const x = el.scrollLeft;
  el.innerHTML = html;
  if (atBottom) el.scrollTop = el.scrollHeight;
  el.scrollLeft = x;
}
/** The watch list as side-panel rows: sectors open their contact menu, objects focus the EXTERIOR view. */
export function watchHtml() {
  const ws = G.watch || [];
  if (!ws.length) return '';
  return (
    '<div class="sh">W A T C H</div>' +
    ws
      .map(w =>
        w.kind === 'sec'
          ? `<div class="row" data-sec="${w.id}"><span class="nm" style="color:#40e0ff">◎ ${esc(watchName(w))}</span></div>`
          : `<div class="row" data-wobj="${w.id}"><span class="nm" style="color:#40e0ff">◎ ${esc(watchName(w))}</span></div>`,
      )
      .join('') +
    '<div class="sh" style="margin-top:6px"></div>'
  );
}
/** Show a tracked exterior object: switch to EXTERIOR, its sector, and centre on it. */
export function focusWatched(id) {
  const o = G.ext.objs.find(o => o.id === id);
  if (!o) return;
  V.sec = o.sec < 0 ? G.home : o.sec;
  setTab('ext');
  const ts = V.ets || 8;
  V.ecam = { x: o.x - cssW / ts / 2, y: o.y - cssH / ts / 2 };
  render();
}
export function updateUI() {
  if (!G) return;
  const S = stats(),
    c = caps(),
    pr = pressureAt(P.x, P.y),
    sun = sunState();
  document.querySelectorAll('#tabs button').forEach((/** @type {HTMLElement} */ b) => {
    const t = b.dataset.tab;
    b.classList.toggle('on', t === V.tab);
    b.classList.toggle(
      'lock',
      ((t === 'ext' || t === 'orbit') && !G.droneUnlocked) || (t === 'earth' && !G.contact),
    );
  });
  $('#tabInfo').textContent =
    V.tab === 'station'
      ? 'WASD/arrows: move · click or U: use · bump: attack · R wait 10 · F fire · G get · Shift+L log · V rooms · Z/X/O/C: views'
      : V.tab === 'ext'
        ? 'select a drone, then tap a target · tap a free door to build hallways and rooms · drag or WASD to pan'
        : V.tab === 'orbit'
          ? 'tap a contact to scan it or send the selected drone · ACTIVE SWEEP is loud'
          : 'requests, legacy satellites, territory';
  $('#bars').innerHTML =
    bar(`BODY   ${Math.ceil(P.hp)}/${P.hpMax}`, P.hp, P.hpMax, '#1c6a2a') +
    bar(`SUIT O2 ${Math.floor(P.o2)}/${S.o2Max}`, P.o2, S.o2Max, '#2a4a6a') +
    bar(`NUTRITION ${Math.floor(P.nut)}`, P.nut, 100, '#6a5a1a') +
    bar(`HYDRATION ${Math.floor(P.hyd ?? 80)}`, P.hyd ?? 80, 100, '#1a4a7a') +
    bar(
      `BATTERY ${Math.floor(G.bat)}/${G.pw.cap}  (${G.pw.gen >= G.pw.dem ? '+' : ''}${G.pw.gen - G.pw.dem})`,
      G.bat,
      G.pw.cap,
      '#14607a',
    ) +
    bar(
      `SIGNATURE ${G.sig} · ${G.sig < 12 ? 'QUIET' : G.sig < 22 ? 'NOTICEABLE' : 'LOUD'}${G.silent ? ' · SILENT RUNNING' : ''}`,
      G.sig,
      40,
      G.sig < 12 ? '#1c5a2a' : G.sig < 22 ? '#6a5a1a' : '#7a1a1a',
    ) +
    `<button class="pbtn" data-a="silent">${G.silent ? 'End silent running' : 'Silent running'}</button>`;
  const m = modAtP();
  const at = G.atmo || { cap: 0, area: 1 };
  $('#res').innerHTML =
    esc(
      `SCRAP ${G.stock.scrap}/${c.scrap}  CIRCUITS ${G.stock.circ}/${c.circ}\nRATIONS ${G.stock.rat}/${c.rat}  WATER ${G.stock.water ?? 0}/${c.water}
AMMO ${G.stock.ammo}  KITS ${G.kits}\nPOWER gen ${G.pw.gen} / draw ${G.pw.dem}\nORBIT ${sun.band} · ${sun.inShadow ? 'ECLIPSE' : 'SUN'} ${sun.untilChange}t${homeInLowOrbit() ? ` · ALT ${Math.round(G.alt ?? 100)}%` : ''}\nAIR scrubbers ${at.cap} / floor ${at.area}\nLOC: ${m ? m.name + ' (' + BR[m.brand].cc + ')' : 'Doorway'}  PRESSURE ${Math.round(pr)}%\nTURN ${G.turn}${G.contact ? `   ACCORD IN ${Math.max(0, G.accordTurn - G.turn)}` : ''}${G.move ? `\nUNDER WAY to ${secName(G.sectors[G.move.to])}: ${G.move.eta}t` : ''}`,
    ) +
    (pr < 35 ? '\n<span class="bad">!! LOW PRESSURE: suit O2 draining !!</span>' : '') +
    (G.fab ? `\n<span class="info">FAB: ${RC[G.fab.r].n} ${G.fab.prog}/${RC[G.fab.r].t}</span>` : '');
  $('#objective').innerHTML = `<span class="dim">${G.obj + 1}/${OBJ.length}</span> ${esc(OBJ[G.obj].t)}`;
  if (V.tab === 'station') uiStation();
  else if (V.tab === 'ext') uiExt();
  else if (V.tab === 'orbit') uiOrbit();
  else uiEarth();
  const fl = arr =>
    arr.map(e => `<div class="ln ${e.c}"><span class="n">${pad5(e.n)}_ </span>${esc(e.m)}</div>`).join('');
  fillScroll($('#log'), fl(G.log.slice(-80)));
  fillScroll($('#cmb'), fl(G.cmb.slice(-60)));
  $('#tail').innerHTML = G.log
    .slice(-3)
    .map(e => `<div class="ln ${e.c}">${esc(e.m)}</div>`)
    .join('');
  $('#tail').scrollLeft = 0;
  $('#hud').innerHTML =
    `<span style="color:#7fff9a">BODY ${Math.ceil(P.hp)}</span> <span style="color:${P.o2 < 30 ? '#ff5a5a' : '#a8dcff'}">O2 ${Math.floor(P.o2)}</span> <span style="color:#e0c060">FOOD ${Math.floor(P.nut)}</span> <span style="color:#4ad0ff">PWR ${G.pw.gen - G.pw.dem >= 0 ? '+' : ''}${G.pw.gen - G.pw.dem}</span> · S${G.stock.scrap} C${G.stock.circ} R${G.stock.rat}` +
    (pr < 35 ? ' <span class="bad">VAC</span>' : '');
  renderPad();
}
function uiStation() {
  $('#ctxH').textContent = '/ G E A R /';
  $('#ctx2H').textContent = '/ S E C T I O N S /';
  let h = '';
  for (const [sl, lab] of [
    ['tool', 'T O O L'],
    ['weap', 'W E A P O N'],
    ['suit', 'S U I T'],
  ]) {
    h += `<div class="sh">${lab}<span class="cnt">${P.eq[sl].length}/${P.cap[sl]}</span></div>`;
    P.eq[sl].forEach((it, j) => {
      const d = IT[it.key];
      h += `<div class="row" data-sl="${sl}" data-j="${j}"><span class="nm">${esc(d.n)}</span>${ibar(it.hp, d.hp)}<span class="iv">${it.hp}</span></div>`;
    });
    for (let j = P.eq[sl].length; j < P.cap[sl]; j++)
      h += '<div class="row empty"><span class="nm">- empty -</span></div>';
  }
  h += `<div class="sh">C A R R I E D<span class="cnt">${P.inv.length}/8</span></div>`;
  P.inv.forEach((it, i) => {
    const d = IT[it.key];
    h += `<div class="row" data-inv="${i}"><span class="k">${i + 1}</span><span class="nm">${esc(d.n)}</span>${d.hp ? ibar(it.hp, d.hp) + `<span class="iv">${it.hp}</span>` : ''}</div>`;
  });
  if (!P.inv.length) h += '<div class="row empty"><span class="nm">nothing</span></div>';
  $('#ctx').innerHTML = h;
  let s = '';
  if (G.crew.length || G.allies.length) {
    s += `<div class="sh">C R E W <span class="cnt">${G.crew.length}</span></div>`;
    for (const c of G.crew)
      s += `<div class="row" style="cursor:default"><span class="nm" title="${esc(ROLE[c.role].d)}">${esc(c.name)} <span class="dim">${ROLE[c.role].n}: ${esc(c.jobTxt || 'arriving')}</span></span>${c.starve > 0 ? '<span class="bad" style="font-size:11px">HUNGRY</span>' : ''}</div>`;
    if (G.allies.length) {
      s += `<div class="sh">A I &nbsp;A L L I E S</div>`;
      for (const a of G.allies)
        s += `<div class="row" style="cursor:default"><span class="nm" style="color:#b08aff">${esc(a.n)} <span class="dim">${PERK[a.perk].n}: ${PERK[a.perk].d}</span></span></div>`;
    }
  }
  G.mods.forEach((r, ri) => {
    const ms = G.machines.filter(
      m => m.mod === r.id && !['terminal', 'locker', 'bunk', 'cryo'].includes(m.type),
    );
    const br = r.breaches.length;
    s += `<div class="sh" style="letter-spacing:.08em">${esc(r.name.toUpperCase())} <span class="dim">${BR[r.brand].cc}</span>${r.ctl ? '' : ' <span class="warn">LOCKED</span>'}<span class="cnt">${Math.round(r.pressure)}% atm${br ? ' <span class="bad">BREACH</span>' : ''}</span></div>`;
    for (const m of ms) {
      const st = machineStatus(m);
      s += `<div class="row" data-m="${m.id}"><span class="nm" style="color:${st === 'ONLINE' ? C.good : st === 'BROKEN' ? C.bad : C.warn}">${esc(MD[m.type].n)}</span><span class="dim" style="font-size:11px">${st}</span>${ibar(m.cond, 100)}</div>`;
    }
  });
  if (G.bot) s += '<div class="sh">MAINTENANCE BOT ACTIVE</div>';
  $('#ctx2').innerHTML = s;
}
function uiExt() {
  $('#ctxH').textContent = '/ D R O N E S /';
  $('#ctx2H').textContent = '/ O R B I T /';
  let h = '';
  for (const d of G.ext.drones) {
    const fr = d.hp / d.max,
      st = d.tr ? '#40c8ff' : atHatch(d) ? '#3fff6a' : d.task.type === 'idle' ? '#ffc040' : '#40e0c0';
    let g = '';
    for (let k = 0; k < 12; k++)
      g += `<i style="${k < Math.round(fr * 12) ? 'background:' + (fr > 0.66 ? C.good : fr > 0.33 ? C.warn : C.bad) : ''}"></i>`;
    h += `<div class="dcard ${d.id === G.sel ? 'sel' : ''}" data-d="${d.id}"><span class="led" style="color:${st}"></span><span class="dn">${d.name} <span class="dim" style="font-size:10px">${DT[d.dt].n.toUpperCase()}</span></span><span class="chips">${d.iface ? '<span class="chip" style="color:#ffa040">IF</span>' : ''}${d.scan ? '<span class="chip" style="color:#b08aff">SC</span>' : ''}</span><div class="lcd">${esc(taskText(d))}</div><div class="hpg">${g}</div></div>`;
  }
  if (!G.ext.drones.length) h += '<div class="lcd" style="color:#3a6a44">NO DRONES ON THE NET</div>';
  {
    const hd = G.ext.drones.find(d => d.task.type === 'hack' && d.task.on);
    if (hd)
      h += `<button class="key wide" data-a="hackcon" data-hd="${hd.id}">OPEN INTRUSION CONSOLE <small>${hd.name}</small></button>`;
  }
  h += `<div class="dim" style="font-size:12px">Fleet ${G.ext.drones.length}/${droneCap()} (3 per working Drone Rack)</div>`;
  h += `<div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px"><button class="pbtn" data-a="recall">RECALL</button><button class="pbtn" data-a="recallall">RECALL ALL</button><button class="pbtn" data-a="deploy">DEPLOY SAT</button></div>`;
  const sd = selDrone();
  if (sd)
    h += `<div class="dim" style="font-size:12px;margin-top:4px">${DT[sd.dt].n}: ${DT[sd.dt].desc}</div>`;
  h += `<div class="dim" style="font-size:12px;margin-top:6px;line-height:1.4">Tap: % debris = salvage · ◊ pod, d wreck, + lifeboat = retrieve · foreign station = hack (Utility) or assault (Guard) · subdued station section = tow · grey O hatch = build tube or dock a towed section · red x = patch · r/s/T = attack · your own section = detach (Tug) · empty space = explore there</div>`;
  $('#ctx').innerHTML = h;
  const sec = SEC(V.sec);
  const so = G.ext.objs.filter(o => o.sec === V.sec && o.seen !== false);
  const ders = so.filter(o => o.kind === 'der'),
    rog = so.filter(o => o.kind === 'rogue' || o.kind === 'turret');
  let s = `<div style="color:${V.sec === HULL || V.sec === G.home ? '#2fdc4f' : SEC_T[sec.type].c}">Viewing ${V.sec === HULL ? 'KESTREL-9 hull (build space)' : V.sec === G.home ? secName(sec) + ' · local space' : secName(sec) + ' · ' + esc(sec.name)}</div>${V.sec !== HULL ? '<button class="pbtn" data-a="homesec">Hull</button>' : ''}${V.sec !== G.home ? '<button class="pbtn" data-a="localsec">Local space</button>' : ''}<div>Satellites in stock: ${
    SATS.filter(t => G.sats[t])
      .map(t => t + ' x' + G.sats[t])
      .join(', ') || 'none'
  } · Tube kits: ${G.kits}</div>`;
  s += `<div>Debris: ${so.filter(o => o.kind === 'debris').length} · Pods: ${so.filter(o => o.kind === 'pod').length} · Wrecks: ${so.filter(o => o.kind === 'wreck').length}</div>`;
  const sts = G.stations.filter(st => st.sec === V.sec && st.known);
  s += sts
    .map(
      st =>
        `<div style="color:${st.state === 'hostile' ? '#ff8a6a' : '#7fffb0'}">${esc(st.name)} · sec ${st.ice} · ${st.state === 'hostile' ? (st.alert ? 'ALERT' : 'hostile') + (st.hk ? ' · hack ' + hackStatus(st) : '') : 'subdued'}</div>`,
    )
    .join('');
  s += `<div>Loose sections: ${
    ders
      .filter(o => !locked(o))
      .map(o => `${o.pack.name} (${BR[o.pack.brand].cc})`)
      .join(', ') || 'none'
  }</div>`;
  if (!sts.length && V.sec === G.home && !G.stations.some(st => st.sec === G.home && st.known))
    s += '<div class="dim">Sensors are short-ranged. Send drones out to see what is around.</div>';
  s += `<div>Free docking ports: ${freePorts().length} · Hull schematics: ${(G.schem || []).length} · Machine schematics: ${Object.keys(G.bp).filter(k => k.startsWith('k_')).length}</div>`;
  if (rog.length) s += `<div class="bad">Hostiles / turrets: ${rog.length}</div>`;
  s += `<div class="dim" style="margin-top:4px">Station: ${G.mods.length} sections from ${new Set(G.mods.map(m => m.brand)).size} makers</div>`;
  $('#ctx2').innerHTML = watchHtml() + s;
}
const repLabel = r =>
  r >= 60 ? 'ALLIED' : r >= 30 ? 'FRIENDLY' : r > -30 ? 'NEUTRAL' : r > -60 ? 'HOSTILE' : 'ENEMY';
function uiEarth() {
  $('#ctxH').textContent = '/ F A C T I O N S /';
  $('#ctx2H').textContent = '/ R E Q U E S T S /';
  const sh = shares();
  let h = '';
  if (!G.contact) {
    $('#ctx').innerHTML = '<div class="dim">No contact yet.</div>';
    $('#ctx2').innerHTML = '';
    return;
  }
  h += `<div class="dim" style="font-size:12px">Settled: ${sh.tot} cells. Habitable: ${sh.hab}. The rest is dead ground.</div>`;
  FAC.forEach((F, fi) => {
    const f = G.fac[fi];
    h += `<div class="card" style="border-color:${F.c}55"><div style="color:${F.c}">${F.n} <span class="cnt">${repLabel(f.rep)} ${Math.round(f.rep)}</span></div><div class="bar" style="height:6px;margin:3px 0"><div class="f" style="left:50%;width:${Math.abs(f.rep) / 2}%;${f.rep < 0 ? 'left:auto;right:50%;' : ''}background:${f.rep < 0 ? '#ff4a4a' : F.c}"></div></div>${hasOnline('driver') ? `<button class="pbtn" data-strike="${fi}" ${G.stock.ammo < 15 ? 'disabled' : ''}>Mass driver strike</button>` : ''}<div class="dim" style="font-size:12px">territory ${sh.c[fi]} cells (${sh.tot ? Math.round((sh.c[fi] / sh.tot) * 100) : 0}%) · sats ${G.orbit.filter(s => s.f === fi).length} · strength ${Math.round(power(fi))} · wants ${F.sat}</div></div>`;
  });
  h += `<div class="sh">L E G A C Y &nbsp;S A T S</div>`;
  for (const L of G.legacy) {
    if (!L.known) {
      h += '<div class="dim" style="font-size:12px">??? unidentified (Sensor Array or RECON sat)</div>';
      continue;
    }
    h += `<div style="font-size:12px;margin:3px 0"><span class="bad">${L.n}</span> <span class="dim">${esc(L.org)} ${L.yr}</span><br>friendly to: ${L.tags.length ? L.tags.map(f => `<span style="color:${f === TAGK ? '#2fdc4f' : FAC[f].c}">${tagName(f)}</span>`).join(' ') : 'nobody'} <button class="pbtn" data-spoof="${L.id}" ${G.spoof || !commsOnline() ? 'disabled' : ''}>Spoof IFF</button></div>`;
  }
  if (G.spoof)
    h += `<div class="info" style="font-size:12px">Spoofing ${G.legacy[G.spoof.lid].n} for ${tagName(G.spoof.f)}: ${G.spoof.prog}/30</div>`;
  $('#ctx').innerHTML = h;
  let s = commsOnline() ? '' : '<div class="bad">Comms offline: no new requests, relays paused.</div>';
  for (const r of G.reqs) {
    const F = FAC[r.f];
    let act = '';
    if (r.type === 'sat')
      act = `<button class="pbtn" data-rq="${r.id}" data-k="satrail" ${hasOnline('launch') && G.sats[r.sat] ? '' : 'disabled'}>Launch (rail)</button><span class="dim" style="font-size:11px"> or deploy with a drone · ${r.sat} in stock: ${G.sats[r.sat]}</span>`;
    if (r.type === 'relay') act = `<span class="dim">progress ${r.prog}/${r.goal}</span>`;
    if (r.type === 'survey')
      act =
        G.survey && G.survey.rid === r.id
          ? `<span class="info">surveying ${G.survey.prog}/40</span>`
          : `<button class="pbtn" data-rq="${r.id}" data-k="survey" ${hasOnline('sensor') && !G.survey ? '' : 'disabled'}>Start survey</button>`;
    if (r.type === 'cargo')
      act = `<button class="pbtn" data-rq="${r.id}" data-k="cargo" ${hasOnline('launch') ? '' : 'disabled'}>Launch cargo</button>`;
    if (r.type === 'spoof')
      act = `<span class="dim" style="font-size:11px">Use Spoof IFF on ${G.legacy[r.lid].n}</span>`;
    s += `<div class="card" style="border-color:${F.c}55"><span style="color:${F.c}">${F.sh}</span> <span class="dim">${r.type.toUpperCase()} · ${Math.max(0, r.deadline - G.turn)} turns left</span><div>${esc(r.text)}</div>${act}</div>`;
  }
  if (!G.reqs.length) s += '<div class="dim">No open requests.</div>';
  $('#ctx2').innerHTML = s;
}
function renderPad() {
  const p = $('#pad');
  let h;
  if (V.tab === 'station') {
    h = `<div id="dpad">${[
      [-1, -1, '↖'],
      [0, -1, '↑'],
      [1, -1, '↗'],
      [-1, 0, '←'],
      [0, 0, '·'],
      [1, 0, '→'],
      [-1, 1, '↙'],
      [0, 1, '↓'],
      [1, 1, '↘'],
    ]
      .map(([x, y, c]) => `<button data-a="mv:${x},${y}">${c}</button>`)
      .join('')}</div>
    <div id="acts"><button class="fire" data-a="fire">FIRE</button><button data-a="target">TARGET</button><button data-a="get">GET</button><button data-a="eat">EAT</button><button data-a="log">LOG</button><button data-a="tags">TAGS</button><button data-a="rooms">ROOMS</button><button data-a="w10">WAIT 10</button><button data-a="help">HELP</button></div>`;
  } else if (V.tab === 'orbit')
    h = `<button data-a="ozin">+</button><button data-a="ozout">−</button><button data-a="ofhome">FOCUS HOME</button><button data-a="ofdrone">FOCUS DRONE</button><button data-a="ofall">WHOLE MAP</button><button data-a="dprev">◀ DRONE</button><button data-a="dnext">DRONE ▶</button><button data-a="w1">WAIT 1</button><button data-a="w10">WAIT 10</button><button data-a="w50">WAIT 50</button><button data-a="log">LOG</button><button data-a="help">HELP</button>`;
  else if (V.tab === 'ext')
    h = `<button data-a="homesec">HULL</button><button data-a="localsec">LOCAL</button><button data-a="dprev">◀ DRONE</button><button data-a="dnext">DRONE ▶</button><button data-a="recall">RECALL</button><button data-a="deploy">DEPLOY SAT</button><button data-a="zin">+</button><button data-a="zout">−</button><button data-a="center">CENTER</button><button data-a="w1">WAIT 1</button><button data-a="w10">WAIT 10</button><button data-a="w50">WAIT 50</button><button data-a="log">LOG</button><button data-a="tags">TAGS</button><button data-a="rooms">ROOMS</button><button data-a="help">HELP</button>`;
  else
    h = `<button data-a="ozin">+</button><button data-a="ozout">−</button><button data-a="gfit">FIT</button><button data-a="w1">WAIT 1</button><button data-a="w10">WAIT 10</button><button data-a="w50">WAIT 50</button><button data-a="log">LOG</button><button data-a="help">HELP</button>`;
  if (p.dataset.h !== V.tab) {
    p.innerHTML = h;
    p.dataset.h = V.tab;
    p.className = V.tab === 'station' ? 'st' : 'wrap';
  }
}
export function padAction(a) {
  if (a.startsWith('mv:')) {
    const [x, y] = a.slice(3).split(',').map(Number);
    return playerMove(x, y);
  }
  switch (a) {
    case 'fire':
      return fire();
    case 'target':
      return cycleTarget();
    case 'get':
      return pickup();
    case 'eat':
      return eat();
    case 'tags':
      return cycTags();
    case 'rooms':
      return toggleRooms();
    case 'help':
      return showHelp();
    case 'log':
      return showLog();
    case 'w1':
      return waitN(1);
    case 'w10':
      return waitN(10);
    case 'w50':
      return waitN(50);
    case 'dprev':
      return cycleDrone(-1);
    case 'dnext':
      return cycleDrone(1);
    case 'ozin':
      return zoomAt(1.35);
    case 'ozout':
      return zoomAt(1 / 1.35);
    case 'ofhome':
      return focusOrbit('home');
    case 'ofdrone':
      return focusOrbit('drone');
    case 'ofall':
      return focusOrbit('all');
    case 'gfit':
      V.gz = 1;
      V.gcam = null;
      return render();
    case 'silent':
      return toggleSilent();
    case 'sweep':
      return activeSweep();
    case 'hackcon': {
      const d = G.ext.drones.find(d => d.task.type === 'hack' && d.task.on);
      if (d) {
        d.task.auto = 0;
        V.hackOpen = d.id;
        hackConsole(d);
      }
      return;
    }
    case 'fscanstop':
      G.fscan = null;
      log('Focused scan cut. Emitters dark.');
      return refresh();
    case 'homesec':
      V.sec = HULL;
      V.ecam = null;
      return setTab('ext');
    case 'localsec':
      V.sec = G.home;
      V.ecam = null;
      return setTab('ext');
    case 'zin':
      V.ez = Math.min(4, V.ez * 1.4);
      return render();
    case 'zout':
      V.ez = Math.max(0.5, V.ez / 1.4);
      return render();
    case 'center':
      V.ecam = null;
      return render();
    case 'recall': {
      const d = selDrone();
      if (d) cmdDrone(d, { type: 'return' }, `${d.name}: returning.`);
      return;
    }
    case 'recallall':
      G.ext.drones.forEach(d => cmdDrone(d, { type: 'return' }));
      log('All drones recalled.');
      return refresh();
    case 'deploy': {
      const d = selDrone();
      if (!d) {
        log('Select a drone first.');
        return refresh();
      }
      if (d.dt === 'guard') {
        log('Guard drones cannot carry satellites.', 'warn');
        return refresh();
      }
      return deployFlow('drone', d.id);
    }
  }
}
