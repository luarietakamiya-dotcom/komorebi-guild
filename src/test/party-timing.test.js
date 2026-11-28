const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
const custom = {name:"ユキ",job:"sword",trait:"kind",tone:"normal"};
const plan = (party, leader = party[0]) => ({party,leader,policy:"safe",meds:0,dungeon:"moss"});

test("探索中と帰還報告中に自作絵付きの冒険者を在町の控えとして登録できる", () => {
  for (const phase of ["explore","report"]) {
    const s = G.initial();
    G.depart(s);
    if (phase === "report") G.returnHome(s);
    const trip = JSON.stringify(s.trip);
    const portrait = "data:image/png;base64," + Buffer.from("portrait").toString("base64");
    G.register(s,{...custom,portrait});
    assert.ok(G.person(reload(s),"custom").portrait === portrait);
    assert.ok(G.available(s,G.person(s,"custom")));
    assert.ok(!G.awayMember(s,"custom") && !s.party.includes("custom"));
    assert.equal(JSON.stringify(s.trip),trip);
    assert.throws(() => G.register(s,custom),/1人/);
  }
});

test("探索中の2隊の移籍予約を復元し、両隊の帰還後に編成して次の朝に送り出す", () => {
  let s = G.initial();
  G.unlockParty(s);
  let second = s.extraParties[0];
  G.configure(s,["gald"],"gald","safe",0,second);
  G.depart(s);
  G.depart(s,second);
  G.register(s,custom);
  G.saveFormation(s,s,plan(["gald","custom"],"custom"));
  G.saveFormation(s,second,plan(["mina"]));
  assert.deepEqual(s.party,["mina","popo"]);
  G.returnHome(s);
  s = reload(s);
  second = s.extraParties[0];
  assert.deepEqual(s.pendingFormation.party,["gald","custom"]);
  assert.deepEqual(second.trip.unit.map(u => u.id),["gald"]);
  assert.deepEqual(s.history[0].unit.map(u => u.id),["mina","popo"]);
  G.returnHome(s,second);
  assert.deepEqual([s.party,s.leader,second.party],[["gald","custom"],"custom",["mina"]]);
  assert.equal(s.pendingFormation,undefined);
  assert.equal(second.pendingFormation,undefined);
  assert.deepEqual(s.history[0].unit.map(u => u.id),["gald"]);
  G.nextWeek(s);
  G.advanceTime(s,G.departureDelay);
  assert.equal(s.trip.leader,"custom");
  assert.deepEqual(second.trip.unit.map(u => u.id),["mina"]);
});

test("在町者の変更は即時反映し、帰還待ちの取り置きは別隊の予約と朝の出発から守る", () => {
  const s = G.initial();
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.saveFormation(s,second,plan(["gald","popo"]));
  assert.deepEqual(s.party,["mina"]);
  G.depart(s);
  G.saveFormation(s,s,plan(["gald"]));
  assert.throws(() => G.saveFormation(s,second,plan(["gald"])),/予約済み/);
  G.advanceTime(s,G.departureDelay);
  assert.equal(second.phase,"prep");
  assert.match(s.morningMail[0].message,/予約編成/);
  G.saveFormation(s,s,plan(["popo"]));
  assert.equal(G.reservedBy(s,"gald",second),undefined);
  G.returnHome(s);
  assert.deepEqual([s.party,second.party,second.leader],[["popo"],["gald"],"gald"]);
  G.saveFormation(s,second,plan(["mina"]));
  assert.deepEqual(second.party,["mina"]);
  assert.equal(G.available(s,G.person(s,"mina")),false);
  assert.throws(() => G.depart(s,second),/療養/);
});

test("予約のリーダーが帰還時に消失したら、残った隊員で予約を反映する", () => {
  const s = G.initial();
  G.depart(s);
  G.saveFormation(s,s,plan(["gald","popo"]));
  s.trip.unit.find(u => u.id === "gald").state = "lost";
  G.returnHome(s);
  assert.deepEqual([s.party,s.leader],[["popo"],"popo"]);
  assert.equal(s.pendingFormation,undefined);
  assert.equal(G.person(s,"gald"),undefined);
});
