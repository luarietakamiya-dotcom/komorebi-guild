const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");
const reload = state => G.restore(JSON.parse(JSON.stringify(state)));
const policy = (s,names,focus="practice",strictness="standard") =>
  G.setProfile(s,0,{...s.guildProfile,rankNames:names,examFocus:focus,examStrictness:strictness});

test("旧セーブの遠征を維持し、復元で名簿・来訪者を二重生成しない", () => {
  const s = G.initial();
  G.depart(s);
  G.step(s);
  const trip = structuredClone(s.trip);
  for (const key of ["ranks","registry","visitors","market","milestones"]) delete s[key];
  for (const p of s.roster) delete p.rank;
  const migrated = reload(s);
  assert.deepEqual(migrated.trip,trip);
  assert.ok(migrated.roster.every(p => p.rank === 1));
  assert.equal(migrated.visitors.length,1);
  assert.ok(migrated.registry.length >= 20);
  assert.deepEqual(reload(migrated),migrated);
  G.returnHome(migrated);
});

test("階級の呼称・段数を編集しても取得した段位を維持し、無効な設定は一切保存しない", () => {
  let s = G.initial();
  const long = ["木の芽","若葉","梢","大樹","森守","森の主"];
  s.roster[0].rank=4;
  policy(s,long);
  policy(s,long.slice(0,2));
  s=reload(s);
  assert.equal(G.rankName(s,s.roster[0]),"若葉");
  assert.equal(G.partyQualifies(s,["mina"],2),false);
  policy(s,long);
  assert.equal(G.rankName(s,s.roster[0]),"森守");
  const before = JSON.stringify(s);
  for (const invalid of [[],["　"],["若葉"," 若葉"]]) assert.throws(()=>policy(s,invalid));
  assert.equal(JSON.stringify(s),before);
});

test("上位依頼と深層の資格を手動選択・臨時編成・自動受注で全員に適用する", () => {
  const s = G.initial();
  s.unlocked=true;
  s.history.push({dungeon:"moss",cleared:true},{dungeon:"canal",cleared:true});
  for (const p of s.roster) p.rank=2;
  G.setQuest(s,"survey");
  G.configure(s,s.party,"mina","safe",0,s,"archive");
  s.roster[1].rank=0;
  assert.throws(()=>G.setQuest(s,"survey"),/階級/);
  const before = JSON.stringify(s);
  assert.throws(()=>G.depart(s),/階級/);
  assert.throws(()=>G.configure(s,s.party,"mina","safe",0,s,"canal"),/階級/);
  assert.equal(JSON.stringify(s),before);
  G.setPriority(s,"depth");
  const [plan]=G.morningPlans(s);
  assert.equal(plan.dungeon,"moss");
  assert.equal(plan.quest,"herb");
  G.depart(s,s,{party:["mina"],leader:"mina",policy:"safe",meds:0,dungeon:"archive"});
  assert.equal(s.trip.dungeon,"archive");
});

test("試験は当落を記録し、再受験・重点・厳しさが昇級と名声に反映される", t => {
  const random = t.mock.method(Math,"random",()=>0.99);
  let s=G.initial();
  const p=s.roster[0];
  assert.throws(()=>G.takeExam(s,p.id),/Lv/);
  p.level=2;
  const normal=G.examStatus(s,p);
  policy(s,s.ranks.names,"record","standard");
  assert.ok(G.examStatus(s,p).chance < normal.chance);
  policy(s,s.ranks.names,"practice","strict");
  assert.ok(G.examStatus(s,p).chance < normal.chance);
  assert.ok(G.examStatus(s,p).renown > normal.renown);
  assert.match(G.takeExam(s,p.id),/不合格/);
  assert.equal(p.rank,1);
  assert.throws(()=>G.takeExam(s,p.id),/翌週/);
  G.nextWeek(s,true);
  s=reload(s);
  random.mock.mockImplementation(()=>0);
  assert.match(G.takeExam(s,p.id),/に合格/);
  assert.deepEqual(s.roster[0].career.filter(e=>"exam" in e).map(e=>e.exam),[false,true]);
  assert.equal(s.roster[0].rank,2);
  assert.equal(G.fame(s),6);
  G.depart(s);
  assert.throws(()=>G.takeExam(s,p.id),/町で/);
});

