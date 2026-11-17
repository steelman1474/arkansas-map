// Downloads the government and politics boundaries (and law enforcement offices) from the Arkansas GIS Office and writes
// one GeoJSON file per layer with short property names, ready for mapshaper.
//
// 1. node build/gov.mjs <dir>        (downloads ~20 MB; writes <dir>/school.geojson, house.geojson, ... and police.json)
// 2. one file per layer (I=60, or 25 for ward; add "-dissolve2 c" for circuit and "-filter '!this.isNull'" for precinct):
//    npx mapshaper -i <dir>/<layer>.geojson -simplify dp interval=I keep-shapes \
//      -each 'lx=+this.innerX.toFixed(4), ly=+this.innerY.toFixed(4)' -rename-layers <layer> \
//      -o data/web/gov/<layer>.json format=topojson quantization=100000
//    then copy <dir>/police.json to data/web/gov/ and bump the gov ?v= numbers in app.js.
import fs from 'fs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node build/gov.mjs <dir>'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const BASE = 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/';
const UA = { headers: { 'User-Agent': 'arkansas-map-build' } };

async function fetchAll(path, fields) {
  const out = []; let offset = 0;
  for (;;) {
    const q = new URLSearchParams({ where: '1=1', outFields: fields, outSR: '4326', f: 'geojson', geometryPrecision: '5',
      maxAllowableOffset: '0.00015', resultOffset: String(offset), resultRecordCount: '200' });
    let j;
    for (let tries = 0; ; tries++) {
      try { j = await (await fetch(BASE + path + '/query?' + q, UA)).json(); if (j.features) break; throw new Error(JSON.stringify(j).slice(0, 200)); }
      catch (e) { if (tries > 3) throw e; await new Promise(r => setTimeout(r, 2000)); }
    }
    out.push(...j.features); offset += j.features.length;
    if (!j.features.length || !(j.exceededTransferLimit || j.properties?.exceededTransferLimit)) break;
  }
  return out;
}
const title = s => (s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Of|And|The)\b/g, w => w.toLowerCase())
  .replace(/\bWss\b|\bPws\b|\bWsd\b|\bPwa\b|\bRwd\b|\bWwtp\b|\bWa\b/g, w => w.toUpperCase()).replace(/\bIi\b/g, 'II').trim();
const party = p => /^Rep/.test(p) ? 'R' : /^Dem/.test(p) ? 'D' : /^Ind/.test(p) ? 'I' : 'V';
const save = (name, feats, map) => {
  const fc = { type: 'FeatureCollection', features: feats.filter(f => f.geometry).map(f => ({ type: 'Feature', properties: map(f.properties), geometry: f.geometry })) };
  fs.writeFileSync(`${dir}/${name}.geojson`, JSON.stringify(fc)); console.log(name, fc.features.length);
};
const B = n => `Boundaries/FeatureServer/${n}`;

save('school', await fetchAll(B(29), 'name,lea'), p => ({ n: p.name.trim(), lea: p.lea }));
save('house', await fetchAll(B(15), 'ndistrict,name,party,hyperlink'), p => ({ d: p.ndistrict, m: p.name, p: party(p.party), u: p.hyperlink }));
save('senate', await fetchAll(B(34), 'ndistrict,name,party,hyperlink'), p => ({ d: p.ndistrict, m: p.name, p: party(p.party), u: p.hyperlink }));
save('cong', await fetchAll(B(6), 'district'), p => ({ d: p.district }));
save('precinct', await fetchAll(B(11), 'county_fips,precinct'), p => ({ n: (p.precinct || '').trim(), cf: p.county_fips }));
save('jp', await fetchAll(B(19), 'fips,district,pop2020'), p => ({ d: +p.district || p.district, cf: p.fips, pop: p.pop2020 }));
// circuits: codes like "08N", "11W.2" (the ".2" is a second piece of the same circuit)
save('circuit', await fetchAll(B(3), 'circuit_court'), p => ({ c: p.circuit_court.replace(/\.\d+$/, '').replace(/^0/, '') }));
save('dcourt', await fetchAll(B(47), 'distnumber,distname,division,ark_law'),
  p => ({ n: p.distname.replace('Seventeeth', 'Seventeenth').trim(), dv: (p.division || '').trim(), law: (p.ark_law || '').trim() }));
save('fire', await fetchAll(B(59), 'name,service_area,fire_district_type,square_miles,estimated_households'),
  p => ({ n: (p.name || '').trim(), sa: (p.service_area || '').trim(), t: p.fire_district_type || '', hh: p.estimated_households || 0 }));
save('levee', await fetchAll(B(44), 'name,eff_date,url'), p => ({ n: p.name.trim(), y: (p.eff_date || '').slice(0, 4), u: p.url || '' }));
save('water', await fetchAll('Utilities/FeatureServer/15', 'pws_name'), p => ({ n: title(p.pws_name) }));
save('ward', await fetchAll(B(50), 'city_name,ward'), p => ({ c: p.city_name.trim(), w: (p.ward || '').trim() }));

// Law enforcement offices: sheriffs, city police and town marshals, and State Police troops
const LE = await fetchAll('Structure/FeatureServer/28', 'name,naicsdescr,address,city,fips,telephone');
const kind = d => /^SHERIFFS' OFFICES \(EXCEPT/.test(d) ? 'sheriff' : /^POLICE DEPARTMENTS|MARSHALS/.test(d) ? 'police' : /STATE POLICE|HIGHWAY PATROL/.test(d) ? 'state' : null;
// keep city police and town marshals (not federal, campus, hospital or other special police), sheriffs, and State Police posts
const NOTCITY = /united states|\bu\.?s\.?\b|fire|universit|college|hospital|coroner|airport|housing|railroad|medical|school|\bstate\b|federal|\bparks?\b|game|capitol|veteran|national/i;
const keep = p => p.t === 'police' ? /police|marshal/i.test(p.n) && !NOTCITY.test(p.n) : p.t === 'state' ? /State Police/i.test(p.n) : true;
const pts = LE.map(f => ({ t: kind(f.properties.naicsdescr), n: title(f.properties.name), a: title(f.properties.address), c: title(f.properties.city),
  cf: (f.properties.fips || '').slice(2), ph: f.properties.telephone, ll: f.geometry?.coordinates?.map(v => +v.toFixed(5)) })).filter(p => p.t && p.ll && keep(p)).map(({ ph, ...p }) => p);
fs.writeFileSync(`${dir}/police.json`, JSON.stringify(pts)); console.log('police', pts.length);
