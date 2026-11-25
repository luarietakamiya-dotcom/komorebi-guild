const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const game = path.join(__dirname, "..");

test("静的な水平断面はモデルごとに一度だけ積み、住人の前後で同じスタンプを再利用する", async () => {
  const requests = [], layers = [], order = [];
  const noop = () => {};
  const document = {createElement() {
    const ctx = new Proxy({drawImage(...args) {
      if (args.length === 9) layers.push(args);
    }}, {get: (target,key) => target[key] ?? noop});
    return {getContext:() => ctx};
  }};
  class Picture {
    set src(id) {
      requests.push(id);
      // One 8-cell row suffices to check indexing and the number of projections.
      this.naturalWidth = 768;
      this.naturalHeight = 96;
      queueMicrotask(() => this.onload());
    }
  }
  const sandbox = vm.createContext({document,Image:Picture});
  for (const file of ["stacks.js","voxel.js"])
    vm.runInContext(fs.readFileSync(path.join(game,file),"utf8"),sandbox);
  const voxel = vm.runInContext("GuildVoxel",sandbox);
  const make = () => voxel.scene("town", [voxel.prop("guild",0,1,1,30),voxel.prop("guild",0,4,.8,24)]);
  const scene = make(), url = id => id;
  await Promise.all([scene.prepare(url),scene.prepare(url)]);
  assert.deepEqual(requests.sort(), ["ground_town","scenery_guild"]);
  assert.deepEqual([...new Set(layers.map(args => args[1]))], [0,96,192,288,384,480,576,672]);
  const projected = layers.length;
  const paint = {drawImage(canvas) { order.push(canvas.width === 276 ? "建物" : "地面"); }};
  for (const draw of [scene,make()]) {
    await draw.prepare(url);
    order.length = 0;
    draw(paint,[5,0,2].map(depth => ({depth,paint:() => order.push(depth)})));
    assert.deepEqual(order,["地面",0,"建物",2,"建物",5]);
  }
  assert.equal(layers.length,projected);
  assert.equal(requests.length,2);
});

test("水彩の建物は原画をそのまま描き、透明な余白をタップ対象から外す", async () => {
  const noop = () => {};
  const ink = new Proxy({}, {get: () => noop});
  const document = {createElement: () => ({getContext: () => ink})};
  class Picture {
    set src(id) {
      this.id = id;
      this.naturalWidth = 276;
      this.naturalHeight = 306;
      queueMicrotask(() => this.onload());
    }
  }
  const sandbox = vm.createContext({document, Image: Picture});
  vm.runInContext(fs.readFileSync(path.join(game, "voxel.js"), "utf8"), sandbox);
  const voxel = vm.runInContext("GuildVoxel", sandbox);
  const hall = voxel.prop("guild", 0, 0, 1, 30);
  const scene = voxel.scene("town", [hall]);
  await scene.prepare(id => id);
  const calls = [];
  scene({drawImage: (...args) => calls.push(args)}, []);
  const [sprite, x, y, width, height] = calls[1];
  assert.equal(sprite.id, "scenery_guild");
  assert.deepEqual([x,y,width,height], [hall.x-69,hall.y-116,138,153]);
  assert.equal(scene.pickProp(hall.x,hall.y-30), hall);
  assert.equal(scene.pickProp(x+1,y+1), undefined);
});