test("週替わりの一般冒険者が階級内で活動し、再開しても分け前の精算は一度", t => {
  t.mock.method(Math,"random",()=>0);
  let s=G.initial();
  const first=G.visitorList(s)[0];
  assert.equal(first.rank,0);
  G.holdDeparture(s);
  G.advanceTime(s,G.weekMillis/2);
  assert.deepEqual(first.mission,{week:1,quest:"herb",dungeon:"moss"});
  assert.throws(()=>G.scout(s,first.id,"premium"),/遠征中/);
  s=reload(s);
  s.metrics[0]=32;
  G.advanceTime(s,G.weekMillis/2);
  assert.equal(G.visitorList(s).filter(p=>!G.uniqueGuests[p.id]).length,5);
  assert.ok(!s.visitors.includes(first.id));
  assert.equal(s.market.returns.length,1);
  assert.equal(s.registry.find(p=>p.id===first.id).contacts,1);
  const gold=s.gold;
  G.collectMarket(s);
  assert.deepEqual([s.gold,s.stock.herb],[gold+10,1]);
  assert.throws(()=>G.collectMarket(s));
  assert.deepEqual(reload(s),s);
});

test("交渉不成立後も再提示でき、成立時だけ支度金と専属名簿を更新する", t => {
  t.mock.method(Math,"random",()=>0);
  let s=G.initial();
  const p=G.visitorList(s)[0], gold=s.gold;
  assert.equal(G.scout(s,p.id,"basic"),false);
  assert.deepEqual([s.gold,s.visitors.includes(p.id)],[gold,true]);
  assert.throws(()=>G.configure(s,[p.id],p.id,"safe",0));
  assert.equal(G.scout(s,p.id,"generous"),true);
  assert.equal(s.gold,gold-G.offers.generous.gold);
  assert.equal(G.payroll(s),48);
  s=reload(s);
  assert.ok(!s.registry.some(q=>q.id===p.id));
  assert.throws(()=>G.scout(s,p.id,"generous"));
  G.depart(s,s,{party:[p.id],leader:p.id,policy:"safe",meds:0});
  assert.equal(s.trip.unit[0].id,p.id);
});

test("二人の固有人物に別々の出会い・加入条件があり、固有技と加入履歴を引き継ぐ", () => {
  const s=G.initial();
  assert.ok(!s.visitors.includes("shusai") && !s.visitors.includes("yuria"));
  s.metrics[0]=12;
  G.nextWeek(s,true);
  assert.ok(s.visitors.includes("shusai") && !s.visitors.includes("yuria"));
  assert.throws(()=>G.scout(s,"shusai","premium"),/討伐/);
  s.history.push({wins:1,path:["gate"]});
  s.metrics[0]=20;
  G.nextWeek(s,true);
  assert.throws(()=>G.scout(s,"yuria","premium"),/宿屋/);
  s.town.plots.brook="inn";
  s.metrics[1]=80;
  for (const [id,skill] of [["shusai","iai"],["yuria","royalWard"]]) {
    assert.ok(G.scout(s,id,"premium"));
    const p=G.person(s,id);
    assert.equal(p.skills[0],skill);
    assert.ok(G.actionList(p)[skill]);
    assert.ok(!G.startingJobs.includes(p.job));
    assert.match(p.career.at(-1).message,/が仲間になった/);
  }
  assert.equal(s.milestones.length,2);
  G.configure(s,["shusai","yuria"],"yuria","safe",0);
  G.retire(s,"shusai");
  G.nextWeek(s,true);
  assert.ok(!s.visitors.includes("shusai"));
  assert.deepEqual(reload(s).milestones,s.milestones);
});

test("一般冒険者も同じ試験に合格し、町での実績が同額の交渉を有利にする", t => {
  t.mock.method(Math,"random",()=>0);
  const s=G.initial();
  const [p]=G.visitorList(s);
  assert.match(G.takeExam(s,p.id),/合格/);
  assert.equal(p.rank,1);
  assert.equal(G.scout(s,p.id,"basic"),false);
  // With a single regular still registered, each new week offers another meeting.
  s.registry=[p];
  for (let week=0;week<4;week++) G.nextWeek(s,true);
  assert.equal(p.contacts,4);
  assert.ok(G.scout(s,p.id,"basic"));
  assert.ok(G.person(s,p.id).career.some(e=>e.exam));
  assert.equal(G.rankName(s,p),"一人前");
});
