const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
function custom(s, species, age, job = "sword", initialSkill) {
  G.register(s,{name:"ユキ",job,trait:"careful",tone:"normal",species,age,initialSkill});
  return G.person(s,"custom");
}
function quietTown() {
  const s = G.initial();
  s.raids.nextWeek = 100000;
  return s;
}
function passWeeks(s,count) {
  for (let i=0; i<count; i++) G.nextWeek(s,true);
}

test("旧セーブに年齢・種族を補い、既得レベル・技能と工房の専門を保持する", () => {
  const s = quietTown();
  G.retire(s,"gald");
  G.learnSkill(s,"hall","sword");
  const unique = s.registry.find(p=>p.id==="shusai");
  unique.level = 9;
  unique.xp = 47;
  unique.skills = ["iai"];
  for (const p of [...s.roster,...s.registry,...s.alumni]) {
    for (const field of ["species","age","frailty","birthdayWeek","xpRemainder"]) delete p[field];
  }
  delete s.children;
  delete s.candidate;
  delete s.town.workshops.hall.lineage;
  const resumed = reload(s);
  assert.ok([...resumed.roster,...resumed.registry,...resumed.alumni,resumed.candidate].every(p=>G.species[p.species] && Number.isInteger(p.age)));
  const master = resumed.registry.find(p=>p.id==="shusai");
  assert.deepEqual([master.age,master.species,master.level,master.xp,master.skills],[58,"human",9,47,["iai"]]);
  assert.deepEqual(resumed.town.workshops.hall.skills,["sword"]);
  assert.deepEqual(reload(resumed),resumed);
});

test("年長者は選んだ技を保って経験と技能を持ち、実地では若手が速く伸びる", () => {
  const young = quietTown(), veteran = quietTown();
  const a = custom(young,"human",18,"sword","parry");
  const b = custom(veteran,"human",54,"sword","parry");
  assert.ok(b.level > a.level && G.stat(b,"hp") > G.stat(a,"hp"));
  assert.equal(b.skills[0],"parry");
  assert.ok(b.skills.length > a.skills.length);
  assert.ok(G.examStatus(veteran,b).chance > G.examStatus(young,a).chance);
  for (const state of [young,veteran]) {
    G.depart(state,state,{party:["custom"],leader:"custom",meds:0,policy:"safe"});
    G.returnHome(state);
  }
  assert.ok(young.history[0].unit[0].xp > veteran.history[0].unit[0].xp);
  assert.equal(reload(veteran).roster.at(-1).xpRemainder,b.xpRemainder);
  for (const [race,age] of [["elf",24],["human",90],["human",20.1],["unknown",22]]) {
    assert.throws(()=>custom(quietTown(),race,age));
  }
});

test("種族別の伸び・職適性と、適性外でも残る素早さ・対魔術防御", () => {
  const human = custom(quietTown(),"human",18);
  const elf = custom(quietTown(),"elf",25);
  const dwarf = custom(quietTown(),"dwarf",22);
  assert.ok(G.stat(elf,"spd") > G.stat(human,"spd"));
  assert.ok(G.spellDefense(elf) > G.spellDefense(human));
  const elfSwordRate = G.growthRate(elf);
  human.level = elf.level = dwarf.level = 10;
  assert.ok(G.stat(dwarf,"atk") > G.stat(human,"atk") && G.stat(dwarf,"hp") > G.stat(human,"hp"));
  assert.ok(G.stat(elf,"atk") < G.stat(human,"atk"));
  for (const [job,axis,skill] of [["hunter","dex","aim"],["mage","magic","ember"]]) {
    elf.job = human.job = job;
    assert.ok(G.growthRate(elf) > elfSwordRate);
    assert.ok(G.stat(elf,axis) > G.stat(human,axis));
    assert.ok(G.abilityPower(elf,skill,"atk") > G.abilityPower(human,skill,"atk"));
    assert.ok(G.maxMP(elf) > G.maxMP(human));
  }
});

test("年度の境目で種族ごとに衰え、引退者は加齢し消失者の年齢は保存される", () => {
  const s = quietTown();
  s.week = G.weeksPerYear-1;
  const p = G.person(s,"mina");
  p.age = G.species.human.decline-1;
  const hp = G.stat(p,"hp");
  const dwarf = s.registry.find(p=>p.species==="dwarf");
  dwarf.age = G.species.dwarf.decline-1;
  const elf = s.registry.find(p=>p.species==="elf");
  const elfHP = G.stat(elf,"hp");
  const retired = G.person(s,"gald"), age = retired.age;
  G.retire(s,retired.id);
  const lost = G.person(s,"popo");
  G.retire(s,lost.id);
  lost.departure.kind = "lost";
  const lostAge = lost.age;
  passWeeks(s,1);
  assert.equal(p.age,54);
  passWeeks(s,1);
  assert.equal(p.age,55);
  assert.ok(G.stat(p,"hp") < hp);
  assert.ok(dwarf.frailty > 0 && dwarf.frailty < p.frailty);
  assert.equal(G.stat(elf,"hp"),elfHP);
  assert.deepEqual([elf.frailty,retired.age,lost.age,s.candidate.age],[0,age+1,lostAge,19]);
  assert.equal(p.career.filter(e=>e.message.includes("加齢")).length,1);
  const resumed = reload(s);
  passWeeks(resumed,1);
  assert.equal(G.person(resumed,"mina").frailty,p.frailty);
});

