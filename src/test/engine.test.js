const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");
const defaults = ["mina", "gald", "popo"];
function toFork(s, leader = "mina", policy = "gather", meds = 0, party = defaults) {
  G.configure(s, party, leader, policy, meds);
  G.depart(s); G.step(s); G.step(s);
}
function complete(s) {
  for (let i = 0; i < 20 && s.phase === "explore"; i++) {
    if (s.trip.pending) G.reply(s, "delegate"); else G.step(s);
  }
  assert.equal(s.phase, "report"); return s.history[0];
}
test("安全帰還の帳簿・研究・翌週の装備と次の受注", () => {
  const s = G.initial();
  toFork(s, "mina", "safe"); const r = complete(s);
  assert.deepEqual([r.delivered, s.gold, r.actual.net, r.xp], [2, 244, 4, 6]);
  assert.deepEqual(s.stock, { herb: 2, ore: 1 });
  G.donate(s); G.sell(s, "herb"); G.sell(s, "herb"); assert.equal(s.gold, 264);
  assert.throws(() => G.sell(s, "herb")); assert.throws(() => G.returnHome(s)); assert.throws(() => G.buy(s));
  G.nextWeek(s); G.buy(s); G.equip(s, "gald"); assert.equal(s.gold, 184);
  G.setQuest(s, "order"); G.depart(s); assert.equal(s.trip.quest, "order");
});
test("負傷続行の帳簿・療養期間・給与", () => {
  const s = G.initial(); G.setQuest(s, "ore"); toFork(s);
  assert.equal(s.trip.route, "pass"); const r = complete(s);
  assert.deepEqual([r.success, r.delivered, r.severe, r.actual.net, s.gold], [true, 2, 1, 60, 300]);
  assert.deepEqual(s.stock, { herb: 2, ore: 2 });
  G.nextWeek(s); assert.equal(G.available(s, G.person(s, "popo")), false);
  assert.throws(() => G.configure(s, defaults, "gald", "safe", 0));
  assert.equal(G.payroll(s), 36); G.nextWeek(s, true); assert.equal(G.available(s, G.person(s, "popo")), true);
});
test("通信待ちの停止・通常枠使用後の必須通信・撤退時の自動納品", () => {
  const s = G.initial(); toFork(s, "gald");
  assert.equal(s.trip.pending.type, "fork"); G.reply(s, "pass"); G.step(s);
  assert.deepEqual([s.trip.pending.target, s.trip.pending.type, s.trip.calls], ["popo", "crisis", 1]);
  const frozen = JSON.stringify(s); assert.throws(() => G.step(s)); assert.throws(() => G.returnHome(s));
  assert.equal(JSON.stringify(s), frozen); G.reply(s, "return");
  assert.equal(s.history[0].success, true); assert.deepEqual(s.stock, { herb: 0, ore: 0 });
  G.nextWeek(s); assert.equal(s.party.length, 3);
});
test("未達と期限切れは納品ゼロ、在庫の流用・その週再出撃不可", () => {
  for (const expired of [true, false]) {
    const s = G.initial(); s.stock.herb = 4; G.depart(s);
    if (expired) { G.step(s); s.trip.deadline = 0; }
    G.returnHome(s); assert.equal(s.history[0].delivered, 0); assert.equal(s.history[0].actual.reward, 0);
    assert.equal(s.stock.herb, expired ? 6 : 4); assert.throws(() => G.depart(s));
    G.nextWeek(s); assert.equal(s.unlocked, true);
  }
});
test("復帰薬は対象を起こし、未使用分は返品。全員戦闘不能でも帰還可能", () => {
  const s = G.initial(); toFork(s, "mina", "gather", 2); G.step(s);
  G.reply(s, "med"); assert.equal(s.trip.unit[2].hp, 16); G.returnHome(s);
  assert.equal(s.history[0].actual.medicine, 30); assert.equal(s.gold, 214);
  const solo = G.initial(); toFork(solo, "popo", "gather", 0, ["popo"]); G.reply(solo, "pass"); G.step(solo);
  assert.deepEqual(G.choices(solo), ["return", "delegate"]); G.reply(solo, "delegate"); assert.equal(solo.phase, "report");
});
test("同じ初期状態から方針・リーダーだけで分岐行動が変わる", () => {
  for (const [leader, policy, route, pending] of [["mina","safe","grove",false],["mina","gather","pass",false],["gald","gather",null,true]]) {
    const s = G.initial(); toFork(s, leader, policy);
    assert.equal(s.trip.route, route); assert.equal(!!s.trip.pending, pending);
    if (pending) { G.reply(s, "delegate"); assert.equal(s.trip.route, "grove"); }
  }
});

