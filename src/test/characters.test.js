const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
const member = (s, id = "mina") => G.person(s,id);
function enterPass(s, party = s.party, meds = 0) {
  G.depart(s,s,{party, leader:party[0], policy:"gather", meds});
  G.step(s);
  G.step(s);
  if (s.trip.pending) G.reply(s,"pass");
  G.step(s);
}

test("旧セーブの所属・引退・来訪候補は呼び名を空欄で補い、本名を使う", () => {
  const s = G.initial();
  G.retire(s,"gald");
  for (const p of [...s.roster, ...s.alumni, ...s.registry]) {
    delete p.nickname;
    delete p.epithet;
  }
  const resumed = reload(s);
  for (const p of [...resumed.roster, ...resumed.alumni, ...resumed.registry]) {
    assert.deepEqual([p.nickname, p.epithet], ["",""]);
    assert.equal(G.formalName(p), p.name);
    assert.equal(G.familiarName(p), p.name);
  }
  assert.deepEqual(reload(resumed), resumed);
});

test("旧セーブの通信待ちから、所属する隊員だけに履歴を一度ずつ追加", () => {
  const s = G.initial();
  G.hire(s);
  enterPass(s);
  for (const p of s.roster) {
    for (const field of ["career","memo","backstory","allocation","skills"]) delete p[field];
  }
  delete s.allowStatReset;
  member(s,"shion").level = 3;
  const resumed = reload(s);
  assert.deepEqual(reload(resumed), resumed);
  const p = member(resumed,"popo"), idle = member(resumed,"shion");
  assert.deepEqual([p.backstory,p.memo,p.skills,G.deepest(p)], ["","",["renew"],3]);
  assert.equal(p.career.filter(e=>e.quest === "herb").length,1);
  assert.equal(G.freePoints(idle),6);
  G.reply(resumed,"carry");
  G.step(resumed);
  G.step(resumed);
  assert.equal(G.deepest(p),4);
  assert.match(p.career.map(e=>e.message).join("\n"), /救出[\s\S]*重傷[\s\S]*帰還/);
  assert.equal(idle.career.length,0);
  assert.ok(p.career.every(e=>e.week === 1));
  assert.equal(member(resumed).career.filter(e=>e.message.includes("苔イノシシを討伐")).length,2);
});

test("参加回数・瀕死・薬での復帰を個人別に記録し、週をまたいで保持", () => {
  const s = G.initial();
  enterPass(s,s.party,1);
  const p = member(s,"popo");
  assert.match(p.career.at(-1).message,/瀕死/);
  G.reply(s,"med");
  G.returnHome(s);
  G.nextWeek(s);
  G.depart(s);
  assert.deepEqual(p.career.filter(e=>e.quest === "herb").map(e=>e.week),[1,2]);
  assert.ok(p.career.some(e=>e.message.includes("回復薬で救出")));
  assert.ok(member(s).career.every(e=>!e.message.includes("瀕死")));
  assert.deepEqual(reload(s),s);
});

test("能力の即時反映、遠征中の制限、成長・振り直し条件・保存", () => {
  const s = G.initial(), p = member(s);
  G.allocate(s,"mina","hp");
  G.allocate(s,"mina","spd");
  assert.equal(G.outfittedStat(s,p,"hp"),44);
  assert.equal(G.stat(p,"spd"),10);
  assert.throws(()=>G.allocate(s,"mina","atk"));
  p.xp = 19;
  G.depart(s);
  assert.equal(s.trip.unit[0].hp,44);
  assert.throws(()=>G.resetAllocation(s,"mina"));
  G.returnHome(s);
  assert.equal(G.freePoints(p),2);
  assert.equal(G.stat(p,"hp"),48);
  G.allocate(s,"mina","def");
  assert.deepEqual(reload(s),s);
  const gold = s.gold;
  s.allowStatReset = false;
  assert.throws(()=>G.resetAllocation(s,"mina"));
  assert.equal(s.gold,gold);
  s.allowStatReset = true;
  s.gold = G.resetCost - 1;
  assert.throws(()=>G.resetAllocation(s,"mina"));
  s.gold = gold;
  G.resetAllocation(s,"mina");
  assert.equal(G.freePoints(p),4);
  assert.equal(G.stat(p,"hp"),44);
  assert.equal(s.gold,gold-G.resetCost);
  assert.throws(()=>G.resetAllocation(s,"mina"));
});

