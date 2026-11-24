const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
const morning = s => G.advanceTime(s,G.departureDelay);
const popo = s => G.person(s,"popo");

function enterSoloFight(s) {
  G.depart(s,s,{party:["popo"],leader:"popo",policy:"gather",meds:1});
  G.step(s); G.step(s); G.reply(s,"pass"); G.step(s);
}

test("週初めの伝書どおりに各隊が別の依頼へ出発し、復元時にも補給と給与は一度だけ", () => {
  let s = G.initial();
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.configure(s,["gald"],"gald","safe",0,second);
  G.setPriority(s,"reward");
  assert.deepEqual(G.morningPlans(s).map(p => p.quest),["ore","herb"]);
  G.advanceTime(s,G.departureDelay-1);
  s = reload(s);
  assert.equal(s.phase,"prep");
  G.advanceTime(s,1);
  assert.deepEqual(G.parties(s).map(t => [t.phase,t.trip.quest,t.trip.quote.wages]),
    [["explore","ore",36],["explore","herb",0]]);
  const gold = s.gold;
  s = reload(s);
  morning(s);
  assert.equal(s.gold,gold);
  assert.equal(s.morningMail.length,2);
  assert.match(s.morningMail[1].message,/ミナ.*洞窟のきらめき鉱石/);
});

test("素材・不足・深さの優先条件と性格で行き先が変わり、掲示前の依頼は選ばない", () => {
  const s = G.initial();
  const plan = () => G.morningPlans(s)[0];
  G.setPriority(s,"herb"); assert.equal(plan().quest,"herb");
  G.setPriority(s,"ore"); assert.equal(plan().quest,"ore");
  G.setPriority(s,"shortage");
  s.stock.ore = 10; assert.equal(plan().quest,"herb");
  s.stock.herb = 11; assert.equal(plan().quest,"ore");
  s.stock.herb = 10; assert.equal(plan().quest,"ore");
  G.configure(s,s.party,"gald","safe",0);
  assert.equal(plan().quest,"herb");
  G.setPriority(s,"depth"); assert.equal(plan().dungeon,"moss");
  G.depart(s);
  while (s.phase === "explore") G.step(s);
  G.nextWeek(s);
  assert.equal(plan().dungeon,"canal");
  morning(s);
  assert.equal(s.trip.dungeon,"canal");
});

test("見送りはその週のみ。資金不足・未編成・一時停止では支払いも出発も発生しない", () => {
  let s = G.initial();
  G.unlockParty(s);
  G.holdDeparture(s);
  s = reload(s);
  const gold = s.gold;
  morning(s);
  assert.equal(s.gold,gold); assert.equal(s.phase,"prep");
  G.nextWeek(s,true);
  s.gold = 0;
  s.clock.paused = true; morning(s);
  assert.equal(s.clock.elapsed,0);
  s.clock.paused = false; morning(s);
  assert.match(s.morningMail[0].message,/補給資金/);
  assert.equal(s.extraParties[0].trip,null);
  G.nextWeek(s,true); morning(s);
  assert.equal(s.phase,"explore");
});

test("HP・MPの部分回復と休暇の回復を区別し、遠征中や休暇中の移籍で回復を重ねない", () => {
  const s = G.initial();
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.configure(s,["mina"],"mina","safe",0,second);
  for (const p of s.roster) { p.missingHP = 20; p.spentMP = 8; }
  G.takeLeave(s);
  assert.throws(() => G.configure(s,["popo"],"popo","safe",0,second));
  assert.throws(() => G.depart(s));
  G.depart(s,second);
  assert.deepEqual([second.trip.unit[0].hp,second.trip.unit[0].mp],[20,2]);
  G.advanceTime(s,G.weekMillis);
  assert.deepEqual([second.trip.unit[0].hp,second.trip.unit[0].mp],[20,2]);
  assert.deepEqual([G.currentHP(s,popo(s)),G.currentMP(popo(s))],[24,16]);
  G.returnHome(s,second);
  G.nextWeek(s);
  const mina = G.person(s,"mina");
  assert.deepEqual([G.currentHP(s,mina),G.currentMP(mina)],[28,4]);
  assert.deepEqual(reload(s),s);
});

test("MP不足でリーダーが休暇を取り、宿屋と料理店の回復効果を受ける", () => {
  const s = G.initial();
  G.build(s,"square","inn"); G.build(s,"west","tavern");
  popo(s).spentMP = 16;
  morning(s);
  assert.equal(s.leaveWeek,1);
  assert.match(s.morningMail[0].message,/休息/);
  assert.equal(s.trip,null);
  G.nextWeek(s);
  assert.equal(G.currentMP(popo(s)),11);
  morning(s);
  assert.equal(s.phase,"explore");
});

