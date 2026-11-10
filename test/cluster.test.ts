import { describe, expect, it } from 'vitest';
import { clusterLive, clusterThreshold } from '../src/dashboard/map/cluster';

describe('live marker clustering', () => {
  it('groups nearby points and leaves a highlighted visitor alone', () => {
    const pts = [
      { key: 'a', lon: 2, lat: 48, x: 10, y: 10 },
      { key: 'b', lon: 2.01, lat: 48, x: 18, y: 12 },
      { key: 'c', lon: 10, lat: 50, x: 400, y: 200, highlight: true },
    ];
    const groups = clusterLive(pts, 20);
    const cluster = groups.find((g) => g.type === 'cluster');
    const alone = groups.find((g) => g.type === 'point' && g.key === 'c');
    expect(cluster?.type === 'cluster' && cluster.count).toBe(2);
    expect(cluster && cluster.type === 'cluster' && cluster.keys.sort()).toEqual(['a', 'b']);
    expect(alone?.type).toBe('point');
  });
  it('expands when the zoom threshold shrinks', () => {
    const pts = [
      { key: 'a', lon: 2, lat: 48, x: 10, y: 10 },
      { key: 'b', lon: 2, lat: 48, x: 40, y: 10 },
    ];
    expect(clusterLive(pts, 40).some((g) => g.type === 'cluster')).toBe(true);
    expect(clusterLive(pts, 10).every((g) => g.type === 'point')).toBe(true);
    expect(clusterThreshold(1)).toBeGreaterThan(clusterThreshold(12));
  });
});
