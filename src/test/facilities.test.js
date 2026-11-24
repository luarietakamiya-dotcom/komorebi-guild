const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));

test("旧セーブの士気は中立。進行中の遠征のHPと既存の士気を再読込で保つ", () => {
  const s = G.initial();
  G.depart(s);
  s.trip.unit[0].hp = 13;
  for (const p of [...s.roster,...s.registry]) delete p.morale;
  s.alumni.push({id:"legacy",rank:1});
  s.roster[1].morale = 82;
  const restored = reload(s);
  assert.equal(restored.roster[0].morale,50);
  assert.equal(restored.roster[1].morale,82);
  assert.equal(restored.registry[0].morale,50);
  assert.equal(restored.alumni[0].morale,50);
  assert.equal(restored.trip.unit[0].hp,13);
  assert.deepEqual(reload(restored),restored);
});

test("酒場は町に残った冒険者に毎週効き、食べ物屋の育成が休息・休暇と満足度に反映される", () => {
  const s = G.initial();
  s.gold = 1000;
  G.build(s,"brook","farm");
  G.build(s,"west","tavern");
  G.build(s,"east","inn");
  G.nextWeek(s,true);
  assert.equal(s.town.food,25);
  G.placeOrder(s,"west","bread","plain");
  G.deliverMaterial(s,"west");
  assert.equal(s.town.workshops.west.level,2);
  assert.equal(s.town.food,22);
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.configure(s,["mina"],"mina","gather",0,second);
  G.depart(s,second);
  const mina = G.person(s,"mina"), popo = G.person(s,"popo");
  popo.spentMP = 16;
  popo.missingHP = 28;
  G.takeLeave(s);
  const before = s.metrics[3];
  G.advanceTime(s,G.weekMillis);
  assert.equal(mina.morale,60);
  assert.equal(popo.morale,70);
  assert.equal(G.currentMP(popo),12);
  // 食べ物屋Lv.2で10％、宿屋で5％を休暇の55％に加算。
  assert.equal(popo.missingHP,28 - Math.ceil(G.outfittedStat(s,popo,"hp") * .70));
  assert.equal(s.metrics[3],before + 2 + 1);
});

test("損傷した酒場は効果を休止し、修理が完了した翌期から再び週末に効く", () => {
  const s = G.initial();
  G.build(s,"west","tavern");
  s.town.repairs.west = {remaining:1,chance:1};
  assert.equal(G.facilityTotals(s.town).recovery,0);
  G.nextWeek(s,true);
  assert.deepEqual([s.roster[0].morale,s.metrics[3]],[50,60]);
  assert.equal(G.facilityTotals(s.town).morale,10);
  G.nextWeek(s,true);
  assert.deepEqual([s.roster[0].morale,s.metrics[3]],[60,61]);
});

test("士気の境界で装備込みの能力値と戦闘ダメージが変わる", () => {
  for (const [morale,factor,hit] of [[30,.9,11],[31,1,12],[69,1,12],[70,1.1,13]]) {
    const s = G.initial(), p = G.person(s,"mina");
    p.morale = morale;
    s.stock.ore = 1;
    G.placeOrder(s,"hall","knife","plain");
    G.wearOrder(s,0,p.id);
    assert.equal(G.moraleMultiplier(p),factor);
    for (const key of ["hp","atk","def","spd"]) {
      const base = G.stat(p,key) + (key === "atk" ? 2 : 0);
      assert.equal(G.outfittedStat(s,p,key),Math.round(base * factor));
    }
    G.depart(s,s,{party:[p.id],leader:p.id,policy:"gather",meds:0},true);
    assert.equal(s.trip.unit[0].hp,Math.round(40 * factor));
    G.step(s); G.step(s);
    if (s.trip.pending) G.reply(s,"pass");
    G.step(s);
    G.step(s);
    if (!s.trip.log.some(e => e.combat?.actor === p.id)) G.step(s);
    assert.equal(s.trip.log.find(e => e.combat?.actor === p.id)?.combat.amount,hit);
  }
});

test("訓練所の経験値と依頼結果の士気を帰還時に一度だけ精算する", () => {
  for (const success of [false,true]) {
    const s = G.initial();
    G.build(s,"west","school");
    G.depart(s);
    if (success) G.step(s);
    G.returnHome(s);
    const xp = success ? 8 : 4, change = success ? 6 : -4;
    assert.equal(s.history[0].xp,xp);
    assert.equal(s.history[0].unit[0].moraleChange,change);
    assert.ok(s.roster.every(p => p.xp === xp && p.morale === 50 + change));
    assert.deepEqual(reload(s),s);
  }
});

test("士気と満足度を0〜100に収め、低い士気も町の満足度に反映する", () => {
  const s = G.initial();
  for (const p of s.roster) p.morale = 2;
  G.depart(s); G.returnHome(s);
  assert.equal(s.roster[0].morale,0);
  const before = s.metrics[3];
  G.nextWeek(s);
  assert.equal(s.metrics[3],before-1);
  G.build(s,"west","tavern");
  for (const p of s.roster) p.morale = 98;
  s.metrics[3] = 99;
  G.nextWeek(s,true);
  assert.deepEqual([s.roster[0].morale,s.metrics[3]],[100,100]);
});
