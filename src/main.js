import { launchCargo, spoofMenu, startSurvey, strikeMenu } from './actions/earth.js';
import { cycleDrone, extTap } from './actions/exterior.js';
import {
  cycleTarget,
  eat,
  fire,
  itemMenu,
  machineMenu,
  partMenu,
  patchMenu,
  pickup,
  playerMove,
  visHostiles,
} from './actions/player.js';
import { EGH, EGW, T, WALK, WH, WW } from './core/constants.js';
import { FAC, MD, OG } from './core/data.js';
import { log } from './core/messages.js';
import { save } from './core/save.js';
import { G, M, P, V } from './core/state.js';
import { cheb, clamp, D8, idx, inB } from './core/util.js';
import { releaseSat } from './sim/earth-tick.js';
import { actorAt } from './sim/stats.js';
import { canAct, endTurn, refresh, waitN } from './sim/turn.js';
import { cellName } from './space/earth.js';
import { machAt } from './space/sectors.js';
import { installUi } from './ui/app.js';
import { $ } from './ui/dom.js';
import { showHelp, showTitle } from './ui/help-title.js';
import { closeModal, modalKeys, pickModal, showLog } from './ui/log-modal.js';
import { padAction, setTab } from './ui/panels.js';
import {
  CAM,
  cssH,
  cssW,
  cv,
  cycTags,
  dpr,
  offX,
  offY,
  orbitTap,
  orbitTapAt,
  render,
  resize,
  toggleRooms,
  TS,
} from './ui/render.js';
import { machineStatus } from './world/machines.js';
import { newGame } from './world/new-game.js';

installUi();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

