const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const G = require("../engine.js");

test("どのサイズの空き地でも10種類から選び、費用を1回だけ支払う", () => {
  assert.equal(Object.keys(G.buildings).length, 10);
  for (const plot of G.plots) for (const [id,building] of Object.entries(G.buildings)) {
    const s = G.initial();
    const price = G.townPrice(plot,building);
    s.gold = price - 1;
    assert.throws(() => G.build(s,plot.id,id));
    assert.deepEqual(s.town.plots, {});
    assert.equal(s.gold,price - 1);
    s.gold++;
    G.build(s,plot.id,id);
    assert.equal(s.gold,0);
    s.gold = price;
    assert.throws(() => G.build(s,plot.id,id));
    assert.equal(s.gold,price);
    assert.equal(s.town.plots[plot.id],id);
  }
  const s = G.initial(), before = JSON.stringify(s);
  for (const args of [["unknown","shop"],["west","unknown"],["west","constructor"]])
    assert.throws(() => G.build(s,...args));
  assert.equal(JSON.stringify(s),before);
});

test("区画面積で収穫し、遠征後も休養後も翌週に一度だけ生産する", () => {
  let s = G.initial();
  s.gold = 2000;
  for (const [plot,kind] of Object.entries({square:"farm", brook:"farm", west:"forge",
    orchard:"shop", birch:"tavern", dawn:"inn", east:"school", mill:"bow", sunny:"magic", south:"wall", clover:"watch"}))
    G.build(s,plot,kind);
  assert.deepEqual(G.townTotals(s.town),{food:26,ore:1,income:23,strength:1,defense:23});
  const gold = s.gold;
  G.nextWeek(s,true);
  assert.deepEqual([s.town.food,s.stock.ore,s.gold,s.metrics[0]],[26,1,gold+53,1]);
  G.depart(s); G.returnHome(s);
  s = JSON.parse(JSON.stringify(s));
  const returned = s.gold;
  G.nextWeek(s);
  assert.deepEqual([s.town.food,s.stock.ore,s.gold,s.metrics[0]],[52,2,returned+23,2]);
  assert.throws(() => G.nextWeek(s));
  assert.equal(s.town.food,52);
});

