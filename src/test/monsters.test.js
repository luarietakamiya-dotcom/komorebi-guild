const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const G = require("../engine");

const reload = state => G.restore(JSON.parse(JSON.stringify(state)));
function encounter(dungeon,floor) {
  const s = G.initial();
  s.gold = 8000;
  s.history.push({dungeon:G.dungeons[dungeon].requires,cleared:true,path:["gate","home"],log:[]});
  s.roster.forEach(p=>p.rank=2);
  G.depart(s,s,{dungeon,party:["mina","gald"],leader:"mina",policy:"bold",meds:0},true);
  s.trip.node = floor === 1 ? "gate" : floor+"-stairs";
  s.trip.route = floor+"-cut";
  G.step(s);
  return s;
}
function turn(s,id) {
  const fight = s.trip.fight;
  fight.turn = fight.order.indexOf(id);
  G.step(s);
  return s.trip.effects.at(-1);
}

test("階ごとの編成に出現情報と同じ敵が入り、すべての種に異なる立体モデルがある", () => {
  for (const dungeon of ["canal","archive"]) {
    for (let floor=1; floor<=G.dungeons[dungeon].floors; floor++) {
      const enemies = encounter(dungeon,floor).trip.fight.enemies;
      assert.deepEqual(enemies.map(e=>e.kind),G.encounterKinds(dungeon,floor+"-cut","bold"));
      assert.equal(new Set(enemies.map(e=>e.id)).size,enemies.length);
    }
  }
  const sources = [], draws = [];
  const noop = ()=>{};
  const ctx = new Proxy({drawImage(...args) { draws.push(args); }},{get:(o,key)=>o[key] ?? noop});
  class Image {
    set src(value) { sources.push(value); this.complete=true; this.naturalWidth=256; }
  }
  const stacks = vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../stacks.js"),"utf8")+"\nGuildStacks",
    {Image,document:{createElement:()=>({getContext:()=>ctx})}});
  const stamps = new Set();
  for (const kind of Object.keys(G.foes)) {
    draws.length=0; sources.length=0;
    stacks.draw(ctx,kind,id=>id,0,0,1,0);
    const hash = crypto.createHash("sha256");
    for (const source of sources) {
      const sprite = fs.readFileSync(path.join(__dirname,"../assets",source+".webp"));
      assert.equal(sprite.toString("ascii",8,12),"WEBP");
      hash.update(sprite);
    }
    assert.ok(draws.length>=19);
    if (kind !== "boar") {
      assert.deepEqual(sources,["monster_"+kind]);
      draws.slice(0,-1).forEach((args,z)=>assert.deepEqual(args.slice(1,5),[z%8*32,Math.floor(z/8)*32,32,32]));
    }
    stamps.add(hash.digest("hex"));
  }
  assert.equal(stamps.size,Object.keys(G.foes).length);
});

test("亜人の狙いと群れの行動、甲羅の一度限りの回復、星粉のMP減少", () => {
  const pack = encounter("canal",1);
  assert.deepEqual(pack.trip.fight.enemies.map(e=>e.kind),["goblin","goblin"]);
  pack.trip.unit[0].hp=30;
  pack.trip.unit[1].hp=40;
  assert.equal(turn(pack,"enemy").target,"mina");
  assert.equal(turn(pack,"flank").target,"mina");
  assert.ok(pack.trip.pending);
  for (const [floor,target] of [[2,"gald"],[3,"mina"]]) {
    const s = encounter("canal",floor);
    s.trip.unit[0].hp=30;
    s.trip.unit[1].hp=40;
    s.trip.unit[1].mp=0;
    assert.equal(turn(s,"enemy").target,target);
  }
  let s = encounter("canal",4);
  s.trip.fight.enemies[0].hp=7;
  assert.equal(turn(s,"enemy").kind,"heal");
  assert.equal(s.trip.fight.enemies[0].hp,13);
  s = reload(s);
  assert.equal(turn(s,"enemy").kind,"attack");
  assert.equal(s.trip.fight.enemies[0].hp,13);
  s = encounter("archive",1);
  const before = s.trip.unit[0].mp;
  s.trip.unit[0].hp=19;
  assert.equal(turn(s,"enemy").target,"mina");
  assert.equal(s.trip.unit[0].mp,before-2);
});

test("番獣の詠唱を保存でき、咆哮の動揺と討伐の偉業が一度ずつ反映される", () => {
  let s = encounter("canal",5);
  assert.equal(s.trip.fight.enemies[0].kind,"warden");
  assert.match(turn(s,"enemy").message,/月角の咆哮を詠唱/);
  s = reload(s);
  s.trip.unit.forEach(u=>u.hp=60);
  const hit = turn(s,"enemy");
  assert.equal(hit.kind,"skill");
  assert.ok(s.trip.fight.shaken[hit.target]);
  s.trip.fight.enemies[0].hp=1;
  turn(s,"mina");
  assert.equal(s.trip.fight,null);
  assert.equal(s.guildProgress.feats[0].points,6);
  assert.match(s.guildProgress.feats[0].message,/双月角の番獣/);
  assert.deepEqual(reload(s).guildProgress,s.guildProgress);
});

test("襲撃予告の編成で出現し、破城獣が防衛施設を破壊する。討伐時だけ名前が偉業に残る", t => {
  t.mock.method(Math,"random",()=>.1);
  const s = G.initial();
  s.gold=30000;
  s.raids.reports.push({week:0,road:"west"});
  G.build(s,"westPass","wall");
  while (!s.raids.warning) G.nextWeek(s,true);
  const warning = s.raids.warning;
  assert.equal(warning.road,"west");
  assert.equal(warning.kinds.at(-1),"ram");
  G.holdDeparture(s);
  const saved = reload(s);
  G.advanceTime(saved,warning.due);
  const raid = saved.raids.active, boss = raid.enemies.at(-1);
  assert.deepEqual(raid.enemies.map(e=>e.kind),warning.kinds);
  assert.ok(boss.boss && boss.hp>raid.enemies[0].hp);
  raid.enemies.slice(0,-1).forEach(e=>e.hp=0);
  boss.step=G.raidRoute(raid).findIndex(p=>p[2]==="westPass");
  const hp = saved.town.defenses.westPass.hp;
  G.advanceTime(saved,G.raidBeat);
  assert.equal(saved.town.defenses.westPass.hp,Math.max(0,hp-(4+raid.tier+3+6)));
  assert.ok(!saved.guildProgress.feats.some(f=>f.kind==="raidBoss"));
  boss.hp=1;
  boss.step=G.guardPost(raid,G.raidDefenders(saved)[0],0).step;
  G.advanceTime(saved,G.raidBeat);
  assert.equal(saved.raids.active,null);
  assert.equal(saved.raids.reports[0].bossKind,"ram");
  const feats = reload(saved).guildProgress.feats.filter(f=>f.kind==="raidBoss");
  assert.equal(feats.length,1);
  assert.equal(feats[0].points,6);
  assert.match(feats[0].message,/鉄冠の破城獣/);
});