test("緊急相談の期限に、性格・方針・使える薬に応じて帰還か救護を選ぶ", () => {
  for (const [leader, policy, meds, choice] of [
    ["popo", "gather", 1, "return"], ["popo", "bold", 1, "med"],
    ["gald", "gather", 1, "med"], ["gald", "gather", 0, "return"]
  ]) {
    const s = G.initial();
    toFork(s, leader, policy, meds);
    if (s.trip.pending) G.reply(s, "pass");
    G.step(s);
    assert.equal(s.trip.pending.type, "crisis");
    assert.equal(s.trip.pending.expiresWeek, 2);
    G.nextWeek(s);
    const answer = s.trip.log.find(e => e.letter?.type === "crisis").letter;
    assert.equal(answer.answer, choice);
    assert.equal(answer.answeredWeek, 2);
    assert.match(answer.decision, /返事がなかったので/);
    if (choice === "return") {
      assert.equal(s.phase, "report");
      assert.equal(G.reportFor(s,s).week, 2);
      assert.match(s.history[0].reason, /安全帰還/);
    } else {
      assert.equal(s.phase, "explore");
      assert.equal(s.trip.meds, 0);
      assert.equal(s.trip.wins, 1);
    }
    assert.deepEqual(G.restore(JSON.parse(JSON.stringify(s))), s);
  }
});

test("週をまたぐ全隊の相談を期限ごとに解決し、後から届く伝書にも翌週の猶予がある", () => {
  const s = G.initial();
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.depart(s,second,{party:["popo"],leader:"popo",policy:"gather",meds:0});
  G.depart(s,s,{party:["gald"],leader:"gald",policy:"gather",meds:0});
  for (const team of G.parties(s)) {
    G.step(s,team); G.step(s,team);
    assert.equal(team.trip.pending.expiresWeek, 2);
  }
  G.reply(s, "pass", second);
  G.step(s,second);
  assert.equal(second.trip.pending.type, "crisis");
  G.nextWeek(s);
  assert.equal(s.trip.route, "grove");
  assert.equal(second.phase, "report");
  assert.equal(second.trip.log.find(e => e.letter?.type === "crisis").letter.answer, "return");
  assert.equal(s.trip.log.filter(e => e.letter?.decision).length, 1);
  assert.throws(() => G.reply(s, "return"));
  G.step(s); G.step(s);
  G.nextWeek(s);
  toFork(s, "gald");
  assert.equal(s.trip.pending.expiresWeek, 4);
  G.reply(s, "pass"); G.step(s);
  assert.equal(s.trip.pending.expiresWeek, 4);
});
test("雇用、自作キャラの口調・画像・狩人補正、負残高からの回復", () => {
  const s = G.initial(); G.hire(s); assert.equal(s.gold, 190); assert.throws(() => G.hire(s));
  const data = { name:"ユキ", job:"hunter", trait:"careful", pronoun:"わたくし", tone:"polite", master:"団長", ending:"ですわ", portrait:"data:image/png;base64,AA==" };
  G.register(s, data); assert.throws(() => G.register(s, data));
  toFork(s, "custom", "gather", 0, ["custom", "gald"]);
  assert.match(s.trip.pending.line, /団長.*わたくし.*ですわ/);
  assert.equal(s.trip.cargo.herb, 3); assert.equal(G.person(s, "custom").portrait, data.portrait);
  G.reply(s, "return"); G.nextWeek(s); s.gold = -5;
  assert.throws(() => G.depart(s)); G.nextWeek(s, true); assert.equal(s.gold, 25); G.depart(s);
});
test("着信中の保存・再開は同じ打撃から再開し、納品を重複させない", () => {
  const s = G.initial(); G.setQuest(s, "ore"); toFork(s); G.step(s);
  const resumed = JSON.parse(JSON.stringify(s));
  for (const game of [s, resumed]) {
    G.reply(game, "carry"); assert.equal(game.trip.wins, 1);
    assert.equal(game.trip.unit[2].state, "down"); G.returnHome(game);
    assert.equal(game.history[0].severe, 0);
    assert.equal(game.stock.ore, 0); assert.throws(() => G.donate(game));
    assert.throws(() => G.reply(game, "carry"));
  }
  assert.deepEqual(resumed, s);
});
test("危険な依頼に安全第一で出ると鉱石が足りず、余剰として持ち帰る", () => {
  const s = G.initial(); G.setQuest(s, "ore"); toFork(s, "mina", "safe");
  const r = complete(s);
  assert.equal(r.success, false); assert.equal(r.actual.net, -66);
  assert.deepEqual(s.stock, { herb: 4, ore: 1 });
  assert.equal(s.metrics[1], 0);
});
test("レベルアップと当週給与の固定、次の出発前の付替え、最低ダメージ", () => {
  const s = G.initial(); G.person(s,"mina").xp = 19;
  toFork(s,"mina","safe"); const r=complete(s);
  assert.equal(r.actual.wages,36); assert.equal(G.person(s,"mina").level,2);
  assert.equal(G.stat(G.person(s,"mina"),"hp"),44);
  G.donate(s); G.nextWeek(s); G.buy(s); G.equip(s,"gald");
  assert.equal(G.payroll(s),38); assert.equal(G.damage(1,1,14),1);
  assert.equal(G.damage(7,1.3,4),7); assert.throws(()=>G.buy(s));
});

