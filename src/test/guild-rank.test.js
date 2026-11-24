const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");
const reload = s => G.restore(JSON.parse(JSON.stringify(s)));

function finishTrip(s) {
  for (let i=0; i<100 && s.phase === "explore"; i++) {
    if (s.trip.pending) G.reply(s,"delegate");
    else G.step(s);
  }
  assert.equal(s.phase,"report");
}

test("通常の薬草依頼と所属者の昇級で第4週にCに届き、依頼と節目が残る", t => {
  t.mock.method(Math,"random",()=>0.1);
  let s = G.initial();
  assert.equal(G.guildStanding(s).grade,"E");
  assert.throws(()=>G.setQuest(s,"waystation"));
  for (let week=1; week<=4; week++) {
    if (week === 2) {
      for (const id of ["mina","gald"]) G.takeExam(s,id);
      assert.equal(G.guildStanding(s).grade,"E");
    }
    G.depart(s);
    finishTrip(s);
    if (week === 2) {
      assert.equal(G.guildStanding(s).grade,"D");
      assert.ok(G.postedQuests(s).includes("waystation"));
      assert.ok(!G.postedQuests(s).includes("townworks"));
    }
    if (week < 4) G.nextWeek(s);
  }
  const standing = G.guildStanding(s);
  assert.equal(s.week,4);
  assert.deepEqual([standing.grade,standing.points,standing.members,standing.minimum,standing.score],["C",26,2,12,40]);
  assert.deepEqual(s.milestones.map(e=>e.guildGrade),["C","D"]);
  assert.ok(G.postedQuests(s).includes("townworks"));
  s = reload(s);
  G.nextWeek(s);
  assert.throws(()=>G.setQuest(s,"townworks"),/階級/);
  G.configure(s,["mina","gald"],"mina","safe",0);
  G.setQuest(s,"townworks");
  G.depart(s);
  assert.equal(s.trip.quest,"townworks");
  G.returnHome(s);
  G.retire(s,"gald");
  assert.equal(G.guildStanding(s).members,1);
  assert.equal(G.guildStanding(s).grade,"C");
  G.retire(s,"mina");
  assert.equal(G.guildStanding(s).members,0);
  assert.deepEqual(reload(s),s);
});

test("来訪者は合格で加点し、専属契約後にだけ所属数と昇格に反映する", t => {
  t.mock.method(Math,"random",()=>0.06); // 初週は段位1のベルタ
  const s = G.initial(), [guest] = G.visitorList(s);
  s.metrics[0] = 25;
  G.depart(s);
  finishTrip(s);
  G.takeExam(s,guest.id);
  assert.equal(G.guildStanding(s).points,8);
  assert.equal(G.guildStanding(s).members,0);
  assert.equal(G.guildStanding(s).grade,"E");
  assert.throws(()=>G.takeExam(s,guest.id));
  assert.ok(G.scout(s,guest.id,"premium"));
  assert.equal(G.guildStanding(s).members,1);
  assert.equal(G.guildStanding(s).grade,"D");
  const names = [...s.ranks.names];
  G.setProfile(s,0,{...s.guildProfile,rankNames:names.slice(0,2),examFocus:"practice",examStrictness:"standard"});
  assert.equal(G.guildStanding(s).members,0);
  assert.equal(G.guildStanding(s).grade,"D");
  G.setProfile(s,0,{...s.guildProfile,rankNames:names,examFocus:"practice",examStrictness:"standard"});
  assert.equal(G.guildStanding(s).members,1);
  assert.equal(s.milestones.filter(e=>e.guildGrade).length,1);
});

test("早期帰還と試験不合格は偉業を加算しない", t => {
  t.mock.method(Math,"random",()=>0.99);
  const s = G.initial();
  G.depart(s);
  G.returnHome(s);
  G.nextWeek(s);
  G.takeExam(s,"mina");
  assert.deepEqual(s.guildProgress.feats,[]);
});

test("旧セーブの踏破・試験・撃退・ヌシ・探索中の番獣討伐を一度だけ復元する", t => {
  t.mock.method(Math,"random",()=>0.1);
  const s = G.initial();
  G.depart(s);
  finishTrip(s);
  G.nextWeek(s);
  G.takeExam(s,"mina");
  for (const p of s.roster) p.level = 50;
  G.configure(s,s.party,"mina","bold",0,s,"canal");
  G.depart(s);
  for (let i=0; i<100 && !s.guildProgress.feats.some(e=>e.kind==="boss"); i++) {
    if (s.trip.pending) G.reply(s,"delegate");
    else G.step(s);
  }
  assert.equal(s.phase,"explore");
  assert.deepEqual(s.guildProgress.feats.map(e=>e.kind),["boss","exam","clear"]);
  s.raids.reports.push({week:1,road:"west",herb:1,repelled:true});
  delete s.guildProgress;
  const migrated = reload(s);
  assert.deepEqual(migrated.trip,s.trip);
  assert.deepEqual(migrated.guildProgress.feats.map(e=>e.kind).sort(),["boss","clear","exam","raidBoss","repel"]);
  assert.equal(G.guildStanding(migrated).points,24);
  assert.deepEqual(reload(migrated),migrated);
  finishTrip(migrated);
  assert.equal(G.guildStanding(migrated).points,29);
  // 帰還報告と同じ遠征の手元の記録を二重に数えない。
  delete migrated.guildProgress;
  migrated.milestones = migrated.milestones.filter(e=>!e.guildGrade);
  assert.equal(G.guildStanding(reload(migrated)).points,29);
});

test("偉業と在籍数が揃っても、最低の指標が評価基準を割れば昇格を保留する", () => {
  for (let index=0; index<4; index++) {
    const s = G.initial();
    s.roster[0].rank = 2;
    s.guildProgress.feats.push({week:1,kind:"clear",message:"踏破",points:5},
      {week:1,kind:"exam",message:"合格",points:3});
    s.metrics = [100,100,100,100];
    s.metrics[index] = 12;
    const settings = {...s.guildProfile,rankNames:s.ranks.names,examFocus:"practice",examStrictness:"standard"};
    G.setProfile(s,0,settings);
    assert.equal(G.guildStanding(s).score,24);
    assert.equal(G.guildStanding(s).grade,"E");
    s.metrics[index]++;
    G.setProfile(s,0,settings);
    assert.equal(G.guildStanding(s).grade,"D");
  }
});
