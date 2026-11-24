const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
function village() {
  const s = G.initial();
  s.raids.nextWeek = 10000;
  return s;
}
function weeks(s,count) {
  for (let i = 0; i < count; i++) G.nextWeek(s,true);
}
function court(s,a,b) {
  while (G.affinity(s,a,b) < 100) {
    G.giveGift(s,a,b);
    if (G.affinity(s,a,b) < 100) weeks(s,1);
  }
}
function firstBattle(s,party) {
  G.depart(s,s,{party,leader:party[0],policy:"gather",meds:1},true);
  G.step(s);
  G.step(s);
  if (s.trip.pending) G.reply(s,"pass");
  G.step(s);
}

test("贈り物・酒場・休暇はペア単位。費用と週の制限を再開後も守る", () => {
  let s = village();
  const gold = s.gold;
  G.giveGift(s,"mina","gald");
  assert.equal(s.gold,gold-G.giftCost);
  assert.equal(G.affinity(s,"gald","mina"),12);
  assert.equal(G.affinity(s,"popo","gald"),0);
  s = reload(s);
  assert.throws(() => G.giveGift(s,"gald","mina"));
  assert.throws(() => G.giveGift(s,"mina","mina"));
  G.build(s,"square","tavern");
  G.takeLeave(s);
  G.nextWeek(s);
  assert.equal(G.affinity(s,"mina","gald"),21);
  assert.equal(G.affinity(s,"mina","popo"),9);
  G.depart(s,s,{party:["mina"],leader:"mina",policy:"safe",meds:0});
  assert.throws(() => G.giveGift(s,"gald","mina"));
  G.returnHome(s);
  s.gold = 0;
  assert.throws(() => G.giveGift(s,"popo","gald"));
});

test("最大好感度の成人が町で結婚し、片方の引退後も休養と出生を共有する", t => {
  let s = village();
  t.mock.method(Math,"random",() => 0);
  assert.throws(() => G.marry(s,"mina","gald"));
  court(s,"mina","gald");
  assert.equal(s.children.length,0);
  const p = G.person(s,"mina");
  p.age = 17;
  assert.throws(() => G.marry(s,"mina","gald"));
  p.age = 18;
  G.depart(s,s,{party:["mina"],leader:"mina",policy:"safe",meds:0});
  assert.throws(() => G.marry(s,"mina","gald"));
  G.returnHome(s);
  G.nextWeek(s);
  G.marry(s,"mina","gald");
  assert.throws(() => G.marry(s,"gald","mina"));
  assert.equal(s.milestones.filter(e => e.message.includes("が結婚")).length,1);
  G.retire(s,"gald");
  s = reload(s);
  assert.equal(G.spouseOf(s,"mina").departure.kind,"retired");
  G.takeLeave(s);
  const spouse = G.knownPerson(s,"gald"), mood = spouse.morale;
  spouse.missingHP = 50;
  G.nextWeek(s);
  assert.equal(spouse.morale,mood+2);
  assert.equal(spouse.missingHP,50-Math.ceil(G.outfittedStat(s,spouse,"hp")*.55));
  assert.equal(s.children.length,1);
  assert.ok(spouse.career.some(e => e.message.includes("生まれた")));
  const first = s.children[0].id;
  s = reload(s);
  weeks(s,2*s.calendar.length-1);
  assert.deepEqual(s.children.map(p => p.id),[first]);
  weeks(s,1);
  assert.equal(s.children.length,2);
  weeks(s,2*s.calendar.length);
  assert.equal(s.children.length,2);
  assert.deepEqual(reload(s),s);
});

test("共闘、救出、かばう実行に好感度が付き、親しい仲間だけ連携・士気が伸びる", t => {
  t.mock.method(Math,"random",() => .99);
  const rescue = village();
  firstBattle(rescue,["mina","gald","popo"]);
  assert.equal(G.affinity(rescue,"mina","popo"),4);
  G.step(rescue);
  G.reply(rescue,"med");
  assert.equal(G.affinity(rescue,"mina","popo"),12);
  assert.equal(G.affinity(rescue,"gald","popo"),4);

  const compare = friendly => {
    const s = village();
    if (friendly) court(s,"mina","gald");
    firstBattle(s,["mina","gald"]);
    G.step(s); G.step(s); G.step(s);
    const blow = s.trip.log.findLast(e => e.combat?.actor === "gald");
    G.returnHome(s);
    return {hit:blow.combat.amount,log:blow.message,mood:s.history[0].unit[0].moraleChange};
  };
  const a = compare(false), b = compare(true);
  assert.equal(b.hit,a.hit+1);
  assert.equal(b.mood,a.mood+1);
  assert.match(b.log,/連携/);

  const s = village();
  G.setGambits(s,"gald",[{condition:"always",subject:"self",value:50,action:"cover",target:"mina"}]);
  firstBattle(s,["mina","gald"]);
  for (let i=0;i<4;i++) G.step(s);
  assert.equal(s.trip.effects[0].protectedId,"mina");
  assert.equal(G.affinity(s,"mina","gald"),10);
});

