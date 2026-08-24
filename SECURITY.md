# Security boundary

- Never commit a real Google Maps `Timeline.json` export.
- Development and CI use fictional/sample data only.
- No Timeline upload endpoint, backend Timeline processing, database, account login, location permission, or location telemetry.
- Public deployment is allowed only for the static frontend assets (HTML/CSS/JS) through GitHub Pages.
- Real Timeline files must never be deployed, uploaded, committed, logged, or stored by the application server.
- Runtime map tiles may be requested from the upstream map provider; requests can reveal the requesting IP and viewed map regions.
- Real Timeline files must remain browser-local and be selected only through the browser file picker.

The only Timeline-like JSON intentionally tracked is `web/public/sample-timeline.json`.
