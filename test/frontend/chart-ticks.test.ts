import { describe, expect, it } from 'vitest';
import { evenIndices } from '../../src/dashboard/lib/chartTicks';

describe('evenIndices', () => {
  it('returns every index when the series is short', () => {
    expect(evenIndices(4, 7)).toEqual([0, 1, 2, 3]);
  });
  it('always includes the first and last point, without neighbours crowding the end', () => {
    const ticks = evenIndices(31, 7);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(30);
    expect(ticks.length).toBe(7);
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(4);
  });
  it('dedupes when rounding would collide', () => {
    expect(evenIndices(3, 10)).toEqual([0, 1, 2]);
  });
});
