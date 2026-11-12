// Synthesized sound with the Web Audio API: no audio files, so still no build step or downloads.
// Sounds follow core events. Browsers only allow audio after the player has interacted with the page,
// so the audio context starts on the first key press or tap.
import { on } from '../core/events.js';
import { G, M, P } from '../core/state.js';
import { idx } from '../core/util.js';

/** @type {AudioContext | null} */
let ac = null;
/** @type {GainNode | null} */
let master = null;
/** @type {{ osc: OscillatorNode[], gain: GainNode, filter: BiquadFilterNode } | null} */
let hum = null;
let volume = 0.5;
const lastPlayed = {};

function start() {
  if (ac || typeof AudioContext === 'undefined') return;
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = volume;
  master.connect(ac.destination);
  startHum();
}

/** Master volume, 0 to 1. */
export function setVolume(v) {
  volume = v;
  if (master) master.gain.setTargetAtTime(v, ac.currentTime, 0.05);
}

/**
 * One short synthesized sound.
 * @param {{ type?: OscillatorType, from: number, to?: number, dur: number, vol?: number, noise?: boolean }} s
 */
function blip({ type = 'square', from, to = from, dur, vol = 0.2, noise = false }) {
  if (!ac || !volume) return;
  const t = ac.currentTime;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(master);
  if (noise) {
    const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    src.buffer = buf;
    src.connect(f).connect(g);
    src.start(t);
    return;
  }
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  o.connect(g);
  o.start(t);
  o.stop(t + dur);
}

/** Play `name` unless it played less than `gap` ms ago (keeps busy turns from turning into noise). */
function cue(name, gap, fn) {
  const now = performance.now();
  if (now - (lastPlayed[name] || 0) < gap) return;
  lastPlayed[name] = now;
  fn();
}

const SOUNDS = {
  shot: () => blip({ noise: true, from: 3000, to: 400, dur: 0.12, vol: 0.25 }),
  boom: () => blip({ noise: true, from: 900, to: 60, dur: 0.6, vol: 0.4 }),
  hurt: () => blip({ type: 'sawtooth', from: 160, to: 60, dur: 0.25, vol: 0.25 }),
  sweep: () => {
    blip({ type: 'sine', from: 1400, to: 900, dur: 1.2, vol: 0.18 });
    blip({ type: 'sine', from: 700, to: 450, dur: 1.4, vol: 0.1 });
  },
  strike: () => blip({ noise: true, from: 400, to: 40, dur: 1.2, vol: 0.35 }),
  alarm: () => {
    blip({ type: 'square', from: 880, dur: 0.12, vol: 0.12 });
    setTimeout(() => blip({ type: 'square', from: 660, dur: 0.16, vol: 0.12 }), 140);
  },
  good: () => blip({ type: 'triangle', from: 660, to: 990, dur: 0.18, vol: 0.12 }),
};

/** A quiet station hum. It drops in pitch and gets rougher when the air around you is thin. */
function startHum() {
  const gain = ac.createGain();
  gain.gain.value = 0.035;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220;
  filter.connect(gain).connect(master);
  const osc = [55, 55.7, 110.4].map(f => {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(filter);
    o.start();
    return o;
  });
  hum = { osc, gain, filter };
}

function updateHum() {
  if (!hum || !G || !P) return;
  const m = G.mods[M.own ? M.own[idx(P.x, P.y)] : -1];
  const pressure = m ? m.pressure : 100;
  const t = ac.currentTime;
  hum.filter.frequency.setTargetAtTime(pressure < 35 ? 90 : 220, t, 0.5);
  hum.gain.gain.setTargetAtTime(G.over ? 0 : pressure < 35 ? 0.05 : 0.035, t, 0.5);
}

export function installAudio() {
  const unlock = () => {
    start();
    if (ac && ac.state === 'suspended') ac.resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  on('fx', f => cue(f.k, 60, f.k === 'boom' ? SOUNDS.boom : SOUNDS.shot));
  on('hurt', () => cue('hurt', 120, SOUNDS.hurt));
  on('sweep', () => cue('sweep', 500, SOUNDS.sweep));
  on('strike', () => cue('strike', 400, SOUNDS.strike));
  on('log', ({ c }) => {
    if (c === 'bad') cue('alarm', 1500, SOUNDS.alarm);
    else if (c === 'good') cue('good', 800, SOUNDS.good);
  });
  on('changed', () => ac && updateHum());
}
