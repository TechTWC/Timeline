import { describe, expect, it } from 'vitest';
import { parseSemanticVisits } from './visits';

describe('parseSemanticVisits', () => {
  it('preserves semantic visit interval, location, and optional candidate metadata', () => {
    const visits = parseSemanticVisits({
      semanticSegments: [{
        startTime: '2026-06-01T10:00:00Z',
        endTime: '2026-06-01T10:30:00Z',
        visit: {
          topCandidate: {
            placeLocation: '25.0330,121.5654',
            placeId: 'fictional-place-1',
            probability: '0.9',
          },
        },
      }],
    });

    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({
      durationMs: 30 * 60 * 1000,
      latitude: 25.033,
      longitude: 121.5654,
      source: 'google-semantic-visit',
      placeId: 'fictional-place-1',
      probability: 0.9,
    });
    expect(visits[0].startTime.toISOString()).toBe('2026-06-01T10:00:00.000Z');
    expect(visits[0].endTime.toISOString()).toBe('2026-06-01T10:30:00.000Z');
  });

  it('supports direct semantic-segment arrays', () => {
    const visits = parseSemanticVisits([{
      startTime: '2026-06-02T10:00:00Z',
      endTime: '2026-06-02T10:10:00Z',
      visit: { topCandidate: { placeLocation: '35.0,139.0' } },
    }]);
    expect(visits).toHaveLength(1);
  });

  it('skips malformed, incomplete, invalid-coordinate, and reversed visits', () => {
    const visits = parseSemanticVisits({
      semanticSegments: [
        {
          startTime: '2026-06-01T10:00:00Z',
          visit: { topCandidate: { placeLocation: '25,121' } },
        },
        {
          startTime: 'not-a-time',
          endTime: '2026-06-01T10:30:00Z',
          visit: { topCandidate: { placeLocation: '25,121' } },
        },
        {
          startTime: '2026-06-01T10:00:00Z',
          endTime: '2026-06-01T10:30:00Z',
          visit: { topCandidate: { placeLocation: '91,121' } },
        },
        {
          startTime: '2026-06-01T11:00:00Z',
          endTime: '2026-06-01T10:30:00Z',
          visit: { topCandidate: { placeLocation: '25,121' } },
        },
      ],
    });
    expect(visits).toEqual([]);
  });

  it('deduplicates identical visits and keeps the stronger candidate metadata', () => {
    const visits = parseSemanticVisits({
      semanticSegments: [
        {
          startTime: '2026-06-01T10:00:00Z',
          endTime: '2026-06-01T10:30:00Z',
          visit: { topCandidate: { placeLocation: '25,121', placeId: 'low', probability: 0.2 } },
        },
        {
          startTime: '2026-06-01T10:00:00Z',
          endTime: '2026-06-01T10:30:00Z',
          visit: { topCandidate: { placeLocation: '25,121', placeId: 'high', probability: 0.8 } },
        },
      ],
    });
    expect(visits).toHaveLength(1);
    expect(visits[0].placeId).toBe('high');
    expect(visits[0].probability).toBe(0.8);
  });
});
