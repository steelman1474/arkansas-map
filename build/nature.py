"""Build data/web/nature.topo.json: rivers, lakes, public lands and wildlife management areas.

Input: gzipped JSON {streams, lakes, pub, wma}, each a list of [attributes, esri_geometry]
downloaded from Arkansas GIS Office / ArDOT feature services:
  streams  gis.arkansas.gov .../Water/FeatureServer/31  (ADEQ stream order, so >= 3)
  lakes    gis.arkansas.gov .../Water/FeatureServer/7   (NHD medium-res lakes/reservoirs)
  pub      gis.ardot.gov .../CORE_BASE_LAYERS/FeatureServer/0 (Public Lands)
  wma      gis.arkansas.gov .../Boundaries/FeatureServer/37 (AGFC wildlife management areas)
Usage: python3 build/nature.py /path/to/ar_nature.json.gz
"""
import gzip, json, sys, subprocess, os
D = json.load(gzip.open(sys.argv[1]))

def ring_area(r):
    return sum(r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1] for i in range(len(r)-1))/2

def poly(g):
    # esri rings -> GeoJSON MultiPolygon (outer rings clockwise in esri; holes counter-clockwise)
    polys = []
    for r in g['rings']:
        if len(r) < 4: continue
        if ring_area(r) < 0 or not polys: polys.append([r])
        else: polys[-1].append(r)
    return {'type': 'MultiPolygon', 'coordinates': polys}

def lines(g):
    return {'type': 'MultiLineString', 'coordinates': g['paths']}

PUB = {'National Forest': 'nf', 'National Park': 'np', 'National Historic Park': 'np', 'National Wildlife Refuge': 'nwr',
       'Wilderness Area': 'wild', 'Natural Area': 'na', 'Military Reservation': 'mil', 'Military Boundary': 'mil',
       'City Park': 'lp', 'County Park': 'lp', 'Local Park': 'lp', 'Park': 'lp', 'Recreation Area': 'lp', 'Public Use Area': 'lp',
       'Park / Public Use Area': 'lp', 'Wayside Park': 'lp', 'Ball Fields': 'lp', 'Research Area': 'oth', 'Wildlife Demonstration Area': 'oth'}
layers = {'rivers': [], 'lakes': [], 'lands': [], 'wma': []}
for a, g in D['streams']:
    n = (a.get('gnis_name') or '').strip()
    layers['rivers'].append({'type': 'Feature', 'properties': {'n': n, 'o': a.get('so') or 0}, 'geometry': lines(g)})
for a, g in D['lakes']:
    layers['lakes'].append({'type': 'Feature', 'properties': {'n': (a.get('gnis_name') or '').strip(), 'a': round(a.get('areasqkm') or 0, 3),
        't': 'Reservoir' if a.get('ftype') == 436 else 'Lake', 'e': a.get('elevation') or 0}, 'geometry': poly(g)})
for a, g in D['pub']:
    t = PUB.get((a.get('Type') or '').strip())
    if not t: continue
    layers['lands'].append({'type': 'Feature', 'properties': {'n': (a.get('Boundary_N') or '').strip(), 't': t, 'ty': (a.get('Type') or '').strip(),
        'ac': a.get('acres') or 0}, 'geometry': poly(g)})
for a, g in D['wma']:
    layers['wma'].append({'type': 'Feature', 'properties': {'n': (a.get('wma') or '').strip()}, 'geometry': poly(g)})

tmp = '/tmp/nature'; os.makedirs(tmp, exist_ok=True)
for k, fs in layers.items():
    json.dump({'type': 'FeatureCollection', 'features': fs}, open(f'{tmp}/{k}.geojson', 'w'))
    print(k, len(fs))
os.makedirs('data/web', exist_ok=True)
subprocess.run(['npx', 'mapshaper',
  '-i', f'{tmp}/rivers.geojson', f'{tmp}/lakes.geojson', f'{tmp}/lands.geojson', f'{tmp}/wma.geojson', 'combine-files', 'snap',
  '-dissolve', 'n,o', 'target=rivers', '-filter', 'o>=4 || n!=""', 'target=rivers',
  '-dissolve', 'n,t,ty', 'calc=ac=max(ac)', 'target=lands',
  '-dissolve', 'n', 'target=wma',
  '-simplify', '35%', 'keep-shapes', 'target=*',
  '-o', 'data/web/nature.topo.json', 'format=topojson', 'quantization=100000', 'target=*'], check=True)
print(os.path.getsize('data/web/nature.topo.json'))
