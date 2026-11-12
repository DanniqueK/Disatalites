import { BR, MD } from '../core/data.js';
import { G, V } from '../core/state.js';
import { esc, pad5 } from '../core/util.js';
import { stopTravel } from '../main.js';
import { refresh } from '../sim/turn.js';
import { $ } from './dom.js';
import { C } from './palette.js';
import { machineStatus } from '../world/machines.js';

/** @typedef {import('../core/types.js').ModalButton} ModalButton */

/** @type {ModalButton[]} */
export let modalBtns = [];
export let modalKeys = [];
const isClose = b => b.k === 'close' || (!b.f && ['Close', 'Cancel', 'OK'].includes(b.t) && b.k !== 'key');
/**
 * @param {string} title
 * @param {string} body
 * @param {ModalButton[]} btns
 * @param {boolean} [locked] Clicking outside does not close it.
 * @param {boolean} [html] Body is HTML, not text.
 * @param {string} [plate] HTML of a machine plate shown above the body.
 */
export function showModal(title, body, btns, locked, html, plate) {
  stopTravel();
  V.modalOpen = true;
  modalBtns = btns;
  $('#mT').textContent = title;
  const mb = $('#mB');
  mb.className = 'mb' + (html ? ' logv' : '');
  if (html) mb.innerHTML = body;
  else {
    mb.textContent = body;
  }
  if (plate) {
    const p = document.createElement('div');
    p.innerHTML = plate;
    mb.prepend(p.firstChild);
  }
  const c = $('#mBtns');
  c.innerHTML = '';
  modalKeys = [];
  let hatch = null;
  btns.forEach((b, i) => {
    if (b.k === 'danger') {
      if (!hatch) {
        hatch = document.createElement('div');
        hatch.className = 'hatch';
        hatch.innerHTML =
          '<button class="cover" type="button"><span>! SERVICE HATCH · LIFT COVER !</span></button><div class="inner"><div class="lbl">PRESS AND HOLD TO CONFIRM</div></div>';
        hatch.querySelector('.cover').onclick = () => hatch.classList.add('open');
      }
      const e = document.createElement('button');
      e.className = 'hold';
      e.type = 'button';
      e.innerHTML = `<span class="fill"></span><span class="tx">${esc(b.t)}</span><small>${b.dis ? 'UNAVAILABLE' : 'HOLD'}</small>`;
      if (b.dis) e.disabled = true;
      let tm = null;
      const cancel = () => {
        clearTimeout(tm);
        tm = null;
        e.classList.remove('go');
      };
      e.addEventListener('pointerdown', ev => {
        if (b.dis) return;
        ev.preventDefault();
        try {
          e.setPointerCapture(ev.pointerId);
        } catch (_) {}
        e.classList.add('go');
        tm = setTimeout(() => {
          tm = null;
          pickModal(i);
        }, 800);
      });
      e.addEventListener('pointerup', cancel);
      e.addEventListener('pointercancel', cancel);
      e.addEventListener('pointerleave', cancel);
      e.addEventListener('contextmenu', ev => ev.preventDefault());
      hatch.querySelector('.inner').appendChild(e);
      return;
    }
    const e = document.createElement('button');
    e.type = 'button';
    if (isClose(b)) {
      e.className = 'closekey';
      e.innerHTML = `${esc(b.t)} <span style="color:#5a6a5c;font-size:11px">ESC</span>`;
      e.onclick = () => pickModal(i);
      c.appendChild(e);
      return;
    }
    modalKeys.push(i);
    e.className = 'key';
    e.innerHTML = `<span class="hk">${modalKeys.length}</span>${esc(b.t)}`;
    if (b.dis) e.disabled = true;
    e.onclick = () => pickModal(i);
    c.appendChild(e);
  });
  if (hatch) {
    const cl = c.querySelector('.closekey');
    c.insertBefore(hatch, cl || null);
    if (cl) c.appendChild(cl);
  }
  $('#modal').classList.remove('hidden');
  $('#modal').dataset.locked = locked ? '1' : '';
  $('.mbox').scrollTop = html ? 1e9 : 0;
}
export function machinePlate(m, extra) {
  const d = MD[m.type];
  const st =
    m.type === 'node'
      ? G.mods[m.mi] && G.mods[m.mi].ctl
        ? 'YOURS'
        : m.cond < 60
          ? 'DAMAGED'
          : 'LOCKED'
      : machineStatus(m);
  const sc = /ONLINE|YOURS|IDLE|BUSY|READY/.test(st)
    ? C.good
    : /BROKEN|DAMAGED|NO /.test(st)
      ? C.bad
      : C.warn;
  const n = 20,
    on = Math.round((Math.min(100, m.cond) / 100) * n);
  let g = '';
  for (let k = 0; k < n; k++)
    g += `<i class="${k < on ? 'on' : ''}${k === 12 ? ' mk' : ''}" style="${k < on ? 'background:' + (m.cond < 60 ? '#c03030' : m.cond < 85 ? '#c0a020' : '#2fbf4f') : ''}"></i>`;
  const mod = G.mods[m.mi];
  return `<div class="plate"><div class="gl" style="color:${d.c}">${esc(d.g)}</div><div class="info"><div class="row1" style="color:${sc}"><span class="led"></span>${esc(st)}<span class="sub" style="margin-left:auto">${mod ? esc(mod.name) + ' · ' + BR[mod.brand].cc : ''}</span></div>
    <div class="gauge">${g}</div><div class="sub">CONDITION ${Math.round(m.cond)}% · runs at 60%${d.use ? ` · DRAW ${d.use}` : d.gen ? ` · OUTPUT +${d.gen}` : ''}${extra ? ' · ' + extra : ''}</div></div></div>`;
}
export function pickModal(i) {
  const b = modalBtns[i];
  if (!b || b.dis) return;
  closeModal();
  if (b.f) b.f();
}
export function closeModal() {
  V.modalOpen = false;
  $('#modal').classList.add('hidden');
  refresh();
  flushModals();
}
export function flushModals() {
  if (!V.modalOpen && V.modalQ.length) {
    const [t, b, btns] = V.modalQ.shift();
    showModal(t, b, btns || [{ t: 'OK' }]);
  }
}
export function showLog() {
  const fl = arr =>
    arr.map(e => `<div class="ln ${e.c}"><span class="n">${pad5(e.n)}_ </span>${esc(e.m)}</div>`).join('');
  showModal(
    'L O G',
    fl(G.log.slice(-120)) +
      '<div class="sh" style="margin-top:12px">C O M B A T</div>' +
      fl(G.cmb.slice(-40)),
    [{ t: 'Close' }],
    false,
    true,
  );
}
