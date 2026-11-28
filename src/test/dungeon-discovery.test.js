const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
const visible = s => Object.keys(G.dungeons).filter(id => G.dungeonOpen(s,id));

function finishTrip(s) {
  for (let i=0; i<100 && s.phase === "explore"; i++) {
    if (s.trip.pending) G.reply(s,"delegate");
    else G.step(s);
  }
  assert.equal(s.phase,"report");
}

test("初週は森の洞だけ。途中帰還では水路は見つからず、踏破した隊が新天地を一度だけ報告する", () => {
  const s = G.initial();
  assert.deepEqual(visible(s),["moss"]);
  for (const id of ["canal","hollow","mine","archive","spire"])
    assert.throws(() => G.configure(s,s.party,s.leader,"safe",0,s,id),/ダンジョン/);
  G.depart(s);
  G.step(s);
  G.returnHome(s);
  assert.deepEqual(visible(s),["moss"]);
  G.nextWeek(s);
  G.depart(s);
  finishTrip(s);
  assert.deepEqual(visible(s),["moss","canal"]);
  const notice = s.discoveries.canal;
  assert.match(notice.message,/地下水路.*森の洞を踏破/);
  assert.equal(s.history[0].log.find(e => e.discovery === "canal").message,notice.message);
  G.nextWeek(s);
  G.depart(s);
  finishTrip(s);
  assert.ok(!s.history[0].log.some(e => e.discovery));
  assert.deepEqual(reload(s).discoveries.canal,notice);
  G.nextWeek(s);
  G.configure(s,s.party,s.leader,"safe",0,s,"canal");
  G.depart(s);
  finishTrip(s);
  assert.match(s.discoveries.archive.message,/大書庫.*地下水路を踏破/);
});

test("別隊の狩人は森の分岐から沢を偵察でき、発見は全隊と再読込後の行き先に反映される", () => {
  const s = G.initial();
  s.gold = 1000;
  G.hire(s);
  G.unlockParty(s);
  const team = s.extraParties[0];
  G.configure(s,["shion"],"shion","safe",0,team);
  G.depart(s,team);
  G.step(s,team);
  assert.equal(G.dungeonOpen(s,"hollow"),false);
  G.step(s,team);
  assert.match(s.discoveries.hollow.message,/シオンが偵察/);
  assert.equal(G.dungeonOpen(s,"canal"),false);
  const saved = reload(s);
  assert.deepEqual(saved.extraParties[0].trip,team.trip);
  G.configure(saved,saved.party,saved.leader,"safe",0,saved,"hollow");
  G.depart(saved);
  finishTrip(saved);
  assert.equal(saved.history[0].dungeon,"hollow");
  assert.equal(saved.history[0].cleared,true);
  assert.equal(G.dungeonOpen(saved,"archive"),false);
});

test("狩人がいない隊も水晶の鉱脈で沢を見つけ、帰還前に記録される", () => {
  const s = G.initial();
  G.configure(s,s.party,"mina","bold",0);
  G.depart(s,s,s,true);
  G.step(s); G.step(s);
  assert.equal(G.dungeonOpen(s,"hollow"),false);
  G.step(s);
  assert.equal(s.trip.node,"vein");
  assert.match(s.discoveries.hollow.message,/水晶の鉱脈/);
  assert.equal(reload(s).phase,"explore");
});

test("名声18に達して来訪した冒険者が廃鉱を知らせ、名声が下がっても地図と情報提供者が残る", t => {
  t.mock.method(Math,"random",()=>0.1);
  const s = G.initial();
  s.metrics[0] = 17;
  G.nextWeek(s,true);
  assert.ok(!G.dungeonOpen(s,"mine"));
  const previous = [...s.visitors];
  s.metrics[0]++;
  G.nextWeek(s,true);
  const notice = s.discoveries.mine;
  assert.ok(notice.rumor);
  assert.equal(notice.week,s.week);
  assert.ok(G.visitorList(s).some(p => !previous.includes(p.id) && notice.message.includes(p.name)));
  s.metrics[0] = 0;
  G.nextWeek(s,true);
  assert.deepEqual(reload(s).discoveries.mine,notice);
  G.configure(s,s.party,s.leader,"safe",0,s,"mine");
  G.depart(s);
  finishTrip(s);
  assert.equal(s.history[0].depth,6);
});

test("大書庫の第6層で観星塔を発見。ギルドランクCでも地図が届き、出発には隊員の階級が必要", () => {
  const s = G.initial();
  s.history.push({dungeon:"canal",cleared:true});
  for (const p of s.roster) p.rank=2;
  G.configure(s,s.party,s.leader,"safe",0,s,"archive");
  G.depart(s);
  while (G.tripRooms(s.trip)[s.trip.node].depth < 5) G.step(s);
  assert.ok(!G.dungeonOpen(s,"spire"));
  finishTrip(s);
  assert.match(s.discoveries.spire.message,/大書庫の第6層/);

  const promoted = G.initial();
  promoted.metrics = [50,50,100,60];
  promoted.roster.forEach(p => { p.rank=2; });
  promoted.guildProgress.feats.push({kind:"clear",points:20});
  G.nextWeek(promoted,true);
  assert.equal(G.guildStanding(promoted).grade,"C");
  assert.match(promoted.discoveries.spire.message,/ランクC/);
  assert.throws(() => G.configure(promoted,promoted.party,"mina","safe",0,promoted,"spire"),/階級/);
  promoted.roster.forEach(p => { p.rank=3; });
  G.configure(promoted,promoted.party,"mina","safe",0,promoted,"spire");
  G.depart(promoted);
  finishTrip(promoted);
  assert.equal(promoted.history[0].depth,9);
});

test("旧セーブの踏破記録・遠征中の隊・来訪者の依頼から既知の場所を復元し、再通知しない", () => {
  const s = G.initial();
  s.history.push({dungeon:"moss",cleared:true,path:["gate","home"],log:[]});
  G.configure(s,s.party,"mina","safe",0,s,"canal");
  G.depart(s);
  G.step(s);
  const guest = G.visitorList(s)[0];
  guest.mission = {week:s.week,quest:"herb",dungeon:"archive"};
  delete s.discoveries;
  const saved = reload(s);
  assert.deepEqual(saved.trip,s.trip);
  assert.deepEqual(G.visitorList(saved)[0].mission,guest.mission);
  assert.deepEqual(visible(saved),["moss","canal","archive"]);
  assert.ok(Object.values(saved.discoveries).every(n => n === null));
  assert.deepEqual(reload(saved),saved);
  finishTrip(saved);
  assert.ok(!saved.history[0].log.some(e => e.discovery === "archive"));
});
