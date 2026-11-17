/* Arkansas map — drawn with MapLibre GL (GPU), panels and data logic in plain JS + d3 helpers */
const fmt = d3.format(",");
const sqmi = m => { const v=m/2589988.11; return v<10? v.toFixed(2) : v<100? v.toFixed(1) : fmt(Math.round(v)); };
const twps = topojson.feature(TOPO, TOPO.objects.townships).features;
const places = topojson.feature(TOPO, TOPO.objects.places).features;
const CN = TOPO.cnames;
const counties = Object.keys(CN).sort().map(cf=>{
  const geoms = TOPO.objects.townships.geometries.filter(g=>g.properties.cf===cf);
  const f = {type:"Feature", properties:{cf, n:CN[cf]}, geometry: topojson.merge(TOPO, geoms)};
  f.properties.la = d3.sum(geoms,g=>g.properties.la); f.properties.wa = d3.sum(geoms,g=>g.properties.wa); return f;});
const stateF = {type:"Feature", properties:{}, geometry: topojson.merge(TOPO, TOPO.objects.townships.geometries)};
const countyMesh = topojson.mesh(TOPO, TOPO.objects.townships, (a,b)=>a.properties.cf!==b.properties.cf && a!==b);
const countyBy = {}; counties.forEach(c=>countyBy[c.properties.cf]=c);
const twpBy = {}; twps.forEach(t=>twpBy[t.properties.id]=t);
const placesByC = {}, placesByT = {}, twpsByC = {};
counties.forEach(c=>{placesByC[c.properties.cf]=[]; twpsByC[c.properties.cf]=[];});
twps.forEach(t=>{twpsByC[t.properties.cf].push(t); placesByT[t.properties.id]=[];});
places.forEach(p=>{ if(p.properties.cf){placesByC[p.properties.cf].push(p); placesByT[p.properties.tw].push(p);} });
const byName=(a,b)=>a.properties.n.localeCompare(b.properties.n,undefined,{numeric:true});
[placesByC,placesByT,twpsByC].forEach(o=>Object.values(o).forEach(a=>a.sort(byName)));
const typeCount = t => places.filter(p=>p.properties.t===t).length;
["City","Town","CDP"].forEach(t=>document.getElementById("n-"+t).textContent=typeCount(t));
document.getElementById("n-Twp").textContent=fmt(twps.length);
document.getElementById("n-County").textContent=counties.length;
document.getElementById("d-inc").textContent=typeCount("City")+typeCount("Town");
document.getElementById("d-cdp").textContent=typeCount("CDP");
document.getElementById("d-twp").textContent=fmt(twps.length);
document.getElementById("d-park").textContent=TOPO.parks.length; document.getElementById("d-hist").textContent=fmt(TOPO.hist.length);
const typeName = {City:"City",Town:"Town",CDP:"Census-designated place"};
const PARKS = TOPO.parks; PARKS.forEach((p,i)=>p.id="pk"+i);
document.getElementById("n-Park").textContent=PARKS.length;
const HIST = TOPO.hist; HIST.forEach((h,i)=>h.id="hp"+i);
document.getElementById("n-Hist").textContent=fmt(HIST.length);
const histByC={}; HIST.forEach(h=>(histByC[h.cf]=histByC[h.cf]||[]).push(h)); Object.values(histByC).forEach(a=>a.sort((x,y)=>x.n.localeCompare(y.n)));
const CI=TOPO.cinfo;
const cRank=(()=>{const r={};Object.keys(CI).sort((a,b)=>CI[b][0]-CI[a][0]).forEach((cf,i)=>r[cf]=i+1);return r;})();
const jpCount=p=>p<20000?9:p<50000?11:p<200000?13:15;
const fmtP=p=>p==null?"—":fmt(p);
const seatsOf = cf=>places.filter(p=>p.properties.sc&&p.properties.sc.includes(cf));
const cnt = (a,t)=>a.filter(p=>p.properties.t===t).length;

/* ---------- helpers for map data ---------- */
const FC = fs => ({type:"FeatureCollection", features:fs});
const feat = (geometry, properties={}, id) => (id==null?{type:"Feature",geometry,properties}:{type:"Feature",id,geometry,properties});
const EMPTY = FC([]);
const bboxOf = f => d3.geoBounds(f.type?f:{type:"Feature",geometry:f});
const outerRings = g => g.type==="Polygon"?[g.coordinates[0]]:g.type==="MultiPolygon"?g.coordinates.map(p=>p[0]):[];
/* everything outside a shape: used to hide the world outside Arkansas, and outside the open county */
const maskOf = g => feat({type:"Polygon",coordinates:[[[-179,-80],[179,-80],[179,84],[-179,84],[-179,-80]],...outerRings(g).map(r=>[...r].reverse())]});
const reorient = f => { if(d3.geoArea(f)>2*Math.PI){const g=f.geometry; if(g.type==="Polygon") g.coordinates.forEach(r=>r.reverse()); else g.coordinates.forEach(p=>p.forEach(r=>r.reverse()));} return f;};

const mapEl = document.getElementById("map"), tip = d3.select("#tip");
const BG = "#eef1f3";
/* Themes: cities, towns, county lines and roads show on every theme; each theme adds its own layers (the panel rows tagged
   data-themes). THEMES lists which of a theme's layers start switched on. */
const THEMES={places:["CDP","Park"],gov:["School"],nature:["Water","NF","NPW","Park"],history:["Hist"]};
let theme="places";
function applyTheme(t){ theme=t;
  document.querySelectorAll("#layers [data-themes]").forEach(el=>{const inT=el.dataset.themes.split(" ").includes(t); el.classList.toggle("off",!inT);
    const cb=el.tagName==="LABEL"&&el.querySelector("input"); if(cb) mapEl.classList.toggle("hide-"+cb.dataset.layer,!(inT&&THEMES[t].includes(cb.dataset.layer)));});}
applyTheme(theme);
const isOn = k => !mapEl.classList.contains("hide-"+k);

/* ---------- the map ---------- */
const stateBox = bboxOf(stateF);
const padFor = () => { const open=!document.getElementById("layers").classList.contains("closed") && mapEl.clientWidth>860;
  return {left:open?300:30, right:64, top:40, bottom:70}; };
const glyphs = new URL("data/fonts/", location.href).href + "{fontstack}/{range}.pbf";
const map = new maplibregl.Map({container:"gl", attributionControl:false, dragRotate:false, pitchWithRotate:false, renderWorldCopies:false,
  maxZoom:18, fadeDuration:120, bounds:stateBox, fitBoundsOptions:{padding:padFor()},
  style:{version:8, glyphs, sources:{}, layers:[{id:"bg",type:"background",paint:{"background-color":BG}}]}});
map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation();
// for testing from the browser console (the app runs as a module, so its variables aren't global)
window.arDebug={map,get HWY(){return HWY},get HWY_GROUPS(){return HWY_GROUPS},keyTiger:P=>keyTiger(P)};
let stateZoom = null;

const R = "Noto Sans Regular", M = "Noto Sans Medium", IT = "Noto Sans Italic";
const zi = (...stops) => ["interpolate",["linear"],["zoom"],...stops];

/* layer bookkeeping: which toggle, which view (state/county) and whether it needs the plain background */
const LAYERS = []; // {id, on:()=>bool}
function add(layer, on){ map.addLayer(layer); if(on) LAYERS.push({id:layer.id, on}); }
function refreshVis(){ for(const L of LAYERS){ if(!map.getLayer(L.id)) continue; map.setLayoutProperty(L.id,"visibility",L.on()?"visible":"none"); }
  const types=["City","Town","CDP"].filter(isOn);
  ["places-fill","places-line"].forEach(id=>map.setFilter(id,["in",["get","t"],["literal",types]]));
  map.setFilter("place-dots",["all",["in",["get","t"],["literal",types]],["==",["get","cf"],openCF||"-"]]);
  map.setFilter("place-lbl",["all",["in",["get","t"],["literal",types]],["==",["get","cf"],openCF||"-"]]);
  const lands=["NF","NPW","WN","LP","MIL"].filter(isOn);
  ["land-fill","land-line"].forEach(id=>map.setFilter(id,["in",["get","L"],["literal",lands]]));
  map.setFilter("park-lbl", ["in",openCF||"-",["get","cfs"]]);
  map.setFilter("hist-lbl", ["==",["get","cf"],openCF||"-"]);
  /* on a county map, only that county's points and labels (everything else is hidden under the fade) */
  map.setFilter("hist-pt", openCF?["==",["get","cf"],openCF]:null);
  map.setFilter("park-pt", openCF?["all",["==",["get","a"],0],["in",openCF,["get","cfs"]]]:["==",["get","a"],0]);
  map.setFilter("twp-lbl", ["==",["get","cf"],openCF||"-"]);
  map.setPaintProperty("twp-fill","fill-color", openCF?"rgba(0,0,0,0)":"#a9cdee");
  map.setPaintProperty("twp-line","line-dasharray", openCF?[4,3]:[1,0]);
  map.setPaintProperty("twp-line","line-color", openCF?(basemap==="sat"?"#fff":"#3c6b98"):"#4f7fae");
  map.setPaintProperty("twp-line","line-width", openCF?0.9:0.4);
  if(map.getLayer("g-Police")) ["g-Police","g-Police-lbl"].forEach(id=>map.setFilter(id,openCF?["==",["get","cf"],openCF]:null));
  loadVisibleGov();
}
const inState = ()=>!openCF, inCounty = ()=>!!openCF, plain = ()=>basemap==="none";

