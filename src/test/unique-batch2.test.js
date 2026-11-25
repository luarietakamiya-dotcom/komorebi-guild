const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");
const waitForGuest = require("./wait-for-guest");

const reload = s => G.restore(structuredClone(s));
const guests = [
  {id:"jobava", fame:22, job:"覇王", qualify:s => s.raids.reports.push({repelled:true})},
  {id:"tanaka", fame:14, job:"サラリーマン", qualify:s => s.history.push({success:true,path:["gate"],log:[]})},
  {id:"shiina", fame:19, job:"アイドル", qualify:s => { s.metrics[3] = 70; }},
  {id:"goto", fame:10, job:"料理人", qualify:s => G.build(s,"west","inn")}
];

function visitors(fame) {
  const s = G.initial();
  s.gold = 3000;
  s.metrics[0] = fame;
  G.nextWeek(s,true);
  return s;
}

function joined(guest) {
  const s = visitors(guest.fame);
  waitForGuest(s,guest.id);
  guest.qualify(s);
  assert.ok(G.scout(s,guest.id,"premium"));
  return s;
}

for (const guest of guests) {
  const {id,fame,job} = guest;
  test(job+"の初来訪・加入の記録は保存後も一度だけ残る", () => {
    const s = visitors(fame-1);
    assert.ok(!s.visitors.includes(id));
    s.metrics[0] = fame;
    waitForGuest(s,id);
    const candidate = G.visitorList(s).find(p => p.id === id);
    const gold = s.gold;
    assert.throws(() => G.scout(s,id,"premium"),{message:G.uniqueGuests[id].invitation});
    assert.equal(s.gold,gold);
    guest.qualify(s);
    assert.ok(G.scout(s,id,"premium"));
    const saved = reload(s), p = G.person(saved,id);
    assert.equal(G.jobs[p.job].name,job);
    assert.ok(!G.startingJobs.includes(p.job));
    assert.throws(() => G.promote(saved,id));
    assert.deepEqual(G.characterArt(p),{portrait:id,stack:id});
    assert.deepEqual(saved.morningMail.filter(m => m.sender === candidate.name).map(m => m.message),
      [G.uniqueGuests[id].letter]);
    assert.deepEqual(p.career.filter(e => e.firstVisit).map(e => e.message),[G.uniqueGuests[id].letter]);
    assert.ok(p.career.at(-1).message.includes(G.uniqueGuests[id].pledge));
    assert.equal(saved.milestones.find(e => e.message === p.career.at(-1).message).week,s.week);
    G.retire(saved,id);
    const retired = reload(saved);
    G.nextWeek(retired,true);
    assert.ok(!retired.visitors.includes(id) && !retired.registry.some(q => q.id === id));
    assert.equal(retired.alumni.filter(q => q.id === id).length,1);
  });

  test(job+"は街道と広場の最終ラインで固有技のオーダーを実行できる", () => {
    const joinedState = joined(guest);
    for (const post of ["front","plaza"]) {
      const s = reload(joinedState), p = G.person(s,id), skill = p.skills[0];
      G.holdDeparture(s);
      s.raids.warning = {outer:true,routeVersion:2,road:"west",count:1,tier:0,due:1};
      for (const q of G.raidDefenders(s)) G.assignGuard(s,q.id,q.id === id ? post : "gate");
      G.setGambits(s,id,[{condition:"always",action:skill,target:G.abilities[skill].atk ? "nearest" : "self"}]);
      G.advanceTime(s,1);
      const raid = s.raids.active;
      raid.enemies[0].step = G.guardPost(raid,p,0).step;
      raid.enemies[0].hp = raid.enemies[0].maxHP = 90;
      p.missingHP = 12;
      G.advanceTime(s,G.raidBeat);
      const contribution = raid.contributions[id];
      assert.ok(contribution.damage > 0 || contribution.support > 0);
      assert.ok(contribution.lastAction.includes(G.abilities[skill].name));
      assert.equal(p.spentMP,2);
      assert.ok(!raid.enemies[0].escaped);
    }
  });
}

test("旧セーブの遠征を維持し、新しい候補を一人ずつ補う", () => {
  const s = G.initial(), ids = guests.map(g => g.id);
  s.registry = s.registry.filter(p => !ids.includes(p.id));
  G.depart(s);
  G.step(s);
  const migrated = reload(s);
  assert.deepEqual(migrated.registry.filter(p => ids.includes(p.id)).map(p => p.id),ids);
  assert.deepEqual(reload(migrated),migrated);
  migrated.registry = migrated.registry.filter(p => !ids.includes(p.id));
  assert.deepEqual(migrated,s);
});

test("覇王が隊長として帰ると同行者の士気が上がる", () => {
  const initial = joined(guests[0]);
  for (const leader of ["jobava","mina"]) {
    const s = reload(initial), member = G.person(s,"mina"), before = member.morale;
    assert.ok(G.stat(G.person(s,"jobava"),"atk") > G.stat(member,"atk"));
    G.depart(s,s,{party:["jobava","mina"],leader,policy:"safe",meds:0});
    assert.ok(!G.raidDefenders(s).some(q => q.id === "jobava"));
    G.returnHome(s);
    assert.equal(member.morale,before - 4 + (leader === "jobava" ? 4 : 0));
  }
});

test("タナカは在町時のみ、同じ支度金でも契約交渉を成功させる", () => {
  const s = joined(guests[1]);
  const candidate = s.registry.find(p => p.id === "guest-1");
  candidate.contacts = 0;
  const offer = G.scoutStatus(s,candidate,"basic");
  assert.ok(offer.accepts);
  G.depart(s,s,{party:["tanaka"],leader:"tanaka",policy:"safe",meds:0});
  const away = G.scoutStatus(s,candidate,"basic");
  assert.ok(!away.accepts);
  assert.equal(offer.price,away.price);
});

test("シイナの公演は町の仲間の士気と満足度を上げ、休暇中は休演する", () => {
  const initial = joined(guests[2]);
  for (const leave of [false,true]) {
    const s = reload(initial);
    if (leave) G.person(s,"shiina").leaveWeek = s.week;
    const mina = G.person(s,"mina"), morale = mina.morale, satisfaction = s.metrics[3];
    G.nextWeek(s,true);
    assert.equal(mina.morale,morale+(leave ? 0 : 5));
    assert.equal(s.metrics[3],satisfaction+(leave ? 0 : 2));
  }
});

test("ゴトウのまかないは宿屋と食べ物屋でHP・MPと満足度を補い、休業中は出ない", () => {
  for (const kind of ["inn","tavern"]) {
    const s = visitors(10);
    waitForGuest(s,"goto");
    G.build(s,"west",kind);
    assert.ok(G.scout(s,"goto","premium"));
    for (const closed of [false,true]) {
      const saved = reload(s), p = G.person(saved,"gald");
      if (closed) saved.town.repairs.west = {remaining:0};
      p.missingHP = G.stat(p,"hp");
      p.spentMP = G.maxMP(p);
      const satisfaction = saved.metrics[3];
      const yields = G.facilityTotals(saved.town);
      G.nextWeek(saved,true);
      const rate = (20 + yields.recovery + (closed ? 0 : 10))/100;
      assert.equal(G.currentHP(saved,p),Math.ceil(G.stat(p,"hp")*rate));
      assert.equal(G.currentMP(p),Math.ceil(G.maxMP(p)*rate));
      assert.equal(saved.metrics[3],satisfaction+yields.satisfaction+(closed ? 0 : 2));
    }
  }
});