test("第5隊まで別々の依頼を同時に受注し、遠征ごとに成長・精算する", () => {
  const s = G.initial();
  s.gold = 1000;
  G.hire(s);
  G.register(s, {name:"ユキ", job:"sword", trait:"kind", tone:"normal"});
  for (const number of [2,3,4,5]) assert.equal(G.unlockParty(s), number);
  assert.equal(s.gold, 450);
  assert.throws(() => G.unlockParty(s));
  const teams = G.parties(s), quests = G.postedQuests(s);
  assert.equal(teams.length, 5);
  assert.equal(quests.length, 5);
  for (const [i, team] of teams.entries()) {
    const member = s.roster[i].id;
    G.setQuest(s, quests[i], team);
    G.depart(s, team, {party:[member], leader:member, policy:"safe", meds:0});
    assert.equal(team.trip.quote.wages, i === 0 ? 60 : 0);
  }
  assert.throws(() => G.nextWeek(s,true));
  for (const team of [...teams].reverse()) {
    for (let i=0; i<4; i++) G.step(s,team);
    const r = G.reportFor(s,team);
    assert.equal(r.unit.length, 1);
    assert.equal(r.xp, G.person(s,team.leader).xp);
    assert.equal(r.quest, team.quest);
    assert.throws(() => G.returnHome(s,team));
    if (G.anyAway(s)) assert.throws(() => G.nextWeek(s));
  }
  assert.equal(s.history.length, 5);
  assert.equal(s.gold, 450 + s.history.reduce((sum,r) => sum + r.actual.net, 0));
  G.sell(s,"herb",teams[3]); G.donate(s,teams[4]);
  assert.equal(G.reportFor(s,teams[3]).sold, 10);
  assert.equal(G.reportFor(s,teams[4]).donated, 1);
  G.nextWeek(s);
  assert.ok(teams.every(t => t.phase === "prep" && !t.trip && t.party.length === 1));
  assert.equal(s.week, 2);
});

test("移籍は待機中の隊員のみ。資金・隊員・依頼の競合で出発に失敗しても状態を保つ", () => {
  const s = G.initial();
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.configure(s,["mina"],"mina","safe",0,second);
  assert.deepEqual([s.party,s.leader],[["gald","popo"],"gald"]);
  G.depart(s);
  const frozen = JSON.stringify(s);
  assert.throws(() => G.configure(s,["popo"],"popo","safe",0,second));
  assert.throws(() => G.setQuest(s,s.quest,second));
  assert.equal(JSON.stringify(s), frozen);
  G.returnHome(s);
  assert.throws(() => G.configure(s,["popo"],"popo","safe",0,second));
  assert.throws(() => G.setQuest(s,s.quest,second));
  s.gold = 0;
  const poor = JSON.stringify(s);
  assert.throws(() => G.unlockParty(s));
  assert.throws(() => G.depart(s,second));
  assert.equal(JSON.stringify(s), poor);
});