test("MPを消費した技は帰還時に保存され、MP切れなら通常攻撃を選ぶ", () => {
  for (const mp of [0,2]) {
    const s = G.initial(), p = G.person(s,"mina");
    p.spentMP = G.maxMP(p)-mp;
    G.learnAbility(s,p.id,"slash");
    G.setGambits(s,p.id,[{condition:"always",action:"slash",target:"nearest"}]);
    G.depart(s,s,{party:[p.id],leader:p.id,policy:"gather",meds:0},true);
    G.step(s); G.step(s); G.step(s); G.step(s); G.step(s);
    assert.equal(s.trip.unit[0].mp,0);
    assert.equal(s.trip.effects[0].kind,mp ? "skill" : "attack");
    G.returnHome(s);
    const restored = reload(s);
    assert.equal(G.currentMP(G.person(restored,p.id)),0);
    assert.equal(G.currentHP(restored,G.person(restored,p.id)),13);
  }
});

test("死亡回数は救護や再読込をまたぎ、骨折の療養を経た3回目で永久消失する", () => {
  let s = G.initial();
  s.gold = 1000;
  enterSoloFight(s);
  assert.equal(popo(s).deaths,1);
  s = reload(s);
  G.reply(s,"return"); G.nextWeek(s);
  enterSoloFight(s);
  let p = popo(s);
  assert.equal(p.deaths,2);
  assert.equal(p.injury.kind,"骨折");
  assert.ok(!G.choices(s).includes("med"));
  G.reply(s,"return");
  assert.ok(s.history[0].log.some(e => e.message.includes("骨折")));
  for (let i = 0; i < 3; i++) {
    G.nextWeek(s); morning(s);
    assert.equal(s.leaveWeek,s.week);
    assert.ok(!G.available(s,p)); assert.throws(() => G.depart(s));
    s = reload(s); p = popo(s);
  }
  G.nextWeek(s);
  assert.equal(p.injury,null);
  assert.ok(G.available(s,p));
  const credit = s.metrics[1];
  enterSoloFight(s);
  assert.equal(s.phase,"report"); assert.equal(s.trip.pending,null);
  assert.equal(popo(s),undefined); assert.ok(!s.party.includes("popo"));
  assert.equal(s.history[0].unit[0].state,"lost");
  assert.ok(s.metrics[1] <= credit-G.lossPenalty);
  assert.equal(s.alumni[0].deaths,3);
  assert.deepEqual(s.alumni[0].career.filter(e => /死亡\d回目/.test(e.message)).map(e=>e.week),[1,2,6]);
  assert.match(s.history[0].log.map(e=>e.message).join(" "),/死亡3回目.*消失/);
  assert.deepEqual(reload(s),s);
});

test("錬金術師が骨折の療養を短縮し、引退した隊長は給与・装備・再雇用の対象から外れる", () => {
  const s = G.initial();
  G.build(s,"square","shop","alchemy");
  popo(s).deaths = 1;
  enterSoloFight(s);
  assert.equal(popo(s).readyWeek,4);
  assert.throws(() => G.retire(s,"popo"));
  G.reply(s,"return");
  s.wielder = "popo";
  const credit = s.metrics[1];
  G.retire(s,"popo");
  assert.equal(s.wielder,null); assert.equal(s.leader,null);
  assert.equal(G.payroll(s),24); assert.equal(s.metrics[1],credit);
  assert.equal(s.alumni[0].departure.kind,"retired");
  assert.match(s.alumni[0].career.at(-1).message,/町で暮らす/);
  assert.equal(G.knownPerson(reload(s),s.history[0].leader).name,"ポポ");
  G.nextWeek(s); G.hire(s); G.retire(s,"shion");
  assert.throws(() => G.hire(s));
});

test("旧セーブの準備・探索・帰還に健康と自動判断を補完し、途中のHPや通信を維持する", () => {
  const s = G.initial();
  function legacy() {
    const old = JSON.parse(JSON.stringify(s));
    for (const key of ["alumni","morningMail","decisionWeek","priority"]) delete old[key];
    for (const p of old.roster)
      for (const key of ["missingHP","spentMP","deaths","leaveWeek","injury"]) delete p[key];
    for (const u of old.trip?.unit || []) delete u.mp;
    const restored = G.restore(old);
    assert.deepEqual(reload(restored),restored);
    return restored;
  }
  assert.equal(legacy().priority,"safe");
  s.clock.elapsed = G.departureDelay + 1000;
  const afternoon = legacy();
  morning(afternoon);
  assert.equal(afternoon.phase,"prep");
  G.nextWeek(afternoon,true); morning(afternoon);
  assert.equal(afternoon.phase,"explore");
  enterSoloFight(s);
  const away = legacy();
  assert.equal(away.trip.unit[0].hp,0);
  assert.equal(away.trip.pending.type,"crisis");
  assert.equal(away.trip.unit[0].mp,G.maxMP(popo(away)));
  G.reply(s,"return");
  const home = legacy();
  assert.equal(G.currentHP(home,popo(home)),0);
  assert.equal(home.history.length,1);
});