let travelTimer = null;
export function stopTravel() {
  if (travelTimer) {
    clearInterval(travelTimer);
    travelTimer = null;
  }
}
function openAt(x, y) {
  const t = M.map[idx(x, y)];
  if (t === T.MACH) {
    const m = machAt(x, y);
    if (m) {
      machineMenu(m);
      return true;
    }
  }
  if (t === T.BREACH) {
    const b = G.brk.find(b => b.x === x && b.y === y);
    if (b) {
      patchMenu(b);
      return true;
    }
  }
  return false;
}
function useNear() {
  if (!canAct()) return;
  const c = [];
  if (V.bumped && cheb(V.bumped[0], V.bumped[1], P.x, P.y) === 1) c.push(V.bumped);
  for (const [dx, dy] of D8) c.push([P.x + dx, P.y + dy]);
  for (const [x, y] of c) if (inB(x, y) && openAt(x, y)) return;
  log('Nothing to use next to you.');
  refresh();
}
function travelTo(tx, ty) {
  stopTravel();
  const gi = idx(tx, ty),
    gt = M.map[gi];
  if (!G.seen[gi]) return;
  const bump = gt === T.MACH || gt === T.BREACH;
  if (!WALK.has(gt) && !bump) return;
  const prev = new Int32Array(WW * WH).fill(-1),
    s = idx(P.x, P.y);
  prev[s] = s;
  const q = [s];
  let h = 0,
    ok = false;
  while (h < q.length) {
    const i = q[h++];
    if (i === gi) {
      ok = true;
      break;
    }
    const x = i % WW,
      y = (i / WW) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx,
        ny = y + dy;
      if (!inB(nx, ny)) continue;
      const j = idx(nx, ny);
      if (prev[j] >= 0 || !G.seen[j]) continue;
      if (!(WALK.has(M.map[j]) || j === gi)) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  if (!ok) return;
  const path = [];
  for (let i = gi; i !== s; i = prev[i]) path.push(i);
  path.reverse();
  const known = new Set(visHostiles().map(a => a.id));
  G.intr = false;
  const step = () => {
    if (!canAct() || !path.length) {
      stopTravel();
      return;
    }
    const n = path.shift(),
      nx = n % WW,
      ny = (n / WW) | 0;
    if (cheb(nx, ny, P.x, P.y) !== 1 || actorAt(nx, ny)) {
      stopTravel();
      return;
    }
    if (n === gi && bump) {
      stopTravel();
      openAt(nx, ny);
      return;
    }
    playerMove(nx - P.x, ny - P.y);
    if (visHostiles().some(a => !known.has(a.id)) || G.intr) stopTravel();
  };
  step();
  if (path.length) travelTimer = setInterval(step, 70);
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && !V.modalOpen) setTab(b.dataset.tab);
});
$('#pad').addEventListener('pointerdown', e => {
  const b = e.target.closest('button');
  if (!b) return;
  e.preventDefault();
  stopTravel();
  if (!V.modalOpen || b.dataset.a === 'help') padAction(b.dataset.a);
});
$('#tail').addEventListener('click', () => {
  if (!V.modalOpen && G) showLog();
});
$('#side').addEventListener('click', e => {
  if (V.modalOpen || !G) return;
  const t = e.target;
  const pb = t.closest('.pbtn,.key');
  if (pb && !pb.disabled) {
    if (pb.dataset.a) return padAction(pb.dataset.a);
    if (pb.dataset.spoof) return spoofMenu(+pb.dataset.spoof);
    if (pb.dataset.strike) return strikeMenu(+pb.dataset.strike);
    if (pb.dataset.rq) {
      const r = G.reqs.find(x => x.id === +pb.dataset.rq);
      if (!r) return;
      const k = pb.dataset.k;
      if (k === 'survey') return startSurvey(r.id);
      if (k === 'cargo') return launchCargo(r);
      if (k === 'satrail') {
        G.sats[r.sat]--;
        log('Launch Rail fires.', 'good');
        endTurn(true);
        releaseSat(r.sat, { req: r.id });
        return endTurn();
      }
    }
    return;
  }
  const row = t.closest('.row,.dcard');
  if (!row) return;
  if (row.dataset.sl) return partMenu(row.dataset.sl, +row.dataset.j);
  if (row.dataset.inv) return itemMenu(+row.dataset.inv);
  if (row.dataset.d) {
    G.sel = +row.dataset.d;
    return refresh();
  }
  if (row.dataset.sec) return orbitTap(G.sectors[+row.dataset.sec]);
  if (row.dataset.m) {
    const m = G.machines.find(x => x.id === +row.dataset.m);
    if (m) {
      log(
        `${MD[m.type].n}: ${G.mods[m.mi] ? G.mods[m.mi].name : ''}, ${Math.round(m.cond)}%, ${machineStatus(m)}.`,
      );
      refresh();
    }
  }
});
$('#modal').addEventListener('click', e => {
  if (e.target.id === 'modal' && !$('#modal').dataset.locked) closeModal();
});
let down = null;
cv.addEventListener('pointerdown', e => {
  const c = V.tab === 'orbit' ? V.ocam : V.tab === 'earth' ? V.gcam : V.ecam;
  down = { x: e.clientX, y: e.clientY, cx: c ? c.x : 0, cy: c ? c.y : 0, drag: false };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  if (down) {
    const dx = e.clientX - down.x,
      dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 10) down.drag = true;
    if (down.drag && V.tab === 'ext' && V.ecam) {
      V.ecam.x = down.cx - dx / V.ets;
      V.ecam.y = down.cy - dy / V.ets;
      render();
    }
    if (down.drag && V.tab === 'orbit' && V.ocam) {
      V.ocam.x = down.cx - dx / V.ots;
      V.ocam.y = down.cy - dy / V.ots;
      render();
    }
    if (down.drag && V.tab === 'earth' && V.gcam && V.eg) {
      V.gcam.x = down.cx - dx / V.eg.cs;
      V.gcam.y = down.cy - dy / V.eg.cs;
      render();
    }
    return;
  }
  if (V.tab === 'station' && V.sxf) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - offX) / TS) + CAM.x,
      y = Math.floor((e.clientY - r.top - offY) / TS) + CAM.y;
    if (!V.hover || V.hover.x !== x || V.hover.y !== y) {
      V.hover = { v: 'station', x, y };
      render();
    }
  }
});
cv.addEventListener('pointerup', e => {
  if (!down) return;
  const d = down;
  down = null;
  if (d.drag || !canAct()) return;
  const r = cv.getBoundingClientRect(),
    px = e.clientX - r.left,
    py = e.clientY - r.top;
  if (V.tab === 'station')
    stationTap(Math.floor((px - offX) / TS) + CAM.x, Math.floor((py - offY) / TS) + CAM.y);
  else if (V.tab === 'ext') extTap(Math.floor(px / V.ets + V.ecam.x), Math.floor(py / V.ets + V.ecam.y));
  else if (V.tab === 'orbit') orbitTapAt(px, py);
  else if (V.eg) {
    const x = Math.floor((px - V.eg.ox) / V.eg.cs),
      y = Math.floor((py - V.eg.oy) / V.eg.cs);
    if (x >= 0 && y >= 0 && x < EGW && y < EGH) {
      const i = x + y * EGW;
      log(
        `${cellName(x, y)}: ${!M.land[i] ? 'ocean' : G.owner[i] >= 0 ? FAC[G.owner[i]].sh + ' territory' : G.hab[i] ? 'habitable, unclaimed' : 'irradiated wasteland'}.`,
      );
      refresh();
    }
  }
});
cv.addEventListener(
  'wheel',
  e => {
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    if (V.tab === 'ext') {
      e.preventDefault();
      V.ez = clamp(V.ez * f, 0.5, 4);
      render();
    } else if (V.tab === 'orbit' || V.tab === 'earth') {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomAt(f, e.clientX - r.left, e.clientY - r.top);
    }
  },
  { passive: false },
);
export function zoomAt(f, px, py) {
  if (px == null) {
    px = cssW / 2;
    py = cssH / 2;
  }
  if (V.tab === 'orbit') {
    const ts = V.ots;
    const wx = px / ts + V.ocam.x,
      wy = py / ts + V.ocam.y;
    V.oz = clamp((V.oz || 1) * f, 0.8, 6);
    const t2 = clamp((Math.min(cssW, cssH) / OG) * V.oz, 3, 44);
    V.ocam.x = wx - px / t2;
    V.ocam.y = wy - py / t2;
    render();
  } else if (V.tab === 'earth' && V.eg) {
    const cs = V.eg.cs;
    const wx = px / cs + V.gcam.x,
      wy = py / cs + V.gcam.y;
    V.gz = clamp((V.gz || 1) * f, 1, 6);
    const c2 = V.eg.fit * V.gz;
    V.gcam.x = wx - px / c2;
    V.gcam.y = wy - py / c2;
    render();
  }
}
function stationTap(x, y) {
  if (!inB(x, y)) return;
  stopTravel();
  const a = actorAt(x, y);
  if (a && M.vis[idx(x, y)]) {
    if (cheb(x, y, P.x, P.y) === 1) return playerMove(x - P.x, y - P.y);
    if (G.target === a.id) return fire();
    G.target = a.id;
    return refresh();
  }
  if (x === P.x && y === P.y) {
    if (G.items[idx(x, y)]) return pickup();
    return playerMove(0, 0);
  }
  if (cheb(x, y, P.x, P.y) === 1) {
    if (openAt(x, y)) return;
    return playerMove(x - P.x, y - P.y);
  }
  travelTo(x, y);
}
const KD = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  Numpad8: [0, -1],
  Numpad2: [0, 1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad7: [-1, -1],
  Numpad9: [1, -1],
  Numpad1: [-1, 1],
  Numpad3: [1, 1],
  Numpad5: [0, 0],
};
const VK = { k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1] };
const WK = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] },
  held = new Set();
