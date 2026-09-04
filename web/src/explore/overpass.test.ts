import { describe, expect, it } from 'vitest';
import {
  buildOverpassQuery,
  buildOverpassRequest,
  OverpassClient,
  OverpassError,
  parseOverpassResponse,
  validateBoundingBox,
} from './overpass';
import type { BoundingBox } from './types';

const bbox: BoundingBox = {
  south: 25.02,
  west: 121.50,
  north: 25.08,
  east: 121.58,
};

describe('Overpass query guard', () => {
  it('builds a bounded query for only the eligible Explore POI catalog', () => {
    const query = buildOverpassQuery(bbox);
    expect(query).toContain('25.020000,121.500000,25.080000,121.580000');
    expect(query).toContain('tourism');
    expect(query).toContain('leisure');
    expect(query).toContain('historic');
    expect(query).toContain('natural');
    expect(query).not.toContain('cafe');
    expect(query).not.toContain('restaurant');
  });

  it('rejects oversized and dateline-crossing bounding boxes', () => {
    expect(() => validateBoundingBox({
      south: 25,
      west: 121,
      north: 26,
      east: 121.1,
    })).toThrowError(expect.objectContaining({ code: 'bbox-too-large' }));
    expect(() => validateBoundingBox({
      south: 10,
      west: 179.9,
      north: 10.1,
      east: -179.9,
    })).toThrowError(expect.objectContaining({ code: 'invalid-bbox' }));
  });

  it('never incorporates Timeline coordinates or visits into the outbound request', () => {
    const pollutedInput = {
      ...bbox,
      timelineCoordinates: [[33.333333, 44.444444]],
      semanticVisits: [{ latitude: 55.555555, longitude: 66.666666 }],
    } as BoundingBox & {
      timelineCoordinates: number[][];
      semanticVisits: Array<{ latitude: number; longitude: number }>;
    };
    const request = buildOverpassRequest(pollutedInput);
    expect(request.query).not.toContain('33.333333');
    expect(request.query).not.toContain('44.444444');
    expect(request.query).not.toContain('55.555555');
    expect(request.query).not.toContain('66.666666');
    expect(String(request.init.body)).not.toContain('33.333333');
    expect(request.init.method).toBe('POST');
  });
});

describe('Overpass response normalization', () => {
  it('normalizes node, way, and relation POIs with stable OSM identities', () => {
    const pois = parseOverpassResponse({
      elements: [
        {
          type: 'node',
          id: 1,
          lat: 25.03,
          lon: 121.56,
          tags: { tourism: 'museum', name: 'Fictional Museum' },
        },
        {
          type: 'way',
          id: 2,
          center: { lat: 25.04, lon: 121.55 },
          tags: { leisure: 'park', name: 'Fictional Park' },
        },
        {
          type: 'relation',
          id: 3,
          center: { lat: 25.05, lon: 121.54 },
          tags: { historic: 'monument' },
        },
      ],
    });

    expect(pois).toEqual([
      expect.objectContaining({
        id: 'osm:node:1',
        name: 'Fictional Museum',
        category: 'museum',
        osm: { elementType: 'node', elementId: 1 },
      }),
      expect.objectContaining({
        id: 'osm:way:2',
        name: 'Fictional Park',
        category: 'park',
        osm: { elementType: 'way', elementId: 2 },
      }),
      expect.objectContaining({
        id: 'osm:relation:3',
        category: 'historic',
        osm: { elementType: 'relation', elementId: 3 },
      }),
    ]);
    expect(pois[2].name).toBeUndefined();
  });

  it('deduplicates OSM ids and drops unsupported or malformed elements', () => {
    const pois = parseOverpassResponse({
      elements: [
        { type: 'node', id: 10, lat: 25, lon: 121, tags: { tourism: 'viewpoint' } },
        { type: 'node', id: 10, lat: 25, lon: 121, tags: { tourism: 'viewpoint' } },
        { type: 'node', id: 11, lat: 25, lon: 121, tags: { amenity: 'cafe' } },
        { type: 'way', id: 12, tags: { leisure: 'garden' } },
        { type: 'node', id: -1, lat: 25, lon: 121, tags: { tourism: 'museum' } },
      ],
    });
    expect(pois).toHaveLength(1);
    expect(pois[0].id).toBe('osm:node:10');
  });

  it('rejects an unexpected provider response shape', () => {
    expect(() => parseOverpassResponse({ nope: [] })).toThrowError(
      expect.objectContaining({ code: 'invalid-response' }),
    );
  });
});

describe('OverpassClient', () => {
  it('surfaces HTTP failures without retrying', async () => {
    let calls = 0;
    const client = new OverpassClient({
      fetcher: async () => {
        calls += 1;
        return new Response('', { status: 503 });
      },
    });
    await expect(client.fetchPois(bbox)).rejects.toMatchObject({ code: 'http' });
    expect(calls).toBe(1);
  });

  it('surfaces non-JSON responses clearly', async () => {
    const client = new OverpassClient({
      fetcher: async () => new Response('not-json', { status: 200 }),
    });
    await expect(client.fetchPois(bbox)).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('allows only one active request at a time', async () => {
    let release: ((response: Response) => void) | null = null;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const client = new OverpassClient({ fetcher: async () => pending });
    const first = client.fetchPois(bbox);
    await expect(client.fetchPois(bbox)).rejects.toMatchObject({ code: 'request-active' });
    if (!release) throw new Error('Test response release was not initialized.');
    release(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    await expect(first).resolves.toEqual([]);
  });

  it('aborts a slow request when the configured timeout expires', async () => {
    const client = new OverpassClient({
      timeoutMs: 5,
      fetcher: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    });
    await expect(client.fetchPois(bbox)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('returns normalized POIs for a successful response', async () => {
    const client = new OverpassClient({
      fetcher: async () => new Response(JSON.stringify({
        elements: [{
          type: 'node',
          id: 99,
          lat: 25.03,
          lon: 121.56,
          tags: { tourism: 'attraction', name: 'Fictional Attraction' },
        }],
      }), { status: 200 }),
    });
    await expect(client.fetchPois(bbox)).resolves.toEqual([
      expect.objectContaining({ id: 'osm:node:99', category: 'attraction' }),
    ]);
  });
});

describe('OverpassError', () => {
  it('carries a stable machine-readable code', () => {
    expect(new OverpassError('network', 'example').code).toBe('network');
  });
});
