const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");
const waitForGuest = require("./wait-for-guest");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
function recruitRiina() {
  const s = G.initial();
  s.gold = 3000;
  G.depart(s);
  for (let i=0; i<8 && s.phase==="explore"; i++) G.step(s);
  assert.equal(s.history[0].cleared,true);
  s.metrics[0] = 16;
  G.nextWeek(s);
  waitForGuest(s,"riina");
  assert.ok(G.scout(s,"riina","premium"));
  return s;
}

test("旧セーブに候補だけを補い、初来訪の伝書を一度だけ届ける", () => {
  const old = G.initial();
  old.registry = old.registry.filter(p => p.id !== "riina");
  G.depart(old);
  G.step(old);
  const s = reload(old);
  assert.deepEqual(s.trip,old.trip);
  assert.deepEqual(s.visitors,old.visitors);
  assert.deepEqual(s.registry.filter(p => p.id !== "riina"),old.registry);
  const p = s.registry.find(p => p.id === "riina");
  assert.equal(p.sex,"female");
  assert.equal(G.jobs[p.job].name,"退魔忍");
  assert.ok(!G.startingJobs.includes(p.job) && !G.jobs[p.job].next);
  assert.deepEqual(G.characterArt(p),{portrait:"riina",stack:"riina"});
  assert.deepEqual(reload(s),s);
  G.returnHome(s);
  s.metrics[1] = 50;
  s.metrics[0] = 15;
  G.nextWeek(s);
  assert.ok(!s.visitors.includes(p.id));
  s.metrics[0] = 16;
  waitForGuest(s,p.id);
  assert.ok(s.visitors.includes(p.id));
  const gold = s.gold;
  assert.throws(() => G.scout(s,p.id,"premium"),/苔むす森の洞/);
  assert.equal(s.gold,gold);
  G.nextWeek(s,true);
  assert.equal(p.career.filter(e => e.firstVisit).length,1);
  assert.deepEqual(s.morningMail.filter(m => m.sender === p.name).map(m => m.message),
    [p.career.find(e => e.firstVisit).message]);
});

test("退魔忍の精神が破邪の印と対魔防御に反映され、祭壇では本人だけが呪いを祓う", t => {
  const s = reload(recruitRiina());
  const p = G.person(s,"riina"), peer = {...p,job:"thief"};
  assert.ok(G.stat(p,"spd") > G.stat(peer,"spd"));
  assert.ok(G.spellDefense(p) > G.spellDefense(peer));
  assert.ok(G.abilityPower(p,"sealStrike","atk") > G.abilities.sealStrike.atk);
  assert.match(p.career.at(-1).message,/苔むす森の洞を踏破/);
  assert.equal(s.milestones[0].message,p.career.at(-1).message);
  G.person(s,"mina").rank = p.rank;
  G.depart(s,s,{party:[p.id,"mina"],leader:p.id,dungeon:"canal",policy:"safe",meds:0});
  assert.ok(!G.raidDefenders(s).some(q => q.id === p.id));
  t.mock.method(Math,"random",() => 0);
  s.trip.route = "1-gallery";
  G.step(s);
  assert.ok(s.trip.log.some(e => e.message.includes("リィナは封じ札で")));
  assert.ok(!Object.hasOwn(p.debuffs,"curse"));
  assert.ok(Object.hasOwn(G.person(s,"mina").debuffs,"curse"));
  assert.deepEqual(reload(s).trip,s.trip);
});

test("最終ラインで固有技のオーダーを実行し、引退後は再来訪しない", () => {
  let s = recruitRiina();
  G.holdDeparture(s);
  s.raids.warning = {outer:true,routeVersion:2,road:"west",count:1,tier:0,due:1};
  G.assignGuard(s,"riina","plaza");
  G.setGambits(s,"riina",[{condition:"always",action:"sealStrike",target:"nearest"}]);
  G.advanceTime(s,1);
  s = reload(s);
  const raid = s.raids.active;
  assert.equal(raid.assignments.riina,"plaza");
  Object.assign(raid.enemies[0],{step:G.raidRoute(raid).length-1,hp:8,maxHP:8});
  G.advanceTime(s,G.raidBeat);
  const report = s.raids.reports[0];
  assert.ok(report.repelled);
  assert.equal(report.contributions.riina.damage,8);
  assert.match(report.contributions.riina.lastAction,/オーダー1 ・ 破邪の印/);
  G.retire(s,"riina");
  s = reload(s);
  G.nextWeek(s,true);
  assert.ok(!s.visitors.includes("riina") && !s.registry.some(p => p.id === "riina"));
  assert.equal(s.alumni.filter(p => p.id === "riina").length,1);
});
