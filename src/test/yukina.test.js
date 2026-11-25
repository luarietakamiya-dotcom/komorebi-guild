const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");
const waitForGuest = require("./wait-for-guest");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
function welcome() {
  const s = G.initial();
  s.metrics[0] = 18;
  s.gold = 3000;
  waitForGuest(s,"yukina");
  return s;
}
function recruit() {
  const s = welcome();
  G.build(s,"west","shop","alchemy");
  assert.ok(G.scout(s,"yukina","premium"));
  return s;
}

test("探索中の旧セーブにはユキナの候補だけが加わり、再読込でも重複しない", () => {
  const old = G.initial();
  old.registry = old.registry.filter(p => p.id !== "yukina");
  G.depart(old);
  G.step(old);
  const s = reload(old);
  const p = s.registry.find(p => p.id === "yukina");
  assert.equal(p.sex,"female");
  assert.deepEqual(G.characterArt(p),{portrait:"yukina",stack:"yukina"});
  assert.deepEqual(reload(s),s);
  s.registry = s.registry.filter(q => q !== p);
  assert.deepEqual(s,old);
});

test("名声18の初来訪、営業中の錬金術師との契約、引退までの履歴が残る", () => {
  let s = G.initial();
  s.gold = 3000;
  s.metrics[0] = 17;
  G.nextWeek(s,true);
  assert.ok(!s.visitors.includes("yukina"));
  s.metrics[0] = 18;
  waitForGuest(s,"yukina");
  assert.ok(s.visitors.includes("yukina"));
  const gold = s.gold;
  assert.throws(() => G.scout(s,"yukina","premium"),/錬金術師/);
  assert.equal(s.gold,gold);
  G.build(s,"west","shop","alchemy");
  s.town.repairs.west = {remaining:0};
  assert.throws(() => G.scout(s,"yukina","premium"),/錬金術師/);
  delete s.town.repairs.west;
  s = reload(s);
  assert.ok(G.scout(s,"yukina","premium"));
  const p = G.person(s,"yukina");
  const visits = p.career.filter(e => e.firstVisit);
  assert.equal(visits.length,1);
  assert.deepEqual(s.morningMail.filter(m => m.sender === p.name).map(m => m.message),[visits[0].message]);
  assert.equal(p.career.at(-1).message,s.milestones[0].message);
  assert.match(p.career.at(-1).message,/錬金術師に薬草/);
  assert.equal(G.jobs[p.job].name,"巫女");
  assert.ok(!G.startingJobs.includes(p.job));
  assert.throws(() => G.promote(s,p.id));
  G.retire(s,p.id);
  s = reload(s);
  G.nextWeek(s,true);
  assert.ok(!s.visitors.includes(p.id) && !s.registry.some(q => q.id === p.id));
  assert.equal(s.alumni.filter(q => q.id === p.id).length,1);
});

test("御幣は行動可能なユキナのMPで新たな封印と鈍重だけを祓う", t => {
  for (const [kind,roll] of [["curse",0],["burden",.8]]) {
    const s = recruit();
    s.history.push({dungeon:"moss",cleared:true,path:["gate","home"],log:[]});
    G.depart(s,s,{party:["mina","yukina"],leader:"mina",dungeon:"canal",policy:"safe",meds:0});
    assert.ok(!G.raidDefenders(s).some(p => p.id === "yukina"));
    const priestess = s.trip.unit.find(u => u.id === "yukina");
    priestess.mp = 2;
    const rolls = [0,0,roll,0,0,roll];
    t.mock.method(Math,"random",() => rolls.shift() ?? .5);
    s.trip.route = "1-gallery";
    G.step(s);
    assert.equal(priestess.mp,0);
    assert.deepEqual(G.person(s,"mina").debuffs,{});
    assert.deepEqual(G.person(s,"yukina").debuffs,{[kind]:0});
    assert.ok(s.trip.log.some(e => e.message.includes("御幣がミナを包み、"+G.debuffs[kind].name)));
    assert.deepEqual(reload(s).trip,s.trip);
    t.mock.restoreAll();
  }
});

test("魔力に応じた鈴の祈りで探索戦の味方を回復する", () => {
  const s = recruit(), p = G.person(s,"yukina");
  const healer = {...p,job:"healer"};
  assert.ok(G.stat(p,"magic") > G.stat(healer,"magic") && G.spellDefense(p) > G.spellDefense(healer));
  const power = G.abilityPower(p,"shrinePrayer","heal");
  assert.ok(power > G.abilities.shrinePrayer.heal);
  G.setGambits(s,p.id,[{condition:"always",action:"shrinePrayer",target:"gald"}]);
  G.depart(s,s,{party:[p.id,"gald"],leader:p.id,policy:"gather",meds:0},true);
  G.step(s); G.step(s);
  if (s.trip.pending) G.reply(s,"pass");
  G.step(s);
  const [priestess,patient] = s.trip.unit, mp = priestess.mp;
  patient.hp -= power+1;
  for (let i=0; i<4 && priestess.mp===mp; i++) G.step(s);
  assert.equal(priestess.mp,mp-2);
  assert.ok(s.trip.log.some(e => e.combat?.actor===p.id && e.combat.target==="gald" &&
    e.combat.kind==="heal" && e.combat.amount===power && e.combat.rule===1));
});

test("街道でも広場の最終ラインでも、指定した仲間を鈴の祈りで回復する", () => {
  for (const post of ["front","plaza"]) {
    let s = recruit();
    G.holdDeparture(s);
    s.raids.warning = {outer:true,routeVersion:2,road:"west",count:1,tier:0,due:1};
    for (const defender of G.raidDefenders(s))
      G.assignGuard(s,defender.id,["yukina","gald"].includes(defender.id) ? post : "gate");
    G.setGambits(s,"yukina",[{condition:"always",action:"shrinePrayer",target:"gald"}]);
    G.advanceTime(s,1);
    s = reload(s);
    const raid = s.raids.active, p = G.person(s,"yukina"), patient = G.person(s,"gald");
    const power = G.abilityPower(p,"shrinePrayer","heal");
    patient.missingHP = power+1;
    Object.assign(raid.enemies[0],{step:G.guardPost(raid,p,0).step,hp:1,maxHP:1});
    G.advanceTime(s,G.raidBeat);
    const report = s.raids.reports[0];
    assert.ok(report.repelled);
    assert.equal(patient.missingHP,1);
    assert.equal(p.spentMP,2);
    assert.equal(report.contributions.yukina.support,1);
    assert.match(report.contributions.yukina.lastAction,/オーダー1 ・ 鈴の祈り/);
  }
});