// Exercise the actual maps, projection, model baking and cached drawing entry points.
function loadMap() {
  const noop = () => {};
  const context = new Proxy({
    createLinearGradient: () => ({addColorStop:noop}),
    getImageData: () => ({data:[0,0,0,0]})
  },{get: (target,key) => target[key] ?? noop});
  const sandbox = vm.createContext({Guild:G, document:{createElement:()=>({getContext:()=>context})},
    window:{matchMedia:()=>({matches:false})}, requestAnimationFrame:()=>1, cancelAnimationFrame:noop});
  for (const file of ["voxel.js","voxel-maps.js","scenery.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),sandbox);
  return vm.runInContext("({maps:GuildVoxelMaps, voxel:GuildVoxel, scenery:GuildScenery})",sandbox);
}

test("区画の地面をタイル単位で選べ、建築後の全巡回経路は占有を避ける", () => {
  const {maps,voxel} = loadMap(), view = voxel.views.town;
  const empty = maps.get("town"), tiles = new Set();
  for (const p of G.plots) {
    for (let col=0; col<p.size; col++) for (let row=0; row<p.size; row++) {
      const [px,py] = maps.farmTile(p,col,row);
      const key = [px,py].join(",");
      assert.ok(!tiles.has(key));
      tiles.add(key);
      assert.ok(px>0 && px<view.width && py>0 && py<view.height);
      assert.equal(empty.plotAtPixel(px,py)?.id,p.id);
    }
  }
  function lotsOnRoute(draw,id) {
    const {points,distances} = draw.routes[id], hits = new Set();
    assert.ok(points.length>1);
    for (let i=1;i<points.length;i++) {
      assert.ok(distances[i]>distances[i-1]);
      const [x,y] = voxel.projectGround(...points[i-1],0,view);
      const [a,b] = voxel.projectGround(...points[i],0,view);
      const steps = Math.ceil(Math.hypot(a-x,b-y));
      for (let k=0;k<=steps;k++) {
        const plot = empty.plotAtPixel(x+(a-x)*k/steps,y+(b-y)*k/steps);
        if (plot) hits.add(plot.id);
      }
    }
    return [...hits];
  }
  assert.deepEqual(lotsOnRoute(empty,"popo"),["clover"]);
  const ids=Object.keys(G.buildings);
  const built=Object.fromEntries(G.plots.map((p,i)=>[p.id,ids[i%ids.length]]));
  const developed=maps.get("town",built);
  assert.notEqual(developed,empty);
  assert.equal(maps.get("town",{...built}),developed);
  for (const id of ["mina","gald","popo","shion","toto","custom"])
    assert.deepEqual(lotsOnRoute(developed,id),[],id);
});

test("スクロール・縮小された地図のタップは該当区画を開き、街を離れると解除する", () => {
  const {maps,voxel,scenery} = loadMap(), view = voxel.views.town;
  const rect = {left:-223,top:104,width:view.width*.75,height:view.height*.75};
  const events = new Map(), selected = [];
  const canvas = {
    dataset:{scene:"town"}, clientWidth:rect.width,
    getContext:()=>({}), closest:()=>({clientWidth:375}), getBoundingClientRect:()=>rect,
    addEventListener:(name,fn)=>events.set(name,fn),
    removeEventListener(name,fn) { assert.equal(events.get(name),fn); events.delete(name); }
  };
  const stop = scenery.mount(canvas,{people:[],selectPlot:id=>selected.push(id)});
  for (const plot of G.plots) {
    const [x,y] = voxel.projectGround(...maps.plotCenter(plot),0,view);
    events.get("click")({clientX:rect.left+x*.75,clientY:rect.top+y*.75});
  }
  events.get("click")({clientX:rect.left+10,clientY:rect.top+10});
  assert.deepEqual(selected,G.plots.map(p=>p.id));
  stop();
  assert.equal(events.size,0);
});

test("石畳と川岸に沿って13区画の輪郭が閉じ、橋・川・広場・ギルド用地は選べない", () => {
  const {maps} = loadMap(), town = maps.get("town");
  assert.equal(maps.clearings.size,13);
  for (const {plot,edge} of maps.clearings.values()) {
    // Sample both sides of every edge, including the inward bends in the road.
    for (let i=0;i<edge.length;i++) {
      const [x,y] = edge[i], [a,b] = edge[(i+1)%edge.length];
      const len = Math.hypot(a-x,b-y), mx = (x+a)/2, my = (y+b)/2;
      const nx = (y-b)/len, ny = (a-x)/len;
      assert.equal(town.plotAtPixel(mx+nx,my+ny)?.id,plot.id);
      assert.equal(town.plotAtPixel(mx-nx,my-ny),undefined);
    }
  }
  for (const [x,y] of [
    [646,478],[515,485],[767,485], // plaza center and paving near either rim
    [771,283],[882,265],[991,270], // bridge and its approaches
    [718,146],[898,340],[1130,500], // river above and below the bridge
    [553,387],[646,354],[272,397],[657,644] // hall, lanes and junctions
  ]) assert.equal(town.plotAtPixel(x,y),undefined);
});

test("草地にポインターがある間だけ区画名を表示し、タッチは直接選択する", () => {
  const {maps,voxel,scenery} = loadMap(), view = voxel.views.town;
  const events = new Map(), visible = new Set(), picked = [];
  const viewport = { clientWidth:view.width, querySelector(selector) {
    const id = selector.match(/data-id="([^"]+)"/)[1];
    return {setAttribute:()=>visible.add(id),removeAttribute:()=>visible.delete(id)};
  }};
  const canvas = {dataset:{scene:"town"}, style:{}, clientWidth:view.width,
    getContext:()=>({}), closest:()=>viewport,
    getBoundingClientRect:()=>({left:0,top:0,width:view.width,height:view.height}),
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const stop = scenery.mount(canvas,{people:[],selectPlot:id=>picked.push(id)});
  function at(plot,pointerType="mouse") {
    const [clientX,clientY] = voxel.projectGround(...maps.plotCenter(plot),0,view);
    return {clientX,clientY,pointerType};
  }
  for (const plot of G.plots) {
    events.get("pointermove")(at(plot));
    assert.deepEqual([...visible],[plot.id]);
  }
  events.get("pointerleave")();
  const touch = at(G.plots[0],"touch");
  events.get("pointermove")(touch);
  assert.equal(visible.size,0);
  events.get("click")(touch);
  assert.deepEqual(picked,[G.plots[0].id]);
  stop();
  assert.equal(events.size,0);
});