test("旧形式の準備・伝書・緊急通信・帰還報告を第1隊として移行する", () => {
  const s = G.initial();
  function legacy() {
    const old = JSON.parse(JSON.stringify(s));
    delete old.extraParties; delete old.selectedParty; delete old.town;
    if (old.trip?.pending) delete old.trip.pending.priority;
    for (const e of old.trip?.log || []) delete e.letter;
    for (const r of old.history) delete r.partyNumber;
    return G.restore(old);
  }
  assert.equal(G.parties(legacy()).length, 1);
  toFork(s,"gald");
  const normal = legacy();
  assert.equal(normal.trip.pending.priority, "normal");
  G.reply(normal,"grove");
  assert.equal(normal.trip.log.find(e => e.letter).letter.answer,"grove");
  G.reply(s,"pass"); G.step(s);
  const crisis = legacy();
  assert.equal(G.emergencyParty(crisis),crisis);
  assert.equal(crisis.trip.fight.turn,s.trip.fight.turn);
  G.reply(s,"return");
  const report = legacy();
  assert.equal(G.reportFor(report,report).partyNumber,1);
  assert.deepEqual(report.stock,s.stock);
  G.nextWeek(report);
  assert.equal(report.week,2);
});

test("旧セーブを補完し、5隊それぞれの設定を週の締めと再読込で引き継ぐ", () => {
  const s = G.initial();
  s.gold = 1000;
  while (G.parties(s).length < G.maxParties) G.unlockParty(s);
  delete s.guildProfile;
  for (const team of G.parties(s)) delete team.partyProfile;
  const old = G.restore(JSON.parse(JSON.stringify(s)));
  assert.equal(old.guildProfile.name, "木もれびギルド");
  const emblem = {shape:"circle", symbol:"moon", ground:"#123456", ink:"#eeeedd"};
  for (const [i,team] of G.parties(old).entries()) {
    assert.equal(team.partyProfile.name, `第${i + 1}隊`);
    G.setProfile(old, i + 1, {name:`月の旅団 ${i + 1}`, emblem});
    assert.notEqual(team.partyProfile.emblem, emblem);
  }
  G.setProfile(old, 0, {name:" 星詠みギルド ", purpose:"", policy:"地図を描く", emblem});
  const before = JSON.stringify(old);
  assert.throws(() => G.setProfile(old, 1, {name:"　"}));
  assert.throws(() => G.setProfile(old, 6, {name:"第6隊"}));
  assert.equal(JSON.stringify(old), before);
  G.nextWeek(old, true);
  const restored = G.restore(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(restored.guildProfile, {name:"星詠みギルド", purpose:"", policy:"地図を描く", emblem});
  for (const [i,team] of G.parties(restored).entries()) {
    assert.deepEqual(team.partyProfile, {name:`月の旅団 ${i + 1}`, emblem});
    assert.equal(team.policy, "safe");
  }
});

test("不完全なエンブレムは有効な色を残し、欠損・不正な指定だけ補完する", () => {
  const s = G.initial();
  const defaults = s.guildProfile;
  s.guildProfile = {name:"旅の灯", emblem:{shape:"constructor", symbol:"unknown", ground:"red", ink:"#526a88"}};
  G.restore(s);
  assert.deepEqual(s.guildProfile, {...defaults, name:"旅の灯", emblem:{...defaults.emblem, ink:"#526a88"}});
});

test("復元時に不正・容量超過の画像を取り除き、保存した組み合わせで表示する", () => {
  const state = G.initial(), original = {...state.guildProfile.emblem, shape:"tower", symbol:"gear"};
  for (const image of ["https://example.org/emblem.png", "data:image/svg+xml;base64,AAAA",
    "data:image/png;base64,AAA\"", "data:image/webp;base64," + "A".repeat(32768)]) {
    state.guildProfile.emblem = {...original, mode:"upload", frame:"constructor", image};
    assert.deepEqual(G.restore(state).guildProfile.emblem, original);
  }
});

test("週の速度ごとに、自動出発と複数週の生産が境界で一度ずつ発生する", () => {
  for (const speed of [0.5, 1, 2]) {
    const s = G.initial();
    G.build(s,"square","farm");
    s.clock.speed = speed;
    const weekDuration = G.weekMillis / speed;
    const preparation = G.departureDelay / speed;
    G.advanceTime(s,preparation - 1);
    assert.equal(s.phase,"prep");
    G.advanceTime(s,1);
    assert.equal(s.phase,"explore");
    assert.equal(s.morningMail.length,1);
    G.advanceTime(s,weekDuration - preparation - 1);
    assert.deepEqual([s.week,s.town.food],[1,0]);
    G.advanceTime(s,1);
    assert.deepEqual([s.week,s.clock.elapsed,s.town.food],[2,0,1]);
    G.advanceTime(s,2 * weekDuration + 10);
    assert.deepEqual([s.week,s.clock.elapsed,s.town.food],[4,10 * speed,3]);
    assert.equal(s.morningMail.length,1);
  }
});

test("日単位のセーブから休暇・療養・遠征・過去の記録を引き継ぎ、二重に週を進めない", () => {
  const old = G.initial();
  old.week = 8;
  G.unlockParty(old);
  const team = old.extraParties[0];
  G.depart(old,team,{party:["gald"],leader:"gald",policy:"gather",meds:0});
  G.step(old,team); G.step(old,team);
  team.trip.day = 8;
  delete team.trip.week;
  for (const letter of [team.trip.pending,team.trip.log.find(e => e.letter).letter]) {
    delete letter.expiresWeek;
    letter.expiresDay = 9;
  }
  delete old.week;
  old.day = 8;
  old.clock = {elapsed:239999, paused:true, dispatchedDay:8};
  old.morningDay = 8;
  old.leaveDay = 8;
  old.morningMail = [{day:8,partyNumber:1,message:"休暇を取ります。"}];
  const p = old.roster[0];
  delete p.readyWeek;
  p.readyDay = 10;
  p.leaveDay = 8;
  p.injury = {kind:"骨折",readyDay:10};
  p.career = [{day:6,message:"骨折"}];
  p.memo = "第8日の日記";
  old.alumni.push({id:"shion",departure:{day:5,kind:"retired"},career:[{day:5,message:"引退"}]});
  old.history.push({day:7,path:["gate"],partyNumber:1,
    unit:[{id:"mina",injury:{kind:"骨折",readyDay:10}}],
    log:[{message:"返信済み",letter:{expiresDay:7,answeredDay:7}}]});

  const s = G.restore(old);
  assert.equal(s.week,8);
  assert.deepEqual(s.clock,{elapsed:239999,paused:true,speed:1,dispatchedWeek:8});
  assert.equal(s.decisionWeek,8);
  assert.equal(s.leaveWeek,8);
  assert.equal(p.leaveWeek,8);
  assert.deepEqual([p.readyWeek,p.injury.readyWeek,p.career[0].week],[10,10,6]);
  assert.equal(p.memo,"第8日の日記");
  assert.equal(s.morningMail[0].week,8);
  assert.equal(s.alumni[0].departure.week,5);
  assert.equal(s.history[0].unit[0].injury.readyWeek,10);
  assert.deepEqual(s.history[0].log[0].letter,{expiresWeek:7,answeredWeek:7});
  assert.equal(team.trip.week,8);
  assert.equal(team.trip.pending.expiresWeek,9);
  assert.deepEqual(G.restore(JSON.parse(JSON.stringify(s))),s);
  G.advanceTime(s,1);
  assert.equal(s.week,8);
  s.clock.paused = false;
  G.advanceTime(s,1);
  assert.equal(s.week,9);
  assert.equal(team.trip.pending,null);
  assert.equal(team.trip.log.find(e => e.letter).letter.answeredWeek,9);
  assert.ok(!G.available(s,p));
  G.returnHome(s,team);
  assert.equal(s.history[0].delivered,0);
  G.nextWeek(s);
  assert.ok(G.available(s,p));
  assert.equal(p.injury,null);
});