map.on("load", () => {
  stateZoom = map.getZoom(); map.setMinZoom(stateZoom-1.2);
  /* background imagery */
  map.addSource("osm",{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,maxzoom:19});
  map.addSource("sat",{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19});
  add({id:"osm",type:"raster",source:"osm"}, ()=>basemap==="osm");
  add({id:"sat",type:"raster",source:"sat"}, ()=>basemap==="sat");

  /* counties */
  map.addSource("counties",{type:"geojson",data:FC(counties.map((c,i)=>feat(c.geometry,{cf:c.properties.cf,n:c.properties.n,_i:i},i)))});
  map.addLayer({id:"counties-fill",type:"fill",source:"counties",paint:{"fill-color":["case",["boolean",["feature-state","hover"],false],"#6fa6db","#9ec3e6"],"fill-opacity":1}});

  /* terrain shading picture */
  map.addSource("shade",{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:15});
  add({id:"shade",type:"raster",source:"shade",paint:{"raster-opacity":0.4,"raster-contrast":0.15}}, ()=>isOn("Terrain"));

  /* land and water */
  map.addSource("nat-areas",{type:"geojson",data:EMPTY,tolerance:0.5});
  map.addSource("nat-lakes",{type:"geojson",data:EMPTY,tolerance:0.5});
  map.addSource("nat-rivers",{type:"geojson",data:EMPTY,tolerance:0.5});
  const LC=["match",["get","t"],"nf","#5ea85a","np","#d08a3c","nwr","#d08a3c","wild","#4f8a5b","na","#4f8a5b","lp","#8fd18a","mil","#9a9a8a","wma","#c9b458","#a7c79a"];
  const LS=["match",["get","t"],"nf","#3f7a3b","np","#8a5420","nwr","#8a5420","wild","#2f5d39","na","#2f5d39","lp","#4f9a4a","mil","#5e5e52","wma","#8a7a2c","#6b8f5e"];
  const LO=["match",["get","t"],"nf",0.5,"np",0.62,"nwr",0.45,"lp",0.6,"wma",0.35,0.42];
  map.addLayer({id:"land-fill",type:"fill",source:"nat-areas",paint:{"fill-color":LC,"fill-opacity":["case",["boolean",["feature-state","hover"],false],["+",LO,0.18],LO]}});
  map.addLayer({id:"land-line",type:"line",source:"nat-areas",paint:{"line-color":LS,"line-width":0.6}});
  add({id:"lakes",type:"fill",source:"nat-lakes",paint:{"fill-color":["case",["boolean",["feature-state","hover"],false],"#4a8bd4","#2e6db4"],"fill-outline-color":"#1d4f8c"}}, ()=>isOn("Water"));
  const RW=(o,a,b,c)=>["==",["get","o"],o];
  const riverWidth=["interpolate",["linear"],["zoom"],6,["match",["get","o"],8,2,7,1.4,6,0.9,0.5],10,["match",["get","o"],8,3.2,7,2.4,6,1.8,5,1.3,4,1,0.7],14,["match",["get","o"],8,6,7,4.5,6,3.4,5,2.6,4,2,1.4]];
  [["rivers-big",6,0],["rivers-mid",4,8],["rivers-small",0,9.5]].forEach(([id,o,mz],i)=>{
    const f=i===0?[">=",["get","o"],6]:i===1?["all",[">=",["get","o"],4],["<",["get","o"],6]]:["<",["get","o"],4];
    add({id,type:"line",source:"nat-rivers",minzoom:mz,filter:f,layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"#2563a8","line-width":riverWidth,"line-opacity":["case",["<",["get","o"],4],0.75,1]}}, ()=>isOn("Water"));});

  /* Arkansas only: hide the world outside the state */
  map.addSource("mask-ar",{type:"geojson",data:maskOf(stateF.geometry)});
  map.addLayer({id:"mask-ar",type:"fill",source:"mask-ar",paint:{"fill-color":BG}});

  /* townships and places */
  map.addSource("twps",{type:"geojson",data:FC(twps.map((t,i)=>feat(t.geometry,{cf:t.properties.cf,_i:i},i)))});
  add({id:"twp-fill",type:"fill",source:"twps",paint:{"fill-color":"#a9cdee","fill-opacity":["case",["boolean",["feature-state","hover"],false],0.0,1]}}, ()=>isOn("Twp"));
  add({id:"twp-hover",type:"fill",source:"twps",paint:{"fill-color":"#4d95dd","fill-opacity":["case",["boolean",["feature-state","hover"],false],0.55,0]}}, ()=>isOn("Twp"));
  add({id:"twp-line",type:"line",source:"twps",paint:{"line-color":"#4f7fae","line-width":0.4}}, ()=>isOn("Twp"));
  map.addSource("places",{type:"geojson",data:FC(places.map((p,i)=>feat(p.geometry,{t:p.properties.t,cf:p.properties.cf||"",_i:i},i)))});
  const PC=["match",["get","t"],"City","#d44a3c","Town","#1fb3b3","#d99023"];
  map.addLayer({id:"places-fill",type:"fill",source:"places",paint:{"fill-color":["case",["boolean",["feature-state","hover"],false],"#ffd84a",PC]}});
  map.addLayer({id:"places-line",type:"line",source:"places",paint:{"line-color":"rgba(0,0,0,.55)","line-width":zi(6,0.3,11,0.8)}});

  /* state parks */
  map.addSource("parks-a",{type:"geojson",data:FC(PARKS.map((p,i)=>p.geo?feat(p.geo,{_i:i},i):null).filter(Boolean))});
  add({id:"park-area",type:"fill",source:"parks-a",paint:{"fill-color":["case",["boolean",["feature-state","hover"],false],"#5fd06e","#3aa04a"],"fill-opacity":0.65}}, ()=>isOn("Park"));
  add({id:"park-area-line",type:"line",source:"parks-a",paint:{"line-color":"#1f6b2b","line-width":1}}, ()=>isOn("Park"));

  /* county lines and state outline */
  map.addSource("cmesh",{type:"geojson",data:feat(countyMesh)});
  add({id:"cmesh",type:"line",source:"cmesh",paint:{"line-color":"#1d3550","line-width":zi(6,1,10,1.6)}}, ()=>isOn("County")&&inState());
  map.addSource("state",{type:"geojson",data:stateF});
  map.addLayer({id:"state-line",type:"line",source:"state",paint:{"line-color":"#111","line-width":2}});

  /* roads: county and local roads (county view), highways (everywhere) */
  map.addSource("roads",{type:"geojson",data:EMPTY,tolerance:0.3});
  add({id:"roads",type:"line",source:"roads",filter:["==",["get","kind"],"local"],layout:{"line-cap":"round","line-join":"round"},
    paint:{"line-color":["match",["get","c"],"Federal","#d7f0c8","#fff"],"line-opacity":["match",["get","c"],"City",0.75,"Private",0.55,"Unknown",0.55,0.9],
      "line-width":zi(8,0.5,12,1.2,15,3,17,6),"line-dasharray":["case",["==",["get","u"],1],["literal",[3,2]],["literal",[1,0]]]}}, ()=>isOn("Road")&&inCounty()&&plain());
  map.addSource("hwy",{type:"geojson",data:EMPTY,tolerance:0.3});
  add({id:"hwy-case",type:"line",source:"hwy",filter:["in",["get","k"],["literal",["U","I"]]],layout:{"line-cap":"round","line-join":"round","line-sort-key":["match",["get","k"],"I",2,1]},
    paint:{"line-color":["match",["get","k"],"I","#6b5214","#44607a"],"line-opacity":0.5,"line-width":zi(6,["match",["get","k"],"I",3,2.2],10,["match",["get","k"],"I",4.8,3.6],14,["match",["get","k"],"I",10,8])}}, ()=>isOn("Hwy")&&plain());
  add({id:"hwy",type:"line",source:"hwy",layout:{"line-cap":"round","line-join":"round","line-sort-key":["match",["get","k"],"I",2,"U",1,0]},
    paint:{"line-color":["case",["boolean",["feature-state","hover"],false],"#1c2a35",["match",["get","k"],"I","#f2c14e","#fff"]],"line-opacity":["match",["get","k"],"S",0.9,1],
      "line-width":zi(6,["match",["get","k"],"I",2,"U",1.3,0.8],10,["match",["get","k"],"I",3.4,"U",2.4,1.6],14,["match",["get","k"],"I",8,"U",6,4])}}, ()=>isOn("Hwy")&&plain());

  /* invisible, wider click targets for thin lines */
  add({id:"river-hit",type:"line",source:"nat-rivers",minzoom:8,paint:{"line-color":"#000","line-opacity":0,"line-width":10}}, ()=>isOn("Water")&&inCounty());
  add({id:"road-hit",type:"line",source:"roads",filter:["==",["get","kind"],"local"],paint:{"line-color":"#000","line-opacity":0,"line-width":10}}, ()=>isOn("Road")&&inCounty()&&plain());
  add({id:"hwy-hit",type:"line",source:"hwy",paint:{"line-color":"#000","line-opacity":0,"line-width":zi(6,3,9,6,12,12)}}, ()=>isOn("Hwy")&&plain());
  add({id:"seg-hit",type:"line",source:"roads",filter:["==",["get","kind"],"state"],paint:{"line-color":"#000","line-opacity":0,"line-width":12}}, ()=>isOn("Hwy")&&inCounty()&&plain());

  /* the open county: everything else fades away so the county reads as its own map */
  map.addSource("mask-c",{type:"geojson",data:EMPTY});
  map.addLayer({id:"mask-c",type:"fill",source:"mask-c",paint:{"fill-color":BG,"fill-opacity":0,"fill-opacity-transition":{duration:650}}});
  map.addSource("c-outline",{type:"geojson",data:EMPTY});
  map.addLayer({id:"c-outline",type:"line",source:"c-outline",paint:{"line-color":"#0d1f33","line-width":2.6}});

  /* selection highlight */
  map.addSource("hl",{type:"geojson",data:EMPTY});
  map.addLayer({id:"hl-fill",type:"fill",source:"hl",filter:["all",["==",["geometry-type"],"Polygon"],["==",["get","s"],"fill"]],paint:{"fill-color":"#ffd84a","fill-opacity":0.75}});
  map.addLayer({id:"hl-line",type:"line",source:"hl",filter:["!=",["geometry-type"],"Point"],layout:{"line-cap":"round","line-join":"round"},
    paint:{"line-color":["match",["get","s"],"fill","#000","#b5202e"],"line-width":["match",["get","s"],"fill",1.6,3.2]}});

  /* points: state parks without an outline, historic places */
  map.addImage("tri", triangle("#2e8b3d","#fff"), {pixelRatio:2});
  map.addImage("tri-hi", triangle("#5fd06e","#0b3d14"), {pixelRatio:2});
  map.addSource("parks-p",{type:"geojson",data:FC(PARKS.map((p,i)=>feat({type:"Point",coordinates:labelPoint(p)},{_i:i,n:p.n,cfs:p.cf,a:p.geo?1:0,sz:p.ac?Math.max(0.75,Math.min(1.5,0.55+Math.sqrt(p.ac)*0.012)):0.75},i)))});
  add({id:"park-pt",type:"symbol",source:"parks-p",filter:["==",["get","a"],0],layout:{"icon-image":"tri","icon-size":["get","sz"],"icon-allow-overlap":true}}, ()=>isOn("Park"));
  map.addSource("hist",{type:"geojson",data:FC(HIST.map((h,i)=>feat({type:"Point",coordinates:h.ll},{_i:i,n:h.n,cf:h.cf},i)))});
  add({id:"hist-pt",type:"circle",source:"hist",paint:{"circle-color":["case",["boolean",["feature-state","hover"],false],"#e3b6ff","#7b3fa0"],"circle-radius":zi(6,2,10,4,14,6),"circle-stroke-color":"#fff","circle-stroke-width":zi(6,0.5,10,1.2)}}, ()=>isOn("Hist"));
  map.addLayer({id:"hl-pt",type:"circle",source:"hl",filter:["==",["geometry-type"],"Point"],paint:{"circle-radius":zi(6,6,12,10),"circle-color":"rgba(0,0,0,0)","circle-stroke-color":"#b5202e","circle-stroke-width":3}});

  addGovLayers();

  /* labels */
  map.addSource("clabels",{type:"geojson",data:FC(counties.map(c=>feat({type:"Point",coordinates:d3.geoCentroid(c)},{n:c.properties.n})))});
  add({id:"clabels",type:"symbol",source:"clabels",layout:{"text-field":["get","n"],"text-font":[M],"text-size":zi(6,10,9,14),"text-padding":1},
    paint:{"text-color":"#14273b","text-halo-color":"rgba(255,255,255,.75)","text-halo-width":1.4}}, ()=>inState()&&labelsOn);
  map.addSource("twp-pts",{type:"geojson",data:FC(twps.map(t=>feat({type:"Point",coordinates:d3.geoCentroid(t)},{n:t.properties.n.replace(/ Township$/,""),cf:t.properties.cf})))});
  add({id:"twp-lbl",type:"symbol",source:"twp-pts",layout:{"text-field":["get","n"],"text-font":[IT],"text-size":zi(8,10,12,13)},paint:{"text-color":"#1f4a75","text-halo-color":"rgba(255,255,255,.75)","text-halo-width":1.2}}, ()=>isOn("Twp")&&inCounty());
  add({id:"park-lbl",type:"symbol",source:"parks-p",layout:{"text-field":["get","n"],"text-font":[M],"text-size":11.5,"text-offset":["case",["==",["get","a"],1],["literal",[0,0]],["literal",[0,1.2]]],"text-max-width":9},
    paint:{"text-color":"#1d5c27","text-halo-color":"rgba(255,255,255,.9)","text-halo-width":1.5}}, ()=>isOn("Park")&&inCounty());
  add({id:"hist-lbl",type:"symbol",source:"hist",minzoom:11,layout:{"text-field":["get","n"],"text-font":[M],"text-size":10.5,"text-anchor":"left","text-offset":[0.7,0],"text-max-width":12,"text-optional":true},
    paint:{"text-color":"#4a1f63","text-halo-color":"rgba(255,255,255,.9)","text-halo-width":1.4}}, ()=>isOn("Hist")&&inCounty());
  map.addSource("place-pts",{type:"geojson",data:FC(places.filter(p=>p.properties.ip).map(p=>feat({type:"Point",coordinates:p.properties.ip},{n:p.properties.n,t:p.properties.t,cf:p.properties.cf||"",seat:p.properties.sc?1:0})))});
  map.addLayer({id:"place-dots",type:"circle",source:"place-pts",paint:{"circle-radius":3,"circle-color":PC,"circle-stroke-color":"#111","circle-stroke-width":1}});
  map.addLayer({id:"place-lbl",type:"symbol",source:"place-pts",layout:{"text-field":["get","n"],"text-font":["case",["==",["get","seat"],1],["literal",[M]],["==",["get","t"],"City"],["literal",[M]],["literal",[R]]],
      "text-size":["case",["==",["get","seat"],1],15,["==",["get","t"],"City"],12.5,11],"text-anchor":"bottom","text-offset":[0,-0.4],"symbol-sort-key":["case",["==",["get","seat"],1],0,["==",["get","t"],"City"],1,2]},
    paint:{"text-color":"#111","text-halo-color":"rgba(255,255,255,.9)","text-halo-width":1.6}});

  refreshVis(); setBasemap(basemap); wireMap();
  loadHighways(); loadNature();
});

function triangle(fill,stroke){const s=28, c=document.createElement("canvas"); c.width=c.height=s; const x=c.getContext("2d");
  x.beginPath(); x.moveTo(s/2,3); x.lineTo(s-3,s-4); x.lineTo(3,s-4); x.closePath(); x.fillStyle=fill; x.fill(); x.lineWidth=2.4; x.strokeStyle=stroke; x.stroke();
  return x.getImageData(0,0,s,s);}
function labelPoint(p){ if(p.geo){ const c=d3.geoCentroid({type:"Feature",geometry:p.geo}); if(d3.geoContains({type:"Feature",geometry:p.geo},c)) return c; } return p.ll; }

