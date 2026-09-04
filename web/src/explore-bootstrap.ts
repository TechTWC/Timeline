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

installExploreUi();
void import('./explore-app');
