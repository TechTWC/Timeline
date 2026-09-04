import type { ClassifiedPoi } from './analysis';
import type { BoundingBox, ExplorationStatus } from './types';
import type { GeoPoint } from '../types';

export const EXPLORE_TILE_ATTRIBUTION = '© OpenStreetMap contributors  © CARTO';
export const EXPLORE_TILE_TEMPLATE = 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
export const EXPLORE_MIN_ZOOM = 11;
export const EXPLORE_MAX_ZOOM = 18;

export interface ExploreMapView {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface ExploreMapOptions {
  onViewChange?: (bbox: BoundingBox) => void;
  onMarkerSelect?: (item: ClassifiedPoi) => void;
}

interface WorldPoint {
  x: number;
  y: number;
}

const TILE_SIZE = 256;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function mapWorldPoint(latitude: number, longitude: number): WorldPoint {
  const lat = clamp(latitude, -85.05112878, 85.05112878);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: (normalizeLongitude(longitude) + 180) / 360,
    y: clamp(0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI), 0, 1),
  };
}

export function worldPointToLatLon(point: WorldPoint): { latitude: number; longitude: number } {
  const longitude = normalizeLongitude(point.x * 360 - 180);
  const y = clamp(point.y, 0, 1);
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return { latitude, longitude };
}

function worldXNear(x: number, reference: number): number {
  let adjusted = x;
  while (adjusted - reference > 0.5) adjusted -= 1;
  while (adjusted - reference < -0.5) adjusted += 1;
  return adjusted;
}

export function exploreBoundingBox(
  view: ExploreMapView,
  width: number,
  height: number,
): BoundingBox {
  const zoom = clamp(Math.round(view.zoom), EXPLORE_MIN_ZOOM, EXPLORE_MAX_ZOOM);
  const worldSize = TILE_SIZE * (2 ** zoom);
  const center = mapWorldPoint(view.latitude, view.longitude);
  const halfX = Math.max(1, width) / 2 / worldSize;
  const halfY = Math.max(1, height) / 2 / worldSize;
  const northWest = worldPointToLatLon({ x: center.x - halfX, y: center.y - halfY });
  const southEast = worldPointToLatLon({ x: center.x + halfX, y: center.y + halfY });
  return {
    south: southEast.latitude,
    west: northWest.longitude,
    north: northWest.latitude,
    east: southEast.longitude,
  };
}

function pixelPosition(
  latitude: number,
  longitude: number,
  view: ExploreMapView,
  width: number,
  height: number,
): { x: number; y: number } {
  const zoom = clamp(Math.round(view.zoom), EXPLORE_MIN_ZOOM, EXPLORE_MAX_ZOOM);
  const scale = TILE_SIZE * (2 ** zoom);
  const center = mapWorldPoint(view.latitude, view.longitude);
  const point = mapWorldPoint(latitude, longitude);
  const pointX = worldXNear(point.x, center.x);
  return {
    x: width / 2 + (pointX - center.x) * scale,
    y: height / 2 + (point.y - center.y) * scale,
  };
}

