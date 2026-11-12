// Combines the template, libraries and map data into one self-contained index.html
import fs from 'fs';
let t = fs.readFileSync('build/template.html', 'utf8');
t = t.replace('/*D3*/', () => fs.readFileSync('node_modules/d3/dist/d3.min.js', 'utf8'))
     .replace('/*TILE*/', () => fs.readFileSync('node_modules/d3-tile/dist/d3-tile.min.js', 'utf8'))
     .replace('/*TOPO*/', () => fs.readFileSync('node_modules/topojson-client/dist/topojson-client.min.js', 'utf8'))
     .replace('/*DATA*/', () => fs.readFileSync('build/ar.topo.json', 'utf8'));
fs.writeFileSync('index.html', t);
console.log('index.html written,', (fs.statSync('index.html').size/1e6).toFixed(1), 'MB');