/* ---------- highways and county roads ---------- */
let HWY=null, HWY_GROUPS=null; // HWY: one feature per route; HWY_GROUPS[routeIndex]: ids of the drawn pieces it runs on
const hwyName=d=>{const n=d.properties.n||""; return n.replace(/^I- ?/,"Interstate ").replace(/^US Hwy/,"U.S. Highway").replace(/^State Hwy/,"Highway")||"Highway";};
function loadHighways(){ fetch("data/web/highways.topo.json?v=2").then(r=>r.json()).then(tj=>{
  const B=buildHighways(tj); HWY=B.routes; HWY_GROUPS=B.groupsOf;
  map.getSource("hwy").setData(FC(B.pieces));
  if(openCF) loadCountyRoads(openCF);}).catch(e=>console.error("highways failed:",e)); }
/* Highways come from OpenStreetMap routes (build/highways.mjs), so a road two routes share (e.g. U.S. 62 and U.S. 412
   near Harrison) is in both. The map draws each stretch of road once, styled as its most important route, instead of
   stacking a copy per route; selecting a route still highlights all of it. */
const HWY_RANK={I:3,U:2,S:1};
function buildHighways(tj){
  const obj=tj.objects[Object.keys(tj.objects)[0]], arcsOf=g=>g.type==="LineString"?[g.arcs]:g.type==="MultiLineString"?g.arcs:[];
  const byKey=new Map(), routes=[];
  for(const g of obj.geometries){ const P=g.properties, key=keyTiger(P)||"?"+P.n;
    let r=byKey.get(key); if(!r){ byKey.set(key,r={key,k:P.k,n:P.n,arcs:new Set(),extra:[]}); routes.push(r); }
    for(const L of arcsOf(g)) for(const a of L) r.arcs.add(a<0?~a:a); }
  const line=i=>topojson.feature(tj,{type:"LineString",arcs:[i]}).geometry.coordinates, M=6371008.8, A=[];
  for(const r of routes) for(const i of r.arcs) if(!A[i]){ const c=line(i); A[i]={c,len:d3.geoLength({type:"LineString",coordinates:c})*M}; }
  // hairline breaks (under 100 m) where two pieces of a route don't quite meet after simplifying: join them
  for(const r of routes){ const deg=new Map(), parent=new Map(), find=x=>{while(parent.get(x)!==x)x=parent.get(x);return x;};
    for(const i of r.arcs){ const c=A[i].c, a=c[0]+"", b=c[c.length-1]+"";
      for(const n of [a,b]){ if(!parent.has(n)) parent.set(n,n); deg.set(n,(deg.get(n)||0)+1); } parent.set(find(a),find(b)); }
    const ends=[...deg].filter(([,d])=>d===1).map(([n])=>n);
    for(let x=0;x<ends.length;x++) for(let y=x+1;y<ends.length;y++){ const p=ends[x].split(",").map(Number), q=ends[y].split(",").map(Number);
      if(find(ends[x])!==find(ends[y])&&d3.geoDistance(p,q)*M<100){ r.extra.push([p,q]); parent.set(find(ends[x]),find(ends[y])); } } }
  // one route feature each (for selecting), and one drawn piece per set of routes sharing a stretch
  const onArc=new Map();
  routes.forEach((r,ri)=>{ for(const i of r.arcs){ if(!onArc.has(i)) onArc.set(i,[]); onArc.get(i).push(ri); } });
  const top=ris=>ris.slice().sort((x,y)=>HWY_RANK[routes[y].k]-HWY_RANK[routes[x].k]||((parseInt(routes[x].key.slice(1))||0)-(parseInt(routes[y].key.slice(1))||0)))[0];
  const mesh=arcs=>topojson.mesh(tj,{type:"GeometryCollection",geometries:arcs.map(i=>({type:"LineString",arcs:[i]}))}).coordinates;
  const groups=new Map();
  for(const [i,ris] of onArc){ const sig=ris.slice().sort((x,y)=>x-y).join(","); if(!groups.has(sig)) groups.set(sig,{ris,arcs:[],lines:[]}); groups.get(sig).arcs.push(i); }
  routes.forEach((r,ri)=>{ if(r.extra.length){ const sig=String(ri); if(!groups.has(sig)) groups.set(sig,{ris:[ri],arcs:[],lines:[]}); groups.get(sig).lines.push(...r.extra); } });
  const pieces=[], groupsOf=routes.map(()=>[]);
  for(const g of groups.values()){ const p=top(g.ris), gid=pieces.length;
    pieces.push(feat({type:"MultiLineString",coordinates:[...(g.arcs.length?mesh(g.arcs):[]),...g.lines]},{k:routes[p].k,_i:p},gid));
    g.ris.forEach(ri=>groupsOf[ri].push(gid)); }
  const feats=routes.map((r,ri)=>{ const shared=new Map();
    for(const i of r.arcs) for(const o of onArc.get(i)) if(o!==ri){ if(!shared.has(o)) shared.set(o,[]); shared.get(o).push(i); }
    return {type:"Feature",properties:{n:r.n,k:r.k,_i:ri,
        // routes sharing part of this one's road, with a sample point on each shared arc (to tell which county it's in)
        // (stretches under 300 m are just where two lines touch at a junction, not a shared road)
        shared:[...shared].map(([o,arcs])=>({ri:o,m:d3.sum(arcs,i=>A[i].len),pts:arcs.map(i=>A[i].c[Math.floor(A[i].c.length/2)])})).filter(x=>x.m>=300)},
      geometry:{type:"MultiLineString",coordinates:[...mesh([...r.arcs]),...r.extra]}}; });
  return {routes:feats,pieces,groupsOf};}
// "Runs together with" row for a route's detail panel; cf limits it to stretches inside that county
function sharedRow(d,cf){ const C=cf&&countyBy[cf];
  const os=(d.properties.shared||[]).filter(s=>!C||s.pts.some(p=>d3.geoContains(C,p))).map(s=>HWY[s.ri]).filter(o=>keyTiger(o.properties));
  if(!os.length) return "";
  return row("Runs together with",os.sort((x,y)=>HWY_RANK[y.properties.k]-HWY_RANK[x.properties.k]).map(o=>`<a href="#" data-hwy="${o.properties._i}">${keyTitle(keyTiger(o.properties))}</a>`).join(", "));}
const roadCache={}, roadPrep={};
const hwyKind=r=>/^Interstate/.test(r)?"I":/^U\.S\./.test(r)?"U":"S";
let ROADS=[], NEAR=[];
function loadCountyRoads(cf){
  const go=feats=>{ if(openCF!==cf) return; const P=roadPrep[cf]||(roadPrep[cf]=prepRoads(cf,feats));
    ROADS=[...P.local.map(f=>(f._kind="local",f)),...P.state.map(f=>(f._kind="state",f))]; NEAR=P.near;
    map.getSource("roads").setData(FC(ROADS.map((f,i)=>feat(f.geometry,{kind:f._kind,c:f.properties.c,u:/^Unpaved/.test(f.properties.s||"")?1:0,_i:i},i))));};
  if(!HWY) return;
  if(roadCache[cf]) return go(roadCache[cf]);
  fetch("data/web/roads/05"+cf+".json").then(r=>r.json()).then(tj=>{roadCache[cf]=topojson.feature(tj,tj.objects[Object.keys(tj.objects)[0]]).features.filter(f=>f.geometry&&f.geometry.coordinates&&f.geometry.coordinates.length); go(roadCache[cf]);})
   .catch(e=>console.error("roads for county "+cf+" failed:",e));}
/* local-road records that trace a highway (e.g. "Old Morrilton Highway" = U.S. 64) are folded into that highway */
function prepRoads(cf,feats){
  let local=feats.filter(f=>f.properties.c!=="State"); const state=feats.filter(f=>f.properties.c==="State");
  const C=countyBy[cf]; const [[x0,y0],[x1,y1]]=d3.geoBounds(C);
  const near=HWY.filter(h=>{const [[a0,b0],[a1,b1]]=h._b||(h._b=d3.geoBounds(h));return a1>=x0&&a0<=x1&&b1>=y0&&b0<=y1;});
  const mk=G=>{const grid=new Map(), cell=(x,y)=>Math.floor(x/G)+","+Math.floor(y/G);
    for(const h of near){const k=keyTiger(h.properties); if(!k) continue; const g=h.geometry; const Ls=g.type==="LineString"?[g.coordinates]:g.coordinates;
      for(const L of Ls) for(let i=1;i<L.length;i++){const a=L[i-1],b=L[i]; if(Math.max(a[0],b[0])<x0||Math.min(a[0],b[0])>x1||Math.max(a[1],b[1])<y0||Math.min(a[1],b[1])>y1) continue;
        const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(G/2))); for(let j=0;j<=n;j++){const c=cell(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n); if(!grid.has(c)) grid.set(c,k);}}}
    return (x,y)=>{const cx=Math.floor(x/G),cy=Math.floor(y/G); for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++){const k=grid.get((cx+i)+","+(cy+j)); if(k) return k;} return null;};};
  const coarse=mk(0.0004), fine=mk(0.00013), keep=[];
  for(const f of local){const g=f.geometry; const Ls=g.type==="LineString"?[g.coordinates]:g.coordinates; let n=0,hc=0,hf=0; const votes={};
    for(const L of Ls) for(const c of L){n++; const kc=coarse(c[0],c[1]); if(kc){hc++; votes[kc]=(votes[kc]||0)+1;} if(fine(c[0],c[1])) hf++;}
    const hwyNamed=/hwy|highway|\bus\b|interstate|^i[ -]?\d/i.test(f.properties.n||"");
    if(n>=2&&((hc/n>=0.85&&(hwyNamed||f.properties.len>=400))||(hf/n>=0.9&&f.properties.len>=80))){f.properties._k=Object.entries(votes).sort((a,b)=>b[1]-a[1])[0][0]; state.push(f);} else keep.push(f);}
  return {local:keep,state,near};}

/* one key per highway route, shared by Census lines and state-file segments */
const sufOf=n=>/\b(Bus|B)\b/i.test(n)?"Bus":/\b(Spr|Spur)\b/i.test(n)?"Spur":/\bByp\b/i.test(n)?"Byp":"";
const keyTiger=P=>{const m=(P.n||"").match(/(\d+[A-Z]?)/); return m?P.k+m[1]+sufOf(P.n):null;};
const keyACF=P=>{if(P._k) return P._k; const m=(P.r||"").match(/(\d+[A-Z]?)$/); return m?hwyKind(P.r)+m[1]:null;};
const keyTitle=k=>{const m=k.match(/^([IUS])(\d+[A-Z]?)(\w*)$/); if(!m) return "Highway";
  return ({I:"Interstate ",U:"U.S. Highway ",S:"Highway "})[m[1]]+m[2]+({Bus:" Business",Spur:" Spur",Byp:" Bypass"}[m[3]]||"");};
const keyKind=k=>({I:"Interstate",U:"U.S. highway",S:"State highway"})[k[0]];
const keyWiki=k=>{const m=k.match(/^([IUS])(\d+[A-Z]?)/); return m?(m[1]==="I"?`Interstate ${m[2]} in Arkansas`:m[1]==="U"?`U.S. Route ${m[2]} in Arkansas`:`Arkansas Highway ${m[2]}`):null;};
function hwyTipKey(k){return `<b>${keyTitle(k)}</b><br><span class=k>${keyKind(k)} · click for details</span>`;}
function routeInCounty(feats,C,cf){ // length without double-counting divided carriageways, plus towns crossed
  const cells=new Map(), towns=new Set(), pls=placesByC[cf]||[];
  for(const f of feats){const g=f.geometry; const lines=g.type==="LineString"?[g.coordinates]:g.coordinates;
    for(const L of lines) for(let i=1;i<L.length;i++){const a=L[i-1],b=L[i], mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      if(!d3.geoContains(C,mid)) continue; const key=Math.round(mid[0]/0.0025)+","+Math.round(mid[1]/0.0025);
      const len=d3.geoDistance(a,b); cells.set(key,Math.max(cells.get(key)||0,len));
      if(i%3===1){const pl=pls.find(q=>d3.geoContains(q,mid)); if(pl) towns.add(pl.properties.n);}}}
  let m=0; for(const v of cells.values()) m+=v;
  return {miles:m*6371008.8/1609.34, towns:[...towns]};}
