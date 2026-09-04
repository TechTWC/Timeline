import { classifyExploration } from './classifier';
import type {
  ExplorationClassification,
  ExplorationStatus,
  OsmExplorePoi,
  SemanticVisit,
} from './types';
import type { GeoPoint } from '../types';

export interface ClassifiedPoi {
  poi: OsmExplorePoi;
  classification: ExplorationClassification;
}

export interface ExplorationSummary {
  total: number;
  visited: number;
  passedNearby: number;
  unvisited: number;
}

export function classifyExplorePois(
  pois: readonly OsmExplorePoi[],
  visits: readonly SemanticVisit[],
  routePoints: readonly GeoPoint[],
): ClassifiedPoi[] {
  return pois.map((poi) => ({
    poi,
    classification: classifyExploration({ poi, visits, routePoints }),
  }));
}

export function summarizeExploration(items: readonly ClassifiedPoi[]): ExplorationSummary {
  const summary: ExplorationSummary = {
    total: items.length,
    visited: 0,
    passedNearby: 0,
    unvisited: 0,
  };
  for (const item of items) {
    switch (item.classification.status) {
      case 'visited':
        summary.visited += 1;
        break;
      case 'passed_nearby':
        summary.passedNearby += 1;
        break;
      case 'unvisited':
        summary.unvisited += 1;
        break;
    }
  }
  return summary;
}

export function filterClassifiedPois(
  items: readonly ClassifiedPoi[],
  visible: ReadonlySet<ExplorationStatus>,
): ClassifiedPoi[] {
  return items.filter((item) => visible.has(item.classification.status));
}

export function nearestRoutePoint(
  poi: OsmExplorePoi,
  routePoints: readonly GeoPoint[],
  distanceMeters: (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => number,
): GeoPoint | null {
  let nearest: GeoPoint | null = null;
  let best = Infinity;
  for (const point of routePoints) {
    const distance = distanceMeters(poi, point);
    if (distance < best) {
      best = distance;
      nearest = point;
    }
  }
  return nearest;
}
