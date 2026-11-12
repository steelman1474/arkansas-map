"""Decode data/processed/park_outlines.txt (compact delta-encoded OSM outlines) into park_outlines.geojson."""
import json, math
feats = []
for line in open('data/processed/park_outlines.txt', encoding='utf-8'):
    line = line.rstrip('\n')
    if not line: continue
    name, enc = line.split('=', 1)
    polys = []
    for poly in enc.split('|'):
        rings = []
        for ring in poly.split(';'):
            x = y = 0; pts = []
            for pair in ring.split(' '):
                dx, dy = pair.split(',')
                x += int(dx, 36); y += int(dy, 36)
                pts.append([x / 1e5, y / 1e5])
            if pts[0] != pts[-1]: pts.append(pts[0])
            rings.append(pts)
        polys.append(rings)
    geom = {'type': 'Polygon', 'coordinates': polys[0]} if len(polys) == 1 else {'type': 'MultiPolygon', 'coordinates': polys}
    feats.append({'type': 'Feature', 'properties': {'osm_name': name}, 'geometry': geom})
json.dump({'type': 'FeatureCollection', 'features': feats}, open('data/processed/park_outlines.geojson', 'w'))
print(len(feats), 'outlines')
