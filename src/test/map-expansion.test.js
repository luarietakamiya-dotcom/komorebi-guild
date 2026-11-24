const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const G = require("../engine.js");

function maps() {
  const ctx = new Proxy({}, {get:()=>()=>{}});
  class Picture { set src(id) { queueMicrotask(()=>this.onload()); } }
  const box = vm.createContext({Guild:G,Image:Picture,document:{createElement:()=>({getContext:()=>ctx})}});
  for (const file of ["stacks.js","voxel.js","voxel-maps.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),box);
  return vm.runInContext("({maps:GuildVoxelMaps,voxel:GuildVoxel})",box);
}

test("外周10区画の全タイルは16方位で画面内にあり、水彩地図は元の13区画を使う", async () => {
  const {maps:map,voxel} = maps();
  assert.equal(G.territoryPlots.length,23);
  assert.equal(new Set(G.territoryPlots.map(p=>p.id)).size,23);
  assert.equal(map.clearings.size,13);
  assert.deepEqual(Array.from(map.hallSite),[553,387]);
  const built = Object.fromEntries(G.outerPlots.map(p=>[p.id,"watch"]));
  const painted = map.get("town");
  assert.equal(map.get("town",built),painted);
  for (let i=0;i<voxel.directions;i++) {
    const camera = voxel.townCamera(i), town = map.get("town",{},camera);
    await town.prepare(id=>id);
    for (const p of G.outerPlots) {
      assert.equal(painted.plotAtPixel(...p.center),undefined);
      for (let row=0;row<p.size;row++) for (let col=0;col<p.size;col++) {
        const [x,y] = camera.project(...map.farmTile(p,col,row));
        assert.ok(x>0 && x<voxel.views.town.width && y>0 && y<voxel.views.town.height);
        assert.equal(town.plotAtPixel(x,y)?.id,p.id);
      }
    }
  }
});

test("5方向の侵攻路は領地の縁と広場を結び、区画に踏み込まず各2か所で迎撃できる", () => {
  const {maps:map,voxel} = maps(), camera = voxel.townCamera(0);
  const town = map.get("town",{},camera);
  function length(road) {
    return road.slice(1).reduce((d,[x,y],i)=>d+Math.hypot(x-road[i][0],2*(y-road[i][1])),0);
  }
  for (const [id,road] of Object.entries(G.territoryRoads)) {
    const [x,y] = road[0], rim = Math.hypot((x-690)/1080,(y-390)/550);
    assert.ok(rim>.96 && rim<1,id);
    assert.deepEqual(road.at(-1),[635,470,"hall"]);
    assert.ok(length(road)>length(G.raidRoads[id])*1.6,id);
    assert.ok((road.length-G.raidRoads[id].length)*G.raidBeat>=20000,id);
    for (let i=1;i<road.length;i++) {
      const [ax,ay] = road[i-1], [bx,by] = road[i];
      const samples = Math.ceil(Math.hypot(bx-ax,by-ay));
      for (let j=0;j<=samples;j++)
        assert.equal(town.plotAtPixel(...camera.project(ax+(bx-ax)*j/samples,ay+(by-ay)*j/samples)),undefined,id);
    }
    const sites = G.outerPlots.filter(p=>p.road===id);
    assert.equal(sites.length,2);
    for (const site of sites) {
      const stop = G.approaches[id].find(stop=>stop[2]===site.id);
      assert.ok(stop,site.id);
      assert.ok(Math.hypot(stop[0]-site.center[0],2*(stop[1]-site.center[1]))<100,site.id);
    }
  }
});

test("街道沿いの塔は外周で迎撃し、旧区画の工房・報酬・進行位置を再読込で保持する", t => {
  t.mock.method(Math,"random",()=>.1);
  const reload = s=>G.restore(JSON.parse(JSON.stringify(s)));
  const s = G.initial();
  G.build(s,"west","shop","alchemy");
  G.build(s,"westPass","magic");
  G.nextWeek(s,true);
  G.nextWeek(s,true);
  G.nextWeek(s,true);
  assert.ok(s.raids.warning.outer);
  assert.equal(s.raids.warning.road,"west");
  G.holdDeparture(s);
  G.advanceTime(s,s.raids.warning.due+G.raidBeat);
  assert.ok(s.raids.active.hits.some(hit=>hit.source==="westPass"));
  const restored = reload(s);
  G.advanceTime(s,80000);
  G.advanceTime(restored,80000);
  assert.deepEqual(restored,s);
  assert.ok(restored.raids.reports[0].repelled);
  assert.equal(restored.town.workshops.west.type,"alchemy");
  assert.equal(G.townTotals(restored.town).defense,10);
});

test("旧セーブの予告・進行中の敵は領地を拡張しても旧街道の同じ地点から続く", () => {
  const s = G.initial();
  s.raids.warning = {road:"west",tier:0,count:3,boss:false,surprise:false,due:100};
  G.build(s,"eastTurn","bow");
  G.advanceTime(s,100+G.raidBeat);
  const restored = G.restore(JSON.parse(JSON.stringify(s)));
  const raid = restored.raids.active;
  assert.equal(G.raidRoute(raid),G.raidRoads.west);
  assert.equal(raid.enemies[0].step,1);
  assert.equal(G.raidRoute(raid)[raid.enemies[0].step][2],"west");
  assert.deepEqual(raid.hits,[]);
});