function selectHighway(k,cf,seg){ if(!k) return;
  const lines=NEAR.filter(d=>keyTiger(d.properties)===k);
  const C=countyBy[cf], segs=(roadCache[cf]||[]).filter(x=>x.properties.c==="State"&&keyACF(x.properties)===k);
  highlight(lines.length?lines:segs,"line");
  const RI=lines.length?routeInCounty(lines,C,cf):null; const miles=RI?RI.miles:d3.sum(segs,x=>x.properties.len)/1609.34;
  const dist=d3.rollups(segs.filter(s=>s.properties.di),v=>v.length,s=>s.properties.di).sort((a,b)=>b[1]-a[1]).map(d=>d[0]);
  const towns=RI?RI.towns:[...new Set(segs.map(s=>{const c=s.geometry.coordinates[0]; const p=c[Math.floor(c.length/2)]; const pl=(placesByC[cf]||[]).find(q=>d3.geoContains(q,p)); return pl&&pl.properties.n;}).filter(Boolean))];
  const S=seg&&seg.properties, wt=keyWiki(k);
  const ed=S&&S.ed&&S.ed.length===8?`${S.ed.slice(4,6)}/${S.ed.slice(6,8)}/${S.ed.slice(0,4)}`:"";
  det().innerHTML=hero("Highway","Hwy",keyTitle(k),wt?`<div class="links">${ext("https://en.wikipedia.org/w/index.php?search="+encodeURIComponent(wt),"Wikipedia: route history")}</div>`:"",`${keyKind(k)} · ${cLink(cf)} County`)+
    stat(miles<0.1?Math.round(miles*5280)+" ft":miles.toFixed(1)+" mi","in "+CN[cf]+" County","accent")+stat("ArDOT",dist.length?"District "+dist.join(", "):"maintains it")+
    rows("Route in this county",row("Maintained by","Arkansas Department of Transportation")+(towns.length?row("Passes through",towns.join(", ")):"")+(lines[0]?sharedRow(lines[0],cf):""))+
    (S?rows("The stretch you clicked",(S.n?row("Local name",S.n):"")+(S.s?row("Surface",S.s):"")+(S.d?row("Road type",S.d):"")+(S.at>0?row("Addresses",`${fmt(S.af)}–${fmt(S.at)}`):"")+(S.z?row("ZIP code",S.z):"")+(ed?row("Last updated in state road file",ed):"")):"")+
    tile("span2 note","Build dates aren't recorded in the road data. The Wikipedia article covers when this route was designated and how it has changed.");
  wire();}
const roadTitle=P=>P.r||P.n||"Unnamed road";
function acfTip(d){const P=d.properties; return `<b>${roadTitle(P)}</b>${P.r&&P.n&&P.n!==P.r?`<br>${P.n}`:""}<br><span class=k>${({County:"County road",City:"City street",State:"State highway",Federal:"Federal road",Private:"Private road",Other:"Public road",Unknown:"Road"})[P.c]}${P.s?" · "+P.s.toLowerCase():""}</span><br><span class=k>Click for details</span>`;}
const wikiRoute=r=>{const m=r.match(/(\d+[A-Z]?)/); if(!m) return null; const n=m[1];
  return /^Interstate/.test(r)?`Interstate ${n} in Arkansas`:/^U\.S\./.test(r)?`U.S. Route ${n} in Arkansas`:`Arkansas Highway ${n}`;};
function selectRoad(d,cf){const P=d.properties;
  // the named road as a whole within this county
  const same=(roadCache[cf]||[]).filter(x=>x===d||(P.c==="State"&&P.r?x.properties.r===P.r&&x.properties.c==="State":P.n&&x.properties.n===P.n&&x.properties.c===P.c));
  highlight(same,"line");
  const miles=d3.sum(same,x=>x.properties.len)/1609.34;
  const mid=(()=>{const c=d.geometry.type==="LineString"?d.geometry.coordinates:d.geometry.coordinates[0]; return c[Math.floor(c.length/2)];})();
  const inPl=(placesByC[cf]||[]).find(p=>d3.geoContains(p,mid));
  const who={County:`${CN[cf]} County, through the county judge's road department`,
    City:inPl?`City of ${inPl.properties.n}`:`The city or town it runs through${P.ci?" ("+P.ci+")":""}`,
    State:`Arkansas Department of Transportation${P.di?`, District ${P.di}`:""}`,
    Federal:"A federal agency, such as the U.S. Forest Service or Army Corps of Engineers",
    Private:"A private owner. It isn't publicly maintained",Other:"Another public agency",Unknown:"Not recorded for this county in the state road file"}[P.c];
  const short={County:"County road",City:"City street",State:"State highway",Federal:"Federal road",Private:"Private road",Other:"Public road",Unknown:"Road"}[P.c];
  const wt=P.c==="State"&&P.r?wikiRoute(P.r):null;
  const ed=P.ed&&P.ed.length===8?`${P.ed.slice(4,6)}/${P.ed.slice(6,8)}/${P.ed.slice(0,4)}`:"";
  det().innerHTML=hero(P.c==="State"?"Highway":"Road",P.c==="State"?"Hwy":"Road",roadTitle(P),
      wt?`<div class="links">${ext("https://en.wikipedia.org/w/index.php?search="+encodeURIComponent(wt),"Wikipedia: route history")}</div>`:"",
      `${P.r&&P.n&&P.n!==P.r?P.n+" · ":""}${cLink(cf)} County${inPl?` · <a href="#" data-pl="${inPl.properties.id}">${inPl.properties.n}</a>`:""}`)+
    stat(short,"maintained by "+({County:CN[cf]+" County",City:inPl?inPl.properties.n:"the city",State:"ArDOT",Federal:"the federal government",Private:"a private owner",Other:"a public agency",Unknown:"unknown"})[P.c],"accent")+
    stat(miles<0.1?Math.round(miles*5280)+" ft":miles.toFixed(1)+" mi",P.c==="State"&&P.r?"of this highway in the county":"long in this county")+
    rows("Details",row("Maintained by",who)+(P.s?row("Surface",P.s):"")+(P.d?row("Road type",P.d):"")+(P.di?row("ArDOT district",P.di):"")+
      (P.at>0?row("Addresses",`${fmt(P.af)}–${fmt(P.at)}`):"")+(P.z?row("ZIP code",P.z):"")+(ed?row("Last updated in state road file",ed):"")+(P.inf?row("Note","Highway identified from the road name"):""))+
    tile("span2 note","Build dates aren't recorded in the state road file. Who maintains each road, its surface and its address ranges come from the Arkansas Centerline File kept by the Arkansas GIS Office and ArDOT."+(wt?" The Wikipedia article covers when this highway was designated and how its route changed.":""));
  wire();}
function selectTigerHwy(d){const P=d.properties, k=keyTiger(P), name=k?keyTitle(k):hwyName(d), wt=k?keyWiki(k):null;
  highlight(k?HWY.filter(h=>keyTiger(h.properties)===k):[d],"line");
  det().innerHTML=hero("Highway","Hwy",name,wt?`<div class="links">${ext("https://en.wikipedia.org/w/index.php?search="+encodeURIComponent(wt),"Wikipedia: route history")}</div>`:"",({I:"Interstate",U:"U.S. highway",S:"State highway"})[P.k])+
    stat("ArDOT","maintains state, U.S. and Interstate highways in Arkansas","accent span2")+
    (sharedRow(d)?rows("Route",sharedRow(d)):"")+
    tile("span2 note","Open a county to click individual stretches of road and see their surface, district and address details.");
  wire();}

/* ---------- land and water ---------- */
const LANDKIND={nf:"National forest",np:"National park site",nwr:"National wildlife refuge",wild:"Wilderness area",na:"Natural area",mil:"Military land",lp:"City or county park",oth:"Public land",wma:"Wildlife management area"};
const LANDWHO={nf:"U.S. Forest Service",np:"National Park Service",nwr:"U.S. Fish and Wildlife Service",wild:"Federal agency managing the surrounding land (usually the U.S. Forest Service or National Park Service)",
  na:"Arkansas Natural Heritage Commission (most natural areas)",mil:"U.S. military or Arkansas National Guard",lp:"The city or county",oth:"A public agency",wma:"Arkansas Game and Fish Commission"};
const landLayer=k=>({nf:"NF",np:"NPW",nwr:"NPW",wild:"WN",na:"WN",lp:"LP",mil:"MIL",oth:"LP",wma:"WMA"})[k];
let NAT=null, NLINK={};
fetch("data/web/nature_links.json?v=2").then(r=>r.json()).then(j=>NLINK=j).catch(()=>{});
/* Wikipedia article and official website when one is known; otherwise a Wikipedia search */
function natLinks(key,name,fs){let L=NLINK[key];
  if(L&&L.c&&fs){const near=fs.some(f=>{const [[x0,y0],[x1,y1]]=f._b||(f._b=d3.geoBounds(f)), p=.12; return L.c[0]>x0-p&&L.c[0]<x1+p&&L.c[1]>y0-p&&L.c[1]<y1+p;}); if(!near) L=null;}
  if(L) return `<div class="links">${ext(wpURL(L.w),"Wikipedia")}${L.s?ext(siteURL(L.s),"Official website"):""}</div>`;
  return name?`<div class="links">${ext("https://en.wikipedia.org/w/index.php?search="+encodeURIComponent(name+" Arkansas"),"Search Wikipedia")}</div>`:"";}
function loadNature(){ fetch("data/web/nature.topo.json?v=5").then(r=>r.json()).then(tj=>{
  const F=k=>topojson.feature(tj,tj.objects[k]).features.filter(f=>f.geometry);
  /* split each named river into connected stretches, so two different "Hurricane Creek"s are separate rivers */
  const riv=[]; F("rivers").forEach(f=>{const P=f.properties, parts=f.geometry.type==="MultiLineString"?f.geometry.coordinates:[f.geometry.coordinates];
    parts.forEach(c=>riv.push({type:"Feature",properties:{...P},geometry:{type:"LineString",coordinates:c}}));});
  const byNm=d3.group(riv.filter(f=>f.properties.n),f=>f.properties.n); let gid=0;
  byNm.forEach(fs=>{const par=fs.map((_,i)=>i), find=i=>par[i]===i?i:(par[i]=find(par[i]));
    /* join stretches when an end comes near another stretch of the same name. Rivers break where they pass through
       reservoirs, so rivers and bayous get a wide gap (~25 km); creeks only ~2 km so same-named creeks stay separate */
    const S=/River|Bayou/.test(fs[0].properties.n)?0.25:0.02, cell=(x,y)=>x+","+y, grid=new Map();
    fs.forEach((f,i)=>f.geometry.coordinates.forEach(p=>{const k=cell(Math.floor(p[0]/S),Math.floor(p[1]/S)); if(!grid.has(k)) grid.set(k,[]); grid.get(k).push([i,p]);}));
    fs.forEach((f,i)=>{const c=f.geometry.coordinates; [c[0],c[c.length-1]].forEach(p=>{const cx=Math.floor(p[0]/S), cy=Math.floor(p[1]/S);
      for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) (grid.get(cell(cx+dx,cy+dy))||[]).forEach(([j,q])=>{if(j!==i&&Math.hypot(q[0]-p[0],q[1]-p[1])<S) par[find(i)]=find(j);});});});
    const ids=new Map(); fs.forEach((f,i)=>{const r=find(i); if(!ids.has(r)) ids.set(r,gid++); f.properties.g=ids.get(r);});});
  NAT={rivers:riv, lakes:F("lakes").map(reorient), lands:F("lands").map(reorient), wma:F("wma").map(reorient)};
  NAT.wma.forEach(f=>f.properties.t="wma");
  /* the source layer tags a stray parcel in Ashley County as Ouachita National Forest; the forest is entirely in west-central Arkansas */
  NAT.lands.forEach(f=>{if(f.properties.n==="Ouachita National Forest"&&f.geometry.type==="MultiPolygon") f.geometry.coordinates=f.geometry.coordinates.filter(p=>p[0][0][1]>34);});
  NAT.areas=[...NAT.lands].sort((a,b)=>d3.geoArea(b)-d3.geoArea(a));
  map.getSource("nat-areas").setData(FC(NAT.areas.map((f,i)=>feat(f.geometry,{t:f.properties.t,L:landLayer(f.properties.t),_i:i},i))));
  map.getSource("nat-lakes").setData(FC(NAT.lakes.map((f,i)=>feat(f.geometry,{_i:i},i))));
  map.getSource("nat-rivers").setData(FC(NAT.rivers.map((f,i)=>feat(f.geometry,{o:f.properties.o||3,_i:i},i))));
}).catch(e=>console.error("land and water layer failed:",e)); }
const waterKind=n=>/river/i.test(n||"")?"River":/bayou/i.test(n||"")?"Bayou":/creek/i.test(n||"")?"Creek":"Stream";
function countiesTouched(f){const g=f.geometry, pts=[]; const walk=a=>typeof a[0]==="number"?pts.push(a):a.forEach(walk); walk(g.coordinates);
  const step=Math.max(1,Math.floor(pts.length/400)), hit=new Set(); for(let i=0;i<pts.length;i+=step){const c=counties.find(c=>d3.geoContains(c,pts[i])); if(c) hit.add(c.properties.cf);} return [...hit].sort((a,b)=>CN[a].localeCompare(CN[b]));}
