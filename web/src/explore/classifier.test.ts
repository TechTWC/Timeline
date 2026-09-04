import { describe, expect, it } from 'vitest';
import { classifyExploration, coordinateDistanceMeters } from './classifier';
import type { ExplorePoi, SemanticVisit } from './types';
import type { GeoPoint } from '../types';

const poi: ExplorePoi = {
  id: 'fictional-poi',
  name: 'Fictional Garden',
  latitude: 25,
  longitude: 121,
};

function visit(
  latitude: number,
  longitude: number,
  durationMinutes: number,
): SemanticVisit {
  const startTime = new Date('2026-06-01T10:00:00Z');
  return {
    startTime,
    endTime: new Date(startTime.getTime() + durationMinutes * 60 * 1000),
    durationMs: durationMinutes * 60 * 1000,
    latitude,
    longitude,
    source: 'google-semantic-visit',
  };
}

function routePoint(latitude: number, longitude: number): GeoPoint {
  return {
    instant: new Date('2026-06-01T10:00:00Z'),
    latitude,
    longitude,
  };
}

describe('classifyExploration', () => {
  it('classifies a 30-minute semantic visit about 30 m from the POI as visited', () => {
    const result = classifyExploration({
      poi,
      visits: [visit(25.00027, 121, 30)],
      routePoints: [],
    });
    expect(result.status).toBe('visited');
    expect(result.matchedVisit?.durationMs).toBe(30 * 60 * 1000);
    expect(result.nearestVisitDistanceMeters).toBeLessThan(40);
  });

  it('classifies a route about 80 m away with no semantic visit as passed nearby', () => {
    const result = classifyExploration({
      poi,
      visits: [],
      routePoints: [routePoint(25.00072, 121)],
    });
    expect(result.status).toBe('passed_nearby');
    expect(result.nearestRouteDistanceMeters).toBeLessThan(100);
  });

  it('classifies a POI with no nearby visit or route as unvisited', () => {
    const result = classifyExploration({
      poi,
      visits: [visit(25.02, 121, 30)],
      routePoints: [routePoint(25.02, 121)],
    });
    expect(result.status).toBe('unvisited');
  });

  it('does not treat a two-minute semantic visit as visited', () => {
    const result = classifyExploration({
      poi,
      visits: [visit(25, 121, 2)],
      routePoints: [],
    });
    expect(result.status).toBe('unvisited');
    expect(result.matchedVisit).toBeNull();
  });

  it('gives a qualifying semantic visit precedence over a nearby route', () => {
    const result = classifyExploration({
      poi,
      visits: [visit(25, 121, 10)],
      routePoints: [routePoint(25.0005, 121)],
    });
    expect(result.status).toBe('visited');
  });

  it('treats thresholds as configurable and inclusive at the boundary', () => {
    const result = classifyExploration({
      poi,
      visits: [visit(25, 121, 5)],
      routePoints: [],
    }, {
      visitedDistanceMeters: 0,
      minimumVisitDurationMs: 5 * 60 * 1000,
      passedNearbyDistanceMeters: 0,
    });
    expect(result.status).toBe('visited');
  });

  it('fails closed on invalid route coordinates instead of crashing', () => {
    const result = classifyExploration({
      poi,
      visits: [],
      routePoints: [routePoint(Number.NaN, 121)],
    });
    expect(result.status).toBe('unvisited');
    expect(result.nearestRouteDistanceMeters).toBeNull();
  });

  it('measures nearby points correctly across the international date line', () => {
    const dateLinePoi: ExplorePoi = {
      id: 'date-line-poi',
      latitude: 0,
      longitude: 179.9995,
    };
    const route = routePoint(0, -179.9995);
    expect(coordinateDistanceMeters(dateLinePoi, route)).toBeLessThan(120);
    expect(classifyExploration({
      poi: dateLinePoi,
      visits: [],
      routePoints: [route],
    }, {
      visitedDistanceMeters: 120,
      minimumVisitDurationMs: 5 * 60 * 1000,
      passedNearbyDistanceMeters: 150,
    }).status).toBe('passed_nearby');
  });
});
