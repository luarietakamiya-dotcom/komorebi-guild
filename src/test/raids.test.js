const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
function scout(s) {
  while (!s.raids.warning && !s.raids.active) G.nextWeek(s,true);
}
function finish(s) {
  for (let i=0; s.raids.active && i<100; i++) G.advanceTime(s,G.raidBeat/s.clock.speed);
  assert.equal(s.raids.active,null);
  return s.raids.reports[0];
}

test("旧セーブに襲撃予定だけを追加し、予告・速度・一時停止・再読込の境界を守る", t => {
  t.mock.method(Math,"random",()=>.1);
  let s = G.initial();
  delete s.raids; delete s.town.repairs; s.week = 11;
  s = reload(s);
  assert.equal(s.raids.nextWeek,12);
  scout(s);
  const plan = s.raids.warning;
  assert.equal(plan.count,3);
  assert.equal(Math.ceil(7*plan.due/G.weekMillis),3);
  G.holdDeparture(s);
  s.clock.speed = 2;
  G.advanceTime(s,(plan.due-1)/2);
  assert.deepEqual(s.raids.warning,plan);
  s.clock.paused = true;
  assert.equal(G.advanceTime(s,120000),false);
  s = reload(s);
  s.clock.paused = false;
  G.advanceTime(s,.5);
  assert.equal(s.raids.warning,null);
  assert.equal(s.raids.active.elapsed,0);
  G.advanceTime(s,G.raidBeat*.75);
  const restored = reload(s);
  finish(s); finish(restored);
  assert.deepEqual(restored,s);
  assert.equal(s.raids.reports.length,1);
});

test("留守の施設では道沿いだけが損傷し、広場の被害・略奪・負傷は一度だけ精算する", t => {
  t.mock.method(Math,"random",()=>.1);
  let s = G.initial();
  G.build(s,"west","farm"); G.build(s,"east","shop");
  scout(s);
  G.depart(s);
  s.visitors = [];
  const gold = s.gold, food = s.town.food, satisfaction = s.metrics[3];
  G.advanceTime(s,s.raids.warning.due+2*G.raidBeat);
  assert.ok(s.town.repairs.west);
  assert.equal(G.townTotals(s.town).food,0);
  s = reload(s);
  const r = finish(s);
  assert.deepEqual(r.damaged,["west","hall"]);
  assert.deepEqual(r.injured,["トト"]);
  assert.equal(s.town.smithReadyWeek,s.week+2);
  assert.equal(r.repelled,false);
  assert.deepEqual([gold-s.gold,food-s.town.food,satisfaction-s.metrics[3]],[r.gold,r.food,r.discontent]);
  assert.equal(r.gold,4*(8+s.raids.peak));
  assert.equal(G.townTotals(s.town).income,8);
  const after = reload(s);
  G.advanceTime(after,2*G.raidBeat);
  assert.deepEqual(after.raids,s.raids);
  assert.equal(after.gold,s.gold);
});

test("遠征中の全隊を除外し、緊急帰還した隊だけが守りに加わる", t => {
  t.mock.method(Math,"random",()=>.1);
  const s = G.initial();
  G.unlockParty(s);
  scout(s);
  const other = s.extraParties[0];
  G.depart(s,s,{party:["mina"],leader:"mina",policy:"safe",meds:0});
  G.depart(s,other,{party:["gald"],leader:"gald",policy:"gather",meds:0});
  G.step(s,other); G.step(s,other);
  assert.ok(other.trip.pending);
  assert.throws(()=>G.raidRecall(s,other));
  G.advanceTime(s,s.raids.warning.due);
  assert.ok(!G.raidDefenders(s).some(p=>["mina","gald"].includes(p.id)));
  G.raidRecall(s,other);
  assert.equal(other.trip.pending,null);
  assert.equal(other.phase,"report");
  assert.match(s.history[0].reason,/緊急帰還/);
  assert.throws(()=>G.raidRecall(s,other));
  assert.ok(G.raidDefenders(s).some(p=>p.id==="gald"));
  assert.ok(!G.raidDefenders(s).some(p=>p.id==="mina"));
});

