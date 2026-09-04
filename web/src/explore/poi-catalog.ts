export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

const TOURISM_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  attraction: 'attraction',
  museum: 'museum',
  gallery: 'gallery',
  viewpoint: 'viewpoint',
});

const LEISURE_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  park: 'park',
  garden: 'garden',
});

const NATURAL_CATEGORIES: Readonly<Record<string, string>> = Object.freeze({
  peak: 'natural_peak',
  waterfall: 'natural_waterfall',
  beach: 'natural_beach',
});

function stringTag(tags: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = tags[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function categoryForOsmTags(tags: Readonly<Record<string, unknown>>): string | null {
  const tourism = stringTag(tags, 'tourism');
  if (tourism && TOURISM_CATEGORIES[tourism]) return TOURISM_CATEGORIES[tourism];

  const leisure = stringTag(tags, 'leisure');
  if (leisure && LEISURE_CATEGORIES[leisure]) return LEISURE_CATEGORIES[leisure];

  const historic = stringTag(tags, 'historic');
  if (historic && historic !== 'no') return 'historic';

  const natural = stringTag(tags, 'natural');
  if (natural && NATURAL_CATEGORIES[natural]) return NATURAL_CATEGORIES[natural];

  return null;
}
