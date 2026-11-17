# Arkansas Counties & Places — interactive map

An interactive map of Arkansas's 75 counties, 1,095 townships (minor civil divisions),
and 540 cities, towns and census-designated places. Click a county to open its own map.

## Just want to look at it?
Visit https://steelman1474.github.io/arkansas-map/. Opening `index.html` directly from disk also works, but road layers need the page to be served over the web.

## Project layout
| Path | What it is |
|---|---|
| `index.html` | The finished map (generated; don't edit by hand) |
| `build/template.html` | The map's page: layout and styles |
| `build/app.js` | The map's code: drawing (MapLibre GL, on the graphics card), clicks, panels and search |
| `data/fonts/` | Label fonts (Noto Sans) used by the map |
| `build/build-data.mjs` | Combines the data files below into map data |
| `build/assemble.mjs` | Packs template + code + libraries (d3, topojson, MapLibre GL) + data into `index.html` |
| `data/processed/twp.json` | Township boundaries (Census TIGER/Line 2024, simplified) |
| `data/processed/places_s.json` | City/town/CDP boundaries (Census TIGER/Line 2019, simplified) |
| `data/processed/place_pops.json` | 2020 populations of places (from Wikidata) |
| `data/processed/county_info.json` | County population, year formed, namesake (from Wikidata) |
| `data/processed/seats.json` | County seats (from Wikidata) |
| `data/processed/state_parks.tsv` | State parks list: names, counties, acres, year, coordinates, links (edit this to change parks) |
| `data/processed/state_parks.json` | Same, converted for the build |
| `data/processed/park_outlines.txt` | Park boundaries from OpenStreetMap (compact; decoded by `build/decode_park_outlines.py`) |
| `data/processed/nrhp_wikidata.tsv` | National Register of Historic Places listings with coordinates (from Wikidata) |
| `data/web/highways.topo.json` | Interstates, U.S. and state highways (OpenStreetMap routes; rebuild with `build/highways.mjs`), loaded by the page |
| `data/web/roads/05xxx.json` | Every road in a county with who maintains it, surface, address range and ArDOT district (Arkansas Centerline File), loaded when a county is opened (rebuild with `build/acf_roads.py`) |
| `data/web/nature.topo.json` | Rivers, lakes, national forests, parks, refuges and other public land (it also holds wildlife management areas, which the map no longer shows) (rebuild with `build/nature.py`) |
| `data/web/gov/*.json` | Government and politics boundaries, one file per layer (school districts, State House and Senate, congressional, voting precincts, JP districts, city wards, circuit and district courts, fire, water and levee districts) plus `police.json` (sheriffs, police, State Police), each loaded the first time its layer is turned on (rebuild with `build/gov.mjs`) |
| `data/processed/nature_links.json` | Wikipedia articles and official websites for rivers, lakes and public lands (matched by name, checked against the article's location) |
| `data/processed/links.json` | Wikipedia titles and official websites (from Wikidata) |

Counties and the state outline are built from the townships, so their lines match exactly.

## Rebuilding after a change
Requires Node.js (https://nodejs.org) and Python 3.

    npm install
    npm run build

## Sources
- Highways: © OpenStreetMap contributors (ODbL), route relations fetched with the Overpass API (November 2026). A road two routes share is in both; Census TIGER road files were dropped because they keep old route names (e.g. Highway 4 on U.S. 278, renumbered in 1998) and miss many shared stretches
- County road details: Arkansas Centerline File (ACF/ARNOLD), Arkansas GIS Office and ArDOT. Maintainer data is missing for a few counties (Conway, Garland, Greene, Izard, Pike, Pope); highways there are identified from names or Census lines
- Background maps: OpenStreetMap (Map) and Esri World Imagery (Satellite), loaded live
- U.S. Census Bureau TIGER/Line shapefiles (county subdivisions 2024, places 2019)
- Wikidata (populations, seats, links, formation dates, namesakes)
- Park outlines: © OpenStreetMap contributors (ODbL), via Nominatim; simplified
- Historic places: National Register of Historic Places entries on Wikidata (reference number, coordinates)
- State parks: Wikipedia "List of Arkansas state parks" table and Wikidata
- Rivers and streams (order 3+): ADEQ stream network via the Arkansas GIS Office
- Lakes (named, about 5 acres and up): USGS National Hydrography Dataset, high resolution, via the Arkansas GIS Office
- Forests, national parks, refuges, wilderness, natural areas, military land and local parks: ArDOT Public Lands layer
- Wildlife management areas: Arkansas Game and Fish Commission via the Arkansas GIS Office
- Terrain shading: Esri World Hillshade, loaded live
- Quorum court size: Arkansas Code § 14-14-402 population ranges
- Government and politics layers: Arkansas GIS Office Boundaries service (school districts, State House and Senate districts with members as listed there, congressional districts, election precincts (2025), justice of the peace districts, municipal wards, circuit courts, state district courts (2025), fire districts, levee districts) and Utilities service (public water systems), fetched November 2026
- Sheriffs, police departments and State Police posts: law enforcement locations (2008 national inventory) via the Arkansas GIS Office