test("遠征中に誕生日を迎えてもHP・MPは上限内で、天寿の記録は帰還時に一度だけ残る", () => {
  let s = quietTown();
  const p = custom(s,"human",54);
  G.person(s,"gald").age = G.species.human.lifespan-1;
  s.week = G.weeksPerYear;
  G.depart(s,s,{party:[p.id,"gald"],leader:"gald",policy:"safe",meds:0},true);
  G.advanceTime(s,G.weekMillis);
  s = reload(s);
  const unit = s.trip.unit.find(u=>u.id===p.id), senior = G.person(s,p.id);
  assert.equal(senior.age,55);
  assert.equal(unit.hp,G.outfittedStat(s,senior,"hp"));
  assert.equal(unit.mp,G.maxMP(senior));
  assert.ok(G.person(s,"gald"));
  G.returnHome(s);
  assert.equal(G.knownPerson(s,"gald").departure.kind,"lifespan");
  assert.equal(s.alumni.filter(p=>p.id==="gald").length,1);
  assert.deepEqual(reload(s),s);
});

test("混血の種族は出生時に確定し、誕生日を迎えて成人した子だけ入団できる", t => {
  const s = quietTown();
  custom(s,"elf",42);
  t.mock.method(Math,"random",()=>0);
  s.week = 8;
  const child = G.welcomeChild(s,"mina","custom","アサ");
  assert.equal(child.species,"elf");
  t.mock.method(Math,"random",()=>.99);
  assert.equal(G.welcomeChild(s,"custom","mina","ヨル").species,"human");
  assert.equal(G.welcomeChild(s,"mina","gald","ヒナ").species,"human");
  assert.throws(()=>G.enlistChild(s,child.id));
  assert.throws(()=>G.welcomeChild(s,"mina","mina","ツキ"));
  const resumed = reload(s), heir = resumed.children[0];
  passWeeks(resumed,G.weeksPerYear-1);
  assert.equal(heir.age,0);
  passWeeks(resumed,1);
  assert.equal(heir.age,1);
  heir.age = G.species.elf.adult-1;
  passWeeks(resumed,G.weeksPerYear);
  G.enlistChild(resumed,heir.id);
  assert.deepEqual(G.person(resumed,heir.id).parents,["mina","custom"]);
  assert.equal(G.person(resumed,heir.id).species,"elf");
  assert.throws(()=>G.enlistChild(resumed,heir.id));
});

test("工房の品質は4年の修業で一段上がり、師弟交代で経験・専門・品質を失わない", () => {
  const s = quietTown(), shop = s.town.workshops.hall;
  G.learnSkill(s,"hall","sword");
  const quote = () => G.orderQuote(s,"hall","sabre","sword");
  const first = quote();
  shop.lineage.age = G.species.dwarf.decline-4;
  passWeeks(s,4*G.weeksPerYear-1);
  assert.equal(quote().quality,first.quality);
  assert.equal(shop.lineage.generation,1);
  passWeeks(s,1);
  assert.equal(shop.lineage.generation,2);
  assert.equal(shop.lineage.apprenticeYears,0);
  assert.equal(shop.lineage.age,G.species.dwarf.adult+4);
  assert.deepEqual([shop.level,shop.skills,quote().quality,quote().effects.atk],[1,["sword"],first.quality+1,first.effects.atk+1]);
  assert.ok(s.milestones.some(e=>e.message.includes("師の技")));
  assert.deepEqual(reload(s).town,s.town);
});

test("エルフ剣士は戦闘で先手を取り、同じ受け流しを使う人間より詠唱攻撃の被害が小さい", () => {
  function fight(species) {
    const s = quietTown();
    const p = custom(s,species,G.species[species].adult,"sword","parry");
    p.trait = "bold"; // 晶角イノシシのいる鉱脈へ進む。
    G.depart(s,s,{party:[p.id],leader:p.id,policy:"bold",meds:1},true);
    for (let i=0; i<30 && s.phase==="explore"; i++) {
      if (s.trip.pending) G.reply(s,s.trip.pending.type==="fork" ? "pass" : "med");
      else G.step(s);
      if (s.trip.log.some(e=>e.combat?.actor==="caster" && e.combat.kind==="skill")) break;
    }
    const events = s.trip.log.filter(e=>e.combat).map(e=>e.combat);
    return {first:events[0].actor, physical:events.find(e=>e.actor==="enemy").amount,
      magic:events.find(e=>e.actor==="caster" && e.kind==="skill").amount};
  }
  const human = fight("human"), elf = fight("elf");
  assert.deepEqual([human.first,elf.first],["enemy","custom"]);
  assert.equal(elf.physical,human.physical);
  assert.ok(elf.magic < human.magic);
});

test("加工で実習を積んだ見習いは3年で老職人を継ぎ、工房の品質は年数に従って伸びる", () => {
  const s = quietTown(), shop = s.town.workshops.hall;
  shop.lineage.age = G.species.dwarf.decline;
  s.stock.ore = 3;
  for (let i=0;i<3;i++) G.placeOrder(s,"hall","knife");
  assert.equal(shop.lineage.lessons,6);
  const before = G.orderQuote(s,"hall","knife").quality;
  passWeeks(s,3*G.weeksPerYear);
  assert.equal(shop.lineage.generation,2);
  assert.equal(shop.lineage.lessons,0);
  assert.equal(G.orderQuote(s,"hall","knife").quality,before);
});
