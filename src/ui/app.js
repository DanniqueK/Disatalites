// Connects the game core's events to the browser UI. Everything the core wants shown goes through here.
import { hackConsole } from '../actions/hack.js';
import { on } from '../core/events.js';
import { G, V } from '../core/state.js';
import { $ } from './dom.js';
import { showTitle } from './help-title.js';
import { flushModals } from './log-modal.js';
import { setTab, updateUI } from './panels.js';
import { kick, render } from './render.js';

let hurtTimer = 0;

function reopenHackConsole() {
  if (V.modalOpen || V.hackOpen == null || !G || G.over) return;
  const d = G.ext.drones.find(x => x.id === V.hackOpen);
  if (!d) {
    V.hackOpen = null;
    return;
  }
  setTimeout(() => {
    if (!V.modalOpen && V.hackOpen === d.id) hackConsole(d);
  }, 0);
}

export function installUi() {
  on('changed', () => {
    reopenHackConsole();
    updateUI();
    render();
    flushModals();
  });
  on('fx', f => {
    f.t0 = performance.now();
    V.fx.push(f);
    kick();
  });
  on('hurt', () => {
    const mw = $('#mapWrap');
    mw.classList.add('hurt');
    clearTimeout(hurtTimer);
    hurtTimer = setTimeout(() => mw.classList.remove('hurt'), 220);
  });
  on('sweep', ({ R }) => {
    V.sweep = { t0: performance.now(), R };
  });
  on('strike', ({ x, y }) => {
    V.strikes.push({ x, y, t0: performance.now() });
  });
  on('tab', tab => setTab(tab));
  on('title', () => showTitle());
}
