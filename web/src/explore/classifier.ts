import type { GeoPoint } from '../types';
import {
  DEFAULT_EXPLORATION_THRESHOLDS,
  type ExplorationClassification,
  type ExplorationInput,
  type ExplorationThresholds,
  type ExplorePoi,
  type SemanticVisit,
} from './types';

interface Coordinate {
  latitude: number;
  longitude: number;
}

function validCoordinate(point: Coordinate): boolean {
  return Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && point.latitude >= -90
    && point.latitude <= 90
    && point.longitude >= -180
    && point.longitude <= 180;
}

export function coordinateDistanceMeters(a: Coordinate, b: Coordinate): number {
  if (!validCoordinate(a) || !validCoordinate(b)) return Infinity;
  const toRadians = Math.PI / 180;
  const lat1 = a.latitude * toRadians;
  const lat2 = b.latitude * toRadians;
  const dLat = lat2 - lat1;
  const rawDLon = (b.longitude - a.longitude) * toRadians;
  const dLon = Math.atan2(Math.sin(rawDLon), Math.cos(rawDLon));
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestDistanceMeters(
  poi: ExplorePoi,
  points: readonly Coordinate[],
): number | null {
  let nearest = Infinity;
  for (const point of points) {
    const distance = coordinateDistanceMeters(poi, point);
    if (distance < nearest) nearest = distance;
  }
  return Number.isFinite(nearest) ? nearest : null;
}

function nearestQualifyingVisit(
  poi: ExplorePoi,
  visits: readonly SemanticVisit[],
  thresholds: Readonly<ExplorationThresholds>,
): { visit: SemanticVisit; distanceMeters: number } | null {
  let match: { visit: SemanticVisit; distanceMeters: number } | null = null;
  for (const visit of visits) {
    if (visit.durationMs < thresholds.minimumVisitDurationMs) continue;
    const distanceMeters = coordinateDistanceMeters(poi, visit);
    if (distanceMeters > thresholds.visitedDistanceMeters) continue;
    if (!match || distanceMeters < match.distanceMeters) match = { visit, distanceMeters };
  }
  return match;
}

export function classifyExploration(
  input: ExplorationInput,
  thresholds: Readonly<ExplorationThresholds> = DEFAULT_EXPLORATION_THRESHOLDS,
): ExplorationClassification {
  const visitMatch = nearestQualifyingVisit(input.poi, input.visits, thresholds);
  const nearestVisitDistanceMeters = nearestDistanceMeters(input.poi, input.visits);
  const nearestRouteDistanceMeters = nearestDistanceMeters(input.poi, input.routePoints);

  if (visitMatch) {
    return {
      status: 'visited',
      nearestVisitDistanceMeters,
      nearestRouteDistanceMeters,
      matchedVisit: visitMatch.visit,
    };
  }

  if (
    nearestRouteDistanceMeters !== null
    && nearestRouteDistanceMeters <= thresholds.passedNearbyDistanceMeters
  ) {
    return {
      status: 'passed_nearby',
      nearestVisitDistanceMeters,
      nearestRouteDistanceMeters,
      matchedVisit: null,
    };
  }

  return {
    status: 'unvisited',
    nearestVisitDistanceMeters,
    nearestRouteDistanceMeters,
    matchedVisit: null,
  };
}

export function routePointsFromGeoPoints(points: readonly GeoPoint[]): readonly GeoPoint[] {
  return points;
}
