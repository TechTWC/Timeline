import { describe, expect, it } from 'vitest';
import { coordinateDistanceMeters } from './classifier';
import {
  classifyExplorePois,
  filterClassifiedPois,
  nearestRoutePoint,
  summarizeExploration,
} from './analysis';
import type { OsmExplorePoi, SemanticVisit } from './types';
import type { GeoPoint } from '../types';

function poi(id: number, latitude: number): OsmExplorePoi {
  return {
    id: `osm:node:${id}`,
    latitude,
    longitude: 121,
    category: 'attraction',
    osm: { elementType: 'node', elementId: id },
  };
}

const route: GeoPoint[] = [
  { instant: new Date('2026-01-01T00:00:00Z'), latitude: 25.001, longitude: 121 },
];
const visits: SemanticVisit[] = [{
  startTime: new Date('2026-01-01T00:00:00Z'),
  endTime: new Date('2026-01-01T00:10:00Z'),
  durationMs: 10 * 60 * 1000,
  latitude: 25,
  longitude: 121,
  source: 'google-semantic-visit',
}];

describe('Explore analysis', () => {
  it('classifies and summarizes eligible POIs without creating a score', () => {
    const items = classifyExplorePois([
      poi(1, 25),
      poi(2, 25.001),
      poi(3, 25.01),
    ], visits, route);
    expect(items.map((item) => item.classification.status)).toEqual([
      'visited',
      'passed_nearby',
      'unvisited',
    ]);
    expect(summarizeExploration(items)).toEqual({
      total: 3,
      visited: 1,
      passedNearby: 1,
      unvisited: 1,
    });
  });

  it('filters statuses locally without changing classifications', () => {
    const items = classifyExplorePois([poi(1, 25), poi(2, 25.01)], visits, route);
    expect(filterClassifiedPois(items, new Set(['unvisited']))).toHaveLength(1);
    expect(items).toHaveLength(2);
  });

  it('finds the nearest local route evidence point', () => {
    const target = poi(1, 25.0009);
    const nearest = nearestRoutePoint(target, route, coordinateDistanceMeters);
    expect(nearest?.instant.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