let wq = 0;
document.addEventListener('keyup', e => {
  held.delete(e.code);
});
window.addEventListener('blur', () => held.clear());
function wasdDir() {
  let x = 0,
    y = 0;
  for (const c of held)
    if (WK[c]) {
      x += WK[c][0];
      y += WK[c][1];
    }
  return [Math.sign(x), Math.sign(y)];
}
function wasdKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  held.add(e.code);
  e.preventDefault();
  if (wq) return true;
  wq = setTimeout(() => {
    wq = 0;
    const [dx, dy] = wasdDir();
    if (!dx && !dy) return;
    if (V.tab === 'ext' && V.ecam) {
      V.ecam.x += dx * 3;
      V.ecam.y += dy * 3;
      render();
    } else if (V.tab === 'station' && !V.modalOpen && G && !G.over) playerMove(dx, dy);
  }, 45);
  return true;
}
document.addEventListener('keydown', e => {
  if (!V.modalOpen && WK[e.code] && G && !G.over && (V.tab === 'station' || V.tab === 'ext')) {
    stopTravel();
    if (wasdKey(e)) return;
  }
  if (V.modalOpen) {
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const i = modalKeys[+e.key - 1];
      if (i != null) pickModal(i);
    } else if (e.key === 'Escape' && !$('#modal').dataset.locked) closeModal();
    return;
  }
  if (!G || G.over) return;
  stopTravel();
  const k = e.key;
  if (k === 'z') return setTab('station');
  if (k === 'x') return setTab('ext');
  if (k === 'o') return setTab('orbit');
  if (k === 'c') return setTab('earth');
  if (k === '?' || k === '/') return showHelp();
  if (k === 'r' || k === 'R') return waitN(10);
  if (k === 't') return cycTags();
  if (k === 'v' && V.tab === 'station') return toggleRooms();
  if (k === 'L') return showLog();
  if (V.tab === 'ext') {
    if (KD[e.code] && V.ecam) {
      e.preventDefault();
      const [dx, dy] = KD[e.code];
      V.ecam.x += dx * 3;
      V.ecam.y += dy * 3;
      return render();
    }
    if (k === '+' || k === '=') {
      V.ez = Math.min(4, V.ez * 1.4);
      return render();
    }
    if (k === '-') {
      V.ez = Math.max(0.5, V.ez / 1.4);
      return render();
    }
    if (k === ' ' || k === '.') {
      e.preventDefault();
      return waitN(1);
    }
    if (k === 'w') return waitN(10);
    if (k === 'Tab') {
      e.preventDefault();
      return cycleDrone(1);
    }
    if (k === 'l') return showLog();
    return;
  }
  if (V.tab === 'earth' || V.tab === 'orbit') {
    if (k === ' ' || k === '.') {
      e.preventDefault();
      return waitN(1);
    }
    if (k === 'w') return waitN(10);
    if (k === 'l') return showLog();
    return;
  }
  const d = KD[e.code] || (e.code.startsWith('Numpad') ? null : VK[k]);
  if (d) {
    e.preventDefault();
    return playerMove(d[0], d[1]);
  }
  if (k === '.' || k === ' ') {
    e.preventDefault();
    return playerMove(0, 0);
  }
  if (k === 'f' || k === 'F') {
    e.preventDefault();
    return fire();
  }
  if (k === 'Tab') {
    e.preventDefault();
    return cycleTarget();
  }
  if (k === 'u' || k === 'U') return useNear();
  if (k === 'g' || k === ',') return pickup();
  if (k === 'e') return eat();
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m) return itemMenu(+m[1] - 1);
});
window.addEventListener('resize', resize);
if (window.ResizeObserver) {
  let rq = 0;
  new ResizeObserver(() => {
    if (rq) return;
    rq = requestAnimationFrame(() => {
      rq = 0;
      const r = $('#mapWrap').getBoundingClientRect();
      if (
        Math.abs(r.width - cssW) > 0.5 ||
        Math.abs(r.height - cssH) > 0.5 ||
        (window.devicePixelRatio || 1) !== dpr
      )
        resize();
    });
  }).observe($('#mapWrap'));
}
if (document.fonts && document.fonts.ready)
  document.fonts.ready.then(() => {
    try {
      render();
    } catch (e) {}
  });
newGame('clone');
V.tab = 'station';
requestAnimationFrame(() => {
  resize();
  refresh();
  showTitle();
});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());
