const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Guild = require("../engine.js");

function game() {
  const calls = [], actors = [], requests = [];
  const noop = () => {};
  const ctx = new Proxy({drawImage:(...args)=>calls.push(args)}, {get:(o,k)=>o[k] ?? noop});
  let frame;
  class Picture {
    set src(name) {
      if (name.startsWith("data:image/svg+xml")) {
        this.svg = decodeURIComponent(name.slice(name.indexOf(",")+1));
        this.complete = true;
        this.naturalWidth = 126;
        return;
      }
      this.name = name;
      requests.push(name);
      assert.ok(fs.existsSync(path.join(__dirname,"../assets",name+".webp")),name);
      if (name.startsWith("scenery_")) {
        this.naturalWidth = 276;
        this.naturalHeight = 306;
      }
      queueMicrotask(()=>this.onload());
    }
  }
  const box = vm.createContext({Guild,Image:Picture,document:{createElement:()=>({getContext:()=>ctx})},
    requestAnimationFrame:cb=>(frame=cb,1),cancelAnimationFrame:noop,window:{matchMedia:()=>({matches:false})}});
  for (const file of ["icons","stacks","voxel","voxel-maps","scenery"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file+".js"),"utf8"),box);
  const api = vm.runInContext("({maps:GuildVoxelMaps,voxel:GuildVoxel,scenery:GuildScenery,stacks:GuildStacks})",box);
  api.stacks.draw = (_ctx,id,_url,x,y,size,angle)=>actors.push({id,x,y,size,angle});
  return {...api,calls,requests,actors,ctx,frame:now=>frame(now)};
}
function near(actual,expected) {
  expected.forEach((value,i)=>assert.ok(Math.abs(actual[i]-value)<1e-8,actual+" / "+expected));
}

test("本館と紋章旗は水彩と全16方位で宿屋より大きく描き、張り出した屋根は区画の選択を奪わない", async () => {
  const {maps,voxel,calls,ctx} = game();
  const flag = {complete:true,naturalWidth:126};
  for (const camera of [null,...Array.from({length:16},(_,step)=>voxel.townCamera(step))]) {
    const prefix = camera ? "turn_" : "scenery_";
    const [x,y] = camera ? camera.project(...maps.hallSite) : maps.hallSite;
    const scale = 1.36*(camera?.scale ?? 1);
    const original = voxel.scene("town",[{id:"guild",x,y,scale,radius:58,depth:0}],camera);
    await original.prepare(id=>id);
    const town = maps.get("town",{sunny:"inn"},camera);
    await town.prepare(id=>id);
    calls.length = 0;
    town(ctx,[],null,flag);
    const hallIndex = calls.findIndex(([image])=>image.name === prefix+"guild");
    const hall = calls[hallIndex].slice(-4);
    const inn = calls.find(([image])=>image.name === prefix+"inn").slice(-4);
    assert.ok(hall[2] > inn[2]*1.3);
    assert.equal(calls[hallIndex+1][0],flag);
    near([hall[0]+hall[2]*69/138,hall[1]+hall[3]*116/153],[x,y]);
    for (let dy=-165;dy<=25;dy+=6) for (let dx=-110;dx<=110;dx+=6) {
      const px = x+dx*scale, py = y+dy*scale;
      const hit = town.pickProp(px,py);
      if (!hit || hit.id === "guild")
        assert.equal(hit?.id, original.pickProp(px,py)?.id);
    }
    if (!camera) assert.equal(town.targetAtPixel(504,281)?.id,"linden");
    const shops = maps.get("town",{sunny:"shop"},camera);
    await shops.prepare(id=>id);
    calls.length = 0;
    shops(ctx,[]);
    const shop = calls.find(([image])=>image.name === prefix+"shop").slice(-4);
    assert.ok(inn[2] > shop[2]*1.15);
  }
});

test("町を開くと保存済みの組み合わせ紋章・アップロード紋章を本館の旗に使う", async () => {
  const {maps,scenery,ctx,calls,frame} = game();
  const canvas = {dataset:{scene:"town"},clientWidth:1393,getContext:()=>ctx,closest:()=>({clientWidth:1393})};
  const saved = Guild.initial();
  const image = "data:image/webp;base64," + fs.readFileSync(path.join(__dirname,"../assets/scenery_flowers.webp")).toString("base64");
  for (const custom of [undefined,{...saved.guildProfile.emblem,mode:"upload",image,ground:"#365278"}]) {
    saved.guildProfile.emblem = custom;
    const emblem = Guild.restore(JSON.parse(JSON.stringify(saved))).guildProfile.emblem;
    const stop = scenery.mount(canvas,{emblem,people:[],url:id=>id});
    await maps.get("town").prepare(id=>id);
    calls.length = 0;
    frame(0);
    const flag = calls.find(([img])=>img.svg)?.[0];
    assert.ok(flag);
    assert.ok(flag.svg.includes(emblem.ground));
    assert.equal(flag.svg.includes(image),emblem.mode === "upload");
    stop();
  }
});

