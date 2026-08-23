# Security boundary

- Never commit a real Google Maps `Timeline.json` export.
- Development and CI use fictional/sample data only.
- No Timeline upload endpoint, backend Timeline processing, database, account login, location permission, or location telemetry.
- v0.1 is not authorized for public deployment.
- Runtime map tiles may be requested from the upstream map provider; requests can reveal the requesting IP and viewed map regions.
- Real Timeline files must remain browser-local.

The only Timeline-like JSON intentionally tracked is `web/public/sample-timeline.json`.
