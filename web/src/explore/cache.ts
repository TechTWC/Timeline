import { OVERPASS_QUERY_VERSION, validateBoundingBox } from './overpass';
import type { BoundingBox, OsmElementType, OsmExplorePoi } from './types';

export const DEFAULT_POI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_NAMESPACE = 'timeline-explore-pois';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CachePayload {
  expiresAt: number;
  pois: OsmExplorePoi[];
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function elementType(value: unknown): value is OsmElementType {
  return value === 'node' || value === 'way' || value === 'relation';
}

function cachedPoi(value: unknown): value is OsmExplorePoi {
  if (!isObject(value) || !isObject(value.osm)) return false;
  return typeof value.id === 'string'
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && typeof value.osm.elementId === 'number'
    && Number.isSafeInteger(value.osm.elementId)
    && elementType(value.osm.elementType);
}

function cachePayload(value: unknown): value is CachePayload {
  return isObject(value)
    && typeof value.expiresAt === 'number'
    && Number.isFinite(value.expiresAt)
    && Array.isArray(value.pois)
    && value.pois.every(cachedPoi);
}

function bboxKey(bbox: BoundingBox): string {
  validateBoundingBox(bbox);
  return [bbox.south, bbox.west, bbox.north, bbox.east]
    .map((value) => value.toFixed(6))
    .join(',');
}

export function poiCacheKey(bbox: BoundingBox): string {
  return `${CACHE_NAMESPACE}:${OVERPASS_QUERY_VERSION}:${bboxKey(bbox)}`;
}

export class PoiCache {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly ttlMs = DEFAULT_POI_CACHE_TTL_MS,
  ) {}

  read(bbox: BoundingBox, now = Date.now()): OsmExplorePoi[] | null {
    const key = poiCacheKey(bbox);
    const raw = this.storage.getItem(key);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.storage.removeItem(key);
      return null;
    }
    if (!cachePayload(parsed) || parsed.expiresAt <= now) {
      this.storage.removeItem(key);
      return null;
    }
    return parsed.pois;
  }

  write(bbox: BoundingBox, pois: readonly OsmExplorePoi[], now = Date.now()): void {
    const payload: CachePayload = {
      expiresAt: now + Math.max(0, this.ttlMs),
      pois: [...pois],
    };
    this.storage.setItem(poiCacheKey(bbox), JSON.stringify(payload));
  }

  clear(bbox: BoundingBox): void {
    this.storage.removeItem(poiCacheKey(bbox));
  }
}
