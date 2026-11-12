# Arkansas Counties & Places — interactive map

An interactive map of Arkansas's 75 counties, 1,095 townships (minor civil divisions),
and 540 cities, towns and census-designated places. Click a county to open its own map.

## Just want to look at it?
Open `index.html` in any web browser (double-click it). It works offline.

## Project layout
| Path | What it is |
|---|---|
| `index.html` | The finished map (generated; don't edit by hand) |
| `build/template.html` | The map's page: layout, styles and interactive code |
| `build/build-data.mjs` | Combines the data files below into map data |
| `build/assemble.mjs` | Packs template + libraries + data into `index.html` |
| `data/processed/twp.json` | Township boundaries (Census TIGER/Line 2024, simplified) |
| `data/processed/places_s.json` | City/town/CDP boundaries (Census TIGER/Line 2019, simplified) |
| `data/processed/place_pops.json` | 2020 populations of places (from Wikidata) |
| `data/processed/county_info.json` | County population, year formed, namesake (from Wikidata) |
| `data/processed/seats.json` | County seats (from Wikidata) |
| `data/processed/state_parks.tsv` | State parks list: names, counties, acres, year, coordinates, links (edit this to change parks) |
| `data/processed/state_parks.json` | Same, converted for the build |
| `data/processed/park_outlines.txt` | Park boundaries from OpenStreetMap (compact; decoded by `build/decode_park_outlines.py`) |
| `data/processed/nrhp_wikidata.tsv` | National Register of Historic Places listings with coordinates (from Wikidata) |
| `data/processed/links.json` | Wikipedia titles and official websites (from Wikidata) |

Counties and the state outline are built from the townships, so their lines match exactly.

## Rebuilding after a change
Requires Node.js (https://nodejs.org).

    npm install
    npm run build

## Sources
- Background maps: OpenStreetMap (Map) and Esri World Imagery (Satellite), loaded live
- U.S. Census Bureau TIGER/Line shapefiles (county subdivisions 2024, places 2019)
- Wikidata (populations, seats, links, formation dates, namesakes)
- Park outlines: © OpenStreetMap contributors (ODbL), via Nominatim; simplified
- Historic places: National Register of Historic Places entries on Wikidata (reference number, coordinates)
- State parks: Wikipedia "List of Arkansas state parks" table and Wikidata
- Quorum court size: Arkansas Code § 14-14-402 population ranges