function selectLand(d,cf){const P=d.properties; highlight([d],"line");
  const C=countiesTouched(d), acres=P.ac>0?P.ac:d3.geoArea(d)*6371008.8**2/4046.86;
  det().innerHTML=hero(LANDKIND[P.t],"Land",P.n||LANDKIND[P.t],natLinks((P.t==="wma"?"wma|":"land|")+P.n,P.n),P.ty||LANDKIND[P.t])+
    stat(fmt(Math.round(acres)),"acres","accent")+stat(C.length,C.length===1?"county":"counties")+
    rows("",row("Managed by",LANDWHO[P.t])+row(C.length===1?"County":"Counties",C.map(c=>cLink(c)).join(", ")))+
    tile("span2 note",P.t==="nf"?"National forest land within the boundary can include private inholdings; the outline shows the forest's proclaimed boundary.":P.t==="wma"?"Wildlife management areas are open to the public for hunting, fishing and wildlife viewing under Game and Fish rules.":"Boundaries come from ArDOT's public lands layer and the Arkansas GIS Office; acreage is approximate.");
  wire();}
function selectWater(d,kind,cf){const P=d.properties;
  const C=countiesTouched(d);
  if(kind==="lake"){ highlight([d],"line");
    det().innerHTML=hero(P.t,"Water",P.n||"Unnamed "+P.t.toLowerCase(),natLinks("lake|"+P.n,P.n,[d]),C.map(c=>cLink(c)+" County").join(", "))+
      stat(fmt(Math.round(P.a*247.1)),"acres of water","accent")+stat(P.a.toFixed(P.a<1?2:1),"square kilometers")+
      tile("span2 note",P.t==="Reservoir"?"A reservoir is a lake made by a dam. Most large lakes in Arkansas are reservoirs built by the U.S. Army Corps of Engineers or utilities.":"Outline from the U.S. Geological Survey's National Hydrography Dataset.");
  } else {
    const all=NAT.rivers.filter(r=>P.n&&r.properties.n===P.n&&r.properties.g===P.g); const same=all.length?all:[d];
    highlight(same,"line");
    const miles=d3.sum(same,f=>d3.geoLength(f))*6371.0088*0.621371; const CC=[...new Set(same.flatMap(countiesTouched))].sort((a,b)=>CN[a].localeCompare(CN[b]));
    const ord=d3.max(same,f=>f.properties.o)||P.o;
    det().innerHTML=hero(waterKind(P.n),"Water",P.n||"Unnamed stream",natLinks("river|"+P.n,P.n,same),"")+
      stat((miles<10?miles.toFixed(1):fmt(Math.round(miles)))+" mi","mapped in Arkansas","accent")+stat(ord,"stream order")+
      rows("",row(CC.length===1?"County":"Counties",CC.map(c=>cLink(c)).join(", ")))+
      tile("span2 note","Stream order measures size: two order-1 streams join to make an order-2 stream, and so on. Arkansas's biggest rivers reach order 8 or more. Only streams of order 3 and up are mapped.");
  }
  wire();}

/* ---------- government and politics ---------- */
/* boundary layers from the Arkansas GIS Office (build/gov.mjs), one file each, fetched the first time a layer is turned on.
   small: drawn thinner, labels only when zoomed in */
const GOVL={
  Pct:     {o:"precinct",c:"#3f6e1f",name:"Voting precinct",small:1},
  JP:      {o:"jp",      c:"#b0361f",name:"Quorum court district",small:1},
  Ward:    {o:"ward",    c:"#a8326e",name:"City ward",small:1},
  School:  {o:"school",  c:"#b8560f",name:"School district"},
  House:   {o:"house",   c:"#6d3aa8",name:"State House district"},
  Senate:  {o:"senate",  c:"#a02a62",name:"State Senate district"},
  Cong:    {o:"cong",    c:"#173f8a",name:"Congressional district"},
  Circuit: {o:"circuit", c:"#4f4596",name:"Judicial circuit"},
  DCourt:  {o:"dcourt",  c:"#7a5520",name:"District court"},
  Fire:    {o:"fire",    c:"#cf2d1e",name:"Fire district",small:1},
  WaterSys:{o:"water",   c:"#1f6fbf",name:"Water system",small:1},
  Levee:   {o:"levee",   c:"#1f7a7a",name:"Levee district"}
};
const GOVD={}, govWait={}; let POLICE=null;
const ordinal=n=>{n=+n; const s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]);};
const SIDE={N:"North",S:"South",E:"East",W:"West"};
const PARTY={R:"Republican",D:"Democrat",I:"Independent"};
const FIRET={MFD:"City fire department",RFD:"Rural fire department",FPD:"Fire protection district"};
const circuitName=c=>{const m=String(c).match(/^(\d+)([NSEW]?)/); return ordinal(m[1])+(m[2]?" "+SIDE[m[2]]:"");};
/* the source names are in all caps or loosely abbreviated: "Conway Vfd 1", "Mcgehee Waterworks", "Mt. Vernon/Enola*" */
const tidyName=n=>n.replace(/\*+$/,"").replace(/\b(Vfd|Fd|Rv|Sw|Se|Ne|Nw|Ahtd|Pwa|Wss|Rwd|Ppwa|Ag&f|Usfs|Ii|Iii|Iv)\b/g,w=>w.toUpperCase()).replace(/\bMc([a-z])/g,(m,c)=>"Mc"+c.toUpperCase()).trim();
function govName(K,d){const P=d.properties;
  switch(K){
    case "School": return /school|district/i.test(P.n)?P.n:P.n+" School District";
    case "House": return "State House District "+P.d;
    case "Senate": return "State Senate District "+P.d;
    case "Cong": return ordinal(P.d)+" Congressional District";
    case "Pct": return /precinct/i.test(P.n)?P.n:P.n+" precinct";
    case "JP": return "JP District "+P.d;
    case "Circuit": return circuitName(P.c)+" Judicial Circuit";
    case "DCourt": return /^Division/.test(P.n)?((govCounties(d).map(c=>CN[c])[0]||"")+" County District Court, "+P.n):/District$/.test(P.n)?P.n+" Court":P.n+" District Court";
    case "Fire": return /fire|vfd|department|district/i.test(P.n)?P.n:P.n+" Fire";
    case "Ward": return P.c+" "+P.w;
    default: return P.n;
  }}
const vacant=P=>P.p==="V"||/vacant/i.test(P.m);
const member=P=>vacant(P)?"Vacant":`${P.m} (${P.p})`;
const num=k=>["to-string",["get",k]];
const GOVLBL={Pct:["get","n"],JP:["concat","JP ",num("d")],Ward:["get","w"],School:["get","n"],House:["concat","House ",num("d")],
  Senate:["concat","Senate ",num("d")],Cong:["concat","District ",num("d")],Circuit:["get","lbl"],DCourt:["get","lbl"],
  Fire:["get","n"],WaterSys:["get","n"],Levee:["get","n"]};
function addGovLayers(){
  for(const [K,G] of Object.entries(GOVL)){
    map.addSource("g-"+K,{type:"geojson",data:EMPTY,tolerance:0.4}); map.addSource("g-"+K+"-pt",{type:"geojson",data:EMPTY});
    const on=()=>isOn(K);
    map.addLayer({id:"g-"+K+"-fill",type:"fill",source:"g-"+K,paint:{"fill-color":G.c,"fill-opacity":["case",["boolean",["feature-state","hover"],false],0.22,0]}},"cmesh");
    map.addLayer({id:"g-"+K+"-line",type:"line",source:"g-"+K,layout:{"line-join":"round"},paint:{"line-color":G.c,"line-opacity":0.9,
      "line-width":G.small?zi(6,0.5,10,1.1,14,2):zi(6,1.3,10,2.2,14,3)}},"cmesh");
    map.addLayer({id:"g-"+K+"-lbl",type:"symbol",source:"g-"+K+"-pt",minzoom:G.small?(K==="Ward"?11:9):0,
      layout:{"text-field":GOVLBL[K],"text-font":[M],"text-size":G.small?zi(9,10,13,12.5):zi(6,10,10,13),"text-max-width":8,"text-padding":2},
      paint:{"text-color":G.c,"text-halo-color":"rgba(255,255,255,.92)","text-halo-width":1.5}},"cmesh");
    ["-fill","-line","-lbl"].forEach(s=>LAYERS.push({id:"g-"+K+s,on}));
  }
  map.addSource("g-Police",{type:"geojson",data:EMPTY});
  map.addLayer({id:"g-Police",type:"circle",source:"g-Police",paint:{"circle-color":["case",["boolean",["feature-state","hover"],false],"#ffd84a",
      ["match",["get","t"],"sheriff","#8a6412","state","#4a5560","#1d3f8f"]],"circle-radius":zi(6,3,10,5,14,7),"circle-stroke-color":"#fff","circle-stroke-width":zi(6,0.8,10,1.5)}},"hl-pt");
  map.addLayer({id:"g-Police-lbl",type:"symbol",source:"g-Police",minzoom:10,layout:{"text-field":["get","n"],"text-font":[M],"text-size":10.5,"text-anchor":"left","text-offset":[0.8,0],"text-max-width":11,"text-optional":true},
    paint:{"text-color":"#1d3f8f","text-halo-color":"rgba(255,255,255,.92)","text-halo-width":1.4}},"hl-pt");
  LAYERS.push({id:"g-Police",on:()=>isOn("Police")},{id:"g-Police-lbl",on:()=>isOn("Police")&&inCounty()});
}
/* fetch a layer's file once; resolves when it's on the map */
function ensureGov(K){
  if(GOVD[K]) return Promise.resolve(GOVD[K]);
  return govWait[K]||(govWait[K]=fetch(`data/web/gov/${GOVL[K].o}.json?v=1`).then(r=>r.json()).then(tj=>{
    const fs=topojson.feature(tj,tj.objects[GOVL[K].o]).features.filter(f=>f.geometry).map(reorient);
    fs.forEach(f=>{const P=f.properties; if(P.n) P.n=tidyName(P.n); if(K==="Pct"&&/^\d/.test(P.n)) P.n="Precinct "+P.n; if(K==="Circuit") P.lbl=circuitName(P.c)+" Circuit"; if(K==="DCourt") P.lbl=P.n.replace(/ District$/,"");});
    GOVD[K]=fs;
    map.getSource("g-"+K).setData(FC(fs.map((f,i)=>feat(f.geometry,{_i:i},i))));
    map.getSource("g-"+K+"-pt").setData(FC(fs.map((f,i)=>feat({type:"Point",coordinates:[f.properties.lx,f.properties.ly]},{...f.properties,_i:i}))));
    return fs;}).catch(e=>{delete govWait[K]; console.error("government layer "+K+" failed:",e); return [];}));}
function ensurePolice(){
  if(POLICE) return Promise.resolve(POLICE);
  return govWait.Police||(govWait.Police=fetch("data/web/gov/police.json?v=1").then(r=>r.json()).then(a=>{POLICE=a;
    map.getSource("g-Police").setData(FC(a.map((p,i)=>feat({type:"Point",coordinates:p.ll},{t:p.t,n:p.n,cf:p.cf,_i:i},i)))); return a;})
    .catch(e=>{delete govWait.Police; console.error("law enforcement layer failed:",e); return [];}));}
function loadVisibleGov(){ if(!map.getSource("g-School")) return; for(const K in GOVL) if(isOn(K)) ensureGov(K); if(isOn("Police")) ensurePolice(); }
const ensureAllGov=()=>Promise.all([...Object.keys(GOVL).map(ensureGov),ensurePolice()]);
/* which features of a layer contain a point */
function govAt(K,ll){ return (GOVD[K]||[]).filter(f=>{const [[x0,y0],[x1,y1]]=f._b||(f._b=d3.geoBounds(f)); return ll[0]>=x0&&ll[0]<=x1&&ll[1]>=y0&&ll[1]<=y1&&d3.geoContains(f,ll);}); }
const govCounties=d=>d._cs||(d._cs=d.properties.cf?[d.properties.cf]:countiesTouched(d));
const areaOf=f=>d3.geoArea(f)*6371008.8**2;
function govTip(K,d){const P=d.properties; let s=`<b>${govName(K,d)}</b>`;
  if(K==="House"||K==="Senate") s+=`<br>${vacant(P)?"Seat vacant":(K==="House"?"Rep. ":"Sen. ")+member(P)}`;
  if(K==="JP") s+=`<br><span class=k>${CN[P.cf]} County quorum court${P.pop?` · ${fmt(P.pop)} people`:""}</span>`;
  if(K==="Pct") s+=`<br><span class=k>Voting precinct · ${CN[P.cf]||""} County</span>`;
  if(K==="Fire") s+=`<br><span class=k>${FIRET[P.t]||"Fire department"}${P.hh?` · ${fmt(P.hh)} households`:""}</span>`;
  if(K==="WaterSys") s+=`<br><span class=k>Public water system</span>`;
  if(K==="Levee"&&P.y) s+=`<br><span class=k>Formed ${P.y}</span>`;
  if(K==="Ward") s+=`<br><span class=k>City council ward</span>`;
  return s+`<br><span class=k>Click for everything at this spot</span>`;}
