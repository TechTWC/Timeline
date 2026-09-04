import { describe, expect, it } from 'vitest';
import {
  exploreBoundingBox,
  EXPLORE_MAX_ZOOM,
  EXPLORE_MIN_ZOOM,
  mapWorldPoint,
  worldPointToLatLon,
} from './explore-map';

describe('Explore map geometry', () => {
  it('round-trips ordinary coordinates through Web Mercator', () => {
    const source = { latitude: 25.033, longitude: 121.5654 };
    const restored = worldPointToLatLon(mapWorldPoint(source.latitude, source.longitude));
    expect(restored.latitude).toBeCloseTo(source.latitude, 6);
    expect(restored.longitude).toBeCloseTo(source.longitude, 6);
  });

  it('produces a bounded current-area query at the minimum interactive zoom', () => {
    const bbox = exploreBoundingBox({ latitude: 25, longitude: 121, zoom: EXPLORE_MIN_ZOOM }, 620, 360);
    expect(bbox.north).toBeGreaterThan(bbox.south);
    expect(bbox.east).toBeGreaterThan(bbox.west);
    expect(bbox.east - bbox.west).toBeLessThan(0.5);
    expect(bbox.north - bbox.south).toBeLessThan(0.5);
  });

  it('clamps zoom inputs to the safe interactive range', () => {
    const tooWide = exploreBoundingBox({ latitude: 25, longitude: 121, zoom: -100 }, 620, 360);
    const minimum = exploreBoundingBox({ latitude: 25, longitude: 121, zoom: EXPLORE_MIN_ZOOM }, 620, 360);
    expect(tooWide).toEqual(minimum);

    const tooClose = exploreBoundingBox({ latitude: 25, longitude: 121, zoom: 100 }, 620, 360);
    const maximum = exploreBoundingBox({ latitude: 25, longitude: 121, zoom: EXPLORE_MAX_ZOOM }, 620, 360);
    expect(tooClose).toEqual(maximum);
  });

  it('surfaces a dateline-crossing viewport as west > east for the provider guard to reject', () => {
    const bbox = exploreBoundingBox({ latitude: 0, longitude: 179.99, zoom: EXPLORE_MIN_ZOOM }, 620, 360);
    expect(bbox.west).toBeGreaterThan(bbox.east);
  });
});
