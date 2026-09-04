import { describe, expect, it } from 'vitest';
import { PoiCache, poiCacheKey, type KeyValueStorage } from './cache';
import type { BoundingBox, OsmExplorePoi } from './types';

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const bbox: BoundingBox = {
  south: 25.02,
  west: 121.50,
  north: 25.08,
  east: 121.58,
};

const poi: OsmExplorePoi = {
  id: 'osm:node:1',
  latitude: 25.03,
  longitude: 121.56,
  name: 'Fictional Museum',
  category: 'museum',
  osm: {
    elementType: 'node',
    elementId: 1,
  },
};

describe('PoiCache', () => {
  it('stores and returns normalized POIs using a bbox and query-version key', () => {
    const storage = new MemoryStorage();
    const cache = new PoiCache(storage, 1_000);
    expect(cache.read(bbox, 100)).toBeNull();
    cache.write(bbox, [poi], 100);
    expect(cache.read(bbox, 500)).toEqual([poi]);
    expect(poiCacheKey(bbox)).toContain('explore-pois-v1');
  });

  it('expires stale entries and removes them from browser-local storage', () => {
    const storage = new MemoryStorage();
    const cache = new PoiCache(storage, 100);
    cache.write(bbox, [poi], 1_000);
    const key = poiCacheKey(bbox);
    expect(storage.values.has(key)).toBe(true);
    expect(cache.read(bbox, 1_101)).toBeNull();
    expect(storage.values.has(key)).toBe(false);
  });

  it('clears the selected-area cache explicitly', () => {
    const storage = new MemoryStorage();
    const cache = new PoiCache(storage);
    cache.write(bbox, [poi], 100);
    cache.clear(bbox);
    expect(cache.read(bbox, 101)).toBeNull();
  });

  it('drops corrupt cache payloads instead of surfacing them', () => {
    const storage = new MemoryStorage();
    const key = poiCacheKey(bbox);
    storage.setItem(key, '{bad json');
    const cache = new PoiCache(storage);
    expect(cache.read(bbox)).toBeNull();
    expect(storage.values.has(key)).toBe(false);
  });

  it('serializes only POI cache data and never Timeline history', () => {
    const storage = new MemoryStorage();
    const cache = new PoiCache(storage);
    cache.write(bbox, [poi], 100);
    const raw = storage.getItem(poiCacheKey(bbox)) ?? '';
    expect(raw).toContain('osm:node:1');
    expect(raw).not.toContain('semanticVisits');
    expect(raw).not.toContain('timelineCoordinates');
    expect(raw).not.toContain('rawSignals');
  });
});
