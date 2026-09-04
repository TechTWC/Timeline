import { parseCoordinate } from '../timeline';
import type { SemanticVisit } from './types';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const raw = value.trim();
  const timeZoneMissing = !/(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const instant = new Date(timeZoneMissing ? `${raw}Z` : raw);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function readOptionalProbability(value: unknown): number | undefined {
  const probability = typeof value === 'string' ? Number(value) : value;
  return typeof probability === 'number' && Number.isFinite(probability) ? probability : undefined;
}

function semanticSegments(data: unknown): readonly unknown[] {
  if (Array.isArray(data)) return data;
  if (isObject(data) && Array.isArray(data.semanticSegments)) return data.semanticSegments;
  return [];
}

function visitKey(visit: SemanticVisit): string {
  return [
    visit.startTime.getTime(),
    visit.endTime.getTime(),
    visit.latitude,
    visit.longitude,
  ].join(':');
}

/**
 * Extracts Google Timeline semantic visits without changing the Journey parser contract.
 * Invalid or incomplete visits are skipped so Explore analysis cannot break Timeline playback.
 */
export function parseSemanticVisits(data: unknown): SemanticVisit[] {
  const unique = new Map<string, SemanticVisit>();
  for (const rawSegment of semanticSegments(data)) {
    if (!isObject(rawSegment) || !isObject(rawSegment.visit)) continue;
    const visit = rawSegment.visit;
    if (!isObject(visit.topCandidate)) continue;
    const candidate = visit.topCandidate;

    const startTime = parseInstant(rawSegment.startTime);
    const endTime = parseInstant(rawSegment.endTime);
    const coordinate = parseCoordinate(candidate.placeLocation);
    if (!startTime || !endTime || !coordinate) continue;

    const durationMs = endTime.getTime() - startTime.getTime();
    if (durationMs < 0) continue;

    const parsed: SemanticVisit = {
      startTime,
      endTime,
      durationMs,
      latitude: coordinate[0],
      longitude: coordinate[1],
      source: 'google-semantic-visit',
      placeId: readOptionalString(candidate.placeId),
      probability: readOptionalProbability(candidate.probability),
    };
    const key = visitKey(parsed);
    const previous = unique.get(key);
    if (!previous || (parsed.probability ?? -Infinity) > (previous.probability ?? -Infinity)) {
      unique.set(key, parsed);
    }
  }
  return [...unique.values()];
}
