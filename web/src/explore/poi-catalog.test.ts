import { describe, expect, it } from 'vitest';
import { categoryForOsmTags, OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from './poi-catalog';

describe('Explore OSM POI catalog', () => {
  it('maps only the focused exploration categories', () => {
    expect(categoryForOsmTags({ tourism: 'museum' })).toBe('museum');
    expect(categoryForOsmTags({ leisure: 'garden' })).toBe('garden');
    expect(categoryForOsmTags({ historic: 'castle' })).toBe('historic');
    expect(categoryForOsmTags({ natural: 'waterfall' })).toBe('natural_waterfall');
    expect(categoryForOsmTags({ amenity: 'cafe' })).toBeNull();
    expect(categoryForOsmTags({ shop: 'supermarket' })).toBeNull();
    expect(categoryForOsmTags({ historic: 'no' })).toBeNull();
  });

  it('pins the required OpenStreetMap attribution and license destination', () => {
    expect(OSM_ATTRIBUTION).toBe('© OpenStreetMap contributors');
    expect(OSM_COPYRIGHT_URL).toBe('https://www.openstreetmap.org/copyright');
  });
});
