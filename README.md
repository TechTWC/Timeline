# My Timeline Visualizer

Private, local-first Web version based on the MIT-licensed [`mahlernim/google-timeline-visualizer`](https://github.com/mahlernim/google-timeline-visualizer).

## v0.1

- Browser import of Google Maps `Timeline.json`.
- Browser-local Timeline processing and video generation.
- Route preview/animation and video export inherited from the pinned upstream Web implementation.
- No backend, database, login, location permission, or Timeline upload.
- The static frontend may be published with GitHub Pages so it can be opened from iPhone/iPad/Mac browsers.

**Never place a real Google Timeline export inside this repository.** Select it only at runtime through the browser file picker.

The public site contains only static HTML/CSS/JS and fictional sample data. Real Timeline files remain browser-local and are not uploaded to the application server.

Map tiles still come from the upstream external map provider, so that provider can observe the requesting IP and requested map regions.

See `SECURITY.md` and `UPSTREAM.md`.
