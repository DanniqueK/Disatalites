import { describe, expect, it } from 'vitest';
import { on } from '../src/core/events.js';
import { log } from '../src/core/messages.js';
import { G, P } from '../src/core/state.js';
import { endTurn } from '../src/sim/turn.js';
import { newGame } from '../src/world/new-game.js';

describe('game core runs headless', () => {
  it.each(['clone', 'cryo'])('%s start: new game and 300 turns without errors', start => {
    newGame(start);
    expect(G.turn).toBe(0);
    expect(G.mods.length).toBeGreaterThan(1);
    expect(P.hp).toBe(start === 'clone' ? 70 : 100);
    for (let i = 0; i < 300 && !G.over; i++) {
      P.hp = P.hpMax;
      P.o2 = 100;
      endTurn(true);
    }
    expect(G.turn).toBeGreaterThan(0);
    expect(G.log.length).toBeGreaterThan(0);
  });

  it('every log line is announced as an event (used for sound)', () => {
    newGame('clone', 3);
    const heard = [];
    const off = on('log', e => heard.push(e));
    log('Test alarm', 'bad');
    off();
    expect(heard).toEqual([{ m: 'Test alarm', c: 'bad' }]);
  });

  it('endTurn announces state changes through events, not UI calls', () => {
    newGame('clone');
    let changed = 0;
    const off = on('changed', () => changed++);
    endTurn();
    endTurn(true);
    off();
    expect(changed).toBe(1);
  });
});
