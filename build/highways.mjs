// Builds the highway lines from OpenStreetMap route relations (Interstate, U.S. and Arkansas state highways, with their
// business, spur and bypass routes). Each road in OSM belongs to every route signed on it, so a stretch two routes share
// (e.g. U.S. 62 and U.S. 412 near Harrison) is in both, and routes renumbered long ago (Highway 4 became U.S. 278 in
// 1998) don't linger. The Census road files had both problems: stacked copies under old names, and gaps.
//
// 1. Download (Overpass API; ~35 MB):
//    curl -A arkansas-map-build --data-urlencode 'data=[out:json][timeout:600];area["ISO3166-2"="US-AR"][admin_level=4]->.ar;rel(area.ar)["type"="route"]["route"="road"]["network"~"^US:(I|US|AR)(:(Business|Bypass))?$"];out geom;' https://overpass-api.de/api/interpreter -o routes.json
// 2. node build/highways.mjs routes.json highways.geojson     (needs build/ar.topo.json from npm run build)
// 3. npx mapshaper -i highways.geojson -dissolve n,k -simplify 12% keep-shapes \
//      -o data/web/highways.topo.json format=topojson quantization=100000
import fs from 'fs';
import * as topojson from 'topojson-client';
import { geoContains } from 'd3-geo';

const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error('usage: node build/highways.mjs <routes.json> <out.geojson>'); process.exit(1); }

// Arkansas outline (merged townships), to drop the parts of multi-state routes outside the state
const ar = JSON.parse(fs.readFileSync('build/ar.topo.json', 'utf8'));
const state = { type: 'Feature', geometry: topojson.merge(ar, ar.objects.townships.geometries) };

// Names in the form the map already reads: "I- 40", "US Hwy 278 Bus", "State Hwy 7 Spr". ArDOT suffix letters:
// B business, S spur, Y bypass; other letters (T truck, N/E/W split routes) stay on the number as their own route.
const KIND = { 'US:I': 'I', 'US:US': 'U', 'US:US:Business': 'U', 'US:US:Bypass': 'U', 'US:AR': 'S' };
const SUF = { B: ' Bus', S: ' Spr', Y: ' Byp' };
function routeName(t) {
  const k = KIND[t.network], m = (t.ref || '').match(/^(\d+)([A-Z]?)$/);
  if (!k || !m) return null;
  let num = m[1], suf = '';
  if (m[2]) { if (SUF[m[2]]) suf = SUF[m[2]]; else num += m[2]; }
  if (t.network === 'US:US:Business') suf = ' Bus';
  if (t.network === 'US:US:Bypass') suf = ' Byp';
  return { k, n: (k === 'I' ? 'I- ' : k === 'U' ? 'US Hwy ' : 'State Hwy ') + num + suf };
}

const rels = JSON.parse(fs.readFileSync(inp, 'utf8')).elements.filter(e => e.type === 'relation');
const feats = [], seen = new Set(); let skipped = 0;
for (const r of rels) {
  const R = routeName(r.tags || {});
  if (!R) { skipped++; continue; }
  for (const m of r.members || []) {
    if (m.type !== 'way' || !m.geometry || m.geometry.length < 2) continue;
    if (/^(stop|platform)/.test(m.role || '')) continue;
    const id = m.ref + '|' + R.n; if (seen.has(id)) continue; seen.add(id); // a way listed twice in one route
    const c = m.geometry.map(p => [p.lon, p.lat]), mid = c[Math.floor(c.length / 2)];
    if (!geoContains(state, mid)) continue;
    feats.push({ type: 'Feature', properties: { n: R.n, k: R.k }, geometry: { type: 'LineString', coordinates: c } });
  }
}
fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features: feats }));
console.log(`${rels.length} routes (${skipped} skipped: no usable number), ${feats.length} road pieces in Arkansas`);
