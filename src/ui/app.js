// Connects the game core's events to the browser UI. Everything the core wants shown goes through here.
import { hackConsole } from '../actions/hack.js';
import { on } from '../core/events.js';
import { G, V } from '../core/state.js';
import { $ } from './dom.js';
import { showTitle } from './help-title.js';
import { flushModals } from './log-modal.js';
import { setTab, updateUI } from './panels.js';
import { kick, render } from './render.js';
import { reducedMotion } from './settings.js';

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
    if (reducedMotion()) return;
    f.t0 = performance.now();
    V.fx.push(f);
    kick();
  });
  on('hurt', () => {
    if (reducedMotion()) return;
    const mw = $('#mapWrap');
    mw.classList.add('hurt');
    clearTimeout(hurtTimer);
    hurtTimer = setTimeout(() => mw.classList.remove('hurt'), 220);
  });
  on('sweep', ({ R }) => {
    if (reducedMotion()) return;
    V.sweep = { t0: performance.now(), R };
  });
  on('strike', ({ x, y }) => {
    if (reducedMotion()) return;
    V.strikes.push({ x, y, t0: performance.now() });
  });
  on('tab', tab => setTab(tab));
  on('title', () => showTitle());
}