test("町のキャンバスに侵入路を進む魔物、持ち場の仲間、塔の迎撃を描く", async () => {
  const Guild = require("../engine.js"), state = Guild.initial();
  state.gold += Guild.buildings.bow.cost;
  Guild.build(state,"west","bow");
  while (!state.raids.warning) Guild.nextWeek(state,true);
  state.raids.warning.road="west";
  delete state.raids.warning.routeVersion; state.raids.warning.outer=false; // Watercolor save
  Guild.holdDeparture(state);
  Guild.advanceTime(state,state.raids.warning.due);
  let frame, fraction=0;
  const stamps=[], lines=[];
  const ctx=new Proxy({lineTo:(x,y)=>lines.push([x,y])},{get:(obj,key)=>obj[key] ?? (()=>{})});
  const canvas={dataset:{scene:"town"},getContext:()=>ctx,clientWidth:1393,closest:()=>({clientWidth:900})};
  const sandbox=vm.createContext({Guild,document:{createElement:()=>({getContext:()=>ctx})},
    requestAnimationFrame(fn) { frame=fn; return 1; },cancelAnimationFrame(){},
    GuildStacks:{draw(_ctx,id,_url,x,y) { stamps.push({id,x,y}); }},
    window:{matchMedia:()=>({matches:false})}});
  for (const name of ["voxel.js","voxel-maps.js","scenery.js"])
    vm.runInContext(fs.readFileSync(path.join(game,name),"utf8"),sandbox);
  const {maps,scenery}=vm.runInContext("({maps:GuildVoxelMaps,scenery:GuildScenery})",sandbox);
  const draw=(_ctx,actors)=>actors.forEach(a=>a.paint(ctx));
  draw.prepare=async()=>{};
  maps.get=()=>draw;
  const stop=scenery.mount(canvas,{people:[],url:id=>id,raidScene:()=>({
    raid:state.raids.active,defenders:Guild.raidDefenders(state),fraction
  })});
  await Promise.resolve();
  frame(0);
  const road=Guild.raidRoads.west;
  const boar=()=>stamps.findLast(p=>p.id==="boar");
  assert.deepEqual([boar().x,boar().y],road[0].slice(0,2));
  assert.ok(stamps.some(p=>p.id==="mina"));
  fraction=.5; frame(1);
  assert.equal(boar().x,(road[0][0]+road[1][0])/2);
  assert.equal(boar().y,(road[0][1]+road[1][1])/2);
  Guild.advanceTime(state,Guild.raidBeat);
  assert.ok(state.raids.active.hits.some(h=>h.source==="west"));
  fraction=.1; frame(2);
  assert.ok(lines.length);
  stop();
});

test("立体地形の守備位置・射線・射程が戦闘と同じ座標で描かれ、足止め中の敵は移動しない", async ()=>{
  const Guild=require("../engine.js"), s=Guild.initial();
  s.gold=10000; s.visitors=[];
  Guild.build(s,"westPass","wall");
  s.raids.warning={routeVersion:2,outer:true,road:"west",count:1,tier:2,due:1};
  Guild.assignGuard(s,"mina","front");
  Guild.holdDeparture(s);
  Guild.advanceTime(s,1);
  const raid=s.raids.active, road=Guild.raidRoute(raid), step=Guild.guardPost(raid,s.roster[0],0).step;
  Object.assign(raid.enemies[0],{step,hp:80,maxHP:80});
  Guild.advanceTime(s,Guild.raidBeat);
  const stamps=[], labels=[], rings=[];
  let frame, fraction=.2;
  const ctx=new Proxy({fillText:t=>labels.push(t),ellipse:(...a)=>rings.push(a)}, {get:(o,k)=>o[k] ?? (()=>{})});
  const canvas={dataset:{scene:"town"},getContext:()=>ctx,clientWidth:1393,closest:()=>({clientWidth:900})};
  const box=vm.createContext({Guild,document:{createElement:()=>({getContext:()=>ctx})},
    requestAnimationFrame(fn){frame=fn;return 1;},cancelAnimationFrame(){},
    GuildStacks:{draw(_ctx,id,_url,x,y){stamps.push({id,x,y});}},window:{matchMedia:()=>({matches:false})}});
  for (const file of ["voxel.js","voxel-maps.js","scenery.js"])
    vm.runInContext(fs.readFileSync(path.join(game,file),"utf8"),box);
  const {maps,scenery,camera}=vm.runInContext("({maps:GuildVoxelMaps,scenery:GuildScenery,camera:GuildVoxel.townCamera(3)})",box);
  const draw=(ctx,actors,highlight)=>{highlight(ctx);actors.forEach(a=>a.paint(ctx));};
  draw.prepare=async()=>{};
  maps.get=()=>draw;
  const plot=Guild.plotForSite("westPass");
  const stop=scenery.mount(canvas,{people:[],url:id=>id,camera,built:s.town.plots,activePlot:()=>plot,
    ranges:()=>[{center:plot.center,range:Guild.defenseStats(s,plot.id).range}],
    raidScene:()=>({raid,defenders:Guild.raidDefenders(s),fraction})});
  await Promise.resolve();
  frame(0);
  const enemy=()=>stamps.findLast(a=>a.id==="boar");
  const first=enemy(), [x,y]=camera.project(...road[step].slice(0,2));
  assert.ok(Math.hypot(first.x-x,first.y-y)<.001);
  fraction=.8; frame(1);
  assert.deepEqual(enemy(),first);
  assert.ok(rings.some(r=>r[0]===plot.center[0] && r[2]===Guild.defenseTypes.wall.range));
  assert.ok(labels.includes("バリケード・足止め") && labels.includes("ミナ"));
  stop();
});
