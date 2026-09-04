function installExploreStyles(): void {
  if (document.getElementById('explore-gap-styles')) return;
  const style = document.createElement('style');
  style.id = 'explore-gap-styles';
  style.textContent = `
    .explore-map-shell { position: relative; margin-top: 16px; }
    #explore-map { position: relative; width: 100%; height: 360px; overflow: hidden; border: 1px solid #e3d6dc; border-radius: 16px; background: linear-gradient(135deg, #f5eff2 25%, #fbf7f9 25%, #fbf7f9 50%, #f5eff2 50%, #f5eff2 75%, #fbf7f9 75%); background-size: 28px 28px; touch-action: none; cursor: grab; }
    #explore-map:active { cursor: grabbing; }
    .explore-map-root > * { position: absolute; inset: 0; }
    .explore-map-tiles { overflow: hidden; }
    .explore-map-tiles img { position: absolute; width: 256px; height: 256px; user-select: none; pointer-events: none; }
    .explore-map-route { width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    .explore-route-line { fill: none; stroke: rgba(36, 25, 29, 0.58); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .explore-map-markers { pointer-events: none; }
    .explore-marker { position: absolute; width: 18px; min-height: 18px; height: 18px; padding: 0; border: 2px solid white; border-radius: 999px; transform: translate(-50%, -50%); box-shadow: 0 2px 8px rgba(36,25,29,.28); pointer-events: auto; }
    .explore-marker-visited { background: #198754; }
    .explore-marker-passed_nearby { background: #f0a000; }
    .explore-marker-unvisited { background: #737780; }
    .explore-map-attribution { inset: auto 6px 5px auto; width: auto; height: auto; padding: 3px 6px; border-radius: 6px; background: rgba(255,255,255,.88); color: #5c4b52; font-size: 9px; pointer-events: none; }
    .explore-map-controls { position: absolute; top: 10px; right: 10px; display: grid; gap: 6px; }
    .explore-map-control { width: 40px; min-height: 40px; height: 40px; padding: 0; border-radius: 10px; font-size: 22px; box-shadow: 0 4px 12px rgba(36,25,29,.16); }
    #explore-search { width: 100%; margin-top: 12px; }
    .explore-filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
    .explore-filters .checkbox-row { align-items: flex-start; font-size: 12px; }
    .explore-details { margin-top: 14px; padding: 14px; border: 1px solid #eadce2; border-radius: 14px; background: #fffafb; }
    .explore-details strong { display: block; margin-bottom: 7px; }
    .explore-details p { margin: 4px 0; font-size: 13px; }
    @media (max-width: 520px) { #explore-map { height: 320px; } .explore-filters { grid-template-columns: 1fr; gap: 0; } }
  `;
  document.head.append(style);
}

function installExploreUi(): void {
  if (document.getElementById('explore-card')) return;
  const previewCard = document.getElementById('preview-card');
  if (!previewCard) throw new Error('Explore UI requires #preview-card');

  const section = document.createElement('section');
  section.id = 'explore-card';
  section.className = 'card hidden';
  section.setAttribute('aria-labelledby', 'explore-heading');
  section.innerHTML = `
    <div class="section-heading">
      <h2 id="explore-heading">Explore nearby · 探索附近</h2>
      <span>Explore Gap v0.1</span>
    </div>
    <p>See eligible places you visited, passed nearby, or have not explored. Timeline analysis stays on this device.</p>
    <div class="privacy-notice">
      <strong>Explore privacy · 探索隱私</strong>
      <p>Your Timeline file, raw GPS history, and semantic visits stay local. After you explicitly enable Explore, CARTO may receive map-tile coordinates for regions you view. OpenStreetMap/Overpass receives only the current map bounding box when you press Search current area.</p>
      <label class="checkbox-row">
        <input id="explore-consent" type="checkbox" />
        <span>I understand and want to enable external map/POI access · 我了解並同意啟用外部地圖／POI 存取</span>
      </label>
    </div>
    <div class="explore-map-shell">
      <div id="explore-map" aria-label="Interactive Explore map"></div>
      <div class="explore-map-controls" aria-label="Map zoom controls">
        <button id="explore-zoom-in" class="secondary explore-map-control" type="button" aria-label="Zoom in">＋</button>
        <button id="explore-zoom-out" class="secondary explore-map-control" type="button" aria-label="Zoom out">−</button>
      </div>
    </div>
    <p class="field-help">Drag or scroll the map locally, then press Search current area. Moving the map never triggers an Overpass query automatically.</p>
    <button id="explore-search" type="button" disabled>Search current area · 搜尋目前區域</button>
    <p id="explore-status" class="status" role="status"></p>
    <p id="explore-summary" class="status">Move the map, then search the current area · 移動地圖後搜尋目前區域。</p>
    <div class="explore-filters" aria-label="Explore status filters">
      <label class="checkbox-row"><input id="explore-filter-visited" type="checkbox" checked /><span>Visited · 已探索</span></label>
      <label class="checkbox-row"><input id="explore-filter-passed" type="checkbox" checked /><span>Passed nearby · 曾經過附近</span></label>
      <label class="checkbox-row"><input id="explore-filter-unvisited" type="checkbox" checked /><span>Unvisited · 尚未探索</span></label>
    </div>
    <div id="explore-details" class="explore-details hidden"></div>
    <p class="field-help">POI source: <a id="explore-osm-attribution" target="_blank" rel="noopener noreferrer"></a>. Basemap: CARTO.</p>
  `;
  previewCard.before(section);
}

installExploreStyles();
installExploreUi();
void import('./explore-app');