export class ExploreMap {
  private view: ExploreMapView = { latitude: 0, longitude: 0, zoom: 13 };
  private tilesEnabled = false;
  private route: readonly GeoPoint[] = [];
  private markers: readonly ClassifiedPoi[] = [];
  private visibleStatuses = new Set<ExplorationStatus>(['visited', 'passed_nearby', 'unvisited']);
  private readonly tileLayer: HTMLDivElement;
  private readonly routeLayer: SVGSVGElement;
  private readonly markerLayer: HTMLDivElement;
  private readonly attribution: HTMLDivElement;
  private dragging = false;
  private pointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: ExploreMapOptions = {},
  ) {
    root.replaceChildren();
    root.classList.add('explore-map-root');
    this.tileLayer = document.createElement('div');
    this.tileLayer.className = 'explore-map-tiles';
    this.routeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.routeLayer.classList.add('explore-map-route');
    this.markerLayer = document.createElement('div');
    this.markerLayer.className = 'explore-map-markers';
    this.attribution = document.createElement('div');
    this.attribution.className = 'explore-map-attribution';
    this.attribution.textContent = EXPLORE_TILE_ATTRIBUTION;
    root.append(this.tileLayer, this.routeLayer, this.markerLayer, this.attribution);
    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerUp);
    root.addEventListener('pointercancel', this.onPointerUp);
    root.addEventListener('wheel', this.onWheel, { passive: false });
    this.render();
  }

  setView(latitude: number, longitude: number, zoom = this.view.zoom): void {
    this.view = {
      latitude: clamp(latitude, -85.05112878, 85.05112878),
      longitude: normalizeLongitude(longitude),
      zoom: clamp(Math.round(zoom), EXPLORE_MIN_ZOOM, EXPLORE_MAX_ZOOM),
    };
    this.renderAndNotify();
  }

  focusOn(point: { latitude: number; longitude: number }, zoom = 13): void {
    this.setView(point.latitude, point.longitude, zoom);
  }

  zoomBy(delta: number): void {
    this.setView(this.view.latitude, this.view.longitude, this.view.zoom + delta);
  }

  setTilesEnabled(enabled: boolean): void {
    this.tilesEnabled = enabled;
    this.renderTiles();
    this.attribution.classList.toggle('hidden', !enabled);
  }

  setRoute(points: readonly GeoPoint[]): void {
    this.route = points;
    this.renderRoute();
  }

  setMarkers(items: readonly ClassifiedPoi[]): void {
    this.markers = items;
    this.renderMarkers();
  }

  setVisibleStatuses(statuses: ReadonlySet<ExplorationStatus>): void {
    this.visibleStatuses = new Set(statuses);
    this.renderMarkers();
  }

  boundingBox(): BoundingBox {
    return exploreBoundingBox(this.view, this.root.clientWidth || 540, this.root.clientHeight || 360);
  }

  render(): void {
    this.renderTiles();
    this.renderRoute();
    this.renderMarkers();
    this.attribution.classList.toggle('hidden', !this.tilesEnabled);
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerUp);
    this.root.removeEventListener('wheel', this.onWheel);
    this.root.replaceChildren();
  }

  private renderAndNotify(): void {
    this.render();
    this.options.onViewChange?.(this.boundingBox());
  }

  private panByPixels(deltaX: number, deltaY: number): void {
    const zoom = this.view.zoom;
    const scale = TILE_SIZE * (2 ** zoom);
    const center = mapWorldPoint(this.view.latitude, this.view.longitude);
    const next = worldPointToLatLon({
      x: center.x - deltaX / scale,
      y: center.y - deltaY / scale,
    });
    this.view = { ...this.view, latitude: next.latitude, longitude: next.longitude };
    this.renderAndNotify();
  }

  private renderTiles(): void {
    this.tileLayer.replaceChildren();
    if (!this.tilesEnabled) return;
    const width = this.root.clientWidth || 540;
    const height = this.root.clientHeight || 360;
    const zoom = this.view.zoom;
    const tileCount = 2 ** zoom;
    const center = mapWorldPoint(this.view.latitude, this.view.longitude);
    const centerPixelX = center.x * tileCount * TILE_SIZE;
    const centerPixelY = center.y * tileCount * TILE_SIZE;
    const left = centerPixelX - width / 2;
    const top = centerPixelY - height / 2;
    const startX = Math.floor(left / TILE_SIZE);
    const endX = Math.floor((left + width) / TILE_SIZE);
    const startY = Math.max(0, Math.floor(top / TILE_SIZE));
    const endY = Math.min(tileCount - 1, Math.floor((top + height) / TILE_SIZE));

    for (let tileX = startX; tileX <= endX; tileX += 1) {
      for (let tileY = startY; tileY <= endY; tileY += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        const image = document.createElement('img');
        image.alt = '';
        image.draggable = false;
        image.loading = 'lazy';
        image.src = EXPLORE_TILE_TEMPLATE
          .replace('{z}', String(zoom))
          .replace('{x}', String(wrappedX))
          .replace('{y}', String(tileY));
        image.style.left = `${tileX * TILE_SIZE - left}px`;
        image.style.top = `${tileY * TILE_SIZE - top}px`;
        this.tileLayer.append(image);
      }
    }
  }

  private renderRoute(): void {
    this.routeLayer.replaceChildren();
    if (this.route.length < 2) return;
    const width = this.root.clientWidth || 540;
    const height = this.root.clientHeight || 360;
    this.routeLayer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const maximum = 800;
    const stride = Math.max(1, Math.ceil(this.route.length / maximum));
    const sampled = this.route.filter((_point, index) => index % stride === 0 || index === this.route.length - 1);
    const coordinates = sampled.map((point) => pixelPosition(
      point.latitude,
      point.longitude,
      this.view,
      width,
      height,
    ));
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', coordinates.map((point) => `${point.x},${point.y}`).join(' '));
    polyline.setAttribute('class', 'explore-route-line');
    this.routeLayer.append(polyline);
  }

  private renderMarkers(): void {
    this.markerLayer.replaceChildren();
    const width = this.root.clientWidth || 540;
    const height = this.root.clientHeight || 360;
    for (const item of this.markers) {
      const status = item.classification.status;
      if (!this.visibleStatuses.has(status)) continue;
      const position = pixelPosition(
        item.poi.latitude,
        item.poi.longitude,
        this.view,
        width,
        height,
      );
      if (position.x < -24 || position.y < -24 || position.x > width + 24 || position.y > height + 24) continue;
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = `explore-marker explore-marker-${status}`;
      marker.style.left = `${position.x}px`;
      marker.style.top = `${position.y}px`;
      marker.title = item.poi.name ?? item.poi.category ?? 'OpenStreetMap place';
      marker.setAttribute('aria-label', `${marker.title}: ${status.replace('_', ' ')}`);
      marker.addEventListener('click', (event) => {
        event.stopPropagation();
        this.options.onMarkerSelect?.(item);
      });
      this.markerLayer.append(marker);
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement).closest('.explore-marker')) return;
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.root.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.panByPixels(deltaX, deltaY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1 : -1);
  };
}
