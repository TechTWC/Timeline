import { filterLocationOutliers } from './outlier';
import {
  parseRawSignalsJson,
  parseTimelineJson,
  processRawSignals,
  TimelineParseError,
} from './timeline';
import type { GeoPoint } from './types';
import {
  classifyExplorePois,
  nearestRoutePoint,
  summarizeExploration,
  type ClassifiedPoi,
} from './explore/analysis';
import { PoiCache, type KeyValueStorage } from './explore/cache';
import { coordinateDistanceMeters } from './explore/classifier';
import { ExploreMap } from './explore/explore-map';
import { OverpassClient, OverpassError } from './explore/overpass';
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from './explore/poi-catalog';
import { ExploreExternalAccessGate } from './explore/privacy';
import type { ExplorationStatus, SemanticVisit } from './explore/types';
import { parseSemanticVisits } from './explore/visits';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing Explore element #${id}`);
  return found as T;
}

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function safeStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    const probe = '__timeline_explore_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return new MemoryStorage();
  }
}

const fileInput = element<HTMLInputElement>('timeline-file');
const sampleButton = element<HTMLButtonElement>('sample-button');
const card = element<HTMLElement>('explore-card');
const mapRoot = element<HTMLElement>('explore-map');
const consent = element<HTMLInputElement>('explore-consent');
const searchButton = element<HTMLButtonElement>('explore-search');
const zoomIn = element<HTMLButtonElement>('explore-zoom-in');
const zoomOut = element<HTMLButtonElement>('explore-zoom-out');
const statusText = element<HTMLParagraphElement>('explore-status');
const summaryText = element<HTMLParagraphElement>('explore-summary');
const details = element<HTMLElement>('explore-details');
const attributionLink = element<HTMLAnchorElement>('explore-osm-attribution');
const filterVisited = element<HTMLInputElement>('explore-filter-visited');
const filterPassed = element<HTMLInputElement>('explore-filter-passed');
const filterUnvisited = element<HTMLInputElement>('explore-filter-unvisited');

attributionLink.textContent = OSM_ATTRIBUTION;
attributionLink.href = OSM_COPYRIGHT_URL;

let routePoints: GeoPoint[] = [];
let semanticVisits: SemanticVisit[] = [];
let classified: ClassifiedPoi[] = [];
let lastQueryCompleted = false;
let queryController: AbortController | null = null;
let queryInProgress = false;
const gate = new ExploreExternalAccessGate();
const client = new OverpassClient();
const cache = new PoiCache(safeStorage());

const map = new ExploreMap(mapRoot, {
  onViewChange: () => {
    if (lastQueryCompleted) {
      statusText.textContent = 'Map moved · 地圖已移動，請按「搜尋目前區域」更新結果。';
    }
  },
  onMarkerSelect: (item) => renderDetails(item),
});

function currentVisibleStatuses(): Set<ExplorationStatus> {
  const visible = new Set<ExplorationStatus>();
  if (filterVisited.checked) visible.add('visited');
  if (filterPassed.checked) visible.add('passed_nearby');
  if (filterUnvisited.checked) visible.add('unvisited');
  return visible;
}

function applyStatusFilters(): void {
  map.setVisibleStatuses(currentVisibleStatuses());
}

function statusLabel(status: ExplorationStatus): string {
  switch (status) {
    case 'visited': return 'Visited · 已探索';
    case 'passed_nearby': return 'Passed nearby · 曾經過附近';
    case 'unvisited': return 'Unvisited · 尚未探索';
  }
}

