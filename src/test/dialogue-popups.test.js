const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Guild = require("../engine.js");

test("全場面に四つの性格の台詞があり、一人称・口調・個別の語尾を使う", () => {
  const p = {pronoun:"拙者",tone:"polite",trait:"bold"};
  for (const scene of ["start","fork","gather","treasure","fight","victory","hurt","home","greet","chat","town","shop"]) {
    const lines = Object.keys(Guild.traits).map(trait => Guild.chatterLine({...p,trait},scene,"ハル"));
    assert.equal(new Set(lines).size,4);
    for (const line of lines) {
      assert.match(line,/です/); assert.doesNotMatch(line,/[{}]|undefined/);
      if (["greet","chat"].includes(scene)) assert.match(line,/ハル/);
    }
  }
  for (const tone of Object.keys(Guild.tones))
    assert.ok(Guild.chatterLine({...p,tone},"start").endsWith(Guild.tones[tone]));
  assert.match(Guild.chatterLine({...p,ending:"でござる"},"start"), /拙者.*でござる/);
});

// Exercise the public canvas mount using a controllable animation frame and viewport.
function scene(kind, people, trip) {
  let frame, now = 0, fraction = 0, rate = "quiet";
  const bubble = {hidden:true,offsetWidth:120,firstElementChild:{},lastElementChild:{},style:{setProperty(){}}};
  const viewport = {clientWidth:kind === "town" ? 1393 : 900,querySelector:selector=>selector === ".scene-bubble" ? bubble : null,
    get scrollLeft() {return 0;}, set scrollLeft(_) {}};
  const ctx = {setTransform(){}};
  const canvas = {clientWidth:viewport.clientWidth,dataset:{scene:kind},closest:()=>viewport,getContext:()=>ctx};
  const box = vm.createContext({Guild,window:{matchMedia:()=>({matches:false})},
    requestAnimationFrame(fn) { frame=fn; },cancelAnimationFrame(){}});
  for (const file of ["voxel.js","voxel-maps.js","scenery.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),box);
  const {maps,scenery,voxel} = vm.runInContext("({maps:GuildVoxelMaps,scenery:GuildScenery,voxel:GuildVoxel})",box);
  const draw = () => {};
  draw.prepare = async()=>{};
  draw.routes = {custom:{points:[[0,0],[8,1]],distances:[0,8],seconds:19}};
  maps.get = ()=>draw;
  const stop = scenery.mount(canvas,{people,trip,url:id=>id,fraction:()=>fraction,time:()=>now/1000,chatterRate:()=>rate});
  return {bubble, stop, camera:voxel.townCamera, rate(value) {rate=value;},
    paint(time, progress=0) {now=time;fraction=progress;frame(time);return bubble.hidden ? null : bubble.lastElementChild.textContent;}};
}

test("町の吹き出しは歩行・回転に追従し、表示時間・間隔・オフを守る", async () => {
  const visit = scene("town",[{id:"toto",sprite:"toto",name:"トト",voice:{trait:"kind",tone:"casual",pronoun:"おいら"}}]);
  await Promise.resolve();
  assert.equal(visit.paint(0),null);
  assert.match(visit.paint(5000),/道具|刃こぼれ/);
  assert.equal(visit.bubble.firstElementChild.textContent,"トト");
  const left = visit.bubble.style.left;
  visit.paint(5300);
  assert.notEqual(visit.bubble.style.left,left);
  visit.stop.setCamera(visit.camera(4));
  await Promise.resolve();
  const before = visit.bubble.style.left;
  visit.paint(5300);
  assert.notEqual(visit.bubble.style.left,before);
  assert.equal(visit.paint(7500),null);
  assert.equal(visit.paint(19000),null);
  assert.ok(visit.paint(20000));
  visit.rate("off");
  assert.equal(visit.paint(20001),null);
  assert.equal(visit.paint(90000),null);
  visit.stop();
});

test("遠征の場面が台詞を決め、負傷時は本人が話し、同じ場面を連発しない", async () => {
  const s = Guild.initial();
  Guild.depart(s,s,s,true);
  const t = s.trip;
  const people = t.unit.map(u=>({id:u.id,sprite:u.id,name:u.id,voice:Guild.person(s,u.id),maxHP:Guild.stat(Guild.person(s,u.id),"hp")}));
  const view = scene("dungeon",people,t);
  await Promise.resolve();
  assert.match(view.paint(0),/あたし/);
  assert.equal(view.paint(8000),null);
  Guild.step(s); Guild.step(s);
  assert.ok(view.paint(8100));
  assert.equal(t.pending,null);
  Guild.step(s);
  assert.match(view.paint(12500,.8),/凱旋|帰る時間|帰り道|帰還/);
  assert.equal(view.paint(16500,.9),null);
  t.dungeon="canal"; t.node="1-cache"; t.steps++;
  assert.match(view.paint(18000),/発見|宝物|宝箱|留め金/);
  t.node="1-cut"; t.steps++;
  t.fight={turn:0,enemies:[{id:"enemy",kind:"boar",hp:13}]};
  assert.match(view.paint(22100),/先手|背中|覚悟|動き/);
  t.fight.turn++;
  t.effects=[{actor:"enemy",target:"gald",kind:"attack",amount:25}];
  t.unit[1].hp=2;
  assert.match(view.paint(26200),/俺.*手当て.*だな/);
  assert.equal(view.bubble.firstElementChild.textContent,"gald");
  t.fight=null;
  assert.match(view.paint(30300),/勝ち|ひと息|ひと安心|点検/);
  view.stop();
});

test("道ですれ違う二人は相手を呼び、次の発言では話者が交代する", async () => {
  const party = Guild.initial().roster.slice(0,2);
  const view = scene("town",party.map(p=>({id:p.id,sprite:p.id,name:p.name,voice:p})));
  await Promise.resolve();
  view.paint(0);
  // At 10 seconds these two walkers are within greeting distance on the test road.
  const line = view.paint(10000);
  const speaker = view.bubble.firstElementChild.textContent;
  assert.ok(line.includes(party.find(p=>p.name!==speaker).name));
  assert.ok(view.paint(25000));
  assert.notEqual(view.bubble.firstElementChild.textContent,speaker);
  view.stop();
});
