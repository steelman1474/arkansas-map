// Combines the template, libraries and map data into one self-contained index.html
import fs from 'fs';
// MapLibre module source, minus its source-map comment (the .map file isn't shipped). It's inlined as raw text inside a
// <script type="text/plain">, so it must not contain anything that would end that tag early.
const lib = f => {
  const s = fs.readFileSync('node_modules/maplibre-gl/dist/' + f, 'utf8').replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
  if (/<\/script|<!--/i.test(s)) throw new Error(f + ' contains </script or <!-- and cannot be inlined as text');
  return s;
};
let t = fs.readFileSync('build/template.html', 'utf8');
t = t.replace('/*D3*/', () => fs.readFileSync('node_modules/d3/dist/d3.min.js', 'utf8'))
     .replace('/*MAPLIBRE*/', () => lib('maplibre-gl.mjs'))
     .replace('/*MAPLIBREWORKER*/', () => lib('maplibre-gl-worker.mjs'))
     .replace('/*MAPLIBRECSS*/', () => fs.readFileSync('node_modules/maplibre-gl/dist/maplibre-gl.css', 'utf8'))
     .replace('/*TOPO*/', () => fs.readFileSync('node_modules/topojson-client/dist/topojson-client.min.js', 'utf8'))
     .replace('/*DATA*/', () => fs.readFileSync('build/ar.topo.json', 'utf8'))
     .replace('/*APP*/', () => fs.readFileSync('build/app.js', 'utf8'));
fs.writeFileSync('index.html', t);
console.log('index.html written,', (fs.statSync('index.html').size/1e6).toFixed(1), 'MB');
