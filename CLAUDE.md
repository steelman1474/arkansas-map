# Notes for Claude

## Who this is for
The owner (GitHub: steelman1474) doesn't code and relies on Claude for every change. Explain results in plain language,
keep replies short, and do the work end to end: edit, build, test, commit, push, then check the live site.

## What this is
An interactive map of Arkansas local government: 75 counties, 1,095 townships (minor civil divisions), cities, towns,
census-designated places, state parks, historic places, highways and county roads, rivers, lakes and public lands.
Live at https://steelman1474.github.io/arkansas-map/ (GitHub Pages serves `index.html` from `main`; a push deploys it
in about a minute).

## How it's built
- `build/app.js` is the map code. The map is drawn with **MapLibre GL** (GPU). d3 is used only for geo math,
  formatting and the small locator inset. topojson-client decodes the data.
- `build/template.html` is the page (HTML + CSS). `build/assemble.mjs` inlines d3, topojson, MapLibre (JS + CSS),
  `build/app.js` and `build/ar.topo.json` into `index.html`.
- `npm run build` = decode park outlines (Python) → `build/build-data.mjs` (writes `build/ar.topo.json`) → assemble.
  **Never edit `index.html` by hand; always rebuild and commit it.**
- Files loaded at runtime (not inlined): `data/web/highways.topo.json`, `data/web/roads/05xxx.json` (one per county,
  fetched when a county opens), `data/web/nature.topo.json`, `data/web/nature_links.json`, `data/fonts/` (self-hosted
  Noto Sans glyphs for map labels: Regular, Medium, Italic; ranges 0-255, 256-511, 8192-8447).
- When a runtime data file changes, bump its `?v=` number in `app.js` so browsers don't use a cached copy.

## Map behavior worth knowing
- One MapLibre map serves both views. "Opening a county" (`openCounty`) flies to it, fades everything else with a mask
  layer (`mask-c`), restricts panning (maxBounds/minZoom) and loads that county's roads. `closeCounty` reverses it.
- Layer checkboxes toggle `hide-<Name>` classes on `#map`; `refreshVis()` turns those into MapLibre layer visibility
  and filters. Cities, Towns, County lines and County names are locked on (disabled checkboxes) by request.
- Clicks/hover go through `PICK` (priority order matters) and `pick()`. Selection is drawn by `highlight()` into the
  `hl` source. Side-panel content comes from the `select*` functions.
- Roads: the Arkansas Centerline File records that trace a highway are folded into the highway (`prepRoads`), and
  highways are keyed per route (`keyTiger` / `keyACF`) so a whole route selects at once.
- Rivers with the same name are split into separate streams by connectivity (so different "Hurricane Creek"s stay apart).
- Removed at the owner's request: wildlife management areas, flood zones, unnamed lakes. Don't bring them back unasked.

## Data sources and how they were fetched
See README.md "Sources". Most of it came from Census TIGER/Line, Wikidata (SPARQL), the Arkansas GIS Office ArcGIS
services (gis.arkansas.gov: Water, Boundaries, roads), ArDOT public lands, Nominatim/OpenStreetMap, Wikipedia's API.
Rebuild scripts: `build/acf_roads.py` (county roads), `build/roads.sh` (highways), `build/nature.py` (land and water;
needs the raw downloads, which aren't in the repo).

## Testing
Serve the folder (`python3 -m http.server 8765`) and open it in a browser; headless Playwright needs WebGL flags
(`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`). Check the console for errors and click
through a few counties (Pulaski is the heaviest; Faulkner and Newton are good checks).

## Commits
Commit as the owner:
`git -c user.name="steelman1474" -c user.email="steelman1474@users.noreply.github.com" commit`