const branch=p=>/district|sub|annex|jail|detention|division|branch|office of|center/i.test(p.n.replace(/Sheriffs? Office/i,""))?1:0; // a sheriff's main office first
const policeKind={sheriff:"Sheriff's office",police:"Police department",state:"State Police"};
function policeTip(p){return `<b>${p.n}</b><br><span class=k>${policeKind[p.t]} · ${p.c}</span>`;}
const NOTE={
  School:"Each school district is governed by its own elected school board, separate from city and county government. Voters in the district approve its property tax (millage).",
  House:"The Arkansas House of Representatives has 100 members, each elected to a two-year term from a district of about 30,000 people. Member names are as listed by the Arkansas GIS Office.",
  Senate:"The Arkansas Senate has 35 members, elected to four-year terms from districts of about 86,000 people. Member names are as listed by the Arkansas GIS Office.",
  Cong:"Arkansas has four seats in the U.S. House of Representatives, each covering about 750,000 people. Both U.S. senators represent the whole state.",
  Pct:"A precinct is the smallest unit of an election: everyone in it gets the same ballot and usually votes at the same polling place. County election commissions draw precinct lines.",
  JP:"The quorum court is the county's legislature: it passes the budget and county ordinances. Each justice of the peace is elected from one district. Bigger counties have more districts (9 to 15).",
  Ward:"Cities are divided into wards for electing city council members (aldermen). Many small towns elect their council at large instead, so they have no wards here.",
  Circuit:"Circuit courts are Arkansas's main trial courts: felonies, larger lawsuits, divorce and family cases, probate and juvenile cases. A circuit covers one or more counties, and its judges are elected to six-year terms.",
  DCourt:"District courts handle misdemeanors, traffic tickets, small claims, smaller civil lawsuits, and first appearances in felony cases.",
  Fire:"City fire departments serve inside city limits. Rural fire departments, mostly volunteer, cover the countryside and are funded by dues or a county fire fee. Fire protection districts are created by the quorum court and can charge a yearly assessment.",
  WaterSys:"Public water systems include city waterworks, rural water associations and regional water authorities. Places outside every system generally rely on private wells.",
  Levee:"Levee districts build and maintain the flood levees along Arkansas's big rivers, paid for by a tax on the land they protect.",
  Police:"The sheriff is the county's elected chief law officer and runs the county jail; deputies patrol outside city limits. Cities have police departments, and some small towns have a town marshal. Locations come from a 2008 national inventory, so a few may have moved or closed."};
let spotLL=null;
const spotTile=`<section class="tile span2" id="spot"><h4>Everything at this spot</h4><p class="fine">Loading…</p></section>`;
/* a government district was clicked: its details, then every district covering the clicked spot */
function selectGov(K,d,ll){ spotLL=ll||spotLL; highlight([d],"line");
  const P=d.properties, cs=govCounties(d);
  const links=(K==="House"||K==="Senate")&&P.u?`<div class="links">${ext(P.u,K==="House"?"Arkansas House page":"Arkansas Senate page")}</div>`
    :K==="Cong"?`<div class="links">${ext(wpURL(`Arkansas's ${ordinal(P.d)} congressional district`),"Wikipedia")}</div>`
    :K==="Levee"&&P.u?`<div class="links">${ext(P.u,"Founding document")}</div>`:"";
  let st;
  if(K==="House"||K==="Senate") st=stat(vacant(P)?"Vacant":P.m,K==="House"?"state representative":"state senator","accent")+stat(PARTY[P.p]||"—","party");
  else if(K==="JP") st=stat(P.pop?fmt(P.pop):"—","people in 2020","accent")+stat(sqmi(areaOf(d)),"sq mi");
  else if(K==="Fire") st=stat(P.hh?fmt(P.hh):"—","households (estimate)","accent")+stat(FIRET[P.t]||"—","type");
  else if(K==="Levee") st=stat(P.y||"—","year formed","accent")+stat(sqmi(areaOf(d)),"sq mi");
  else st=stat(sqmi(areaOf(d)),"sq mi","accent")+stat(cs.length,cs.length===1?"county":"counties");
  det().innerHTML=hero(GOVL[K].name,"Gov",govName(K,d),links,(cs.length===1?"County: ":"Counties: ")+cs.map(c=>cLink(c)).join(", "))+st+
    tile("span2 note",NOTE[K])+spotTile;
  wire(); if(spotLL) renderSpot(spotLL);}
function selectPolice(p){ highlight([{ll:p.ll}]); spotLL=p.ll;
  det().innerHTML=hero(policeKind[p.t],"Gov",p.n,`<div class="links">${ext("https://www.google.com/search?q="+encodeURIComponent(p.n+" "+p.c+" Arkansas"),"Search the web")}</div>`,
      `${p.a?p.a+", ":""}${p.c}${p.cf&&CN[p.cf]?" · "+cLink(p.cf)+" County":""}`)+
    tile("span2 note",NOTE.Police)+spotTile;
  wire(); renderSpot(p.ll);}
function renderSpot(ll){
  ensureAllGov().then(()=>{ const el=document.getElementById("spot"); if(!el||spotLL!==ll) return;
    const one=(K,f2s)=>{const fs=govAt(K,ll); return fs.length?fs.map(f=>`<a href="#" data-gov="${K}:${GOVD[K].indexOf(f)}">${f2s?f2s(f):govName(K,f)}</a>`).join("<br>"):null;};
    const C=counties.find(c=>d3.geoContains(c,ll)), cf=C&&C.properties.cf;
    const pl=cf&&(placesByC[cf]||[]).find(p=>p.properties.t!=="CDP"&&d3.geoContains(p,ll));
    const tw=cf&&(twpsByC[cf]||[]).find(t=>d3.geoContains(t,ll));
    const sheriff=cf&&POLICE.filter(p=>p.t==="sheriff"&&p.cf===cf).sort((a,b)=>branch(a)-branch(b))[0];
    const cops0=pl?POLICE.filter(p=>p.t==="police"&&p.c.toLowerCase()===pl.properties.n.toLowerCase()):[];
    const cops=cops0.filter(p=>!/ - /.test(p.n)).length?cops0.filter(p=>!/ - /.test(p.n)):cops0; // the department, not each substation
    const pd=x=>`<a href="#" data-pol="${POLICE.indexOf(x)}">${x.n}</a>`;
    const R=[["U.S. House",one("Cong",f=>`${ordinal(f.properties.d)} District`)],
      ["State Senate",one("Senate",f=>`District ${f.properties.d}: ${member(f.properties)}`)],
      ["State House",one("House",f=>`District ${f.properties.d}: ${member(f.properties)}`)],
      ["County",cf?cLink(cf)+" County":null],
      ["Quorum court",one("JP",f=>`JP District ${f.properties.d}`)],
      ["City or town",pl?`<a href="#" data-pl="${pl.properties.id}">${pl.properties.n}</a>`:(cf?"None (unincorporated; the county governs)":null)],
      ["City ward",pl?(one("Ward",f=>f.properties.w)||"None mapped"):null],
      ["Township",tw?`<a href="#" data-tw="${tw.properties.id}">${tw.properties.n}</a>`:null],
      ["Voting precinct",one("Pct")],
      ["School district",one("School")],
      ["Fire protection",one("Fire")||"None mapped"],
      ["Water",one("WaterSys")||"No public system mapped (likely private wells)"],
      ["Levee district",one("Levee")],
      ["Circuit court",one("Circuit")],
      ["District court",one("DCourt")],
      ["Sheriff",sheriff?pd(sheriff):null],
      ["Police",cops.length?cops.map(pd).join("<br>"):null]];
    el.innerHTML=`<h4>Everything at this spot</h4>`+R.filter(r=>r[1]).map(([k,v])=>row(k,v)).join("")+
      `<p class="fine">Who governs and serves this exact spot. Click a name to see it on the map.</p>`;
    el.querySelectorAll("a[data-gov]").forEach(a=>a.onclick=e=>{e.preventDefault(); const [K,i]=a.dataset.gov.split(":"); selectGov(K,GOVD[K][+i],ll);});
    el.querySelectorAll("a[data-pol]").forEach(a=>a.onclick=e=>{e.preventDefault(); selectPolice(POLICE[+a.dataset.pol]);});
    wire(); });}

/* ---------- tooltips ---------- */
function countyTip(d){const a=placesByC[d.properties.cf]; const se=seatsOf(d.properties.cf);
  return `<b>${d.properties.n} County</b><br><span class=k>Population</span> ${fmt(CI[d.properties.cf][0])}<br>Seat: ${se.map(p=>p.properties.n).join(" & ")}<br>${cnt(a,"City")} cities · ${cnt(a,"Town")} towns · ${cnt(a,"CDP")} CDPs<br><span class=k>Click to open the county map</span>`;}
function parkTip(d){return `<b>${d.n}</b><span class="badge Park">State park</span><br><span class=k>County</span> ${d.cf.map(c=>CN[c]).join(", ")}${d.ac?`<br><span class=k>Size</span> ${fmt(d.ac)} acres`:""}${d.y?`<br><span class=k>Established</span> ${d.y}`:""}`;}
function histTip(d){const P=d.pl&&places.find(p=>p.properties.id===d.pl);
  return `<b>${d.n}</b><span class="badge Hist">Historic</span><br><span class=k>${P?P.properties.n+", ":""}${CN[d.cf]} County</span><br><span class=k>National Register #${d.r}</span>`;}
function twpTip(d){const P=d.properties;
  return `<b>${P.n}</b><span class="badge Twp">MCD</span><br><span class=k>County</span> ${CN[P.cf]}<br><span class=k>Land area</span> ${sqmi(P.la)} sq mi`;}
function placeTip(d){const P=d.properties;
  return `<b>${P.n}</b><span class="badge ${P.t}">${P.t}</span>${P.sc?`<br>County seat of ${P.sc.map(cf=>CN[cf]).join(", ")} County`:""}<br><span class=k>County</span> ${P.cf?CN[P.cf]:"—"}<br><span class=k>Population</span> ${fmtP(P.p)}`;}
function showTip(e,html){const r=mapEl.getBoundingClientRect();tip.html(html).style("opacity",1);
  const tw=tip.node().offsetWidth, th=tip.node().offsetHeight;
  let x=e.clientX-r.left+14, y=e.clientY-r.top+14;
  if(x+tw>r.width-6) x=e.clientX-r.left-tw-14; if(y+th>r.height-6) y=e.clientY-r.top-th-14;
  tip.style("left",x+"px").style("top",y+"px");}
function hideTip(){tip.style("opacity",0);}

/* ---------- what's under the mouse ---------- */
/* each clickable layer: how to find the original record, its tooltip, and what a click does */
const GOV_ORDER=["Ward","Pct","JP","Fire","WaterSys","School","Levee","House","Senate","DCourt","Circuit","Cong"];
let clickLL=null;
const GOV_PICK=Object.fromEntries(GOV_ORDER.map(K=>["g-"+K+"-fill",{get:f=>GOVD[K]&&GOVD[K][f.properties._i], tip:d=>govTip(K,d), click:d=>selectGov(K,d,clickLL)}]));
const PICK = {
  "g-Police":  {get:f=>POLICE&&POLICE[f.properties._i], tip:d=>policeTip(d), click:d=>selectPolice(d)},
  "hist-pt":   {get:f=>HIST[f.properties._i], tip:d=>histTip(d), click:d=>selectHist(d,true)},
  "park-pt":   {get:f=>PARKS[f.properties._i], tip:d=>parkTip(d), click:d=>selectPark(d,true)},
  "seg-hit":   {get:f=>ROADS[f.properties._i], tip:d=>hwyTipKey(segKey(d)||"S"), click:d=>{const k=segKey(d); k?selectHighway(k,openCF,d):selectRoad(d,openCF);}},
  "hwy-hit":   {get:f=>HWY[f.properties._i], tip:d=>hwyTipKey(keyTiger(d.properties)||"S"), click:d=>openCF?selectHighway(keyTiger(d.properties),openCF,null):selectTigerHwy(d)},
  "road-hit":  {get:f=>ROADS[f.properties._i], tip:d=>acfTip(d), click:d=>selectRoad(d,openCF)},
  ...GOV_PICK,
  "lakes":     {get:f=>NAT&&NAT.lakes[f.properties._i], tip:d=>`<b>${d.properties.n||"Unnamed lake"}</b><br><span class=k>${d.properties.t} · ${fmt(Math.round(d.properties.a*247.1))} acres</span>`, click:d=>selectWater(d,"lake",openCF), county:true},
  "river-hit": {get:f=>NAT&&NAT.rivers[f.properties._i], tip:d=>`<b>${d.properties.n||"Unnamed stream"}</b><br><span class=k>${waterKind(d.properties.n)} · click for details</span>`, click:d=>selectWater(d,"river",openCF)},
  "places-fill":{get:f=>places[f.properties._i], tip:d=>placeTip(d), click:d=>selectPlace(d,false)},
  "park-area": {get:f=>PARKS[f.properties._i], tip:d=>parkTip(d), click:d=>selectPark(d,true)},
  "twp-fill":  {get:f=>twps[f.properties._i], tip:d=>twpTip(d), click:d=>selectTwp(d,false)},
  "land-fill": {get:f=>NAT&&NAT.areas[f.properties._i], tip:d=>`<b>${d.properties.n||LANDKIND[d.properties.t]}</b><br><span class=k>${LANDKIND[d.properties.t]} · click for details</span>`, click:d=>selectLand(d,openCF), county:true},
  "counties-fill":{get:f=>counties[f.properties._i], tip:d=>openCF?`<b>${d.properties.n} County</b><br><span class=k>Unincorporated area — governed by the county</span>`:countyTip(d), click:d=>openCF?selectCounty(countyBy[openCF]):selectCounty(d)}
};
const HOVER = {...Object.fromEntries(GOV_ORDER.map(K=>["g-"+K+"-fill","g-"+K])),"g-Police":"g-Police","hist-pt":"hist","places-fill":"places","park-area":"parks-a","twp-fill":"twps","lakes":"nat-lakes","land-fill":"nat-areas","counties-fill":"counties","hwy-hit":"hwy"};
function pick(point){
  // in the Government theme a click is about districts, so county roads (which cover a county map) are not clickable
  const layers=Object.keys(PICK).filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,"visibility")!=="none"&&!(PICK[id].county&&!openCF)&&!(theme==="gov"&&(id==="road-hit"||id==="seg-hit")));
  const fs=map.queryRenderedFeatures([[point.x-3,point.y-3],[point.x+3,point.y+3]],{layers});
  if(openCF && fs.length){ // outside the open county counts as nothing
    const inside=d3.geoContains(countyBy[openCF],map.unproject(point).toArray()); if(!inside) return null; }
  for(const id of Object.keys(PICK)){ const f=fs.find(x=>x.layer.id===id); if(f){ const d=PICK[id].get(f); if(!d) continue;
      // a state-road-file stretch is labelled with one route, often loosely ("Highway 62" for U.S. 62/412); go by the
      // highway route drawn at the same spot when there is one
      if(id==="seg-hit"){ const h=fs.find(x=>x.layer.id==="hwy-hit"); d._hk=h&&HWY[h.properties._i]?keyTiger(HWY[h.properties._i].properties):null; }
      return {id,f,d}; } }
  return null;}
