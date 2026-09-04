import { categoryForOsmTags } from './poi-catalog';
import type { BoundingBox, OsmElementType, OsmExplorePoi } from './types';

export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_QUERY_VERSION = 'explore-pois-v1';
export const MAX_BBOX_LATITUDE_SPAN = 0.5;
export const MAX_BBOX_LONGITUDE_SPAN = 0.5;
export const DEFAULT_OVERPASS_TIMEOUT_MS = 20_000;

export type OverpassErrorCode =
  | 'invalid-bbox'
  | 'bbox-too-large'
  | 'request-active'
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'http'
  | 'invalid-response';

export class OverpassError extends Error {
  constructor(
    public readonly code: OverpassErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OverpassError';
  }
}

export interface OverpassRequest {
  url: string;
  init: RequestInit;
  query: string;
}

interface OverpassClientOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -85.05112878 && value <= 85.05112878;
}

function validLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function validateBoundingBox(bbox: BoundingBox): void {
  if (
    !validLatitude(bbox.south)
    || !validLatitude(bbox.north)
    || !validLongitude(bbox.west)
    || !validLongitude(bbox.east)
    || bbox.south >= bbox.north
    || bbox.west >= bbox.east
  ) {
    throw new OverpassError(
      'invalid-bbox',
      'The selected map area must be a finite non-dateline-crossing bounding box.',
    );
  }
  if (
    bbox.north - bbox.south > MAX_BBOX_LATITUDE_SPAN
    || bbox.east - bbox.west > MAX_BBOX_LONGITUDE_SPAN
  ) {
    throw new OverpassError(
      'bbox-too-large',
      'The selected map area is too large for the public Explore POI query.',
    );
  }
}

function queryCoordinate(value: number): string {
  return value.toFixed(6);
}

export function buildOverpassQuery(bbox: BoundingBox, timeoutSeconds = 20): string {
  validateBoundingBox(bbox);
  const safeTimeout = Math.max(1, Math.min(60, Math.ceil(timeoutSeconds)));
  const bounds = [bbox.south, bbox.west, bbox.north, bbox.east]
    .map(queryCoordinate)
    .join(',');
  return [
    `[out:json][timeout:${safeTimeout}];`,
    '(',
    `  nwr["tourism"~"^(attraction|museum|gallery|viewpoint)$"](${bounds});`,
    `  nwr["leisure"~"^(park|garden)$"](${bounds});`,
    `  nwr["historic"]["historic"!="no"](${bounds});`,
    `  nwr["natural"~"^(peak|waterfall|beach)$"](${bounds});`,
    ');',
    'out center;',
  ].join('\n');
}

export function buildOverpassRequest(
  bbox: BoundingBox,
  endpoint = OVERPASS_ENDPOINT,
  timeoutSeconds = 20,
): OverpassRequest {
  const query = buildOverpassQuery(bbox, timeoutSeconds);
  return {
    url: endpoint,
    query,
    init: {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: `data=${encodeURIComponent(query)}`,
    },
  };
}

function elementType(value: unknown): OsmElementType | null {
  return value === 'node' || value === 'way' || value === 'relation' ? value : null;
}

function elementId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function coordinateFromElement(element: JsonObject, type: OsmElementType): [number, number] | null {
  const source = type === 'node' ? element : element.center;
  if (!isObject(source)) return null;
  const latitude = source.lat;
  const longitude = source.lon;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!validLatitude(latitude) || !validLongitude(longitude)) return null;
  return [latitude, longitude];
}

function normalizedName(tags: Readonly<Record<string, unknown>>): string | undefined {
  const name = tags.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined;
}

function normalizeElement(value: unknown): OsmExplorePoi | null {
  if (!isObject(value)) return null;
  const type = elementType(value.type);
  const id = elementId(value.id);
  if (!type || id === null) return null;
  const coordinate = coordinateFromElement(value, type);
  if (!coordinate) return null;
  const tags = isObject(value.tags) ? value.tags : {};
  const category = categoryForOsmTags(tags);
  if (!category) return null;
  return {
    id: `osm:${type}:${id}`,
    latitude: coordinate[0],
    longitude: coordinate[1],
    name: normalizedName(tags),
    category,
    osm: {
      elementType: type,
      elementId: id,
    },
  };
}

export function parseOverpassResponse(data: unknown): OsmExplorePoi[] {
  if (!isObject(data) || !Array.isArray(data.elements)) {
    throw new OverpassError('invalid-response', 'Overpass returned an unexpected response shape.');
  }
  const unique = new Map<string, OsmExplorePoi>();
  for (const element of data.elements) {
    const poi = normalizeElement(element);
    if (poi) unique.set(poi.id, poi);
  }
  return [...unique.values()];
}

export class OverpassClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  private activeController: AbortController | null = null;

  constructor(options: OverpassClientOptions = {}) {
    this.endpoint = options.endpoint ?? OVERPASS_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_OVERPASS_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  async fetchPois(bbox: BoundingBox, signal?: AbortSignal): Promise<OsmExplorePoi[]> {
    if (this.activeController) {
      throw new OverpassError('request-active', 'An Explore POI request is already in progress.');
    }
    const controller = new AbortController();
    this.activeController = controller;
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const forwardAbort = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const request = buildOverpassRequest(
        bbox,
        this.endpoint,
        Math.ceil(this.timeoutMs / 1000),
      );
      const response = await this.fetcher(request.url, {
        ...request.init,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new OverpassError('http', `Overpass request failed with HTTP ${response.status}.`);
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new OverpassError('invalid-response', 'Overpass returned non-JSON content.');
      }
      return parseOverpassResponse(data);
    } catch (error) {
      if (controller.signal.aborted) {
        if (timedOut) throw new OverpassError('timeout', 'The Explore POI request timed out.');
        throw new OverpassError('aborted', 'The Explore POI request was cancelled.');
      }
      if (error instanceof OverpassError) throw error;
      throw new OverpassError('network', 'The Explore POI request could not reach the provider.');
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', forwardAbort);
      this.activeController = null;
    }
  }
}
