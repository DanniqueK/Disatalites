import { hullNear, releaseTow, selDrone, taskText } from '../actions/exterior.js';
import { machineStatus, modBreaches } from '../actions/player.js';
import { EGH, EGW, T, WH, WW } from '../core/constants.js';
import {
  BR,
  DT,
  EN,
  ER,
  FAC,
  IT,
  MD,
  OC,
  OG,
  RC,
  RINGS,
  ROLE,
  SEC_T,
  TAGK,
  bandOf,
  hasAI,
  stById,
} from '../core/data.js';
import { G, M, P, V } from '../core/state.js';
import { $, cheb, clamp, esc, idx, rr } from '../core/util.js';
import { atHatch } from '../sim/exterior-tick.js';
import { stats } from '../sim/stats.js';
import { refresh } from '../sim/turn.js';
import { cellOf, isHome, shares } from '../space/earth.js';
import { hatchOf, objById, stationBox } from '../space/exterior-objects.js';
import {
  HULL,
  LC,
  SEC,
  SIGN,
  cid,
  det,
  locked,
  machAt,
  passR,
  scanOK,
  sdist,
  secCoord,
  secName,
  startFocus,
  startTransfer,
  sweepR,
  travelTime,
} from '../space/sectors.js';
import { log, modalOpen, showModal } from './log-modal.js';
import { setTab } from './panels.js';
import { cutSpot, freePorts, modById, modCells, modIndex } from '../world/build.js';
import { commsOnline, ctlOK, hasOnline, online } from '../world/machines.js';
import { portWorld } from '../world/shapes.js';

export const cv = $('#map'),
  ctx = cv.getContext('2d');
export let TS = 16,
  cssW = 0,
  cssH = 0,
  dpr = 1,
  offX = 0,
  offY = 0;