const segKey=d=>d._hk||keyACF(d.properties);
let hovered=null;
function setHover(h){ if(h&&h.id==="counties-fill"&&openCF) h=null;
  const key=h&&HOVER[h.id]&&h.f.id!=null?HOVER[h.id]+":"+(h.id==="hwy-hit"?"r"+h.f.properties._i:h.f.id):null;
  if(hovered&&hovered.key!==key){ hovered.fids.forEach(id=>map.setFeatureState({source:hovered.source,id},{hover:false})); hovered=null; }
  if(key&&!hovered){ hovered={key,source:HOVER[h.id],fids:h.id==="hwy-hit"?HWY_GROUPS[h.f.properties._i]:[h.f.id]};
    hovered.fids.forEach(id=>map.setFeatureState({source:hovered.source,id},{hover:true})); } }
function wireMap(){
  const canvas=map.getCanvas();
  map.on("mousemove",e=>{ if(map.isMoving()) return; const h=pick(e.point); setHover(h);
    if(h){ canvas.style.cursor="pointer"; showTip(e.originalEvent,PICK[h.id].tip(h.d)); } else { canvas.style.cursor=""; hideTip(); } });
  map.on("mouseout",()=>{hideTip(); setHover(null);});
  map.on("movestart",()=>{hideTip();});
  map.on("click",e=>{ hideTip(); clickLL=e.lngLat.toArray(); const h=pick(e.point);
    if(h) PICK[h.id].click(h.d); else if(openCF) selectCounty(countyBy[openCF]); else { highlight([]); resetDetail(); } });
}

/* ---------- selection highlight ---------- */
function highlight(list,style){
  const fs=[]; for(const d of list){ if(!d) continue;
    if(d.geometry) fs.push(feat(d.geometry,{s:style||(d.geometry.type.includes("Polygon")?"fill":"line")}));
    else if(d.geo) fs.push(feat(d.geo,{s:"fill"}));
    else if(d.ll) fs.push(feat({type:"Point",coordinates:d.ll},{s:"pt"})); }
  if(map.getSource("hl")) map.getSource("hl").setData(FC(fs));}

