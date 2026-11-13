#!/bin/sh
# Rebuild road layers from Census TIGER/Line 2024 shapefiles.
# Download and unzip into $ROADS:
#   https://www2.census.gov/geo/tiger/TIGER2024/PRISECROADS/tl_2024_05_prisecroads.zip
#   https://www2.census.gov/geo/tiger/TIGER2024/ROADS/tl_2024_05<county FIPS>_roads.zip  (75 files)
# Usage: ROADS=/path/to/unzipped sh build/roads.sh
set -e
mkdir -p data/web/roads
# Interstates (I), U.S. highways (U) and state highways (S), merged by name
npx mapshaper -i $ROADS/tl_2024_05_prisecroads/*.shp \
  -filter '["I","U","S"].indexOf(RTTYP)>-1' -each 'k=RTTYP' -dissolve FULLNAME,k \
  -simplify 12% keep-shapes -filter-fields FULLNAME,k -rename-fields n=FULLNAME \
  -o data/web/highways.topo.json format=topojson quantization=100000
# Local roads (MTFCC S1400: county roads and city streets), one file per county
for d in $ROADS/tl_2024_05???_roads; do
  cf=$(basename $d | sed 's/tl_2024_\(05...\)_roads/\1/')
  npx mapshaper -i $d/*.shp -filter 'MTFCC=="S1400"' -dissolve FULLNAME -simplify 12% keep-shapes \
    -rename-fields n=FULLNAME -o data/web/roads/$cf.json format=topojson quantization=100000
done
