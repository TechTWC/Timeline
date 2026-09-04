import type { GeoPoint } from '../types';

export type ExplorationStatus = 'visited' | 'passed_nearby' | 'unvisited';

export interface SemanticVisit {
  startTime: Date;
  endTime: Date;
  durationMs: number;
  latitude: number;
  longitude: number;
  source: 'google-semantic-visit';
  placeId?: string;
  probability?: number;
}

export interface ExplorePoi {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  category?: string;
}

export interface ExplorationThresholds {
  visitedDistanceMeters: number;
  minimumVisitDurationMs: number;
  passedNearbyDistanceMeters: number;
}

export const DEFAULT_EXPLORATION_THRESHOLDS: Readonly<ExplorationThresholds> = Object.freeze({
  visitedDistanceMeters: 120,
  minimumVisitDurationMs: 5 * 60 * 1000,
  passedNearbyDistanceMeters: 250,
});

export interface ExplorationClassification {
  status: ExplorationStatus;
  nearestVisitDistanceMeters: number | null;
  nearestRouteDistanceMeters: number | null;
  matchedVisit: SemanticVisit | null;
}

export interface ExplorationInput {
  poi: ExplorePoi;
  visits: readonly SemanticVisit[];
  routePoints: readonly GeoPoint[];
}