/* ---------- background ---------- */
const ATTR={osm:'Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  sat:'Imagery © Esri, Maxar, Earthstar Geographics, USDA, USGS'};
let basemap="none", labelsOn=true;
function setBasemap(v){basemap=v; mapEl.classList.remove("bm-osm","bm-sat"); if(v!=="none") mapEl.classList.add("bm-"+v);
  document.getElementById("layers").classList.toggle("no-roads",v!=="none");
  if(!map.getLayer("counties-fill")) return;
  map.setPaintProperty("counties-fill","fill-opacity",v==="none"?1:v==="osm"?0.18:0.04);
  placeFade();
  map.setPaintProperty("mask-ar","fill-color",BG);
  map.setPaintProperty("state-line","line-color",v==="sat"?"#fff":"#111");
  map.setPaintProperty("cmesh","line-color",v==="sat"?"rgba(255,255,255,.85)":"#1d3550");
  map.setPaintProperty("c-outline","line-color",v==="sat"?"#ffe14d":"#0d1f33");
  const sat=v==="sat";
  ["clabels","twp-lbl","park-lbl","hist-lbl","place-lbl"].forEach(id=>{map.setPaintProperty(id,"text-halo-color",sat?"rgba(0,0,0,.75)":"rgba(255,255,255,.9)");});
  map.setPaintProperty("clabels","text-color",sat?"#fff":"#14273b"); map.setPaintProperty("place-lbl","text-color",sat?"#fff":"#111");
  map.setPaintProperty("park-lbl","text-color",sat?"#d6ffd9":"#1d5c27"); map.setPaintProperty("hist-lbl","text-color",sat?"#f0d9ff":"#4a1f63");
  map.setPaintProperty("twp-lbl","text-color",sat?"#dbeaff":"#1f4a75");
  updateAttrib(); refreshVis();}
/* cities and towns are drawn lighter in the Government theme so district lines on top of them stay readable */
function placeFade(){ if(map.getLayer("places-fill")) map.setPaintProperty("places-fill","fill-opacity",(basemap==="none"?1:basemap==="osm"?0.5:0.35)*(theme==="gov"?0.45:1)); }
function updateAttrib(){const a=[]; if(basemap!=="none") a.push(ATTR[basemap]); if(isOn("Terrain")) a.push("Terrain © Esri");
  document.getElementById("attrib").innerHTML=a.join(" · ");}
document.querySelectorAll('input[name="bm"]').forEach(r=>r.onchange=()=>setBasemap(r.value));

/* ---------- state view and county view ---------- */
let openCF=null, flying=false;
const flyOpts = extra => ({padding:padFor(), duration:900, essential:true, ...extra});
function fitCounty(cf,opts={}){ const b=bboxOf(countyBy[cf]); map.fitBounds(b,flyOpts(opts)); }
function setTitles(cf){
  document.getElementById("ttl").textContent=cf?CN[cf]+" County":"";
  document.querySelector(".app").classList.toggle("cv",!!cf);
  document.title=cf?CN[cf]+" County · Arkansas map":"Arkansas Counties & Places";}
function openCounty(cf){
  if(openCF===cf){setTitles(cf);return;}
  openCF=cf; setTitles(cf); mapEl.classList.add("cview"); setHover(null);
  map.setMaxBounds(null); map.setMinZoom(stateZoom-1.2);
  const C=countyBy[cf];
  map.getSource("mask-c").setData(maskOf(C.geometry)); map.getSource("c-outline").setData(C);
  map.setPaintProperty("mask-c","fill-opacity",1);
  ROADS=[]; NEAR=[]; map.getSource("roads").setData(EMPTY); loadCountyRoads(cf);
  highlight([]); refreshVis(); drawInset();
  const b=bboxOf(C), cam=map.cameraForBounds(b,{padding:padFor()});
  map.fitBounds(b,flyOpts());
  map.once("moveend",()=>{ if(openCF!==cf) return;
    const w=b[1][0]-b[0][0], h=b[1][1]-b[0][1];
    map.setMinZoom(Math.max(0,(cam?cam.zoom:map.getZoom())-0.8));
    map.setMaxBounds([[b[0][0]-w*0.6,b[0][1]-h*0.6],[b[1][0]+w*0.6,b[1][1]+h*0.6]]); });}
function closeCounty(){ if(!openCF) return; openCF=null; setTitles(null); mapEl.classList.remove("cview");
  map.setMaxBounds(null); map.setMinZoom(stateZoom-1.2);
  map.setPaintProperty("mask-c","fill-opacity",0); map.getSource("c-outline").setData(EMPTY);
  ROADS=[]; NEAR=[]; map.getSource("roads").setData(EMPTY);
  highlight([]); resetDetail(); refreshVis(); drawInset();
  map.fitBounds(stateBox,flyOpts({duration:800})); }
function zoomToFeature(f,maxZoom){ map.fitBounds(bboxOf(f),flyOpts({maxZoom,duration:700})); }

/* locator inset */
const inset=d3.select("#inset"), iproj=d3.geoConicConformal().parallels([34.33,36.23]).rotate([92.2,0]), ipath=d3.geoPath(iproj);
function drawInset(){inset.selectAll("*").remove(); if(!openCF) return;
  iproj.fitExtent([[6,6],[154,124]],stateF);
  inset.append("g").selectAll("path").data(counties).join("path").attr("d",ipath).attr("class",d=>"i-c"+(d.properties.cf===openCF?" on":""));
  inset.append("path").datum(stateF).attr("d",ipath).attr("class","i-s");}
document.getElementById("insetwrap").onclick=()=>closeCounty();

/* ---------- side panel ---------- */
const det = ()=>document.getElementById("detail");
const row=(k,v)=>`<div class=row><span>${k}</span><b>${v}</b></div>`;
const dotList=a=>`<ul>${a.map(p=>`<li data-id="${p.properties.id}"><span class=dot style="background:var(--${p.properties.t?p.properties.t.toLowerCase():"twp"})"></span>${p.properties.n}</li>`).join("")}</ul>`;
function wire(){det().querySelectorAll("li[data-id],tr[data-id]").forEach(li=>li.onclick=()=>{const id=li.dataset.id;
    const p=places.find(x=>x.properties.id===id); p?selectPlace(p,true):selectTwp(twpBy[id],true);});
  det().querySelectorAll("a[data-cf]").forEach(a=>a.onclick=e=>{e.preventDefault();selectCounty(countyBy[a.dataset.cf]);});
  det().querySelectorAll("a[data-pl]").forEach(a=>a.onclick=e=>{e.preventDefault();selectPlace(places.find(p=>p.properties.id===a.dataset.pl),true);});
  det().querySelectorAll("a[data-hwy]").forEach(a=>a.onclick=e=>{e.preventDefault(); const h=HWY[+a.dataset.hwy]; openCF?selectHighway(keyTiger(h.properties),openCF,null):selectTigerHwy(h);});
  det().querySelectorAll("a[data-tw]").forEach(a=>a.onclick=e=>{e.preventDefault();selectTwp(twpBy[a.dataset.tw],true);});
  det().querySelectorAll("li[data-pk]").forEach(li=>li.onclick=()=>selectPark(PARKS.find(p=>p.id===li.dataset.pk)));
  det().querySelectorAll("li[data-hp]").forEach(li=>li.onclick=()=>selectHist(HIST.find(h=>h.id===li.dataset.hp)));}
const wpURL=t=>"https://en.wikipedia.org/wiki/"+encodeURIComponent(t.replace(/ /g,"_"));
const siteURL=s=>/^https?:/.test(s)?s:"https://"+s;
const ext=(href,label)=>`<a class="ext" href="${href}" target="_blank" rel="noopener">${label} ↗</a>`;
function linksBlock(wk,ws,fallback){
  const a=[];
  if(wk) a.push(ext(wpURL(wk),"Wikipedia"));
  else if(fallback) a.push(ext(fallback[0],fallback[1]));
  if(ws) a.push(ext(siteURL(ws),"Official website"));
  return `<div class="links">${a.join("")}</div>`;}
const cLink=cf=>`<a href="#" data-cf="${cf}">${CN[cf]}</a>`;
const tile=(cls,inner)=>`<section class="tile ${cls}">${inner}</section>`;
const stat=(v,l,cls="")=>tile("stat "+cls,`<b>${v}</b><span>${l}</span>`);
const hero=(kind,badgeCls,name,links,sub="")=>tile("hero span2",`<span class="badge ${badgeCls}">${kind}</span><h3>${name}</h3>${sub?`<p class="sub">${sub}</p>`:""}${links}`);
const rows=(title,html)=>tile("span2",`${title?`<h4>${title}</h4>`:""}${html}`);

function selectCounty(d){const cf=d.properties.cf;const fresh=openCF!==cf;openCounty(cf); highlight([]);
  if(!fresh) fitCounty(cf,{duration:500});
  const a=placesByC[cf], T=twpsByC[cf], CL=TOPO.clinks[cf], [pop,yr,nm]=CI[cf];
  const landSq=d.properties.la/2589988.11, S=seatsOf(cf);
  const inc=d3.sum(a.filter(p=>p.properties.t!=="CDP"),p=>p.properties.p||0), unin=Math.max(0,pop-inc), incPct=Math.min(100,Math.round(inc/pop*100));
  const byPop=[...a].sort((x,y)=>(y.properties.p||0)-(x.properties.p||0));
  const P=PARKS.filter(p=>p.cf.includes(cf)), H=histByC[cf]||[];
  det().innerHTML=
   hero("County","County",d.properties.n+" County",linksBlock(CL[0],CL[1]),`Seat: ${S.map(p=>`<a href="#" data-pl="${p.properties.id}">${p.properties.n}</a>`).join(" & ")}`)+
   stat(fmt(pop),"people in 2020","accent")+stat("#"+cRank[cf],"of 75 by population")+
   stat(fmt(Math.round(pop/landSq)),"people per sq mi")+stat(yr,"year formed")+
   rows("Government",row("County judge","1, elected executive")+row("Quorum court",`${jpCount(pop)} justices of the peace`)+row("Townships",`${T.length} (no government)`)+row("Cities · towns · CDPs",`${cnt(a,"City")} · ${cnt(a,"Town")} · ${cnt(a,"CDP")}`))+
   rows("Who governs where people live",`<div class="split"><span style="width:${incPct}%" class="inc"></span><span style="width:${100-incPct}%" class="un"></span></div>
     <div class="splitkey"><span><i class="inc"></i>City or town ≈${incPct}%<br>${fmt(inc)} people</span><span><i class="un"></i>County only ≈${100-incPct}%<br>${fmt(unin)} people</span></div>
     <p class="fine">City and town residents have a mayor and council on top of the county. Everyone else, CDP residents included, is governed directly by the county judge and quorum court.</p>`)+
   (a.length?rows("Places by population",`<table class="ptab">${byPop.map(p=>`<tr data-id="${p.properties.id}"><td><span class=dot style="background:var(--${p.properties.t.toLowerCase()})"></span>${p.properties.n}${p.properties.sc?'<span class="seattag">seat</span>':''}</td><td>${fmtP(p.properties.p)}</td></tr>`).join("")}</table>`):"")+
   (P.length?tile(H.length?"":"span2",`<h4>State parks</h4><ul class="pklist">${P.map(p=>`<li data-pk="${p.id}"><i class="sq park-sq"></i>${p.n}</li>`).join("")}</ul>`):"")+
   (H.length?tile(P.length?"":"span2",`<h4>Historic places <span class="cnt">${H.length}</span></h4><ul class="hplist">${H.map(h=>`<li data-hp="${h.id}">${h.n}</li>`).join("")}</ul>`):"")+
   rows("Townships",dotList(T))+
   rows("Facts",(nm?row("Named for",nm):"")+row("Land area",sqmi(d.properties.la)+" sq mi")+row("FIPS code","05"+cf));
  wire();}

function selectPark(d,stay){ if(!(stay&&openCF&&d.cf.includes(openCF))) openCounty(d.pc||d.cf[0]);
  highlight([d.geo?{geometry:d.geo}:{ll:d.ll}]);
  const blanch=d.n.startsWith("Blanchard");
  det().innerHTML=hero("State park","Park",d.n,linksBlock(d.wk,d.ws,["https://www.arkansasstateparks.com/parks","Arkansas State Parks"]),(d.cf.length>1?"Counties: ":"County: ")+d.cf.map(c=>cLink(c)).join(", "))+
   stat(d.ac?fmt(d.ac):"—","acres","accent")+stat(d.y||"—","year established")+
   rows("",(d.w?row("Water",d.w):"")+row("Run by",blanch?"Arkansas State Parks, on a U.S. Forest Service site":"Arkansas State Parks")+row("Boundary",d.geo?"OpenStreetMap outline (approximate)":"Location only"))+
   tile("span2 note","State parks are run by the state Department of Parks, Heritage and Tourism, not by the county they sit in.");
  wire();}

function selectHist(d,stay){ if(!(stay&&openCF===d.cf)) openCounty(d.cf);
  highlight([{ll:d.ll}]);
  const P=d.pl&&places.find(p=>p.properties.id===d.pl);
  det().innerHTML=hero("Historic place","Hist",d.n,`<div class="links">${d.wk?ext(wpURL(d.wk),"Wikipedia"):""}${ext("https://npgallery.nps.gov/AssetDetail/NRIS/"+d.r,"National Register file")}</div>`,
     `${P?`<a href="#" data-pl="${P.properties.id}">${P.properties.n}</a>, `:""}${cLink(d.cf)} County`)+
   stat(d.r,"National Register #","accent")+stat(P?"In town":"Rural","")+
   tile("span2 note","The National Register of Historic Places is the federal list of places worth preserving. Listing is mostly honorary: it doesn't stop a private owner from altering or demolishing a building, but it can qualify the property for tax credits and grants.");
  wire();}

function selectTwp(d,zoomIt){const P=d.properties;openCounty(P.cf); highlight([d],"fill");
  if(zoomIt) map.once("idle",()=>zoomToFeature(d,12)), setTimeout(()=>{ if(!map.isMoving()) zoomToFeature(d,12); },950);
  const a=placesByT[P.id];
  det().innerHTML=hero("Township","Twp",P.n,linksBlock(P.wk,P.ws,[wpURL(TOPO.clinks[P.cf][0]),CN[P.cf]+" County on Wikipedia"]),`${cLink(P.cf)} County`)+
   stat(sqmi(P.la),"sq mi of land","accent")+stat(a.length,a.length===1?"place centered here":"places centered here")+
   (a.length?rows("Places",dotList(a)):"")+
   rows("",row("Water area",sqmi(P.wa)+" sq mi")+row("Census GEOID",P.id))+
   tile("span2 note","Townships are Arkansas's minor civil divisions. They have no government of their own and mainly serve as constable election districts.");
  wire();}

function selectPlace(d,zoomIt){const P=d.properties; const wasOpen=openCF;
  if(P.cf&&!(openCF&&P.cf!==openCF&&!zoomIt))openCounty(P.cf); highlight([d],"fill");
  if(zoomIt){ if(wasOpen===P.cf) zoomToFeature(d,14); else setTimeout(()=>zoomToFeature(d,14),950); }
  const tw=P.tw&&twpBy[P.tw];
  det().innerHTML=hero(typeName[P.t],P.t,P.n,linksBlock(P.wk,P.ws,["https://en.wikipedia.org/w/index.php?search="+encodeURIComponent(P.n+" Arkansas"),"Search Wikipedia"]),
     (P.cf?cLink(P.cf)+" County":"")+(P.sc?` · county seat`:""))+
   stat(fmtP(P.p),"people in 2020","accent")+stat(sqmi(P.la),"sq mi of land")+
   rows("",row("Government",P.t==="CDP"?"None of its own (county governs)":"Mayor and council")+(P.sc?row("County seat of",P.sc.map(cf=>cLink(cf)).join(", ")):"")+
     row("Township",tw?`<a href="#" data-tw="${P.tw}">${tw.properties.n}</a>`:"—")+row("Water area",sqmi(P.wa)+" sq mi")+row("Census GEOID",P.id));
  wire();}

const defaultDetail=det().innerHTML; function resetDetail(){det().innerHTML=defaultDetail;}

/* ---------- controls ---------- */
/* browsers can restore old checkbox ticks on reload or Back; always make the boxes match what the map is showing */
const syncLayerBoxes=()=>document.querySelectorAll("[data-layer]").forEach(cb=>{cb.autocomplete="off"; cb.checked=isOn(cb.dataset.layer);});
syncLayerBoxes(); window.addEventListener("pageshow",syncLayerBoxes);
document.querySelectorAll("[data-layer]").forEach(cb=>cb.onchange=()=>{mapEl.classList.toggle("hide-"+cb.dataset.layer,!cb.checked);
  if(map.getLayer("counties-fill")){ refreshVis(); updateAttrib(); }});
document.getElementById("labels").onchange=e=>{labelsOn=e.target.checked; if(map.getLayer("clabels")) refreshVis(); updateAllBtn();};
/* one button that turns every layer on, or every layer off */
const allBtn=document.getElementById("allbtn"), allBoxes=()=>[...document.querySelectorAll("#layers label:not(.off) input[type=checkbox]:not(:disabled)")];
function updateAllBtn(){allBtn.textContent=allBoxes().every(cb=>cb.checked)?"Deselect all":"Select all";}
allBtn.onclick=()=>{const on=!allBoxes().every(cb=>cb.checked);
  allBoxes().forEach(cb=>{cb.checked=on; if(cb.dataset.layer) mapEl.classList.toggle("hide-"+cb.dataset.layer,!on);});
  labelsOn=document.getElementById("labels").checked;
  if(map.getLayer("counties-fill")){ refreshVis(); updateAttrib(); } updateAllBtn();};
document.querySelectorAll("#layers [data-layer]").forEach(cb=>cb.addEventListener("change",updateAllBtn));
updateAllBtn(); window.addEventListener("pageshow",updateAllBtn);
const themeRadios=[...document.querySelectorAll("input[name=theme]")];
const syncTheme=()=>themeRadios.forEach(r=>{r.autocomplete="off"; r.checked=r.value===theme;});
syncTheme(); window.addEventListener("pageshow",syncTheme);
themeRadios.forEach(r=>r.onchange=()=>{applyTheme(r.value); syncLayerBoxes(); placeFade();
  if(map.getLayer("counties-fill")){ refreshVis(); updateAttrib(); } updateAllBtn();});
document.getElementById("zin").onclick=()=>map.zoomIn();
document.getElementById("zout").onclick=()=>map.zoomOut();
document.getElementById("zreset").onclick=()=>openCF?fitCounty(openCF,{duration:600}):map.fitBounds(stateBox,flyOpts({duration:600}));
document.getElementById("crumb-home").onclick=e=>{e.stopPropagation(); if(openCF) closeCounty(); else {map.fitBounds(stateBox,flyOpts({duration:600})); highlight([]); resetDetail();}};
const layersEl=document.getElementById("layers"), layersBtn=layersEl.querySelector("button");
layersBtn.onclick=()=>{const c=layersEl.classList.toggle("closed"); layersBtn.setAttribute("aria-expanded",String(!c));};
if(window.matchMedia("(max-width:860px)").matches){layersEl.classList.add("closed");layersBtn.setAttribute("aria-expanded","false");}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&openCF&&document.activeElement!==q) closeCounty();});

/* ---------- search ---------- */
const index=[...counties.map(c=>({n:c.properties.n+" County",t:"County",f:c})),
  ...twps.map(t=>({n:t.properties.n,sub:CN[t.properties.cf],t:"Twp",f:t})),
  ...places.map(p=>({n:p.properties.n,t:p.properties.t,f:p})),
  ...PARKS.map(p=>({n:p.n,t:"Park",f:p})),
  ...HIST.map(h=>({n:h.n,sub:CN[h.cf],t:"Hist",f:h}))];
const q=document.getElementById("q"), res=document.getElementById("results");
q.oninput=()=>{const s=q.value.trim().toLowerCase(); if(!s){res.innerHTML="";return;}
  const hits=index.filter(i=>i.n.toLowerCase().includes(s)).sort((a,b)=>a.n.toLowerCase().indexOf(s)-b.n.toLowerCase().indexOf(s)||a.n.localeCompare(b.n)).slice(0,40);
  res.innerHTML=hits.map((h,i)=>`<li data-i="${i}">${h.n}${h.sub?` <span class=k>(${h.sub})</span>`:""}<span class="badge ${h.t}">${h.t==="Twp"?"MCD":h.t==="Park"?"State park":h.t==="Hist"?"Historic":h.t}</span></li>`).join("")||"<li>No matches</li>";
  res.querySelectorAll("li[data-i]").forEach(li=>li.onclick=()=>{const h=hits[+li.dataset.i]; res.innerHTML=""; q.blur();
    h.t==="County"?selectCounty(h.f):h.t==="Twp"?selectTwp(h.f,true):h.t==="Park"?selectPark(h.f):h.t==="Hist"?selectHist(h.f):selectPlace(h.f,true);});};
q.onkeydown=e=>{if(e.key==="Escape"){res.innerHTML="";q.blur();e.stopPropagation();} if(e.key==="Enter"){const f=res.querySelector("li[data-i]"); if(f) f.click();}};
document.addEventListener("click",e=>{if(!e.target.closest(".search")) res.innerHTML="";});
q.onfocus=()=>{if(q.value.trim()) q.oninput();};
