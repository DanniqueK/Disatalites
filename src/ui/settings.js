// Display settings, stored in the browser separately from the save.
import { refresh } from '../sim/turn.js';
import { showModal } from './log-modal.js';
import { setPalette } from './palette.js';
import { cycTags, resize } from './render.js';
import { V } from '../core/state.js';

const KEY = 'kestrel9.settings';
const TEXT = [1, 1.15, 1.3, 1.5];
const TILES = [0.8, 1, 1.25, 1.5];
const TAG_MODES = ['see-through', 'faint', 'off'];

export const SETTINGS = {
  text: 1,
  tiles: 1,
  /** @type {'full' | 'reduced'} */
  motion: 'full',
  /** @type {'standard' | 'colorblind'} */
  palette: 'standard',
};

export const reducedMotion = () => SETTINGS.motion === 'reduced';

function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify(SETTINGS));
  } catch (e) {}
}

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (TEXT.includes(s.text)) SETTINGS.text = s.text;
    if (TILES.includes(s.tiles)) SETTINGS.tiles = s.tiles;
    if (s.motion === 'reduced') SETTINGS.motion = 'reduced';
    if (s.palette === 'colorblind') SETTINGS.palette = 'colorblind';
  } catch (e) {}
  applySettings();
}

export function applySettings() {
  document.documentElement.style.setProperty('--ui-zoom', String(SETTINGS.text));
  document.body.classList.toggle('reduce-motion', reducedMotion());
  setPalette(SETTINGS.palette);
  resize();
}

const next = (list, v) => list[(list.indexOf(v) + 1) % list.length];
const pct = v => Math.round(v * 100) + '%';

/**
 * The settings dialog. Every change applies immediately and is remembered in this browser.
 * @param {() => void} [back] Where "Back" returns to.
 */
export function settingsMenu(back) {
  const change = fn => () => {
    fn();
    store();
    applySettings();
    refresh();
    settingsMenu(back);
  };
  const tagMode = !V.tags ? 'off' : TAG_MODES[V.tagA || 0];
  showModal(
    'SETTINGS',
    'Changes apply right away and are remembered in this browser, separately from your save.',
    [
      { t: `Text size: ${pct(SETTINGS.text)}`, f: change(() => (SETTINGS.text = next(TEXT, SETTINGS.text))) },
      {
        t: `Map tile size (STATION): ${pct(SETTINGS.tiles)}`,
        f: change(() => (SETTINGS.tiles = next(TILES, SETTINGS.tiles))),
      },
      {
        t: `Motion: ${SETTINGS.motion === 'full' ? 'full' : 'reduced (no flashing, blinking or animated machines)'}`,
        f: change(() => (SETTINGS.motion = SETTINGS.motion === 'full' ? 'reduced' : 'full')),
      },
      {
        t: `Status colours: ${SETTINGS.palette === 'standard' ? 'standard (green / amber / red)' : 'colourblind-safe (blue / yellow / orange)'}`,
        f: change(() => (SETTINGS.palette = SETTINGS.palette === 'standard' ? 'colorblind' : 'standard')),
      },
      { t: `Labels: ${tagMode}`, f: change(() => cycTags()) },
      { t: 'Back', k: 'close', f: back },
    ],
  );
}