test("16方向すべてで各農地区画の全タイルを選択でき、逆投影と強調輪郭が一致する", () => {
  const {maps,voxel} = game();
  for (let i=0;i<16;i++) {
    const camera = voxel.townCamera(i), town = maps.get("town",{},camera);
    assert.equal(voxel.townCamera(i-16).step,i);
    for (const plot of Guild.plots) {
      for (let row=0;row<plot.size;row++) for (let col=0;col<plot.size;col++) {
        const site = maps.farmTile(plot,col,row), point = camera.project(...site);
        near(camera.inverse(...point),site);
        assert.equal(town.plotAtPixel(...point)?.id,plot.id);
      }
      let matrix;
      maps.highlight(new Proxy({transform:(...m)=>matrix=m},{get:(o,k)=>o[k] ?? (()=>{})}),plot,camera);
      const [x,y] = maps.clearings.get(plot.id).edge[0], [a,b,c,d,e,f] = matrix;
      near([a*x+c*y+e,b*x+d*y+f],camera.project(x,y));
    }
    assert.equal(town.plotAtPixel(...camera.project(881,265)),undefined);
  }
});

test("地形と建物に同じ方位を使い、半回転でギルド・住人・砲塔の前後が入れ替わる",async () => {
  const {maps,voxel,calls,requests,ctx} = game();
  const built = {mill:"bow"}, view = voxel.views.town;
  const tower = Guild.plots.find(p=>p.id==="mill");
  const site = voxel.projectGround(...maps.plotCenter(tower),0,view);
  for (let i=0;i<16;i++) {
    const camera=voxel.townCamera(i), draw=maps.get("town",built,camera);
    await draw.prepare(id=>id);
    assert.ok(requests.includes("town_terrain_"+String(i).padStart(2,"0")));
    const unit={depth:camera.depth((site[0]+maps.hallSite[0])/2,(site[1]+maps.hallSite[1])/2),
      paint:()=>calls.push([{name:"unit"}])};
    calls.length=0;
    draw(ctx,[unit]);
    const order=calls.map(([img])=>img.name).filter(n=>["unit","turn_guild","turn_bow"].includes(n));
    const hallFirst=camera.depth(...maps.hallSite)<camera.depth(...site);
    assert.deepEqual(order,hallFirst ? ["turn_guild","unit","turn_bow"] : ["turn_bow","unit","turn_guild"]);
    const [,sx,sy,w,h] = calls.find(([img])=>img.name==="turn_guild");
    assert.deepEqual([sx,sy,w,h],[i%4*138,Math.floor(i/4)*153,138,153]);
    const [x,y] = camera.project(...maps.hallSite);
    assert.equal(draw.targetAtPixel(x,y-26)?.id,"guild");
    const [tx,ty]=camera.project(...site);
    assert.equal(draw.targetAtPixel(tx,ty-17)?.id,"mill");
    assert.equal(maps.get("town",built,camera),draw);
  }
  assert.equal(requests.filter(n=>n==="turn_guild").length,1);
});

test("巡回の足元・向き、襲撃中の魔物と攻撃線を同じ視点へ写す",async () => {
  const {maps,voxel,scenery,ctx,actors,frame} = game();
  const camera=voxel.townCamera(4), lines=[];
  ctx.lineTo=(x,y)=>lines.push([x,y]);
  ctx.moveTo=(x,y)=>lines.push([x,y]);
  const canvas={dataset:{scene:"town"},clientWidth:1393,getContext:()=>ctx,closest:()=>({clientWidth:1393})};
  let battle=null;
  const stop=scenery.mount(canvas,{people:[{id:"mina",sprite:"mina"}],camera,url:id=>id,time:()=>0,
    raidScene:()=>battle});
  const draw=maps.get("town",{},camera);
  await draw.prepare(id=>id);
  frame(0);
  const [a,b]=draw.routes.mina.points;
  near([actors[0].x,actors[0].y,actors[0].angle],[...camera.project(651,632),Math.atan2(b[0]-a[0],b[1]-a[1])+camera.angle]);
  battle={raid:{road:"east",enemies:[{step:4,hp:3,maxHP:3}],hits:[{source:"hall",target:0}]},
    defenders:[],fraction:.5};
  frame(1);
  const [p,q]=Guild.raidRoads.east.slice(4,6);
  const target=camera.project((p[0]+q[0])/2,(p[1]+q[1])/2), source=camera.project(...maps.hallSite);
  const boar=actors.find(a=>a.id==="boar");
  near([boar.x,boar.y],target);
  near(lines.at(-2),[source[0],source[1]-20]);
  near(lines.at(-1),[target[0],target[1]-10]);
  stop();
});

