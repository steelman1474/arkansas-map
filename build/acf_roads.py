"""Build per-county road files from the Arkansas Centerline File (ACF / ARNOLD).

Input: a gzipped JSON list of rows downloaded from the Arkansas GIS Office
feature service (gis.arkansas.gov .../Transportation/FeatureServer/18), each:
[county_fips, name, rd_class, rd_surftyp, rd_design, ah_dist, ah_route, ah_section,
 ah_signed, city, zip, addr_from, addr_to, date_edited, length_m, paths]
Output: data/web/roads/05xxx.json (TopoJSON, one per county)
Usage: python3 build/acf_roads.py /path/to/ar_acf_roads.json.gz
"""
import gzip, json, sys, os, subprocess, re, collections

src = sys.argv[1]
rows = json.load(gzip.open(src))

def norm_class(c, sg):
    sgl = (sg or '').strip().lower()
    if sgl in ('state', 'us', 'interstate', 'ar'): return 'State'
    c = (c or '').strip().lower()
    if c in ('county', 'co'): return 'County'
    if c in ('municipal', 'mu'): return 'City'
    if c in ('state', 'st', 'highway', 'freeway', 'frontage road', 'ramp'): return 'State'
    if c in ('federal', 'fe'): return 'Federal'
    if c in ('private', 'pr', 'mail', 'service'): return 'Private'
    if c == '': return 'Unknown'
    return 'Other'

def norm_surface(s):
    s = (s or '').strip().lower()
    if not s: return ''
    if 'unpav' in s or 'upaved' in s or s in ('u', 'dirt') or 'gravel' in s:
        return 'Unpaved, gravel' if 'gravel' in s else ('Unpaved, dirt' if 'dirt' in s else 'Unpaved')
    if s.startswith('p') or 'asphalt' in s or 'concrete' in s or 'chip' in s:
        for k, v in (('chip', 'Paved, chip seal'), ('asphalt', 'Paved, asphalt'), ('concrete', 'Paved, concrete')):
            if k in s: return v
        return 'Paved'
    return ''

def norm_design(d):
    d = (d or '').strip().lower()
    if d in ('single carriageway', 'sc'): return 'Two-way road'
    if d.startswith('dual') or d == 'dc': return 'Divided road'
    if 'ramp' in d or d in ('ra', 'rg'): return 'Ramp'
    if 'circle' in d or d == 'tc': return 'Roundabout'
    if 'frontage' in d: return 'Frontage road'
    if 'driveway' in d: return 'Driveway'
    return ''

def route_label(sg, rt):
    sg = (sg or '').strip().lower(); rt = (rt or '').strip().lstrip('0')
    if not rt: return ''
    if sg == 'interstate': return f'Interstate {rt}'
    if sg == 'us': return f'U.S. Highway {rt}'
    if sg in ('state', 'ar'): return f'Highway {rt}'
    return ''

RX_I = re.compile(r'^I[- ]?(\d+)\b(?!.*(Blvd|Dr|St|Ave))', re.I)
RX_US = re.compile(r'^(US|U\.S\.)\s*(Highway|Hwy|Route|Rte)?\s*(\d+)', re.I)
RX_ST = re.compile(r'^(State\s+|AR\s*|Ark\s+)?(Highway|Hwy)\s+(\d+)', re.I)
def infer_from_name(name):
    n = (name or '').strip()
    if re.match(r'^old\b', n, re.I): return None
    m = RX_I.match(n)
    if m: return f'Interstate {m.group(1)}'
    m = RX_US.match(n)
    if m: return f'U.S. Highway {m.group(3)}'
    m = RX_ST.match(n)
    if m: return f'Highway {m.group(3)}'
    return None

# county polygons for rows with no county code
sys.path.insert(0, os.path.dirname(__file__))
need_cty = [r for r in rows if not r[0]]
feats = collections.defaultdict(list)
if need_cty:
    topo = json.load(open('build/ar.topo.json'))
VALID = {f'{i:03d}' for i in range(1, 150, 2)}
for r in rows:
    cf, name, cls, surf, des, dist, rt, sec, sg, city, z, af, at, ed, ln, paths = r
    cf = (cf or '').strip(); cf = cf.zfill(3) if cf.isdigit() else ''
    if cf not in VALID: cf = ''
    props = {'n': (name or '').strip(), 'c': norm_class(cls, sg), 's': norm_surface(surf), 'd': norm_design(des),
             'r': route_label(sg, rt), 'di': (dist or '').strip(), 'ci': (city or '').strip(), 'z': (z or '').strip(),
             'af': af or 0, 'at': at or 0, 'ed': (ed or '')[:8], 'len': ln or 0, 'cf': cf or '', 'inf': 0}
    if props['c'] in ('Unknown', 'Federal') or (props['c'] == 'State' and not props['r']):
        guess = infer_from_name(name)
        if guess:
            props['c'] = 'State'; props['r'] = props['r'] or guess; props['inf'] = 1
    feats[cf or ''].append({'type': 'Feature', 'properties': props, 'geometry': {'type': 'MultiLineString', 'coordinates': paths}})

# assign rows without a county by their first vertex, using the township-based county outlines
if '' in feats:
    import subprocess
    tmp = '/tmp/acf_nocounty.geojson'
    json.dump({'type': 'FeatureCollection', 'features': feats.pop('')}, open(tmp, 'w'))
    subprocess.run(['node', '-e', '''
const fs=require("fs"),tc=require("topojson-client"),d3=require("d3-geo");
const t=JSON.parse(fs.readFileSync("build/ar.topo.json")),F=JSON.parse(fs.readFileSync("/tmp/acf_nocounty.geojson"));
const C={};for(const k of Object.keys(t.cnames))C[k]={type:"Feature",geometry:tc.merge(t,t.objects.townships.geometries.filter(g=>g.properties.cf===k))};
for(const f of F.features){const p=f.geometry.coordinates[0][0];f.properties.cf=Object.keys(C).find(k=>d3.geoContains(C[k],p))||"";}
fs.writeFileSync("/tmp/acf_nocounty.geojson",JSON.stringify(F));'''], check=True)
    for f in json.load(open(tmp))['features']:
        if f['properties']['cf']: feats[f['properties']['cf']].append(f)

for cf, fs in feats.items():
    known = {}
    for f in fs:
        r = f['properties']['r']
        if r and not f['properties']['inf']:
            m = re.search(r'(\d+)$', r)
            if m and not r.startswith('Highway'): known[m.group(1)] = r
    for f in fs:
        r = f['properties']['r']
        if f['properties']['inf'] and r.startswith('Highway'):
            n = r.split()[-1]
            if n in known: f['properties']['r'] = known[n]

os.makedirs('data/web/roads', exist_ok=True)
for cf, fs in sorted(feats.items()):
    tmp = f'/tmp/acf_{cf}.geojson'
    json.dump({'type': 'FeatureCollection', 'features': fs}, open(tmp, 'w'))
    subprocess.run(['npx', 'mapshaper', '-i', tmp,
        '-dissolve', 'n,c,s,d,r,di,ci,z,inf', 'calc=af=min(af),at=max(at),ed=max(ed),len=sum(len)',
        '-simplify', '22%', 'keep-shapes',
        '-o', f'data/web/roads/05{cf}.json', 'format=topojson', 'quantization=100000'], check=True, capture_output=True)
    print(cf, len(fs))
