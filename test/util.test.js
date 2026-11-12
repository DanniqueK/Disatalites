import { describe, expect, it } from 'vitest';
import { cheb, clamp, esc, idx, inB, pickW } from '../src/core/util.js';
import { WH, WW } from '../src/core/constants.js';

describe('util', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('cheb is the Chebyshev distance', () => {
    expect(cheb(0, 0, 3, -2)).toBe(3);
    expect(cheb(4, 4, 4, 4)).toBe(0);
  });

  it('idx and inB agree with the world size', () => {
    expect(idx(0, 1)).toBe(WW);
    expect(inB(WW - 1, WH - 1)).toBe(true);
    expect(inB(WW, 0)).toBe(false);
    expect(inB(0, -1)).toBe(false);
  });

  it('esc escapes HTML', () => {
    expect(esc('<b a="1">&')).toBe('&lt;b a=&quot;1&quot;&gt;&amp;');
  });

  it('pickW never picks a zero-weight item and returns null when all weights are zero', () => {
    for (let n = 0; n < 200; n++) expect(pickW(['a', 'b', 'c'], k => (k === 'b' ? 1 : 0))).toBe('b');
    expect(pickW(['a'], () => 0)).toBeNull();
  });
});
