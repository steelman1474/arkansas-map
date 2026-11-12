import fs from 'fs';
import * as topojson from 'topojson-client';
import {topology} from 'topojson-server';
import * as d3 from 'd3-geo';
const us = JSON.parse(fs.readFileSync('node_modules/us-atlas/counties-10m.json'));
const cname = {}; us.objects.counties.geometries.filter(g=>g.id.startsWith('05')).forEach(g=>cname[g.id.slice(2)]=g.properties.name);
const rewind = f => { const g=f.geometry; if (g && d3.geoArea(f) > 2*Math.PI) { if(g.type==='Polygon') g.coordinates.forEach(r=>r.reverse()); else g.coordinates.forEach(p=>p.forEach(r=>r.reverse())); } };
const SEATS = JSON.parse(fs.readFileSync('data/processed/seats.json'));
const PP = JSON.parse(fs.readFileSync('data/processed/place_pops.json'));
const CI = JSON.parse(fs.readFileSync('data/processed/county_info.json'));
const LK = JSON.parse(fs.readFileSync('data/processed/links.json'));
const twp = JSON.parse(fs.readFileSync('data/processed/twp.json'));
twp.features.forEach(rewind);
twp.features.forEach(f=>{const P=f.properties; const nm = P.LSAD==='44' ? P.NAME+' Township' : P.NAMELSAD;
  f.properties={id:P.GEOID, n:nm, cf:P.COUNTYFP, la:P.ALAND, wa:P.AWATER, wk:(LK[P.GEOID]||[])[0]||undefined, ws:(LK[P.GEOID]||[])[1]||undefined};});
const pl = JSON.parse(fs.readFileSync('data/processed/places_s.json'));
pl.features.forEach(rewind);
const typ = {'25':'City','43':'Town','57':'CDP'};
let miss=[];
for (const p of pl.features) {
  const P = p.properties, pt=[+P.INTPTLON,+P.INTPTLAT];
  const t = twp.features.find(f=>d3.geoContains(f,pt));
  if(!t) miss.push(P.NAME);
  p.properties = {id:P.GEOID, n:P.NAME, t:typ[P.LSAD], la:P.ALAND, wa:P.AWATER, cf:t?t.properties.cf:null, tw:t?t.properties.id:null, wk:(LK[P.GEOID]||[])[0]||undefined, ws:(LK[P.GEOID]||[])[1]||undefined, sc:SEATS[P.GEOID], p:PP[P.GEOID]??undefined, ip:[+(+P.INTPTLON).toFixed(5),+(+P.INTPTLAT).toFixed(5)]};
}
const topo = topology({townships: twp, places: pl}, 2e5);
topo.cnames = cname;
// state parks: points; counties = listed counties plus the county the point falls in
const PARKS = JSON.parse(fs.readFileSync('data/processed/state_parks.json'));
const cpoly = {}; for (const k of Object.keys(cname)) cpoly[k] = {type:'Feature', geometry: topojson.merge(topo, topo.objects.townships.geometries.filter(g=>g.properties.cf===k))};
for (const pk of PARKS) { const inn = Object.keys(cpoly).find(k=>d3.geoContains(cpoly[k], pk.ll)); pk.pc = inn; if (inn && !pk.cf.includes(inn)) pk.cf.push(inn); }
// park outlines (OpenStreetMap, simplified) where available
const OUT = JSON.parse(fs.readFileSync('data/processed/park_outlines.geojson')).features;
for (const f of OUT) { const pk = PARKS.find(p=>p.n===f.properties.osm_name || p.n.startsWith(f.properties.osm_name));
  if (!pk) continue; const g=f.geometry; if (d3.geoArea(f) > 2*Math.PI) { if(g.type==='Polygon') g.coordinates.forEach(r=>r.reverse()); else g.coordinates.forEach(p=>p.forEach(r=>r.reverse())); }
  pk.geo = g; }
topo.parks = PARKS;
// National Register of Historic Places (from Wikidata): keep points inside Arkansas; find county and city
const rows = fs.readFileSync('data/processed/nrhp_wikidata.tsv','utf8').trim().split('\n').slice(1).map(l=>l.split('\t'));
const plBoxes = pl.features.map(f=>({f, b:d3.geoBounds(f)}));
const HP = [];
for (const [qid, ref, lon, lat, label, wiki] of rows) {
  const ll = [+lon, +lat];
  const cf = Object.keys(cpoly).find(k=>d3.geoContains(cpoly[k], ll));
  if (!cf) continue; // outside Arkansas
  const inPl = plBoxes.find(({f,b})=>ll[0]>=b[0][0]&&ll[0]<=b[1][0]&&ll[1]>=b[0][1]&&ll[1]<=b[1][1]&&d3.geoContains(f,ll));
  HP.push({n: label || wiki || ref, r: ref.split(',')[0], wk: wiki || undefined, ll, cf, pl: inPl ? inPl.f.properties.id : undefined});
}
topo.hist = HP;
console.log('historic places in Arkansas', HP.length);
topo.cinfo = CI;
topo.clinks = Object.fromEntries(Object.keys(cname).map(cf=>[cf, LK['05'+cf]||[cname[cf]+' County, Arkansas','']]));
fs.writeFileSync('build/ar.topo.json', JSON.stringify(topo));
console.log('twp',twp.features.length,'places',pl.features.length,'miss',miss,'counties',Object.keys(cname).length, 'size', fs.statSync('build/ar.topo.json').size);