test("作成時の過去と初期技、現在職の習得窓、転職後の攻撃効果と生涯の枠数", () => {
  const s = G.initial(), data = {name:"雪",job:"sword",trait:"bold",tone:"normal",backstory:"港の出身\n船を降りた。"};
  assert.throws(()=>G.register(s,{...data,initialSkill:"wind"}));
  G.register(s,{...data,initialSkill:"slash"});
  const p = member(s,"custom");
  assert.deepEqual(p.skills,["slash"]);
  assert.equal(p.backstory,data.backstory);
  assert.throws(()=>G.learnAbility(s,p.id,"lunge"));
  assert.throws(()=>G.promote(s,p.id));
  p.level = G.promotionLevel;
  G.promote(s,p.id);
  assert.deepEqual(p.skills,["slash"]);
  assert.throws(()=>G.learnAbility(s,p.id,"rally"));
  assert.throws(()=>G.promote(s,p.id));
  enterPass(s,[p.id]);
  const hit = G.damage(G.stat(p,"atk") + 2,1,G.enemy.def);
  assert.ok(s.trip.log.some(e=>e.message.includes(hit+"ダメージ") && e.message.startsWith("雪の攻撃")));
  assert.throws(()=>G.learnAbility(s,p.id,"lunge"));
  G.returnHome(s);
  G.learnAbility(s,p.id,"lunge");
  G.learnAbility(s,p.id,"footwork");
  assert.equal(p.skills.length,G.skillLimit);
  assert.throws(()=>G.learnAbility(s,p.id,"lunge"));
  assert.match(p.career.map(e=>e.message).join("\n"), /踏み込み斬りを習得[\s\S]*フェンサーに転職[\s\S]*鋭い突きを習得/);
  assert.deepEqual(reload(s),s);

  const other = G.initial(), q = member(other);
  q.level = 2;
  G.learnAbility(other,q.id,"slash");
  G.promote(other,q.id);
  G.learnAbility(other,q.id,"lunge");
  assert.throws(()=>G.learnAbility(other,q.id,"footwork"));
  assert.deepEqual(q.skills,["rally","slash","lunge"]);
});

test("自動戦闘で回復・防御・行動順のスキルが働く", () => {
  const s = G.initial();
  G.learnAbility(s,"popo","aid");
  enterPass(s,s.party,1);
  G.reply(s,"med");
  assert.equal(s.trip.unit.find(u=>u.id==="popo").hp,20);
  assert.ok(s.trip.log.some(e=>e.message.includes("HPが4回復")));

  const defense = G.initial();
  G.learnAbility(defense,"gald","shield");
  enterPass(defense,["gald"]);
  const hit = G.damage(G.enemy.atk,1,G.stat(member(defense,"gald"),"def")+4);
  assert.ok(defense.trip.log.some(e=>e.message.includes("ガルドに"+hit+"ダメージ")));

  const speed = G.initial();
  member(speed).level = 2;
  G.promote(speed,"mina");
  G.learnAbility(speed,"mina","footwork");
  G.hire(speed);
  enterPass(speed,["shion","mina"]);
  assert.ok(speed.trip.log.find(e=>e.message.includes("の攻撃。")).message.startsWith("ミナ"));
});

test("同じ週に別々の依頼を受けた二隊の年表と最深層を混同しない", () => {
  const s = G.initial();
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.depart(s,s,{party:["mina"],leader:"mina",policy:"safe",meds:0});
  G.setQuest(s,"ore",second);
  G.depart(s,second,{party:["gald"],leader:"gald",policy:"gather",meds:0});
  G.step(s,second);
  G.returnHome(s,second);
  while (s.phase === "explore") G.step(s);
  assert.deepEqual(member(s).career.filter(e=>e.quest).map(e=>e.quest),["herb"]);
  assert.deepEqual(member(s,"gald").career.filter(e=>e.quest).map(e=>e.quest),["ore"]);
  assert.deepEqual(s.roster.map(G.deepest),[3,1,0]);
});