test("自主的にかばうとき、同じ好感度の友人より配偶者が先に動く", t => {
  const s = village();
  court(s,"mina","popo");
  court(s,"gald","popo");
  G.marry(s,"gald","popo");
  assert.throws(() => G.marry(s,"mina","popo"));
  G.person(s,"popo").missingHP = 20;
  t.mock.method(Math,"random",() => 0);
  firstBattle(s,["mina","gald","popo"]);
  G.step(s);
  assert.equal(s.trip.effects[0].protectedId,"popo");
  assert.equal(s.trip.effects[0].target,"gald");
});

test("子は両親の素質を保持し、消失後も成長して入団し、孫の世代につながる", t => {
  let s = village();
  court(s,"mina","gald");
  G.marry(s,"mina","gald");
  t.mock.method(Math,"random",() => 0);
  G.setYearLength(s,1);
  weeks(s,1);
  const child = s.children[0], id = child.id;
  assert.deepEqual([child.job,child.jobAffinity,child.trait,child.aptitude,child.skillTalent],["sword","sword","bold","atk","brace"]);
  assert.equal(G.stat(child,"atk"),G.stat({...child,aptitude:null},"atk")+1);
  assert.ok(G.growthRate(child) > G.growthRate({...child,jobAffinity:null}));
  assert.ok(!G.raidDefenders(s).some(p => p.id === id));
  assert.throws(() => G.configure(s,[id],id,"safe",0));
  assert.throws(() => G.enlistChild(s,id));
  const parent = G.person(s,"mina");
  parent.deaths = G.deathLimit-1;
  parent.missingHP = 39;
  firstBattle(s,["mina"]);
  G.step(s);
  assert.equal(G.knownPerson(s,"mina").departure.kind,"lost");
  G.nextWeek(s);
  G.retire(s,"gald");
  s = reload(s);
  const heir = s.children.find(p => p.id === id);
  const stages = new Set([G.childStage(heir)]);
  while (heir.age < G.species[heir.species].adult) {
    weeks(s,1);
    stages.add(G.childStage(heir));
  }
  assert.deepEqual([...stages],["幼年期","少年期","見習い","成人"]);
  assert.equal(s.children.length,1);
  G.enlistChild(s,id);
  assert.ok(!s.children.includes(heir));
  assert.deepEqual(heir.parents,["mina","gald"]);
  assert.throws(() => G.enlistChild(s,id));
  heir.level = G.promotionLevel;
  G.promote(s,id);
  assert.throws(() => G.learnAbility(s,id,"slash"));
  G.learnAbility(s,id,"brace");
  G.learnAbility(s,id,"lunge");
  assert.throws(() => G.learnAbility(s,id,"footwork"));
  assert.equal(heir.skills.length,G.skillLimit);
  court(s,id,"gald");
  assert.throws(() => G.marry(s,id,"gald"));
  court(s,id,"popo");
  G.marry(s,id,"popo");
  weeks(s,1);
  assert.deepEqual(s.children[0].parents,[id,"popo"]);
  assert.equal(G.knownPerson(s,"mina").departure.kind,"lost");
  assert.ok(s.milestones.some(e => e.message.includes("入団")));
  assert.deepEqual(reload(s),s);
});

test("旧セーブの52週の暦・子・工房を保ち、速度変更は次に経過する週から適用する", () => {
  let s = village();
  s.week = 21;
  const child = G.welcomeChild(s,"mina","gald","モモ");
  child.birthdayWeek = 36;
  delete s.calendar; delete s.bonds; delete s.marriages; delete s.nextChildId;
  delete child.jobAffinity; delete child.aptitude; delete child.skillTalent;
  const shop = s.town.workshops.hall.lineage;
  shop.practiceWeeks = 30;
  s = reload(s);
  const heir = s.children[0];
  assert.equal(s.calendar.length,52);
  assert.equal(G.calendarDate(s),21);
  assert.equal(s.nextChildId,2);
  assert.deepEqual(s.marriages,[]);
  G.setYearLength(s,4);
  assert.equal(G.calendarDate(s),21);
  weeks(s,1);
  assert.equal(heir.age,0);
  G.setYearLength(s,13);
  weeks(s,1);
  assert.equal(heir.age,1);
  const before = G.calendarDate(s);
  G.setYearLength(s,1);
  assert.equal(G.calendarDate(s),before);
  weeks(s,1);
  assert.equal(heir.age,2);
  assert.equal(s.town.workshops.hall.lineage.practiceWeeks,47);
  assert.equal(s.town.workshops.hall.lineage.craftYears,1);
  assert.throws(() => G.setYearLength(s,0));
  assert.deepEqual(reload(s),s);
});
