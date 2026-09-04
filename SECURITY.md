# Security boundary

- Never commit a real Google Maps `Timeline.json` export.
- Development and CI use fictional/sample data only.
- No Timeline upload endpoint, backend Timeline processing, database, account login, location permission, or location telemetry.
- Public deployment is allowed only for the static frontend assets (HTML/CSS/JS) through GitHub Pages.
- Real Timeline files must never be deployed, uploaded, committed, logged, or stored by the application server.
- Runtime map tiles may be requested from the upstream map provider; requests can reveal the requesting IP and viewed map regions.
- Explore POI lookups may send only an explicitly user-selected map bounding box to the configured OpenStreetMap/Overpass provider. Raw Timeline points, semantic visits, and reconstructed history must never be included in those requests.
- Explore POI cache entries may contain only normalized public OSM POI data plus cache metadata; they must never contain Timeline history.
- The external OSM/Overpass provider can observe the requesting IP and selected query region even though Timeline history remains local.
- OpenStreetMap-derived POIs must retain the required `© OpenStreetMap contributors` attribution and a link to the ODbL/copyright information.
- Real Timeline files must remain browser-local and be selected only through the browser file picker.

The only Timeline-like JSON intentionally tracked is `web/public/sample-timeline.json`.