test("施設が自動でヌシを迎撃し、倉庫の素材を加工できて討伐の偉業も残る", t => {
  t.mock.method(Math,"random",()=>.1);
  const s = G.initial();
  s.gold = 1000;
  G.build(s,"west","magic");
  G.build(s,"clover","bow");
  G.build(s,"linden","wall");
  scout(s);
  G.holdDeparture(s);
  G.advanceTime(s,s.raids.warning.due);
  finish(s);
  G.nextWeek(s,true); scout(s);
  assert.ok(s.raids.warning.boss);
  G.holdDeparture(s);
  const ore = s.stock.ore, herb = s.stock.herb, credit = s.metrics[1];
  G.advanceTime(s,s.raids.warning.due);
  const r = finish(s);
  assert.ok(r.repelled);
  assert.equal(r.ore,r.count);
  assert.deepEqual([r.herb,s.stock.herb-herb,s.stock.ore-ore,s.metrics[1]-credit],[1,1,r.count,r.credit]);
  assert.ok(r.credit>0);
  assert.match(s.milestones[0].message,/ヌシを討伐/);
  G.placeOrder(s,"hall","knife");
  assert.equal(s.stock.ore,ore+r.ore-1);
  const feats = s.guildProgress.feats.filter(e=>e.week===r.week);
  assert.deepEqual(feats.map(e=>[e.kind,e.points]),[["raidBoss",6],["repel",4]]);
  assert.deepEqual(reload(s).guildProgress,s.guildProgress);
  assert.deepEqual(reload(s).milestones,s.milestones);
});

test("週を締めても予告済みの襲撃が解決され、成長後の規模は維持され奇襲だけ小さい", t => {
  const roll = t.mock.method(Math,"random",()=>.1);
  const s = G.initial();
  scout(s);
  const first = s.raids.warning.count;
  G.nextWeek(s,true);
  assert.equal(s.raids.reports.length,1);
  s.metrics[0]=64;
  scout(s);
  const grown = s.raids.warning.count, tier = s.raids.peak;
  assert.ok(grown>first);
  G.nextWeek(s,true);
  s.metrics[0]=1;
  scout(s);
  assert.equal(s.raids.warning.count,grown);
  G.nextWeek(s,true);
  roll.mock.mockImplementation(()=>.01);
  scout(s);
  assert.equal(s.raids.warning,null);
  assert.ok(s.raids.active.surprise);
  assert.equal(s.raids.active.tier,tier);
  assert.ok(s.raids.active.count<grown);
});

test("職人育成で修理費・工期・遅延率が下がり、修理の支払い・機能復帰は一度だけ", t => {
  t.mock.method(Math,"random",()=>.99);
  let s = G.initial();
  G.build(s,"west","shop","alchemy");
  s.raids.nextWeek=100;
  s.town.repairs.west={remaining:0};
  const external = G.repairQuote(s,"west");
  s.stock.ore=20;
  for (let i=0;i<9;i++) G.deliverMaterial(s,"hall");
  const local = G.repairQuote(s,"west");
  assert.ok(local.local && local.cost<external.cost && local.weeks<external.weeks && local.chance>external.chance);
  s.gold=local.cost-1;
  assert.throws(()=>G.startRepair(s,"west"));
  assert.equal(s.town.repairs.west.remaining,0);
  s.gold=local.cost;
  G.startRepair(s,"west");
  assert.equal(s.gold,0);
  assert.throws(()=>G.startRepair(s,"west"));
  s.stock.herb=5;
  s=reload(s);
  for (let i=0;i<local.weeks;i++) {
    assert.throws(()=>G.placeOrder(s,"west","vial"),/復旧/);
    assert.throws(()=>G.deliverMaterial(s,"west"),/復旧/);
    assert.equal(G.townTotals(s.town).income,0);
    G.nextWeek(s,true);
  }
  assert.ok(s.town.repairs.west.delayed);
  s=reload(s);
  G.nextWeek(s,true);
  assert.equal(s.town.repairs.west,undefined);
  assert.equal(G.townTotals(s.town).income,8);
  G.placeOrder(s,"west","vial");
  assert.equal(s.supplies.medicine,1);
});
