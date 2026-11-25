const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
const beat = s => G.advanceTime(s,G.raidBeat);
function warning(count=1) {
  const s = G.initial();
  s.gold = 30000;
  s.visitors = [];
  s.raids.warning = {outer:true,routeVersion:2,road:"west",count,tier:0,due:1};
  G.holdDeparture(s);
  return s;
}
function start(s) {
  G.advanceTime(s,1);
  return s.raids.active;
}
function position(r,index,step,hp=100) {
  Object.assign(r.enemies[index],{step,hp,maxHP:hp});
}
function finish(s) {
  for (let i=0; i<160 && s.raids.active; i++) beat(s);
  assert.equal(s.raids.active,null);
  return s.raids.reports[0];
}
test("全街道に防衛専用地が2か所あり、旧予告の経路を維持したまま新しい侵攻路の行程が増える", () => {
  for (const road of Object.keys(G.territoryRoads)) {
    const old = G.raidRoute({road,outer:true}), path = G.raidRoute({road,routeVersion:2});
    const length = stops => stops.slice(1).reduce((sum,[x,y],i)=>sum+Math.hypot(x-stops[i][0],2*(y-stops[i][1])),0);
    assert.ok(path.length >= old.length+6 && length(path)>length(old)+200);
    assert.deepEqual(path.slice(-old.length),old);
    const sites = G.defenseSpots.filter(p=>p.road===road);
    assert.equal(sites.length,2);
    for (const p of sites) {
      const s = warning();
      assert.throws(()=>G.build(s,p.id,"shop"));
      assert.equal(s.gold,30000);
      assert.ok(Math.min(...path.map(([x,y])=>Math.hypot(x-p.center[0],2*(y-p.center[1]))))<G.defenseTypes.wall.range);
      assert.equal(G.plotForSite(p.id),p);
      G.build(s,p.id,"wall");
      assert.deepEqual(reload(s).town.defenses[p.id],s.town.defenses[p.id]);
    }
  }
});
test("新規金庫では建てられず、施設・強化・装備の支払いはギルド金庫のみ。旧塔はLv.1から育つ", () => {
  const s = G.initial();
  for (const kind of Object.keys(G.defenseTypes)) {
    assert.ok(G.buildings[kind].cost>=900);
    assert.throws(()=>G.build(s,"west",kind));
  }
  assert.ok(G.landmarkPrice(s)>=3000);
  let old = reload(s);
  old.town.plots.west = "watch";
  delete old.town.defenses;
  old = reload(old);
  const base = G.defenseStats(old,"west");
  old.wallet=50; old.gold=base.upgradeCost+49;
  assert.throws(()=>G.improveDefense(old,"west"));
  old.gold++;
  G.improveDefense(old,"west");
  const up = G.defenseStats(old,"west");
  assert.equal(old.gold,50);
  for (const key of ["level","range","maxHP","power"]) assert.ok(up[key]>base[key]);
  assert.equal(G.townTotals(old.town).defense,6);
  old.gold+=G.defenseOptions.range.cost;
  G.improveDefense(old,"west","range");
  assert.equal(G.defenseStats(old,"west").range,up.range+60);
  assert.throws(()=>G.improveDefense(old,"west","boss"));
  assert.throws(()=>G.improveDefense(old,"west","range"));
  assert.throws(()=>G.improveDefense(old,"west","rapid"));
  assert.equal(old.gold,50);
  assert.deepEqual(reload(old).town.defenses.west,old.town.defenses.west);
});
test("射程・発射間隔・範囲攻撃・要点補正・各追加装備が実際の迎撃に適用される", () => {
  function encounter(kind,option,stepDelta=0) {
    const s=warning(2);
    G.build(s,"westPass",kind);
    if (option) G.improveDefense(s,"westPass",option);
    const r=start(s), stop=G.raidRoute(r).findIndex(p=>p[2]==="westPass")+stepDelta;
    position(r,0,stop); position(r,1,stop);
    r.enemies[0].boss=true;
    beat(s);
    return {s,r,stop};
  }
  const ballista = encounter("bow","boss"), double = G.defenseTypes.bow.power*2;
  assert.equal(ballista.r.enemies[0].hp,100-double-2);
  assert.equal(ballista.r.enemies[1].hp,100);
  beat(ballista.s);
  assert.equal(ballista.r.hits.length,0);
  const distant = encounter("watch",null,-10);
  assert.equal(distant.r.contributions.westPass.damage,0);
  const area=encounter("magic","aura");
  assert.deepEqual(area.r.enemies.map(e=>e.hp),[92,92]);
  assert.ok(area.r.enemies.every(e=>e.step===area.stop));
  const wall=encounter("wall","aura");
  assert.deepEqual(wall.r.enemies.map(e=>e.hp),[100,100]);
  assert.equal(wall.r.contributions.westPass.delay,8);
  for (let i=0;i<4;i++) beat(wall.s);
  assert.ok(wall.r.enemies.every(e=>e.step>wall.stop));
  const fire=encounter("watch","fire");
  beat(fire.s);
  assert.equal(fire.r.enemies[0].hp,87);
  assert.equal(fire.r.hits[0].label,"火矢");
  const rapid=encounter("watch","rapid");
  beat(rapid.s);
  assert.ok(rapid.r.hits.some(h=>h.label==="射撃"));
});
test("守備配置は予告中のみ。在町の隊と来訪者は持ち場に残り、未指定者は自動配置", () => {
  const s=warning(), guest=s.registry[0];
  s.visitors=[guest.id];
  s.decisionWeek=0; s.raids.warning.due=G.weekMillis*.75;
  G.assignGuard(s,"mina","front");
  G.assignGuard(s,guest.id,"gate");
  assert.throws(()=>G.assignGuard(s,"missing","front"));
  assert.throws(()=>G.assignGuard(s,"mina","invalid"));
  G.advanceTime(s,s.raids.warning.due);
  const r=s.raids.active;
  assert.equal(s.phase,"prep"); assert.ok(!guest.mission);
  assert.deepEqual([r.assignments.mina,r.assignments.gald,r.assignments[guest.id]],["front","plaza","gate"]);
  assert.throws(()=>G.assignGuard(s,"mina","gate"));
  assert.throws(()=>G.build(s,"west","wall"));
  position(r,0,G.guardPost(r,s.roster[0],0).step);
  beat(s);
  assert.ok(r.contributions.mina.damage>0);
  assert.equal(r.contributions.gald,undefined);
});
test("広場で本人の装備・オーダーを使い、突破時だけ街道の商店とホールが損傷。結果精算は一度", t => {
  t.mock.method(Math,"random",()=>.5);
  for (const flee of [false,true]) {
    const s=warning();
    G.build(s,"west","shop");
    for (const p of s.roster) G.setGambits(s,p.id,[{condition:"always",action:flee ? "flee" : "attack",target:flee ? "self" : "nearest"}]);
    const r=start(s), last=G.raidRoute(r).length-1;
    position(r,0,last-1,12);
    beat(s);
    assert.equal(r.enemies[0].step,last);
    assert.deepEqual(s.town.repairs,{});
    const copy=reload(s), report=finish(s);
    assert.deepEqual(finish(copy),report);
    assert.equal(report.repelled,!flee);
    assert.deepEqual(report.damaged,flee ? ["west","hall"] : []);
    assert.match(report.contributions.mina.lastAction,/オーダー1/);
    if (!flee) assert.equal(Object.values(report.contributions).reduce((n,v)=>n+v.damage,0),12);
    const saved=JSON.stringify(s.raids.reports);
    beat(s);
    assert.equal(JSON.stringify(s.raids.reports),saved);
  }
});
test("破損した防衛施設は修理待ちになり、工房の育ちで安く早く直り、レベルと装備を保持", t=>{
  t.mock.method(Math,"random",()=>.1);
  const s=warning(5);
  G.build(s,"westPass","wall"); G.improveDefense(s,"westPass"); G.improveDefense(s,"westPass","range");
  const r=start(s), stop=G.raidRoute(r).findIndex(p=>p[2]==="westPass");
  r.tier=4;
  r.enemies.forEach((_,i)=>position(r,i,stop,20));
  beat(s);
  assert.equal(s.town.defenses.westPass.hp,0);
  assert.equal(s.town.repairs.westPass.remaining,0);
  assert.equal(G.townTotals(s.town).defense,0);
  assert.throws(()=>G.improveDefense(s,"westPass"));
  finish(s);
  const before=G.repairQuote(s,"westPass");
  s.town.workshops.hall.level=4; s.town.smithReadyWeek=0;
  const after=G.repairQuote(s,"westPass");
  assert.ok(after.weeks<before.weeks && after.cost<before.cost);
  G.startRepair(s,"westPass"); assert.throws(()=>G.startRepair(s,"westPass"));
  const restored=reload(s);
  for (let i=0;i<after.weeks;i++) G.nextWeek(restored,true);
  assert.deepEqual(restored.town.defenses.westPass,{level:2,option:"range",hp:G.defenseStats(restored,"westPass").maxHP});
  assert.equal(G.townTotals(restored.town).defense,8);
});
test("八つの丘の建造物が、射程・援軍・守備隊・修理に固有の効果を出す", ()=>{
  function battle(kind) {
    const s=warning();
    if (kind) G.buildLandmark(s,kind);
    G.build(s,"westPass","wall");
    G.setGambits(s,"mina",[{condition:"always",action:"attack",target:"nearest"}]);
    const r=start(s), road=G.raidRoute(r), unit=r.enemies[0];
    position(r,0,road.findIndex(p=>p[2]==="westPass"));
    beat(s);
    position(r,0,road.length-1,300);
    unit.wait=0;
    beat(s);
    return {s,r,loss:s.roster.reduce((a,p)=>a+p.missingHP,0)};
  }
  const plain=battle(null), cathedral=battle("cathedral"), bath=battle("baths");
  assert.ok(cathedral.loss<plain.loss && bath.loss<plain.loss);
  assert.ok(cathedral.r.contributions.cathedral.support);
  assert.ok(battle("memorial").r.contributions.mina.damage>plain.r.contributions.mina.damage);
  assert.ok(battle("academy").r.contributions.mina.damage>plain.r.contributions.mina.damage);
  assert.equal(G.defenseStats(battle("observatory").s,"westPass").range,G.defenseStats(plain.s,"westPass").range+40);
  assert.ok(battle("castle").r.contributions.knights.damage);
  const shop=battle("manufactory");
  assert.ok(shop.r.contributions.manufactory.support && shop.s.town.defenses.westPass.hp>plain.s.town.defenses.westPass.hp);
  const {s,r}=battle("exchange");
  assert.ok(r.contributions.mercenaries.damage);
  r.tier=60; // Force a breach after verifying the mercenary attack.
  const report=finish(s);
  assert.equal(report.subsidy,72);
  const quote=G.repairQuote(s,"hall"), gold=s.gold;
  G.startRepair(s,"hall");
  assert.equal(s.gold,gold-quote.cost);
  assert.equal(s.town.repairFund,72-quote.subsidy);
});