function formatMeters(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} m`;
}

function formatDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  return `${minutes} min`;
}

function renderDetails(item: ClassifiedPoi): void {
  const nearest = nearestRoutePoint(item.poi, routePoints, coordinateDistanceMeters);
  const visit = item.classification.matchedVisit;
  details.classList.remove('hidden');
  details.replaceChildren();

  const heading = document.createElement('strong');
  heading.textContent = item.poi.name ?? item.poi.category ?? 'OpenStreetMap place';
  const status = document.createElement('p');
  status.textContent = statusLabel(item.classification.status);
  const category = document.createElement('p');
  category.textContent = `Category · 類別: ${item.poi.category ?? '—'}`;
  const route = document.createElement('p');
  route.textContent = `Closest route · 最近軌跡: ${formatMeters(item.classification.nearestRouteDistanceMeters)}`;
  details.append(heading, status, category, route);

  if (nearest) {
    const date = document.createElement('p');
    date.textContent = `Nearby date · 鄰近日期: ${nearest.instant.toLocaleDateString()}`;
    details.append(date);
  }
  if (visit) {
    const duration = document.createElement('p');
    duration.textContent = `Matched visit · 停留: ${formatDuration(visit.durationMs)} · ${visit.startTime.toLocaleDateString()}`;
    details.append(duration);
  }
}

function renderSummary(): void {
  const summary = summarizeExploration(classified);
  if (summary.total === 0) {
    summaryText.textContent = 'No eligible POIs found in this queried area · 此區域沒有符合 v0.1 條件的探索地點。';
    return;
  }
  summaryText.textContent = [
    `${summary.visited} / ${summary.total} eligible POIs visited`,
    `${summary.passedNearby} passed nearby`,
    `${summary.unvisited} unvisited`,
  ].join(' · ');
}

function resetResults(): void {
  queryController?.abort();
  queryController = null;
  queryInProgress = false;
  classified = [];
  lastQueryCompleted = false;
  map.setMarkers([]);
  details.classList.add('hidden');
  details.replaceChildren();
  summaryText.textContent = 'Move the map, then search the current area · 移動地圖後搜尋目前區域。';
  statusText.textContent = '';
  refreshSearchAvailability();
}

function refreshSearchAvailability(): void {
  searchButton.disabled = routePoints.length === 0 || !gate.canAccessExternalServices() || queryInProgress;
  zoomIn.disabled = routePoints.length === 0;
  zoomOut.disabled = routePoints.length === 0;
}

function parseExploreData(data: unknown): { route: GeoPoint[]; visits: SemanticVisit[] } {
  const visits = parseSemanticVisits(data);
  try {
    const points = parseTimelineJson(data);
    return {
      route: filterLocationOutliers(points, 'conservative').points,
      visits,
    };
  } catch (error) {
    const raw = parseRawSignalsJson(data);
    if (
      raw.length > 0
      && error instanceof TimelineParseError
      && (error.reason === 'raw-signals-only' || error.reason === 'no-usable-locations')
    ) {
      return {
        route: processRawSignals(raw, 100).points,
        visits: [],
      };
    }
    throw error;
  }
}

function applyExploreData(data: unknown): void {
  const parsed = parseExploreData(data);
  if (parsed.route.length === 0) throw new Error('No usable Explore route points.');
  routePoints = parsed.route;
  semanticVisits = parsed.visits;
  consent.checked = false;
  gate.setConsent(false);
  map.setTilesEnabled(false);
  map.setRoute(routePoints);
  map.focusOn(routePoints.at(-1) ?? routePoints[0], 13);
  card.classList.remove('hidden');
  resetResults();
  refreshSearchAvailability();
}

function failExploreLoad(): void {
  routePoints = [];
  semanticVisits = [];
  gate.setConsent(false);
  consent.checked = false;
  map.setTilesEnabled(false);
  map.setRoute([]);
  resetResults();
  card.classList.add('hidden');
}

async function loadExploreFile(file: File): Promise<void> {
  const text = await file.text();
  applyExploreData(JSON.parse(text) as unknown);
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await loadExploreFile(file);
  } catch {
    failExploreLoad();
  }
});

sampleButton.addEventListener('click', async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}sample-timeline.json`);
    if (!response.ok) throw new Error('Sample unavailable');
    applyExploreData(await response.json() as unknown);
  } catch {
    failExploreLoad();
  }
});

consent.addEventListener('change', () => {
  gate.setConsent(consent.checked);
  map.setTilesEnabled(consent.checked);
  if (consent.checked) {
    statusText.textContent = 'Map tiles enabled. POIs are queried only when you press Search current area · 地圖已啟用；只有按下搜尋才會查詢 POI。';
  } else {
    statusText.textContent = 'External map and POI access disabled · 已停用外部地圖與 POI 存取。';
  }
  refreshSearchAvailability();
});

zoomIn.addEventListener('click', () => map.zoomBy(1));
zoomOut.addEventListener('click', () => map.zoomBy(-1));
filterVisited.addEventListener('change', applyStatusFilters);
filterPassed.addEventListener('change', applyStatusFilters);
filterUnvisited.addEventListener('change', applyStatusFilters);

searchButton.addEventListener('click', async () => {
  if (queryInProgress) return;
  try {
    gate.requireConsent();
  } catch {
    consent.focus();
    return;
  }
  queryInProgress = true;
  refreshSearchAvailability();
  statusText.textContent = 'Searching current area · 正在搜尋目前區域…';
  const bbox = map.boundingBox();
  queryController = new AbortController();
  try {
    let pois = cache.read(bbox);
    const cacheHit = pois !== null;
    if (pois === null) {
      pois = await client.fetchPois(bbox, queryController.signal);
      cache.write(bbox, pois);
    }
    classified = classifyExplorePois(pois, semanticVisits, routePoints);
    map.setMarkers(classified);
    applyStatusFilters();
    renderSummary();
    details.classList.add('hidden');
    lastQueryCompleted = true;
    statusText.textContent = cacheHit
      ? 'Loaded from local POI cache · 已從本機 POI 快取載入。'
      : 'OpenStreetMap POIs loaded for this selected area · 已載入此選定區域的 OpenStreetMap POI。';
  } catch (error) {
    lastQueryCompleted = false;
    if (error instanceof OverpassError) {
      statusText.textContent = `Explore query unavailable (${error.code}) · 探索查詢暫時無法使用。`;
    } else {
      statusText.textContent = 'Explore query failed safely · 探索查詢失敗，未上傳 Timeline 資料。';
    }
  } finally {
    queryController = null;
    queryInProgress = false;
    refreshSearchAvailability();
  }
});

window.addEventListener('resize', () => map.render());
refreshSearchAvailability();
