import { hasCrew, HK, stById } from '../core/data.js';
import { log } from '../core/messages.js';
import { G, V } from '../core/state.js';
import { esc } from '../core/util.js';
import { endTurn, refresh } from '../sim/turn.js';
import { showModal } from '../ui/log-modal.js';
import { C } from '../ui/palette.js';

export function hackConsole(d) {
  const t = d && d.task;
  if (!t || t.type !== 'hack' || !t.on) {
    V.hackOpen = null;
    return;
  }
  const st = stById(t.st);
  if (!st || !st.hk) {
    V.hackOpen = null;
    return;
  }
  const H = st.hk,
    cur = H.L[H.i];
  const tr = Math.round(H.trace);
  let gauge = '';
  for (let k = 0; k < 25; k++) {
    const on = k < tr / 4;
    gauge += `<i style="background:${on ? (k >= 20 ? C.bad : k >= 14 ? C.warn : C.good) : '#0b140c'}"></i>`;
  }
  const plates = H.L.map((l, k) => {
    const done = k < H.i,
      curr = k === H.i;
    const nm = l.known || done ? HK[l.k].n : '???';
    const bar = curr
      ? `<span class="hpb">${'█'.repeat(Math.max(0, l.hp))}${'░'.repeat(Math.max(0, l.max - Math.max(0, l.hp)))}</span>`
      : '';
    return `<div class="ice ${done ? 'done' : curr ? 'cur' : ''}"><span>${k + 1}</span><b>${nm}</b>${bar}${done ? '<em>BYPASSED</em>' : ''}</div>`;
  }).join('');
  const html = `<div class="hk"><div class="hkrow"><div class="hkst">${plates}</div><div class="hkr"><div class="lbl">TRACE ${tr}%</div><div class="tg">${gauge}</div>
    <div class="lcd tty">${H.lines.map(esc).join('<br>')}</div></div></div>
    <div class="dim" style="font-size:12px;margin-top:6px">${cur.known ? esc(HK[cur.k].d) : 'Unknown layer. Probe it to see what it is (and double your next brute force).'}${hasCrew('hacker') ? ' Your hacker keeps trace gains down.' : ''}</div></div>`;
  showModal(
    `INTRUSION · ${d.name} > ${st.name.toUpperCase()}`,
    html,
    [
      { t: 'Probe (+3 trace)', f: () => hackCmd(d, 'probe') },
      { t: 'Spoof handshake (1 circ)', dis: G.stock.circ < 1, f: () => hackCmd(d, 'spoof') },
      { t: 'Brute force (+8 trace)', f: () => hackCmd(d, 'brute') },
      { t: 'Inject worm (1 circ)', dis: G.stock.circ < 1, f: () => hackCmd(d, 'worm') },
      { t: 'Go dark (-15 trace)', f: () => hackCmd(d, 'dark') },
      {
        t: 'Let the drone run its script',
        f: () => {
          t.auto = 1;
          V.hackOpen = null;
          log(`${d.name} runs its intrusion script on its own.`);
          refresh();
        },
      },
      {
        t: 'Disconnect',
        k: 'danger',
        f: () => {
          t.on = 0;
          d.task = { type: 'idle' };
          V.hackOpen = null;
          log(`${d.name} pulls out of the ${st.name}. Bypassed layers stay open for now.`);
          refresh();
        },
      },
      {
        t: 'Close',
        k: 'close',
        f: () => {
          V.hackOpen = null;
          t.auto = 1;
          refresh();
        },
      },
    ],
    false,
    true,
  );
}

export function hackCmd(d, c) {
  const t = d.task;
  if (!t || t.type !== 'hack') return;
  t.cmd = c;
  t.auto = 0;
  V.hackOpen = d.id;
  endTurn();
}