test("ドラッグで回しても区画が開かず、次のクリックは回転後の区画を開く",() => {
  const {maps,voxel,scenery,ctx} = game(), events=new Map(), picked=[];
  const viewport={clientWidth:1393,querySelector:()=>null};
  const canvas={dataset:{scene:"town"},style:{},clientWidth:1393,getContext:()=>ctx,closest:()=>viewport,
    getBoundingClientRect:()=>({left:0,top:0,width:1393,height:784}),setPointerCapture:()=>{},
    addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k)};
  let camera=voxel.townCamera(0);
  const stop=scenery.mount(canvas,{camera,people:[],selectPlot:id=>picked.push(id),turn:delta=>{
    camera=voxel.townCamera(camera.step+delta);stop.setCamera(camera);
  }});
  const pointer={pointerId:1,pointerType:"mouse",isPrimary:true,button:0,clientX:400,clientY:300};
  events.get("pointerdown")(pointer);
  events.get("pointermove")({...pointer,clientX:482});
  events.get("lostpointercapture")(pointer);
  assert.equal(camera.step,2);
  const plot=Guild.plots[0], [x,y]=voxel.projectGround(...maps.plotCenter(plot),0,voxel.views.town);
  const [clientX,clientY]=camera.project(x,y);
  const click={...pointer,clientX,clientY};
  events.get("click")(click);
  assert.deepEqual(picked,[]);
  events.get("pointerdown")(click);events.get("lostpointercapture")(click);events.get("click")(click);
  assert.deepEqual(picked,[plot.id]);
  stop.setCamera(null);
  events.get("pointerdown")(pointer);events.get("pointermove")({...pointer,clientX:482});
  events.get("click")({...pointer,clientX:x,clientY:y});
  assert.deepEqual(picked,[plot.id,plot.id]);
  stop();
  assert.equal(events.size,0);
});

test("町を歩く子供は幼年期から背が伸び、同じ視点で成人の大きさに近づく", async () => {
  const {maps,voxel,scenery,ctx,actors,frame} = game();
  const camera = voxel.townCamera(0);
  const canvas = {dataset:{scene:"town"},clientWidth:1393,getContext:()=>ctx,closest:()=>({clientWidth:1393})};
  const people = [{id:"gald",sprite:"gald"},{id:"child-1",sprite:"mina",scale:.5}];
  const stop = scenery.mount(canvas,{people,camera,url:id=>id,time:()=>0});
  await maps.get("town",{},camera).prepare(id=>id);
  frame(0);
  const adult = actors.find(a=>a.id==="gald").size;
  assert.equal(actors.find(a=>a.id==="mina").size,adult*.5);
  actors.length = 0;
  people[1].scale = .75;
  frame(1);
  near([actors.find(a=>a.id==="mina").size],[adult*.75]);
  stop();
});

test("丘は水彩と16方位の立体地図で選択でき、各建物は対応するモデルに切り替わる",async () => {
  const {maps,voxel,ctx,calls} = game();
  for (const camera of [null,...Array.from({length:16},(_,i)=>voxel.townCamera(i))]) {
    const [x,y] = maps.hillPoint(camera);
    const empty = maps.get("town",{},camera);
    assert.equal(empty.targetAtPixel(x,y)?.id,"hill");
    const step = camera?.step ?? 0;
    for (const kind of Object.keys(Guild.landmarks)) {
      const draw = maps.get("town",{},camera,kind);
      assert.notEqual(draw,empty);
      await draw.prepare(id=>id);
      calls.length=0;
      draw(ctx,[]);
      const stamp = calls.find(([img])=>img.name==="turn_"+kind);
      assert.ok(stamp,kind);
      assert.deepEqual(stamp.slice(1,5),[step%4*138,Math.floor(step/4)*153,138,153]);
      assert.equal(draw.targetAtPixel(x,y-10*(camera?.scale ?? 1))?.id,"hill");
    }
  }
});