export const CAM = { x: 0, y: 0 };
export function resize() {
  const r = $('#mapWrap').getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  cssW = r.width;
  cssH = r.height;
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  render();
}
const narrow = () => cssW < 700;
const FONT = s => `${Math.floor(s)}px 'Share Tech Mono', ui-monospace, monospace`;
function glyph(ch, x, y, col, ts) {
  ctx.fillStyle = col;
  ctx.fillText(ch, x + ts / 2, y + ts / 2 + 1);
}
export function render() {
  if (!G) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cssW, cssH);
  if (V.tab === 'station') renderStation();
  else if (V.tab === 'ext') renderExt();
  else if (V.tab === 'orbit') renderOrbit();
  else renderEarth();
  drawFx();
}
function renderStation() {
  TS = narrow() ? 18 : clamp(Math.floor(Math.min(cssW / 44, cssH / 27)), 14, 26);
  const vw = cssW / TS,
    vh = cssH / TS;
  CAM.x = clamp(P.x - Math.floor(vw / 2), 0, WW - Math.floor(vw));
  CAM.y = clamp(P.y - Math.floor(vh / 2), 0, WH - Math.floor(vh));
  offX = 0;
  offY = 0;
  const sx = x => offX + (x - CAM.x) * TS,
    sy = y => offY + (y - CAM.y) * TS;
  ctx.font = FONT(TS * 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const S = stats();
  const x0 = Math.max(0, CAM.x),
    y0 = Math.max(0, CAM.y),
    x1 = Math.min(WW, CAM.x + Math.ceil(vw) + 1),
    y1 = Math.min(WH, CAM.y + Math.ceil(vh) + 1);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      if (!G.seen[i]) continue;
      tile(x, y, sx(x), sy(y), M.vis[i], TS);
    }
  drawFixtures(sx, sy, TS, x0, y0, x1, y1);
  for (const k in G.crates) {
    const i = +k;
    if (!G.seen[i]) continue;
    const x = i % WW,
      y = (i / WW) | 0;
    ctx.globalAlpha = M.vis[i] ? 1 : 0.45;
    glyph('$', sx(x), sy(y), '#f0c850', TS);
    ctx.globalAlpha = 1;
  }
  const IC = { tool: '#ffb030', weap: '#c868ff', suit: '#4aa8ff', use: '#ff6a8a', drone: '#40e0c0' },
    IG = { tool: '/', weap: ')', suit: '[', use: '!', drone: 'd' };
  for (const k in G.items) {
    const i = +k,
      arr = G.items[k];
    if (!arr.length || !G.seen[i]) continue;
    const x = i % WW,
      y = (i / WW) | 0,
      d = IT[arr[arr.length - 1].key];
    ctx.globalAlpha = M.vis[i] ? 1 : 0.45;
    glyph(IG[d.s], sx(x), sy(y), IC[d.s], TS);
    ctx.globalAlpha = 1;
  }
  for (const a of G.actors) {
    if (a.hp <= 0) continue;
    const i = idx(a.x, a.y),
      vis = M.vis[i],
      sc = !vis && S.scan && cheb(a.x, a.y, P.x, P.y) <= S.scan;
    if (!vis && !sc) continue;
    const d = EN[a.type];
    ctx.globalAlpha = vis ? 1 : 0.45;
    ctx.fillStyle = '#000';
    ctx.fillRect(sx(a.x), sy(a.y), TS, TS);
    glyph(d.g, sx(a.x), sy(a.y), d.c, TS);
    if (vis && a.hp < a.max) {
      ctx.fillStyle = '#f33';
      ctx.fillRect(sx(a.x) + 1, sy(a.y) + TS - 3, ((TS - 2) * a.hp) / a.max, 2);
    }
    ctx.globalAlpha = 1;
  }
  for (const c of G.crew)
    if (M.vis[idx(c.x, c.y)]) {
      ctx.fillStyle = '#000';
      ctx.fillRect(sx(c.x), sy(c.y), TS, TS);
      glyph(
        '@',
        sx(c.x),
        sy(c.y),
        {
          engineer: '#ffb030',
          pilot: '#40c8ff',
          hacker: '#b08aff',
          medic: '#ff8aa0',
          gunner: '#ff7050',
          botanist: '#3fcf4f',
        }[c.role],
        TS,
      );
    }
  if (G.bot && M.vis[idx(G.bot.x, G.bot.y)]) {
    ctx.fillStyle = '#000';
    ctx.fillRect(sx(G.bot.x), sy(G.bot.y), TS, TS);
    glyph('m', sx(G.bot.x), sy(G.bot.y), '#7fffb0', TS);
  }
  for (const d of G.ext.drones)
    if (M.vis[idx(d.x, d.y)]) {
      ctx.globalAlpha = 0.8;
      glyph('D', sx(d.x), sy(d.y), '#40e0c0', TS);
      ctx.globalAlpha = 1;
    }
  ctx.fillStyle = '#0e3a18';
  ctx.fillRect(sx(P.x), sy(P.y), TS, TS);
  ctx.font = 'bold ' + FONT(TS * 0.95);
  glyph('@', sx(P.x), sy(P.y), '#eafff0', TS);
  ctx.font = FONT(TS * 0.9);
  if (V.tags) stationTags(sx, sy);
  const t = G.actors.find(a => a.id === G.target && a.hp > 0);
  if (t && M.vis[idx(t.x, t.y)]) {
    ctx.strokeStyle = '#ff3a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx(t.x) - 1, sy(t.y) - 1, TS + 2, TS + 2);
  }
  if (V.hover && V.hover.v === 'station') {
    ctx.strokeStyle = 'rgba(47,220,79,.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(V.hover.x) + 0.5, sy(V.hover.y) + 0.5, TS - 1, TS - 1);
  }
  V.sxf = sx;
  V.syf = sy;
}
function wallDraw(px, py, ts, B, v) {
  ctx.fillStyle = v ? B.wall : shade(B.wall);
  ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
  ctx.strokeStyle = v ? B.line : shade(B.line);
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (B.pat === 'hatch') {
    for (let k = -ts; k < ts; k += Math.max(4, ts / 3)) {
      ctx.moveTo(px + 1 + Math.max(0, k), py + 1 + Math.max(0, -k));
      ctx.lineTo(px + 1 + Math.min(ts - 2, k + ts - 2), py + 1 + Math.min(ts - 2, ts - 2 - k));
    }
  } else if (B.pat === 'rivet') {
    const r = Math.max(1, ts * 0.09);
    for (const [a, b] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ])
      ctx.rect(px + ts * a - r / 2, py + ts * b - r / 2, r, r);
  } else if (B.pat === 'plate') {
    ctx.rect(px + ts * 0.22 + 0.5, py + ts * 0.22 + 0.5, ts * 0.56, ts * 0.56);
  } else if (B.pat === 'brick') {
    ctx.moveTo(px + 1, py + ts / 2);
    ctx.lineTo(px + ts - 1, py + ts / 2);
    ctx.moveTo(px + ts / 2, py + 1);
    ctx.lineTo(px + ts / 2, py + ts / 2);
    ctx.moveTo(px + ts / 4, py + ts / 2);
    ctx.lineTo(px + ts / 4, py + ts - 1);
  } else if (B.pat === 'grid') {
    ctx.moveTo(px + ts / 3, py + 1);
    ctx.lineTo(px + ts / 3, py + ts - 1);
    ctx.moveTo(px + (2 * ts) / 3, py + 1);
    ctx.lineTo(px + (2 * ts) / 3, py + ts - 1);
    ctx.moveTo(px + 1, py + ts / 2);
    ctx.lineTo(px + ts - 1, py + ts / 2);
  } else if (B.pat === 'scrap') {
    ctx.moveTo(px + 2, py + ts * 0.3);
    ctx.lineTo(px + ts - 3, py + ts * 0.6);
    ctx.moveTo(px + ts * 0.4, py + ts - 2);
    ctx.lineTo(px + ts * 0.7, py + 3);
  }
  ctx.stroke();
  ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);
}
const shadeCache = {};
function shade(c) {
  if (shadeCache[c]) return shadeCache[c];
  const n = parseInt(c.slice(1), 16);
  const r = (((n >> 16) & 255) * 0.42) | 0,
    g = (((n >> 8) & 255) * 0.42) | 0,
    b = ((n & 255) * 0.42) | 0;
  return (shadeCache[c] = `rgb(${r},${g},${b})`);
}
function tile(x, y, px, py, v, ts) {
  const i = idx(x, y),
    t = M.map[i];
  const m = G.mods[M.own[i]];
  const B = m ? BR[m.brand] : BR.scav;
  switch (t) {
    case T.VOID: {
      const s = M.stars[i];
      if (s) {
        ctx.fillStyle = `rgba(200,220,255,${(v ? 0.8 : 0.35) * s})`;
        ctx.fillRect(px + ts * 0.45, py + ts * 0.45, Math.max(1, ts * 0.1), Math.max(1, ts * 0.1));
      }
      break;
    }
    case T.FLOOR: {
      const pr = m ? m.pressure : 100;
      ctx.fillStyle =
        pr < 35
          ? v
            ? '#06223a'
            : '#031220'
          : m && !m.ctl
            ? v
              ? '#140a1c'
              : '#08050c'
            : v
              ? B.floor
              : '#050805';
      ctx.fillRect(px, py, ts, ts);
      glyph(B.fg, px, py, v ? B.fc : shade(B.fc), ts);
      break;
    }
    case T.WALL:
      wallDraw(px, py, ts, B, v);
      break;
    case T.DOOR:
      ctx.fillStyle = v ? B.floor : '#050805';
      ctx.fillRect(px, py, ts, ts);
      glyph('+', px, py, v ? B.door : shade(B.door), ts);
      break;
    case T.PORT:
      ctx.fillStyle = v ? '#202020' : '#0c0c0c';
      ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
      ctx.strokeStyle = v ? B.line : shade(B.line);
      ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);
      glyph('O', px, py, v ? '#a0a0a0' : '#404040', ts);
      break;
    case T.WINDOW:
      ctx.fillStyle = v ? '#0a2c4c' : '#05162a';
      ctx.fillRect(px, py, ts, ts);
      glyph('=', px, py, v ? '#6ad0ff' : '#245470', ts);
      break;
    case T.BREACH:
      ctx.fillStyle = v ? '#3a0808' : '#160404';
      ctx.fillRect(px, py, ts, ts);
      glyph('x', px, py, v ? '#ff5050' : '#702020', ts);
      break;
    case T.MACH: {
      const k = machAt(x, y);
      if (!k) break;
      const on = online(k),
        d = MD[k.type];
      if (k.fx) {
        ctx.fillStyle = v ? B.floor : '#050805';
        ctx.fillRect(px, py, ts, ts);
        break;
      }
      if (k.type === 'mount') {
        ctx.fillStyle = v ? B.floor : '#050805';
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = v ? '#3f7a4a' : '#1a3020';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(px + 2.5, py + 2.5, ts - 5, ts - 5);
        ctx.setLineDash([]);
        break;
      }
      if (k.wall) {
        wallDraw(px, py, ts, B, v);
        const mine = G.mods[k.mi] && G.mods[k.mi].ctl,
          col =
            k.type === 'hp'
              ? '#7a6050'
              : k.type === 'turret'
                ? online(k)
                  ? '#ff7050'
                  : '#a03030'
                : k.type === 'junc'
                  ? k.cond < 60
                    ? '#e04040'
                    : '#ffa040'
                  : mine
                    ? '#2fdc4f'
                    : k.cond < 60
                      ? '#e04040'
                      : '#e0c030';
        const [fx, fy] = k.face || [0, 1];
        const pw = ts * 0.62,
          cx = px + ts / 2 + fx * ts * 0.16,
          cy = py + ts / 2 + fy * ts * 0.16;
        ctx.globalAlpha = v ? 1 : 0.45;
        ctx.fillStyle = '#050805';
        ctx.fillRect(cx - pw / 2, cy - pw / 2, pw, pw);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - pw / 2 + 0.5, cy - pw / 2 + 0.5, pw - 1, pw - 1);
        ctx.fillStyle = col;
        if (fx) ctx.fillRect(fx > 0 ? px + ts - 2 : px, py + ts * 0.2, 2, ts * 0.6);
        else ctx.fillRect(px + ts * 0.2, fy > 0 ? py + ts - 2 : py, ts * 0.6, 2);
        const fz = ctx.font;
        ctx.font = 'bold ' + FONT(ts * 0.5);
        ctx.fillStyle = col;
        ctx.fillText(d.g, cx, cy + 1);
        ctx.font = fz;
        ctx.globalAlpha = 1;
        break;
      }
      ctx.fillStyle = on
        ? v
          ? '#123a1a'
          : '#0a1c0e'
        : k.cond < 60
          ? v
            ? '#3a1212'
            : '#1a0808'
          : v
            ? '#33300e'
            : '#181606';
      ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
      ctx.strokeStyle = on ? '#2fdc4f' : k.cond < 60 ? '#a03030' : '#a09030';
      ctx.globalAlpha = v ? 1 : 0.4;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1.5, py + 1.5, ts - 3, ts - 3);
      glyph(d.g, px, py, on ? d.c : '#9a9a9a', ts);
      ctx.globalAlpha = 1;
      break;
    }
  }
}
/* ---------- fixture art: drawn in a local frame with the backing wall at the top ---------- */
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function casing(x, y, w, h, ts, acc) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
  g.addColorStop(0, '#3a4640');
  g.addColorStop(0.5, '#1e2622');
  g.addColorStop(1, '#0e1311');
  ctx.fillStyle = g;
  rrect(x, y, w, h, ts * 0.12);
  ctx.fill();
  ctx.strokeStyle = '#05080a';
  ctx.lineWidth = Math.max(1, ts * 0.08);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.15, y + 1.5);
  ctx.lineTo(x + w - ts * 0.15, y + 1.5);
  ctx.stroke();
  if (w > ts * 1.4 && h > ts * 0.9) {
    ctx.fillStyle = '#55605a';
    for (const [a, b] of [
      [x + ts * 0.14, y + ts * 0.14],
      [x + w - ts * 0.14, y + ts * 0.14],
      [x + ts * 0.14, y + h - ts * 0.14],
      [x + w - ts * 0.14, y + h - ts * 0.14],
    ]) {
      ctx.beginPath();
      ctx.arc(a, b, Math.max(1, ts * 0.05), 0, 6.3);
      ctx.fill();
    }
  }
  if (acc) {
    ctx.fillStyle = acc;
    ctx.fillRect(
      x + ts * 0.1,
      y + h - Math.max(2, ts * 0.08) - ts * 0.06,
      w - ts * 0.2,
      Math.max(2, ts * 0.08),
    );
  }
}
function lamp(x, y, r, col, lit) {
  ctx.fillStyle = lit ? col : '#1a1a1a';
  if (lit) {
    ctx.shadowColor = col;
    ctx.shadowBlur = r * 3;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 6.3);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
}
function screen(x, y, w, h, col, lit) {
  ctx.fillStyle = lit ? '#03140a' : '#050606';
  rrect(x, y, w, h, 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (lit) {
    ctx.fillStyle = col;
    ctx.globalAlpha *= 0.12;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha /= 0.12;
  }
}
function fan(cx, cy, r, ang, lit) {
  ctx.fillStyle = '#0a0d0c';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = '#4a5650';
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  ctx.fillStyle = lit ? '#9fb8b0' : '#4a5450';
  for (let i = 0; i < 4; i++) {
    const a = ang + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r * 0.85, a, a + 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, 6.3);
  ctx.fill();
}
function spark(x, y, w, h) {
  if (Math.random() < 0.25) {
    ctx.strokeStyle = '#ffe080';
    ctx.lineWidth = 1;
    const a = x + Math.random() * w,
      b = y + Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(a, b);
    ctx.lineTo(a + (Math.random() - 0.5) * 8, b + (Math.random() - 0.5) * 8);
    ctx.lineTo(a + (Math.random() - 0.5) * 10, b + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }
}
const FXART = {
  reactor(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    ctx.save();
    ctx.setLineDash([ts * 0.25, ts * 0.25]);
    ctx.strokeStyle = '#c0a020';
    ctx.lineWidth = Math.max(2, ts * 0.12);
    rrect(-w / 2 + ts * 0.1, -h / 2 + ts * 0.1, w - ts * 0.2, h - ts * 0.2, ts * 0.1);
    ctx.stroke();
    ctx.restore();
    const r = Math.min(w, h) * 0.36;
    ctx.strokeStyle = '#55605a';
    ctx.lineWidth = Math.max(2, ts * 0.18);
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(a * r * 0.7, b * r * 0.7);
      ctx.lineTo(a * (w / 2 - ts * 0.25), b * (h / 2 - ts * 0.25));
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.15);
    g.addColorStop(0, '#2a302c');
    g.addColorStop(0.5, '#6a766e');
    g.addColorStop(1, '#1a201c');
    ctx.strokeStyle = g;
    ctx.lineWidth = r * 0.45;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, 6.3);
    ctx.stroke();
    const p = S.on ? 0.75 + 0.25 * Math.sin(S.t * 4) : S.broken ? (Math.random() < 0.15 ? 0.5 : 0.08) : 0.05;
    const c = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
    c.addColorStop(0, S.broken ? `rgba(255,90,60,${p})` : `rgba(255,255,220,${p})`);
    c.addColorStop(0.5, S.broken ? `rgba(160,30,20,${p * 0.7})` : `rgba(255,200,60,${p * 0.8})`);
    c.addColorStop(1, 'rgba(0,0,0,.9)');
    if (S.on) {
      ctx.shadowColor = '#ffd040';
      ctx.shadowBlur = ts * 1.2;
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, 6.3);
    ctx.fill();
    ctx.shadowBlur = 0;
    lamp(w / 2 - ts * 0.35, -h / 2 + ts * 0.35, Math.max(2, ts * 0.09), S.lampC, true);
  },
  battery(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    const n = Math.max(2, Math.round((w / ts) * 2)),
      cw = (w - ts * 0.4) / n,
      fr = S.on ? clamp(G.bat / Math.max(1, G.pw.cap), 0, 1) : 0;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ts * 0.2 + i * cw + cw * 0.12,
        y = -h / 2 + ts * 0.2,
        ch = h - ts * 0.45;
      ctx.fillStyle = '#070a09';
      rrect(x, y, cw * 0.76, ch, 2);
      ctx.fill();
      ctx.strokeStyle = '#3a4440';
      ctx.lineWidth = 1;
      ctx.stroke();
      const fh = ch * fr;
      const g = ctx.createLinearGradient(x, 0, x + cw * 0.76, 0);
      g.addColorStop(0, '#1a7aa0');
      g.addColorStop(0.5, '#60e0ff');
      g.addColorStop(1, '#1a7aa0');
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + ch - fh, cw * 0.76 - 2, fh);
      ctx.fillStyle = '#8a948e';
      ctx.fillRect(x + cw * 0.24, y - ts * 0.08, cw * 0.28, ts * 0.08);
    }
    lamp(w / 2 - ts * 0.18, h / 2 - ts * 0.18, Math.max(1.5, ts * 0.07), S.lampC, true);
  },
  scrubber(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts, S.on ? '#4aa8ff' : null);
    const n = w > h * 1.5 ? 2 : 1;
    const r = Math.min(w / n, h) * 0.36;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + (w / n) * (i + 0.5);
      fan(cx, 0, r, S.on ? S.t * 7 + i : 0.3, S.on);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 1;
    for (let y = -h / 2 + ts * 0.12; y < -h / 2 + ts * 0.32; y += 3) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + ts * 0.2, y);
      ctx.lineTo(w / 2 - ts * 0.2, y);
      ctx.stroke();
    }
    lamp(w / 2 - ts * 0.2, h / 2 - ts * 0.25, Math.max(1.5, ts * 0.07), S.lampC, true);
  },
  pod(w, h, ts, S, cryo) {
    ctx.fillStyle = '#2a302c';
    rrect(-w / 2 + ts * 0.05, h / 2 - ts * 0.45, w - ts * 0.1, ts * 0.4, ts * 0.1);
    ctx.fill();
    ctx.fillStyle = '#1a201c';
    rrect(-w / 2 + ts * 0.05, -h / 2 + ts * 0.02, w - ts * 0.1, ts * 0.3, ts * 0.1);
    ctx.fill();
    const gx = -w / 2 + ts * 0.14,
      gy = -h / 2 + ts * 0.28,
      gw = w - ts * 0.28,
      gh = h - ts * 0.75;
    const g = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    const col = cryo ? [160, 220, 255] : [90, 255, 170];
    const a = S.on ? 0.55 : S.broken ? 0.12 : 0.25;
    g.addColorStop(0, `rgba(${col},${a * 0.5})`);
    g.addColorStop(0.4, `rgba(${col},${a})`);
    g.addColorStop(1, `rgba(${col},${a * 0.35})`);
    ctx.fillStyle = g;
    rrect(gx, gy, gw, gh, gw * 0.45);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,255,230,.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(0, gy + gh * 0.55, gw * 0.22, gh * 0.32, 0, 0, 6.3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, gy + gh * 0.2, gw * 0.16, 0, 6.3);
    ctx.fill();
    if (S.on) {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      for (let i = 0; i < 3; i++) {
        const p = (S.t * 0.6 + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(
          gx + gw * (0.3 + (0.4 * ((i * 37) % 10)) / 10),
          gy + gh * (1 - p),
          Math.max(1, ts * 0.04),
          0,
          6.3,
        );
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.moveTo(gx + gw * 0.2, gy + gh * 0.15);
    ctx.lineTo(gx + gw * 0.2, gy + gh * 0.8);
    ctx.stroke();
    lamp(0, h / 2 - ts * 0.25, Math.max(1.5, ts * 0.08), S.lampC, true);
  },
  rack(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    const n = 3,
      sw = (w - ts * 0.3) / n;
    const docked = G.ext.drones.filter(d => atHatch(d)).length;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ts * 0.15 + i * sw;
      ctx.fillStyle = '#070a09';
      rrect(x + sw * 0.08, -h / 2 + ts * 0.15, sw * 0.84, h - ts * 0.35, 3);
      ctx.fill();
      ctx.strokeStyle = '#3a4440';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (i < docked && S.on) {
        ctx.fillStyle = '#40e0c0';
        ctx.beginPath();
        const cx = x + sw / 2,
          cy = 0;
        ctx.moveTo(cx, cy - h * 0.22);
        ctx.lineTo(cx + sw * 0.25, cy);
        ctx.lineTo(cx, cy + h * 0.18);
        ctx.lineTo(cx - sw * 0.25, cy);
        ctx.closePath();
        ctx.fill();
      }
      lamp(
        x + sw / 2,
        h / 2 - ts * 0.12,
        Math.max(1.2, ts * 0.05),
        i < docked ? '#40e0c0' : S.lampC,
        S.on || S.broken,
      );
    }
  },
  fab(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts, S.on ? '#ffb030' : null);
    const bx = -w / 2 + ts * 0.25,
      by = -h / 2 + ts * 0.55,
      bw = w - ts * 0.5,
      bh = h - ts * 0.85;
    ctx.fillStyle = '#0a0c0b';
    rrect(bx, by, bw, bh, 3);
    ctx.fill();
    ctx.strokeStyle = '#4a5450';
    ctx.stroke();
    for (let x = bx + 4; x < bx + bw; x += 5) {
      ctx.fillStyle = '#1a201c';
      ctx.fillRect(x, by + 2, 1, bh - 4);
    }
    const busy = S.on && G.fab && G.fab.mid === S.k.id;
    const hx = bx + bw * (busy ? 0.5 + 0.45 * Math.sin(S.t * 2.5) : 0.15);
    ctx.fillStyle = '#6a7670';
    ctx.fillRect(-w / 2 + ts * 0.15, -h / 2 + ts * 0.25, w - ts * 0.3, ts * 0.12);
    ctx.fillStyle = '#8a948e';
    ctx.fillRect(hx - ts * 0.12, -h / 2 + ts * 0.2, ts * 0.24, by - (-h / 2 + ts * 0.2) + bh * 0.35);
    ctx.fillStyle = busy ? '#ffd080' : '#555';
    ctx.beginPath();
    ctx.arc(hx, by + bh * 0.4, Math.max(1.5, ts * 0.07), 0, 6.3);
    ctx.fill();
    if (busy) {
      spark(hx - 6, by + bh * 0.3, 12, 10);
      const pr = clamp(G.fab.prog / RC[G.fab.r].t, 0, 1);
      ctx.fillStyle = '#ffb030';
      ctx.fillRect(bx, by + bh + 2, bw * pr, 2);
    }
    lamp(w / 2 - ts * 0.2, -h / 2 + ts * 0.18, Math.max(1.5, ts * 0.07), S.lampC, true);
  },
  comms(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    const r = Math.min(w, h) * 0.32;
    ctx.strokeStyle = '#8a948e';
    ctx.lineWidth = Math.max(2, ts * 0.08);
    ctx.beginPath();
    ctx.arc(-w * 0.18, -h * 0.12, r, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.18, -h * 0.12 + r * 0.5);
    ctx.lineTo(-w * 0.18, -h * 0.12 - r * 0.3);
    ctx.stroke();
    const sx0 = w * 0.02,
      sy0 = -h / 2 + ts * 0.25,
      sw = w / 2 - ts * 0.25,
      sh = h - ts * 0.6;
    screen(sx0, sy0, sw, sh, '#4aa8ff', S.on);
    if (S.on) {
      ctx.strokeStyle = '#4aa8ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const x = sx0 + (sw * i) / 20,
          y = sy0 + sh / 2 + Math.sin(i * 0.9 + S.t * 5) * sh * 0.3 * Math.sin(i * 0.3);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    lamp(-w / 2 + ts * 0.2, h / 2 - ts * 0.22, Math.max(1.5, ts * 0.07), S.lampC, true);
  },
  hydro(w, h, ts, S) {
    ctx.fillStyle = '#3a2a18';
    rrect(-w / 2 + ts * 0.05, -h / 2 + ts * 0.05, w - ts * 0.1, h - ts * 0.1, ts * 0.12);
    ctx.fill();
    ctx.strokeStyle = '#120a04';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (S.on) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,90,220,.18)');
      g.addColorStop(1, 'rgba(255,90,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    const rows = Math.max(2, Math.round((h / ts) * 1.5)),
      cols = Math.max(3, Math.round((w / ts) * 2.2)),
      gr = S.on ? 0.45 + 0.55 * clamp((S.k.prog || 0) / 20, 0, 1) : S.broken ? 0.25 : 0.4;
    for (let j = 0; j < rows; j++) {
      const y = -h / 2 + (h * (j + 0.5)) / rows;
      ctx.fillStyle = '#1a1008';
      ctx.fillRect(-w / 2 + ts * 0.15, y - ts * 0.08, w - ts * 0.3, ts * 0.16);
      for (let i = 0; i < cols; i++) {
        const x = -w / 2 + (w * (i + 0.5)) / cols;
        const r = ts * 0.17 * gr;
        ctx.fillStyle = S.broken ? '#5a5a20' : '#2fbf4f';
        ctx.beginPath();
        ctx.ellipse(x - r * 0.5, y - r * 0.3, r, r * 0.55, -0.6, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = S.broken ? '#4a4a18' : '#5fef6f';
        ctx.beginPath();
        ctx.ellipse(x + r * 0.5, y - r * 0.4, r, r * 0.5, 0.6, 0, 6.3);
        ctx.fill();
      }
    }
  },
  solar(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    const r = Math.min(w * 0.3, h * 0.42);
    ctx.fillStyle = '#e8e2c8';
    ctx.beginPath();
    ctx.arc(-w * 0.18, h * 0.12, r, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.stroke();
    const a = Math.PI + (S.on ? 0.2 + 0.6 * Math.PI * (0.8 + 0.05 * Math.sin(S.t)) : 0.1);
    ctx.strokeStyle = '#c03020';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.18, h * 0.12);
    ctx.lineTo(-w * 0.18 + Math.cos(a) * r * 0.9, h * 0.12 + Math.sin(a) * r * 0.9);
    ctx.stroke();
    lamp(w * 0.25, 0, Math.max(2, ts * 0.1), '#ffe060', S.on);
  },
  launch(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts, S.on ? '#ff8a40' : null);
    ctx.strokeStyle = '#8a948e';
    ctx.lineWidth = Math.max(1.5, ts * 0.07);
    for (const o of [-0.18, 0.18]) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + ts * 0.2, h * o);
      ctx.lineTo(w / 2 - ts * 0.2, h * o);
      ctx.stroke();
    }
    ctx.fillStyle = (G.sats || 0) > 0 || S.on ? '#d8d8d8' : '#555';
    rrect(w / 2 - ts * 0.9, -h * 0.15, ts * 0.5, h * 0.3, 2);
    ctx.fill();
    ctx.fillStyle = '#3a6aa0';
    ctx.fillRect(w / 2 - ts * 1.05, -h * 0.06, ts * 0.15, h * 0.12);
    ctx.fillRect(w / 2 - ts * 0.4, -h * 0.06, ts * 0.15, h * 0.12);
    lamp(-w / 2 + ts * 0.25, -h / 2 + ts * 0.25, Math.max(1.5, ts * 0.07), S.lampC, true);
  },
  sensor(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    const n = w > h * 1.4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + (w / n) * (i + 0.5),
        r = Math.min(w / n, h) * 0.36;
      screen(cx - r, -r, r * 2, r * 2, '#b08aff', S.on);
      if (S.on) {
        ctx.strokeStyle = 'rgba(176,138,255,.4)';
        ctx.lineWidth = 1;
        for (const k of [0.35, 0.7]) {
          ctx.beginPath();
          ctx.arc(cx, 0, r * k, 0, 6.3);
          ctx.stroke();
        }
        const a = S.t * 2 + i;
        ctx.strokeStyle = '#d0b0ff';
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx + Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
        ctx.stroke();
      }
    }
  },
  maint(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    ctx.strokeStyle = '#ffc040';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    rrect(-w * 0.3, -h * 0.05, w * 0.6, h * 0.42, 3);
    ctx.stroke();
    ctx.setLineDash([]);
    const a = S.on ? Math.sin(S.t * 1.5) * 0.6 : 0.4;
    ctx.strokeStyle = '#8a948e';
    ctx.lineWidth = Math.max(2, ts * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, -h / 2 + ts * 0.2);
    const ex = -w * 0.3 + Math.cos(a) * w * 0.3,
      ey = -h / 2 + ts * 0.2 + Math.sin(a + 1) * h * 0.25 + h * 0.2;
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex + w * 0.25, ey + h * 0.05);
    ctx.stroke();
    ctx.lineCap = 'butt';
    lamp(w / 2 - ts * 0.2, -h / 2 + ts * 0.2, Math.max(1.5, ts * 0.07), S.lampC, true);
  },
  refinery(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    const r = Math.min(w, h) * 0.3;
    const g = ctx.createRadialGradient(0, h * 0.05, 0, 0, h * 0.05, r);
    g.addColorStop(0, S.on ? '#fff0a0' : '#2a1a10');
    g.addColorStop(0.6, S.on ? '#ff6020' : '#1a0e08');
    g.addColorStop(1, '#100804');
    ctx.fillStyle = g;
    rrect(-r, h * 0.05 - r * 0.7, r * 2, r * 1.4, r * 0.4);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (S.on) {
      ctx.shadowColor = '#ff6020';
      ctx.shadowBlur = ts * 0.8;
      ctx.fillStyle = 'rgba(255,140,40,.3)';
      ctx.fillRect(-r, h * 0.05 - r * 0.7, r * 2, r * 1.4);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#4a5450';
    ctx.fillRect(-w * 0.08, -h / 2 + ts * 0.1, w * 0.16, h * 0.2);
  },
  med(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    ctx.fillStyle = '#d8e0e8';
    rrect(-w / 2 + ts * 0.18, -h / 2 + ts * 0.18, w - ts * 0.36, h - ts * 0.36, ts * 0.15);
    ctx.fill();
    ctx.fillStyle = '#b0bcc8';
    rrect(-w / 2 + ts * 0.25, -h / 2 + ts * 0.25, ts * 0.45, h - ts * 0.5, ts * 0.1);
    ctx.fill();
    if (S.on && !S.k.prog) {
      const x = -w / 2 + ts * 0.4 + ((S.t * 0.5) % 1) * (w - ts * 0.8);
      ctx.strokeStyle = 'rgba(255,138,160,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, -h / 2 + ts * 0.1);
      ctx.lineTo(x, h / 2 - ts * 0.1);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff4a6a';
    ctx.fillRect(w / 2 - ts * 0.35, -ts * 0.12, ts * 0.24, ts * 0.08);
    ctx.fillRect(w / 2 - ts * 0.27, -ts * 0.2, ts * 0.08, ts * 0.24);
  },
  defense(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    const r = Math.min(w, h) * 0.34;
    screen(-r, -r, r * 2, r * 2, '#ff5050', S.on);
    ctx.strokeStyle = S.on ? '#ff6060' : '#4a2020';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, 6.3);
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    if (S.on) {
      const a = S.t * 1.3;
      lamp(Math.cos(a) * r * 0.6, Math.sin(a * 1.7) * r * 0.5, Math.max(1.5, ts * 0.06), '#ff4040', true);
    }
  },
  driver(w, h, ts, S) {
    casing(-w / 2, -h / 2, w, h, ts);
    ctx.fillStyle = '#4a5450';
    rrect(-w / 2 + ts * 0.2, -h * 0.18, w - ts * 0.4, h * 0.36, h * 0.15);
    ctx.fill();
    const n = Math.round((w / ts) * 1.5);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ts * 0.35 + (i * (w - ts * 0.7)) / n;
      const lit = S.on && (S.t * 4 - i * 0.5) % 3 < 0.6;
      ctx.fillStyle = lit ? '#ffb0a0' : '#8a6a60';
      ctx.fillRect(x, -h * 0.28, ts * 0.12, h * 0.56);
    }
  },
  thruster(w, h, ts, S) {
    casing(-w / 2, -h / 2 + h * 0.25, w, h * 0.75, ts);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h * 0.1);
    g.addColorStop(0, S.on ? '#a0d8ff' : '#1a2228');
    g.addColorStop(1, '#2a3238');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.38, -h / 2 + ts * 0.05);
    ctx.lineTo(w * 0.38, -h / 2 + ts * 0.05);
    ctx.lineTo(w * 0.18, h * 0.1);
    ctx.lineTo(-w * 0.18, h * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#05080a';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (S.on && G.move) {
      ctx.shadowColor = '#80c0ff';
      ctx.shadowBlur = ts;
      ctx.fillStyle = 'rgba(128,192,255,.5)';
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    lamp(0, h * 0.3, Math.max(1.5, ts * 0.08), S.lampC, true);
  },
};
FXART.cryo = (w, h, ts, S) => FXART.pod(w, h, ts, S, true);
function drawFixtures(sx, sy, ts, X0, Y0, X1, Y1) {
  const t = performance.now() / 1000;
  V.animFx = false;
  for (const k of G.machines) {
    if (!k.fx || !k.bb || !FXART[k.type]) continue;
    const b = k.bb;
    if (b.x1 < X0 || b.y1 < Y0 || b.x0 > X1 || b.y0 > Y1) continue;
    if (!k.cells.some(c => G.seen[idx(c[0], c[1])])) continue;
    const vis = k.cells.some(c => M.vis[idx(c[0], c[1])]);
    const W = (b.x1 - b.x0 + 1) * ts,
      H = (b.y1 - b.y0 + 1) * ts;
    const wd = k.wdW || [0, -1];
    const ang = wd[1] === -1 ? 0 : wd[0] === 1 ? Math.PI / 2 : wd[1] === 1 ? Math.PI : -Math.PI / 2;
    const sw = ang === 0 || ang === Math.PI;
    const lw = sw ? W : H,
      lh = sw ? H : W;
    const on = online(k),
      broken = k.cond < 60;
    const S = { on, broken, t, k, lampC: on ? '#2fdc4f' : broken ? '#ff3a2a' : '#e0b020' };
    ctx.save();
    ctx.globalAlpha = vis ? 1 : 0.5;
    ctx.translate(sx(b.x0) + W / 2, sy(b.y0) + H / 2);
    ctx.rotate(ang);
    FXART[k.type](lw - 2, lh - 2, ts, S);
    if (broken && vis) spark(-lw / 2, -lh / 2, lw, lh);
    ctx.restore();
    if (vis && (on || broken)) V.animFx = true;
  }
}
setInterval(() => {
  if (G && V.tab === 'station' && V.animFx && !document.hidden && !modalOpen) render();
}, 160);
const TAGA = [0.5, 0.22];
export const cycTags = () => {
  if (!V.tags) {
    V.tags = true;
    V.tagA = 0;
    log('Labels: see-through.');
  } else if (!V.tagA) {
    V.tagA = 1;
    log('Labels: faint.');
  } else {
    V.tags = false;
    log('Labels: off.');
  }
  render();
};
function drawLabels(list, sx, sy, ts, avoid) {
  const rects = [],
    keep = [];
  const fs = Math.max(9, Math.floor(Math.min(ts, 22) * 0.6));
  ctx.font = FONT(fs);
  ctx.textAlign = 'left';
  const a = TAGA[V.tagA || 0];
  const pad = ts * 0.15;
  for (const [x, y] of avoid || [])
    keep.push({ x: sx(x) - pad, y: sy(y) - pad, w: ts + pad * 2, h: ts + pad * 2 });
  for (const L of list) keep.push({ x: sx(L.x), y: sy(L.y), w: ts, h: ts });
  const hit = (lx, ly, tw, th) =>
    rects.concat(keep).some(r => lx < r.x + r.w && lx + tw > r.x && ly < r.y + r.h && ly + th > r.y);
  for (const L of list) {
    const tw = ctx.measureText(L.t).width + 8,
      th = fs + 4,
      px = sx(L.x),
      py = sy(L.y);
    const opts = [
      [px - tw - ts * 0.5, py + ts / 2 - th / 2, -1],
      [px + ts * 1.5, py + ts / 2 - th / 2, 1],
    ];
    let best = null;
    for (let k = 0; k < 10 && !best; k++) {
      const dy = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * th * 0.9;
      for (const [ox, oy, sd] of opts) {
        if (ox < 2 || ox + tw > cssW - 2) continue;
        if (!hit(ox, oy + dy, tw, th)) {
          best = [ox, oy + dy, sd];
          break;
        }
      }
    }
    if (!best) {
      const o = opts[0][0] < 2 ? opts[1] : opts[0];
      best = [o[0], o[1], o[2]];
    }
    const [lx, ly, side] = best;
    rects.push({ x: lx, y: ly, w: tw, h: th });
    ctx.globalAlpha = Math.min(1, a + 0.25);
    ctx.strokeStyle = L.bg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(side < 0 ? lx + tw : lx, ly + th / 2);
    ctx.lineTo(side < 0 ? px : px + ts, py + ts / 2);
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ctx.fillRect(lx, ly, tw, th);
    ctx.globalAlpha = 1;
    ctx.fillStyle = L.bg;
    ctx.fillRect(lx, ly, 2, th);
    ctx.globalAlpha = Math.min(1, a + 0.35);
    ctx.strokeStyle = L.bg;
    ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, th - 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = L.bg;
    ctx.fillText(L.t, lx + 5, ly + th / 2 + 1);
  }
  ctx.textAlign = 'center';
}
function stationTags(sx, sy) {
  const L = [];
  for (const m of G.machines) {
    if (!M.vis[idx(m.x, m.y)] || ['terminal', 'locker', 'bunk', 'mount'].includes(m.type)) continue;
    if (m.type === 'node') {
      const md = G.mods[m.mi];
      if (md && !md.ctl)
        L.push({
          x: m.x,
          y: m.y,
          t: 'GRID NODE · ' + (m.cond < 60 ? 'DAMAGED' : modBreaches(m.mi) ? 'VENTING' : 'LOCKED'),
          bg: '#c0a020',
          fg: '#000',
        });
      continue;
    }
    if (m.type === 'hp') continue;
    if (m.type === 'turret' && ctlOK(m) && m.cond >= 60 && G.stock.ammo < 1) {
      L.push({ x: m.x, y: m.y, t: 'TURRET · NO AMMO', bg: '#ff7050', fg: '#000' });
      continue;
    }
    if (m.type === 'junc') {
      if (m.cond < 60)
        L.push({ x: m.x, y: m.y, t: `JUNCTION ${Math.round(m.cond)}%`, bg: '#ff7a30', fg: '#000' });
      continue;
    }
    if (!ctlOK(m)) {
      L.push({ x: m.x, y: m.y, t: MD[m.type].n.toUpperCase() + ' · NO ACCESS', bg: '#6a4a8a', fg: '#000' });
      continue;
    }
    const st = machineStatus(m);
    L.push({
      x: m.x,
      y: m.y,
      t:
        MD[m.type].n.toUpperCase() +
        (st === 'ONLINE' ? '' : st === 'BROKEN' ? ` ${Math.round(m.cond)}%` : ' ' + st),
      bg: st === 'ONLINE' ? '#28a040' : st === 'BROKEN' ? '#a03030' : '#a08a20',
      fg: '#000',
    });
  }
  for (const a of G.actors)
    if (a.hp > 0 && M.vis[idx(a.x, a.y)])
      L.push({ x: a.x, y: a.y, t: EN[a.type].n.toUpperCase(), bg: '#28c040', fg: '#001a04' });
  for (const k in G.items) {
    const i = +k;
    if (!G.items[k].length || !M.vis[i]) continue;
    L.push({
      x: i % WW,
      y: (i / WW) | 0,
      t: IT[G.items[k][G.items[k].length - 1].key].n.toUpperCase(),
      bg: '#8a8a8a',
      fg: '#101010',
    });
  }
  for (const b of G.brk)
    if (M.vis[idx(b.x, b.y)]) L.push({ x: b.x, y: b.y, t: 'HULL BREACH', bg: '#ff4a4a', fg: '#200' });
  for (const c of G.crew)
    if (M.vis[idx(c.x, c.y)])
      L.push({
        x: c.x,
        y: c.y,
        t: c.name.split(' ')[0].toUpperCase() + ' · ' + ROLE[c.role].n.toUpperCase(),
        bg: '#5a8ab0',
        fg: '#000',
      });
  const av = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) av.push([P.x + dx, P.y + dy]);
  drawLabels(L, sx, sy, TS, av);
  ctx.font = FONT(TS * 0.9);
}
function renderExt() {
  const home = V.sec === HULL,
    sec = SEC(V.sec);
  const fit = Math.min(cssW / WW, cssH / WH);
  const base = narrow() ? Math.max(7, fit) : Math.max(6, fit);
  const ts = clamp(base * V.ez, 4, 28);
  V.ets = ts;
  if (!V.ecam) {
    const b = home ? stationBox() : { cx: WW / 2, cy: WH / 2 };
    V.ecam = { x: b.cx - cssW / ts / 2, y: b.cy - cssH / ts / 2 };
  }
  const vw = cssW / ts,
    vh = cssH / ts;
  if (vw >= WW) V.ecam.x = -(vw - WW) / 2;
  else V.ecam.x = clamp(V.ecam.x, 0, WW - vw);
  if (vh >= WH) V.ecam.y = -(vh - WH) / 2;
  else V.ecam.y = clamp(V.ecam.y, 0, WH - vh);
  const sx = x => (x - V.ecam.x) * ts,
    sy = y => (y - V.ecam.y) * ts;
  V.esx = sx;
  V.esy = sy;
  const ring = sec ? sec.ring : 1;
  const ex = sx(WW / 2),
    ey = sy(WH + [45, 70, 130, 190][ring]),
    R = ts * [70, 90, 140, 200][ring];
  const gr = ctx.createRadialGradient(ex, ey - R * 0.3, R * 0.5, ex, ey, R);
  gr.addColorStop(0, '#2a2014');
  gr.addColorStop(0.93, '#1a1810');
  gr.addColorStop(1, '#0c2a4a');
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(ex, ey, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,150,230,.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  const x0 = Math.max(0, Math.floor(V.ecam.x)),
    y0 = Math.max(0, Math.floor(V.ecam.y)),
    x1 = Math.min(WW, Math.ceil(V.ecam.x + vw) + 1),
    y1 = Math.min(WH, Math.ceil(V.ecam.y + vh) + 1);
  ctx.font = FONT(ts * 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = idx(x, y);
      if (!home || M.map[i] === T.VOID) {
        const s2 = M.stars[(i * 7) % (WW * WH)];
        if (s2) {
          ctx.fillStyle = `rgba(200,220,255,${s2 * 0.55})`;
          ctx.fillRect(sx(x) + ts / 2, sy(y) + ts / 2, 1.2, 1.2);
        }
        continue;
      }
      if (ts >= 12) tile(x, y, sx(x), sy(y), 1, ts);
      else extTile(x, y, sx(x), sy(y), ts);
    }
  {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    const R = 11 + (hasOnline('sensor') ? 12 : 0) + (hasAI('lantern') ? 8 : 0);
    if (home) {
      const hb = stationBox();
      ctx.strokeStyle = 'rgba(47,220,79,.18)';
      ctx.setLineDash([2, 6]);
      ctx.strokeRect(
        sx(hb.x0 - R),
        sy(hb.y0 - R),
        (hb.x1 - hb.x0 + 2 * R) * ts,
        (hb.y1 - hb.y0 + 2 * R) * ts,
      );
      ctx.setLineDash([]);
    }
    for (const d of G.ext.drones)
      if (d.sec === V.sec) {
        ctx.strokeStyle = 'rgba(64,224,192,.12)';
        ctx.beginPath();
        ctx.arc(sx(d.x) + ts / 2, sy(d.y) + ts / 2, 9 * ts, 0, Math.PI * 2);
        ctx.stroke();
      }
  }
  if (home) {
    for (const fp of freePorts()) {
      ctx.fillStyle = 'rgba(47,220,79,.25)';
      ctx.fillRect(sx(fp.x + fp.dx), sy(fp.y + fp.dy), ts, ts);
    }
    for (const j of G.joints || []) {
      const r = j.loop ? 0 : j.load / j.cap;
      const c = j.loop ? '#4aa8ff' : r > 1 ? '#ff3a3a' : r > 0.75 ? '#ffc040' : '#2fdc4f';
      const b = portWorld(G.mods[j.b], j.pb);
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1.5, ts * 0.14);
      ctx.strokeRect(
        Math.min(sx(j.x), sx(b.x)) + 1,
        Math.min(sy(j.y), sy(b.y)) + 1,
        (Math.abs(j.x - b.x) + 1) * ts - 2,
        (Math.abs(j.y - b.y) + 1) * ts - 2,
      );
      if (j.br && ts >= 8) {
        ctx.fillStyle = c;
        for (let k = 0; k < j.br; k++) ctx.fillRect(sx(j.x) + 2 + k * 4, sy(j.y) - 3, 3, 3);
      }
    }
    if (V.tubePlan) {
      const fp = freePorts().find(p => p.mid === V.tubePlan.mid && p.pi === V.tubePlan.pi);
      if (fp) {
        ctx.strokeStyle = '#7fffd0';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx(fp.x) - 1, sy(fp.y) - 1, ts + 2, ts + 2);
      }
      const gp = V.tubePlan.ghost;
      if (gp) {
        ctx.globalAlpha = 0.5;
        for (let y = 0; y < gp.shape.h; y++)
          for (let x = 0; x < gp.shape.w; x++) {
            const ch = gp.shape.g[y][x];
            if (ch === ' ') continue;
            ctx.fillStyle = ch === '#' ? '#2a6a5a' : ch === 'P' ? '#7fffd0' : '#0f3a30';
            ctx.fillRect(sx(gp.ox + x), sy(gp.oy + y), ts, ts);
          }
        ctx.globalAlpha = 1;
      }
    }
    for (const k of G.machines)
      if (k.type === 'rack' && k.hatch && online(k))
        glyph('H', sx(k.hatch[0]), sy(k.hatch[1]), '#ffff50', ts);
  }
  const objs = G.ext.objs.filter(o => o.sec === V.sec && o.seen !== false);
  for (const o of objs) {
    if (o.kind === 'platform') {
      const L = G.legacy[o.lid];
      const safe = L.tags.includes(TAGK);
      ctx.strokeStyle = safe ? 'rgba(255,200,80,.35)' : 'rgba(255,60,60,.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(sx(o.x) + ts / 2, sy(o.y) + ts / 2, o.r * ts, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2a0a0a';
      ctx.fillRect(sx(o.x - 1), sy(o.y - 1), ts * 3, ts * 3);
      ctx.strokeStyle = '#ff5050';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx(o.x - 1), sy(o.y - 1), ts * 3, ts * 3);
      ctx.font = 'bold ' + FONT(ts * 1.6);
      glyph('!', sx(o.x), sy(o.y), '#ffdddd', ts);
      ctx.font = FONT(ts * 0.9);
    }
    if (o.kind === 'core') {
      ctx.fillStyle = '#3a0a14';
      ctx.fillRect(sx(o.x), sy(o.y), ts, ts);
      ctx.strokeStyle = '#ff3a6a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx(o.x) - 1, sy(o.y) - 1, ts + 2, ts + 2);
      glyph('¤', sx(o.x), sy(o.y), '#ff8aa0', ts);
      if (o.hp < o.max) {
        ctx.fillStyle = '#f33';
        ctx.fillRect(sx(o.x), sy(o.y) + ts, (ts * o.hp) / o.max, 2);
      }
    }
    if (o.kind === 'raft') {
      ctx.fillStyle = '#0a2240';
      ctx.fillRect(sx(o.x), sy(o.y), ts, ts);
      glyph('+', sx(o.x), sy(o.y), '#bfe8ff', ts);
    }
    if (o.kind === 'null') {
      ctx.strokeStyle = 'rgba(160,90,255,.8)';
      ctx.fillStyle = '#08000f';
      ctx.beginPath();
      ctx.arc(sx(o.x) + ts / 2, sy(o.y) + ts / 2, ts * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (o.kind === 'turret') {
      const st = stById(o.st);
      const al = st && st.alert;
      ctx.strokeStyle = al ? 'rgba(255,110,60,.3)' : 'rgba(255,110,60,.12)';
      ctx.beginPath();
      ctx.arc(sx(o.x) + ts / 2, sy(o.y) + ts / 2, (al ? o.r : 3) * ts, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#3a0c06';
      ctx.fillRect(sx(o.x), sy(o.y), ts, ts);
      glyph('T', sx(o.x), sy(o.y), '#ff7040', ts);
    }
    if (o.kind === 'sci') {
      ctx.fillStyle = '#1a0c2a';
      ctx.fillRect(sx(o.x - 1), sy(o.y - 1), ts * 3, ts * 3);
      ctx.strokeStyle = locked(o) ? '#ff7040' : '#b08aff';
      ctx.strokeRect(sx(o.x - 1), sy(o.y - 1), ts * 3, ts * 3);
      glyph('Σ', sx(o.x), sy(o.y), '#d0b0ff', ts);
    }
    if (o.kind === 'debris') glyph('%', sx(o.x), sy(o.y), o.res.scrap > 14 ? '#ffd070' : '#c0a070', ts);
    if (o.kind === 'pod') {
      ctx.fillStyle = '#000';
      ctx.fillRect(sx(o.x), sy(o.y), ts, ts);
      glyph('◊', sx(o.x), sy(o.y), o.f >= 0 ? FAC[o.f].c : '#e0e0e0', ts);
    }
    if (o.kind === 'wreck') glyph('d', sx(o.x), sy(o.y), '#7a9a90', ts);
    if (o.kind === 'rogue') {
      ctx.fillStyle = '#200';
      ctx.fillRect(sx(o.x), sy(o.y), ts, ts);
      glyph(
        o.tag === 'swarm' ? 's' : o.tag === 'hunter' ? 'h' : 'r',
        sx(o.x),
        sy(o.y),
        o.tag === 'swarm' ? '#d0e040' : o.tag === 'hunter' ? '#ff50c8' : '#ff5a5a',
        ts,
      );
    }
    if (o.kind === 'der') drawDer(o, sx, sy, ts);
  }
  if (V.sec === G.home) {
    const [cx, cy] = LC();
    ctx.fillStyle = '#062a10';
    ctx.fillRect(sx(cx - 2), sy(cy - 2), ts * 5, ts * 5);
    ctx.strokeStyle = '#2fdc4f';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx(cx - 2) + 0.5, sy(cy - 2) + 0.5, ts * 5 - 1, ts * 5 - 1);
    ctx.font = 'bold ' + FONT(ts * 2);
    glyph('@', sx(cx), sy(cy), '#bfffcf', ts);
    ctx.font = FONT(ts * 0.9);
  }
  const drs = G.ext.drones.filter(d => d.sec === V.sec);
  for (const d of drs) {
    const t = d.task;
    if (t.type === 'tow' && t.att) {
      const o = objById(t.oid);
      if (o && o.sec === V.sec) {
        ctx.strokeStyle = '#40d0b0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx(d.x) + ts / 2, sy(d.y) + ts / 2);
        ctx.lineTo(sx(o.x) + ts / 2, sy(o.y) + ts / 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = d.id === G.sel ? '#0f4a3a' : '#000';
    ctx.fillRect(sx(d.x), sy(d.y), ts, ts);
    glyph(
      d.dt === 'tug' ? 'T' : d.dt === 'guard' ? 'G' : 'D',
      sx(d.x),
      sy(d.y),
      d.dt === 'guard' ? '#ff9a5a' : '#40e0c0',
      ts,
    );
    if (d.id === G.sel) {
      ctx.strokeStyle = '#7fffd0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx(d.x) - 1, sy(d.y) - 1, ts + 2, ts + 2);
      const tg = taskTarget(d);
      if (tg) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(127,255,208,.5)';
        ctx.beginPath();
        ctx.moveTo(sx(d.x) + ts / 2, sy(d.y) + ts / 2);
        ctx.lineTo(sx(tg[0]) + ts / 2, sy(tg[1]) + ts / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  if (V.tags) {
    const L = [];
    for (const o of objs) {
      if (o.kind === 'der')
        L.push({
          x: o.x,
          y: o.y,
          t: `${o.pack.name.toUpperCase()} (${BR[o.pack.brand].cc})${locked(o) ? ' [LOCKED]' : ''}`,
          bg: locked(o) ? '#c06040' : '#9a9ab0',
          fg: '#000',
        });
      if (o.kind === 'pod')
        L.push({
          x: o.x,
          y: o.y,
          t: o.f >= 0 ? FAC[o.f].sh + ' POD' : 'CACHE',
          bg: o.f >= 0 ? FAC[o.f].c : '#ccc',
          fg: '#000',
        });
      if (o.kind === 'wreck')
        L.push({ x: o.x, y: o.y, t: DT[o.dt].n.toUpperCase() + ' WRECK', bg: '#6a8a80', fg: '#000' });
      if (o.kind === 'rogue')
        L.push({
          x: o.x,
          y: o.y,
          t:
            o.tag === 'swarm'
              ? 'RECLAIMER'
              : o.tag === 'hunter'
                ? 'HUNTER'
                : typeof o.tag === 'number'
                  ? FAC[o.tag].sh + ' DRONE'
                  : 'ROGUE',
          bg: o.tag === 'swarm' ? '#a0b030' : '#ff4a4a',
          fg: '#200',
        });
      if (o.kind === 'core') {
        const st = stById(o.st);
        L.push({
          x: o.x,
          y: o.y,
          t: `${st.name.toUpperCase()} CORE · SEC ${st.ice}${st.alert ? ' · ALERT' : ''}`,
          bg: '#ff3a6a',
          fg: '#200',
        });
      }
      if (o.kind === 'raft') L.push({ x: o.x, y: o.y, t: `LIFEBOAT (${o.n})`, bg: '#6ab0e8', fg: '#001' });
      if (o.kind === 'null') L.push({ x: o.x, y: o.y, t: 'NULL POCKET', bg: '#a05aff', fg: '#100' });
      if (o.kind === 'turret') L.push({ x: o.x, y: o.y, t: 'DEFENSE TURRET', bg: '#ff7040', fg: '#200' });
      if (o.kind === 'sci')
        L.push({
          x: o.x,
          y: o.y,
          t: 'DATA CORE' + (locked(o) ? ' [DEFENDED]' : ''),
          bg: '#b08aff',
          fg: '#100',
        });
      if (o.kind === 'platform') {
        const Lg = G.legacy[o.lid];
        L.push({
          x: o.x,
          y: o.y,
          t: `${Lg.n} · ${Lg.org.toUpperCase()}${Lg.tags.includes(TAGK) ? ' (IFF: FRIENDLY)' : ''}`,
          bg: '#ff4a4a',
          fg: '#200',
        });
      }
    }
    for (const d of drs)
      if (!atHatch(d) || d.id === G.sel) L.push({ x: d.x, y: d.y, t: d.name, bg: '#40d0b0', fg: '#001a14' });
    if (V.sec === G.home) {
      const [cx, cy] = LC();
      L.push({
        x: cx,
        y: cy - 2,
        t: 'KESTREL-9 (tap to send drone back to the hull)',
        bg: '#2fdc4f',
        fg: '#000',
      });
    }
    if (home)
      for (const m of G.mods) {
        if (m.fn === 'tube') continue;
        const cs = modCells(m);
        let mx = 0,
          my = 0;
        for (const c of cs) {
          mx += c.x;
          my += c.y;
        }
        mx = Math.round(mx / cs.length);
        my = Math.round(my / cs.length);
        ctx.font = FONT(Math.max(9, Math.min(ts, 20) * 0.7));
        const t = m.name.toUpperCase() + (m.ctl ? '' : ' (LOCKED)');
        const tw = ctx.measureText(t).width + 6;
        ctx.fillStyle = 'rgba(0,0,0,.7)';
        ctx.fillRect(sx(mx) + ts / 2 - tw / 2, sy(my), tw, Math.max(11, ts * 0.9));
        ctx.fillStyle = !m.ctl ? '#c08aff' : m.pressure >= 60 ? '#bfffcf' : '#8ac0e8';
        ctx.fillText(t, sx(mx) + ts / 2, sy(my) + Math.max(11, ts * 0.9) / 2 + 1);
      }
    drawLabels(L, sx, sy, ts);
  }
  ctx.textAlign = 'left';
  ctx.font = FONT(12);
  ctx.fillStyle = 'rgba(0,0,0,.7)';
  const hdr = `${secName(sec)} · ${secCoord(sec)} · ${home ? 'HOME' : SEC_T[sec.type].n.toUpperCase() + ': ' + sec.name}`;
  const tw = ctx.measureText(hdr).width + 10;
  const hy = narrow() ? 22 : 4;
  ctx.fillRect(4, hy, tw, 18);
  ctx.fillStyle = home ? '#2fdc4f' : SEC_T[sec.type].c;
  ctx.fillText(hdr, 9, hy + 10);
  ctx.textAlign = 'center';
}
function extTile(x, y, px, py, ts) {
  const i = idx(x, y),
    t = M.map[i];
  const m = G.mods[M.own[i]];
  const B = m ? BR[m.brand] : BR.scav;
  const c =
    t === T.FLOOR
      ? m && m.pressure < 35
        ? '#0a2238'
        : B.floor
      : t === T.WALL
        ? B.wall
        : t === T.DOOR
          ? B.door
          : t === T.PORT
            ? '#9a9a9a'
            : t === T.WINDOW
              ? '#3a8ad0'
              : t === T.BREACH
                ? '#ff3030'
                : t === T.MACH
                  ? G.machines.some(k => k.x === x && k.y === y && online(k))
                    ? '#2fdc4f'
                    : '#a03030'
                  : '#000';
  ctx.fillStyle = c;
  ctx.fillRect(px, py, Math.ceil(ts), Math.ceil(ts));
  if (t === T.WALL && ts >= 6) {
    ctx.fillStyle = B.line;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(px + ts * 0.35, py + ts * 0.35, ts * 0.3, ts * 0.3);
    ctx.globalAlpha = 1;
  }
}
function drawDer(o, sx, sy, ts) {
  const sh = o.pack.shape,
    B = BR[o.pack.brand];
  const ox = o.x - Math.floor(sh.w / 2),
    oy = o.y - Math.floor(sh.h / 2);
  ctx.globalAlpha = 0.85;
  for (let y = 0; y < sh.h; y++)
    for (let x = 0; x < sh.w; x++) {
      const c = sh.g[y][x];
      if (c === ' ') continue;
      ctx.fillStyle = c === '#' ? B.wall : c === 'P' ? '#9a9a9a' : '#16161c';
      ctx.fillRect(sx(ox + x), sy(oy + y), Math.ceil(ts), Math.ceil(ts));
    }
  for (const k of o.pack.mach) {
    if (k.type === 'mount') continue;
    ctx.fillStyle = '#a03030';
    ctx.fillRect(sx(ox + k.lx) + ts * 0.2, sy(oy + k.ly) + ts * 0.2, ts * 0.6, ts * 0.6);
  }
  ctx.globalAlpha = 1;
  const stt = o.st != null ? stById(o.st) : null;
  ctx.strokeStyle = o.tow
    ? '#40d0b0'
    : stt
      ? stt.state === 'hostile'
        ? 'rgba(255,90,70,.7)'
        : 'rgba(47,220,79,.7)'
      : 'rgba(200,200,220,.5)';
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(sx(ox) - 1, sy(oy) - 1, sh.w * ts + 2, sh.h * ts + 2);
  ctx.setLineDash([]);
}
function taskTarget(d) {
  const t = d.task;
  let o;
  if (d.tr) return null;
  switch (t.type) {
    case 'salvage':
    case 'fetch':
    case 'attack':
      o = objById(t.oid);
      return o && o.sec === d.sec ? [o.x, o.y] : null;
    case 'cut': {
      const m = modById(t.mid);
      const c = m && cutSpot(m, t.lx, t.ly);
      return c ? [c.ox, c.oy] : null;
    }
    case 'brace':
      return [t.x, t.y];
    case 'scrap':
    case 'park': {
      const o = objById(t.oid);
      return o && o.sec === d.sec ? [o.x, o.y] : null;
    }
    case 'build': {
      const fp = freePorts().find(p => p.mid === t.mid && p.pi === t.pi);
      return fp ? [fp.x + fp.dx, fp.y + fp.dy] : null;
    }
    case 'tube2':
      return t.plan.cells[0];
    case 'seal': {
      const fp = freePorts().find(p => p.mid === t.mid && p.pi === t.pi);
      return fp ? [fp.x + fp.dx, fp.y + fp.dy] : null;
    }
    case 'iface': {
      const m = modById(t.mid);
      const n = m && G.machines.find(k => k.type === 'node' && k.mi === modIndex(t.mid));
      return n ? hullNear(m, n.x, n.y) : null;
    }
    case 'patch': {
      const b = G.brk.find(b => b.id === t.bid);
      return b ? [b.x, b.y] : null;
    }
    case 'tow': {
      if (!t.att || !t.mid) {
        o = objById(t.oid);
        return o ? [o.x, o.y] : null;
      }
      const fp = freePorts().find(p => p.mid === t.mid && p.pi === t.pi);
      return fp ? [fp.x, fp.y] : null;
    }
    case 'tube': {
      const fp = freePorts().find(p => p.mid === t.mid && p.pi === t.pi);
      return fp ? [fp.x, fp.y] : null;
    }
    case 'detach': {
      const m = modById(t.mid);
      return m ? [m.ox, m.oy] : null;
    }
    case 'hack': {
      const st = stById(t.st);
      return st && st.sec === d.sec ? [st.cx, st.cy] : null;
    }
    case 'goto':
      return [t.x, t.y];
    case 'return':
      return hatchOf(d);
  }
  return null;
}
function renderEarth() {
  const fit = Math.min(cssW / EGW, (cssH - (narrow() ? 24 : 0)) / EGH);
  const cs = fit * (V.gz || 1);
  if (!V.gcam) V.gcam = { x: -(cssW / cs - EGW) / 2, y: -(cssH / cs - EGH) / 2 - (narrow() ? 1 : 0) };
  const vw = cssW / cs,
    vh = cssH / cs;
  if (vw >= EGW) V.gcam.x = -(vw - EGW) / 2;
  else V.gcam.x = clamp(V.gcam.x, 0, EGW - vw);
  if (vh >= EGH) V.gcam.y = -(vh - EGH) / 2;
  else V.gcam.y = clamp(V.gcam.y, 0, EGH - vh);
  const ox = -V.gcam.x * cs,
    oy = -V.gcam.y * cs;
  V.eg = { cs, ox, oy, fit };
  ctx.font = FONT(cs * 0.95);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < EGH; y++)
    for (let x = 0; x < EGW; x++) {
      const px = ox + x * cs,
        py = oy + y * cs;
      if (px < -cs || py < -cs || px > cssW || py > cssH) continue;
      const i = x + y * EGW;
      const [ch, fg, bg] = earthGlyph(i, x, y);
      ctx.fillStyle = bg;
      ctx.fillRect(px, py, Math.ceil(cs), Math.ceil(cs));
      if (cs >= 6) {
        if (ch !== ' ') glyph(ch, px, py, fg, cs);
      } else {
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(px, py, Math.ceil(cs), Math.ceil(cs));
        ctx.globalAlpha = 1;
      }
    }
  for (const L of G.legacy) {
    if (!L.known) continue;
    const px = ox + (L.x + 0.5) * cs,
      py = oy + (L.y + 0.5) * cs;
    ctx.strokeStyle = L.tags.length ? 'rgba(255,200,80,.35)' : 'rgba(255,60,60,.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - L.r * cs, py - L.r * cs, L.r * 2 * cs, L.r * 2 * cs);
    ctx.fillStyle = '#200';
    ctx.fillRect(px - cs / 2, py - cs / 2, cs, cs);
    ctx.strokeStyle = '#ff4040';
    ctx.strokeRect(px - cs / 2, py - cs / 2, cs, cs);
    glyph('!', px - cs / 2, py - cs / 2, '#ff8080', cs);
  }
  for (const s of G.orbit) {
    const px = ox + (s.cx + 0.5) * cs,
      py = oy + (s.cy + 0.5) * cs;
    ctx.fillStyle = '#000';
    ctx.fillRect(px - cs / 2, py - cs / 2, cs, cs);
    ctx.strokeStyle = FAC[s.f].c;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px - cs / 2, py - cs / 2, cs, cs);
    glyph('*', px - cs / 2, py - cs / 2, '#ffffff', cs);
  }
  for (const r of G.reqs) {
    if (!r.cell || ((performance.now() / 400) | 0) % 2) continue;
    ctx.strokeStyle = FAC[r.f].c;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + r.cell[0] * cs - 2, oy + r.cell[1] * cs - 2, cs + 4, cs + 4);
  }
  const now = performance.now();
  V.strikes = V.strikes.filter(s => now - s.t0 < 1500);
  for (const s of V.strikes) {
    const p = (now - s.t0) / 1500;
    ctx.strokeStyle = `rgba(255,230,120,${1 - p})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox + (s.x + 0.5) * cs, 0);
    ctx.lineTo(ox + (s.x + 0.5) * cs, oy + (s.y + 0.5) * cs);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,160,40,${1 - p})`;
    ctx.beginPath();
    ctx.arc(ox + (s.x + 0.5) * cs, oy + (s.y + 0.5) * cs, cs * (0.4 + p * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  if (V.tags) {
    const L = [];
    FAC.forEach(F => {
      const [hx, hy] = cellOf(F.home[0], F.home[1]);
      L.push({ x: hx, y: hy, t: F.sh, bg: F.c, fg: '#000' });
    });
    for (const Lg of G.legacy)
      if (Lg.known && cs >= 9) L.push({ x: Lg.x, y: Lg.y, t: Lg.n, bg: '#ff4a4a', fg: '#200' });
    drawLabels(
      L,
      x => ox + x * cs,
      y => oy + y * cs,
      cs,
    );
  }
  const sh = shares();
  ctx.textAlign = 'left';
  ctx.font = FONT(12);
  const hdr = `SURFACE · habitable ${sh.hab} · settled ${sh.tot} · x${(V.gz || 1).toFixed(1)}`;
  const hy = narrow() ? 22 : 4;
  ctx.fillStyle = 'rgba(0,0,0,.75)';
  ctx.fillRect(4, hy, ctx.measureText(hdr).width + 10, 18);
  ctx.fillStyle = '#2fdc4f';
  ctx.fillText(hdr, 9, hy + 10);
  ctx.textAlign = 'center';
  if (!G.contact) {
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#2fdc4f';
    ctx.font = FONT(16);
    ctx.fillText('NO SIGNAL. Take and repair a Comms Array.', cssW / 2, cssH / 2);
  }
}
const hsh = (x, y) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
function earthGlyph(i, x, y) {
  if (!M.land[i]) return [hsh(x, y) < 0.35 ? '~' : ' ', '#1c4a6a', '#03101e'];
  const o = G.owner[i];
  if (o >= 0) return [isHome(o, i) ? '&' : '#', FAC[o].c, shadeA(FAC[o].c)];
  if (G.hab[i]) return [hsh(x, y) < 0.5 ? '"' : ',', '#5a9a3a', '#0b1608'];
  return hsh(x, y) < 0.12 ? ['·', '#a04020', '#140c08'] : ['.', '#5a4630', '#120c08'];
}
const shadeAC = {};
function shadeA(c) {
  if (shadeAC[c]) return shadeAC[c];
  const n = parseInt(c.slice(1), 16);
  return (shadeAC[c] =
    `rgb(${(((n >> 16) & 255) * 0.22) | 0},${(((n >> 8) & 255) * 0.22) | 0},${((n & 255) * 0.22) | 0})`);
}
export function focusOrbit(mode) {
  let fx = OC,
    fy = OC;
  if (mode === 'home') {
    const h = G.sectors[G.home];
    fx = h.ox;
    fy = h.oy;
    V.oz = Math.max(V.oz || 1, 2.2);
  } else if (mode === 'drone') {
    const d = selDrone();
    if (d) {
      const p = dronePos(d);
      fx = p[0];
      fy = p[1];
      V.oz = Math.max(V.oz || 1, 2.2);
    }
  } else {
    V.oz = 1;
  }
  const t2 = clamp((Math.min(cssW, cssH) / OG) * V.oz, 3, 44);
  V.ocam = { x: fx - cssW / t2 / 2, y: fy - cssH / t2 / 2 };
  render();
}
function dronePos(d) {
  if (d.tr) {
    const a = SEC(d.tr.from),
      b = SEC(d.tr.to),
      f = 1 - d.tr.eta / d.tr.total;
    return [a.ox + (b.ox - a.ox) * f, a.oy + (b.oy - a.oy) * f];
  }
  const s = SEC(d.sec);
  return s ? [s.ox + 1, s.oy] : [OC, OC];
}
const spos = s => (det(s) === 1 && s.fz ? [s.ox + s.fz[0], s.oy + s.fz[1]] : [s.ox, s.oy]);
function renderOrbit() {
  const ts = clamp((Math.min(cssW, cssH) / OG) * (V.oz || 1), 3, 44);
  V.ots = ts;
  if (!V.ocam) {
    focusOrbit('home');
    return;
  }
  const vw = cssW / ts,
    vh = cssH / ts;
  V.ocam.x = clamp(V.ocam.x, -vw * 0.5, OG - vw * 0.5);
  V.ocam.y = clamp(V.ocam.y, -vh * 0.5, OG - vh * 0.5);
  const sx = x => (x - V.ocam.x) * ts,
    sy = y => (y - V.ocam.y) * ts;
  V.osx = sx;
  V.osy = sy;
  const now = performance.now();
  const x0 = Math.max(0, Math.floor(V.ocam.x)),
    y0 = Math.max(0, Math.floor(V.ocam.y)),
    x1 = Math.min(OG, Math.ceil(V.ocam.x + vw) + 1),
    y1 = Math.min(OG, Math.ceil(V.ocam.y + vh) + 1);
  ctx.font = FONT(ts * 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const big = ts >= 7;
  const rot = G.turn * 0.05;
  const cs = Math.ceil(ts);
  const h = G.sectors[G.home],
    PR = passR();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const px = sx(x),
        py = sy(y);
      const dx = x + 0.5 - OC,
        dy = y + 0.5 - OC,
        r = Math.hypot(dx, dy);
      if (r < ER) {
        const u = dx / ER,
          v = dy / ER;
        const lat = clamp((-Math.asin(clamp(v, -1, 1)) * 180) / Math.PI, -70, 79);
        const lo = (Math.asin(clamp(u / Math.sqrt(Math.max(0.02, 1 - v * v)), -1, 1)) * 180) / Math.PI;
        const lon = ((lo + rot + 540) % 360) - 180;
        const [ex, ey] = cellOf(lon, lat);
        const [ch, fg, bg] = earthGlyph(ex + ey * EGW, ex, ey);
        ctx.fillStyle = bg;
        ctx.fillRect(px, py, cs, cs);
        if (big) {
          if (ch !== ' ') glyph(ch, px, py, fg, ts);
        } else {
          ctx.fillStyle = fg;
          ctx.globalAlpha = 0.6;
          ctx.fillRect(px, py, cs, cs);
          ctx.globalAlpha = 1;
        }
        if (u > 0.35) {
          ctx.fillStyle = `rgba(0,0,0,${Math.min(0.8, (u - 0.35) * 1.1)})`;
          ctx.fillRect(px, py, cs, cs);
        }
        continue;
      }
      if (r < ER + 0.9) {
        ctx.fillStyle = '#0c2a4a';
        ctx.fillRect(px, py, cs, cs);
        continue;
      }
      const b = bandOf(r);
      const hh = hsh(x, y);
      if (b < 0) {
        if (hh < 0.05) {
          ctx.fillStyle = 'rgba(200,220,255,.5)';
          ctx.fillRect(px + ts / 2, py + ts / 2, 1, 1);
        }
        continue;
      }
      const B = RINGS[b];
      const edge =
        Math.abs(r - (B.r0 - 0.5)) < 0.55 || (b === RINGS.length - 1 && Math.abs(r - (B.r1 + 0.5)) < 0.55);
      if (edge) {
        ctx.fillStyle = '#0a120c';
        ctx.fillRect(px, py, cs, cs);
        if (big) glyph(hh < 0.5 ? '·' : ':', px, py, B.c, ts);
        else {
          ctx.fillStyle = B.c;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(px + ts * 0.3, py + ts * 0.3, Math.max(1, ts * 0.4), Math.max(1, ts * 0.4));
          ctx.globalAlpha = 1;
        }
        continue;
      }
      // unknown space: faint static, a little brighter inside passive sensor range
      const inR = Math.hypot(x + 0.5 - h.ox, y + 0.5 - h.oy) <= PR;
      if (inR) {
        ctx.fillStyle = 'rgba(47,220,79,.035)';
        ctx.fillRect(px, py, cs, cs);
      }
      if (hh < (inR ? 0.05 : 0.025)) {
        if (big) glyph(hh < 0.012 ? '+' : '.', px, py, inR ? '#1f4a2a' : '#182418', ts);
        else {
          ctx.fillStyle = inR ? '#1f4a2a' : '#182418';
          ctx.fillRect(px + ts * 0.4, py + ts * 0.4, Math.max(1, ts * 0.2), Math.max(1, ts * 0.2));
        }
      }
    }
  // sensor envelopes
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(47,220,79,.35)';
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.arc(sx(h.ox + 0.5), sy(h.oy + 0.5), PR * ts, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,192,64,.22)';
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(sx(h.ox + 0.5), sy(h.oy + 0.5), sweepR() * ts, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (V.sweep) {
    const p = (now - V.sweep.t0) / 1800;
    if (p >= 1) V.sweep = null;
    else {
      ctx.strokeStyle = `rgba(255,220,120,${1 - p})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx(h.ox + 0.5), sy(h.oy + 0.5), V.sweep.R * ts * p, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      kick();
    }
  }
  for (const L of G.legacy) {
    if (!(L.aware > G.turn) || L.tags.includes(TAGK)) continue;
    const s2 = G.sectors[L.sec];
    if (!s2 || !det(s2)) continue;
    const [ax, ay] = spos(s2);
    ctx.strokeStyle = 'rgba(255,60,60,.5)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sx(ax + 0.5), sy(ay + 0.5));
    ctx.lineTo(sx(h.ox + 0.5), sy(h.oy + 0.5));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s2 of G.sectors) {
    if (det(s2) < 2 || s2.type !== 'weapon') continue;
    const L = G.legacy.find(L => L.sec === s2.id);
    if (L && L.tags.includes(TAGK)) continue;
    ctx.strokeStyle = 'rgba(255,60,60,.35)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(sx(s2.ox + 0.5), sy(s2.oy + 0.5), 4 * ts, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.font = FONT(Math.max(10, Math.min(14, ts * 0.9)));
  for (const B of RINGS) {
    const yy = OC - (B.r0 + B.r1) / 2;
    const tx = sx(OC + 0.5),
      ty = sy(yy);
    if (ty < -10 || ty > cssH + 10) continue;
    const t = `${B.n} · ${B.a0.toLocaleString('en-US')}-${B.a1.toLocaleString('en-US')} km`;
    const tw = ctx.measureText(t).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillRect(tx - tw / 2, ty - 8, tw, 16);
    ctx.fillStyle = B.c;
    ctx.fillText(t, tx, ty);
  }
  ctx.font = FONT(ts * 0.9);
  if (G.move) {
    const b2 = G.sectors[G.move.to];
    ctx.strokeStyle = 'rgba(47,220,79,.6)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sx(h.ox + 0.5), sy(h.oy + 0.5));
    ctx.lineTo(sx(b2.ox + 0.5), sy(b2.oy + 0.5));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (G.fscan) {
    const s2 = G.sectors[G.fscan.sid];
    const [ax, ay] = spos(s2);
    const ph = (now / 300) % 1;
    ctx.strokeStyle = `rgba(176,138,255,${0.4 + 0.4 * ph})`;
    ctx.beginPath();
    ctx.moveTo(sx(h.ox + 0.5), sy(h.oy + 0.5));
    ctx.lineTo(sx(ax + 0.5), sy(ay + 0.5));
    ctx.stroke();
    kick();
  }
  const pulse = 0.55 + 0.45 * Math.sin(now / 350);
  for (const s2 of G.sectors) {
    const D = det(s2);
    if (!D) continue;
    const [ax, ay] = spos(s2);
    const px = sx(ax) + ts / 2,
      py = sy(ay) + ts / 2;
    if (px < -ts * 6 || py < -ts * 6 || px > cssW + ts * 6 || py > cssH + ts * 6) continue;
    const sel = s2.id === V.osel;
    if (D === 1) {
      ctx.fillStyle = `rgba(224,176,32,${0.07 + 0.05 * pulse})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.6 * ts, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224,176,32,.45)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(px, py, 2.6 * ts, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const bs = Math.max(ts, 12);
      ctx.font = 'bold ' + FONT(bs * 0.85);
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      glyph('?', px - bs / 2, py - bs / 2, '#e0b020', bs);
      ctx.globalAlpha = 1;
    } else {
      const T2 = SEC_T[s2.id === G.home ? 'home' : s2.type];
      const bs = Math.max(ts * 1.2, 13);
      ctx.font = 'bold ' + FONT(bs * 0.9);
      ctx.shadowColor = T2.c;
      ctx.shadowBlur = 8;
      glyph(T2.g, px - bs / 2, py - bs / 2, T2.c, bs);
      ctx.shadowBlur = 0;
    }
    if (sel) {
      const r = Math.max(ts * 1.4, 12);
      ctx.strokeStyle = '#bfffcf';
      ctx.lineWidth = 1.5;
      for (const [qx, qy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(px + qx * r, py + qy * r * 0.45);
        ctx.lineTo(px + qx * r, py + qy * r);
        ctx.lineTo(px + qx * r * 0.45, py + qy * r);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    ctx.font = FONT(ts * 0.9);
  }
  for (const d of G.ext.drones) {
    const [x, y] = dronePos(d);
    const bs = Math.max(ts, 9);
    if (d.tr) {
      const a = SEC(d.tr.from),
        b2 = SEC(d.tr.to);
      ctx.strokeStyle = 'rgba(64,224,192,.35)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(sx(a.ox + 0.5), sy(a.oy + 0.5));
      ctx.lineTo(sx(b2.ox + 0.5), sy(b2.oy + 0.5));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!d.tr && (d.sec === G.home || d.sec === HULL)) continue;
    const qx = sx(x) + ts / 2 - bs / 2,
      qy = sy(y) + ts / 2 - bs / 2;
    ctx.font = FONT(bs * 0.85);
    glyph(
      d.dt === 'tug' ? 'T' : d.dt === 'guard' ? 'G' : 'D',
      qx,
      qy,
      d.id === G.sel ? '#bfffe0' : '#40e0c0',
      bs,
    );
    ctx.font = FONT(ts * 0.9);
  }
  if (V.tags) {
    const L = [];
    for (const s2 of G.sectors) {
      const D = det(s2);
      if (!D) continue;
      if (ts < 6 && s2.id !== G.home && s2.id !== V.osel) continue;
      const [ax, ay] = spos(s2);
      if (D === 1) L.push({ x: ax, y: ay, t: `${cid(s2)} · UNKNOWN`, bg: '#e0b020', fg: '#000' });
      else {
        const T2 = SEC_T[s2.id === G.home ? 'home' : s2.type];
        L.push({
          x: s2.ox,
          y: s2.oy,
          t: `${s2.id === G.home ? 'KESTREL-9' : s2.name && s2.name !== T2.n ? s2.name : T2.n}${ts >= 12 ? ' · ' + secCoord(s2) : ''}`.toUpperCase(),
          bg: s2.id === G.home ? '#2fdc4f' : T2.c,
          fg: '#000',
        });
      }
    }
    drawLabels(L, sx, sy, ts);
  }
  ctx.textAlign = 'left';
  ctx.font = FONT(12);
  const sel = selDrone();
  const nC = G.sectors.filter(s2 => det(s2) === 1).length;
  const hdr = `SENSOR CHART · x${(V.oz || 1).toFixed(1)} · ${nC} unknown contact${nC === 1 ? '' : 's'}${G.fscan ? ' · FOCUSED SCAN ' + G.fscan.w + '/' + G.fscan.need : ''} · ${sel ? sel.name + ': ' + taskText(sel) : 'no drone selected'}`;
  const hy = narrow() ? 22 : 4;
  ctx.fillStyle = 'rgba(0,0,0,.75)';
  ctx.fillRect(4, hy, ctx.measureText(hdr).width + 10, 18);
  ctx.fillStyle = '#2fdc4f';
  ctx.fillText(hdr, 9, hy + 10);
  ctx.textAlign = 'center';
}
export function orbitTapAt(px, py) {
  const ts = V.ots;
  const x = px / ts + V.ocam.x,
    y = py / ts + V.ocam.y;
  let best = null,
    bd = Math.max(2, 14 / ts);
  for (const s2 of G.sectors) {
    if (!det(s2)) continue;
    const [ax, ay] = spos(s2);
    const d = Math.hypot(ax + 0.5 - x, ay + 0.5 - y);
    if (d <= bd) {
      bd = d;
      best = s2;
    }
  }
  if (!best) {
    if (Math.hypot(x - OC, y - OC) < ER) {
      log('Earth. Switch to the EARTH tab for the surface.', 'info');
      return refresh();
    }
    V.osel = null;
    log('Nothing on the sensors there. Run an active sweep or a passive watch to pick up contacts.', 'info');
    return refresh();
  }
  V.osel = best.id;
  orbitTap(best);
}
export function orbitTap(s) {
  const D = det(s),
    T2 = SEC_T[s.id === G.home ? 'home' : s.type],
    sel = selDrone();
  const so = G.ext.objs.filter(o => o.sec === s.id && o.seen !== false);
  const h = G.sectors[G.home];
  const cnt = k => so.filter(o => o.kind === k).length;
  const b = [];
  let body, title;
  const send = () => {
    if (sel && sel.sec !== s.id && !sel.tr)
      b.push({
        t: `Send ${sel.name} ${D === 1 ? 'to investigate' : 'here'} (ETA ${Math.ceil(travelTime(sel.sec < 0 ? G.home : sel.sec, s.id) / (G.thrust ? 1.5 : 1))} turns)`,
        f: () => {
          releaseTow(sel);
          sel.task = {
            type: 'goto',
            x: Math.floor(WW / 2) + rr(-8, 8),
            y: Math.floor(WH / 2) + rr(8, 14),
            sec: s.id,
          };
          startTransfer(sel, s.id, null);
          refresh();
        },
      });
  };
  if (D === 1) {
    title = `CONTACT ${cid(s)}`;
    const [sz, em] = SIGN[s.type];
    body = `Unidentified return in ${RINGS[s.ring].n}, roughly ${Math.round(sdist(s, h) * 1400).toLocaleString('en-US')} km out.\n\nMass: ${sz}\nEmissions: ${em}\nPosition is uncertain by a few hundred km.\n\nA focused scan identifies it but keeps our emitters lit for a while, and whatever is out there can see that. A drone can go and look instead.`;
    b.push({
      t:
        G.fscan && G.fscan.sid === s.id
          ? `Focused scan running (${G.fscan.w}/${G.fscan.need})`
          : `Focused scan (${Math.round(8 + sdist(s, h) / 5)} turns, loud)`,
      dis: !scanOK() || (G.fscan && G.fscan.sid === s.id),
      f: () => startFocus(s),
    });
    if (!scanOK()) body += '\n\nFocused scans need a working Sensor Array or Comms Array.';
    send();
  } else {
    title = s.id === G.home ? 'KESTREL-9' : T2.n.toUpperCase();
    body = `${secName(s)} · ${secCoord(s)}\n${s.id === G.home ? 'Home: KESTREL-9' : T2.n + (s.name && s.name !== T2.n ? ': ' + s.name : '')}\n${T2.desc}\n\nSeen so far: debris ${cnt('debris')} · wrecks ${cnt('wreck')} · station sections ${cnt('der')} · turrets ${cnt('turret')}${cnt('raft') ? ' · LIFEBOAT' : ''}${cnt('platform') ? ' · legacy platform' : ''}${cnt('null') ? ' · null pockets ' + cnt('null') : ''}`;
    const dh = G.ext.drones.filter(d => d.sec === s.id);
    if (dh.length) body += `\nYour drones here: ${dh.map(d => d.name).join(', ')}`;
    if (s.type === 'weapon') {
      const L = G.legacy.find(L => L.sec === s.id);
      if (L)
        body += `\n${L.n} IFF: ${L.tags.includes(TAGK) ? 'your drones are tagged friendly.' : 'it will shoot your drones.'}${L.aware > G.turn ? ' It is TRACKING KESTREL-9.' : ''}`;
    }
    b.push({
      t: s.id === G.home ? 'View local space' : 'View in EXTERIOR',
      f: () => {
        V.sec = s.id;
        V.ecam = null;
        setTab('ext');
      },
    });
    send();
    if (s.id !== G.home) {
      const eng = hasOnline('thruster');
      const eta = travelTime(G.home, s.id) * 3;
      b.push({
        t: G.move
          ? `KESTREL-9 already under way (${G.move.eta}t)`
          : `Move KESTREL-9 here (Ion Drive, 20 scrap fuel, ${eta} turns)`,
        dis: !eng || G.move || G.stock.scrap < 20,
        f: () => {
          G.stock.scrap -= 20;
          G.move = { to: s.id, eta };
          log(
            `Ion drives lit. KESTREL-9 is leaving its orbit for ${secName(s)}. ETA ${eta} turns. Leaving the mapped lanes is how stations die.`,
            'warn',
          );
          refresh();
        },
      });
      if (!eng)
        body += '\n\nThe station could move here if it had a working Ion Drive (found on military stations).';
    }
  }
  b.push({ t: 'Close' });
  showModal(title, body, b);
}
export function uiOrbit() {
  $('#ctxH').textContent = '/ S E N S O R S /';
  $('#ctx2H').textContent = '/ C O N T A C T S /';
  const h = G.sectors[G.home];
  const cd = Math.max(0, (G.timers.sweep || 0) - G.turn);
  const c = `<div class="console">
    <div class="dial"><div class="lcd">PASSIVE ${Math.round(passR() * 1400).toLocaleString('en-US')} km<br>SWEEP ${Math.round(sweepR() * 1400).toLocaleString('en-US')} km</div>
    <div class="lamps"><span class="lamp ${hasOnline('sensor') ? 'on' : ''}">ARRAY</span><span class="lamp ${commsOnline() ? 'on' : ''}">COMMS</span><span class="lamp ${G.fscan ? 'amber' : ''}">FOCUS</span><span class="lamp ${G.legacy.some(L => L.aware > G.turn && !L.tags.includes(TAGK)) ? 'red' : ''}">LOCKED</span></div></div>
    <button class="key wide" data-a="sweep" ${cd || G.bat < 8 ? 'disabled' : ''}>ACTIVE SWEEP <small>${cd ? 'cooling ' + cd + 't' : '8 batt · LOUD'}</small></button>
    ${G.fscan ? `<div class="lcd">FOCUS ${cid(G.sectors[G.fscan.sid])} ${'#'.repeat(Math.round((G.fscan.w / G.fscan.need) * 12))}${'.'.repeat(12 - Math.round((G.fscan.w / G.fscan.need) * 12))}</div><button class="key wide" data-a="fscanstop">CUT FOCUSED SCAN</button>` : ''}
    <div class="dim" style="font-size:11px;line-height:1.4">Passive sensors pick up loud things nearby over time, safely. An active sweep finds everything in range but tells everything in range where we are. Tap a contact to scan it or send a drone.</div></div>`;
  $('#ctx').innerHTML = c;
  let f = '';
  const list = G.sectors
    .filter(s => det(s) && s.id !== G.home)
    .sort((a, b) => det(a) - det(b) || sdist(a, h) - sdist(b, h));
  for (const s of list) {
    const D = det(s),
      T2 = SEC_T[s.type];
    f += `<div class="row" data-sec="${s.id}"><span class="nm" style="color:${D === 1 ? '#e0b020' : T2.c}">${D === 1 ? '? ' + cid(s) + ' unknown · ' + SIGN[s.type][1] : T2.g + ' ' + esc(s.name)}</span><span class="dim" style="font-size:11px">${travelTime(G.home, s.id)}t</span></div>`;
  }
  if (!list.length) f = '<div class="dim">No contacts.</div>';
  $('#ctx2').innerHTML = f;
}
function drawFx() {
  const now = performance.now();
  V.fx = V.fx.filter(f => now - f.t0 < f.dur);
  for (const f of V.fx) {
    if (f.view !== V.tab || (f.view === 'ext' && f.sec !== V.sec)) continue;
    const p = (now - f.t0) / f.dur;
    const sx = f.view === 'ext' ? V.esx : V.sxf,
      sy = f.view === 'ext' ? V.esy : V.syf,
      ts = f.view === 'ext' ? V.ets : TS;
    if (!sx) continue;
    if (f.k === 'tr') {
      ctx.strokeStyle = f.c;
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(f.x0) + ts / 2, sy(f.y0) + ts / 2);
      ctx.lineTo(sx(f.x1) + ts / 2, sy(f.y1) + ts / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (f.k === 'boom') {
      ctx.fillStyle = `rgba(255,170,40,${1 - p})`;
      ctx.beginPath();
      ctx.arc(sx(f.x) + ts / 2, sy(f.y) + ts / 2, ts * (0.6 + p * 1.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
let raf = 0;
export function kick() {
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0;
      render();
      if (V.fx.length || (V.tab === 'earth' && V.strikes.length)) kick();
    });
}
setInterval(() => {
  if (G && (V.tab === 'earth' || V.tab === 'orbit') && !document.hidden) render();
}, 400);
