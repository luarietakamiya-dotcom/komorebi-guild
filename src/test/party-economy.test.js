const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
function finish(s,team = s) {
  for (let steps=0; steps<100 && team.phase==="explore"; steps++) {
    if (team.trip.pending) G.reply(s,"delegate",team);
    else G.step(s,team);
  }
  assert.equal(team.phase,"report");
  return G.reportFor(s,team);
}
function unchanged(s,action) {
  const saved = JSON.stringify(s);
  assert.throws(action);
  assert.equal(JSON.stringify(s),saved);
}

test("受注時の上納率を隊別に固定し、達成・未達の報酬、金庫、採集品を精算する", () => {
  const s = G.initial();
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.configure(s,["gald"],"gald","safe",0,second);
  G.depart(s);
  G.setProfile(s,0,{name:"森のギルド",tributeRate:20});
  unchanged(s,() => G.setProfile(s,0,{name:"変更前",tributeRate:-1}));
  G.depart(s,second);
  const failure = finish(s,second);
  assert.deepEqual([failure.actual.reward,failure.actual.tribute,second.wallet],[0,0,0]);
  assert.equal(second.bag.materials.herb,4);
  const first = finish(s);
  assert.deepEqual([first.actual.reward,first.actual.tributeRate,first.actual.tribute,
    first.actual.partyReward,first.actual.share,s.wallet],[100,10,10,90,30,60]);
  assert.equal(G.guildGold(s),240-50-30-36+10);
  assert.deepEqual(s.bag.materials,{herb:2,ore:1});
  assert.equal(G.materialAvailable(s,"herb",null),0);
  G.sell(s,"herb",second);
  assert.deepEqual([s.wallet,second.wallet,second.bag.materials.herb],[60,10,3]);
  unchanged(s,() => G.sell(s,"herb",null));
  unchanged(s,() => G.returnHome(s));
  assert.deepEqual(reload(s),s);
});

test("注文は購入者だけの資金・素材を使い、装備の交換・移籍で所有権を守る", () => {
  const s = G.initial();
  s.gold = 650;
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.configure(s,["popo"],"popo","safe",0,second);
  s.wallet=120;
  s.stock.ore=3;
  s.bag.materials.ore=3;
  const treasury=G.guildGold(s);
  unchanged(s,() => G.placeOrder(s,"hall","knife","plain",second,true));
  unchanged(s,() => G.placeOrder(s,"hall","knife"));
  const order = G.placeOrder(s,"hall","knife","plain",s);
  assert.deepEqual([s.wallet,s.bag.materials.ore,G.guildGold(s)],[120-order.fee,2,treasury]);
  G.wearOrder(s,0,"mina");
  assert.equal(G.outfittedStat(s,G.person(s,"mina"),"atk"),14);
  unchanged(s,() => G.wearOrder(s,0,"popo"));
  const other = G.placeOrder(s,"hall","knife","plain",null,true);
  assert.equal(G.guildGold(s),treasury-other.price);
  G.wearOrder(s,1,"mina");
  assert.equal(s.equipment[0].wearer,null);
  G.wearOrder(s,0,"mina");
  G.build(s,"east","shop","armor");
  G.build(s,"west","shop","magic");
  G.placeOrder(s,"east","vest","plain",s);
  G.placeOrder(s,"west","charm","plain",s);
  G.wearOrder(s,2,"mina"); G.wearOrder(s,3,"mina");
  assert.deepEqual(["atk","def","hp"].map(k => G.outfittedStat(s,G.person(s,"mina"),k)),[14,10,43]);
  G.configure(s,["mina","popo"],"popo","safe",0,second);
  assert.ok(s.equipment.every(item => !item.wearer));
  G.depart(s,second);
  unchanged(s,() => G.wearOrder(s,0,"mina"));
  assert.deepEqual(reload(s),s);
});

test("職人の成長と仕上げで回復量が変わり、使用・返品・再開時に品質と持ち主を保つ", () => {
  let s=G.initial();
  s.gold=800; s.wallet=150;
  G.build(s,"east","shop","alchemy");
  const plain = G.placeOrder(s,"east","vial","plain",null,true);
  G.learnSkill(s,"east","remedy");
  G.placeOrder(s,"east","vial","remedy",s,true);
  const fine = G.placeOrder(s,"east","vial","remedy",s,true);
  assert.deepEqual([plain.quality,fine.quality],[1,3]);
  G.configure(s,s.party,"mina","gather",3);
  G.depart(s);
  assert.deepEqual(s.trip.packed.medicine.map(m => [m.owner,m.quality]),[["party",3],["party",3],["party",3]]);
  for (let i=0;i<3;i++) G.step(s);
  s=reload(s);
  G.reply(s,"med");
  assert.equal(s.trip.unit.find(u => u.id==="popo").hp,24);
  G.returnHome(s);
  assert.equal(s.supplies.medicine,1);
  assert.deepEqual(s.bag.lots.map(l => [l.quality,l.count]),[[2,2],[3,2]]);
  assert.deepEqual(reload(s),s);
});

test("未使用薬を財布と金庫にそれぞれ返し、他隊の在庫を使用しない", () => {
  const s=G.initial();
  G.unlockParty(s);
  const second=s.extraParties[0];
  second.bag.supplies.medicine=3;
  s.wallet=45;
  s.supplies.medicine=1;
  G.configure(s,s.party,"mina","safe",3);
  const guild=G.guildGold(s);
  G.depart(s);
  assert.equal(s.wallet,0);
  assert.equal(s.trip.quote.medicine,60);
  assert.equal(s.trip.packed.medicine[0].owner,"guild");
  G.returnHome(s);
  assert.deepEqual([s.wallet,s.supplies.medicine,second.bag.supplies.medicine],[15,1,3]);
  assert.equal(G.guildGold(s),guild-36);
});

test("深層の宝箱・番獣だけが別々の一点物を落とし、履歴と所有者を保持する", t => {
  t.mock.method(Math,"random",()=>.8); // 宝箱と番獣まで、途中の罠を踏まずに進む。
  let s=G.initial();
  G.depart(s); finish(s); G.nextWeek(s);
  G.configure(s,s.party,"mina","gather",0,s,"canal");
  G.depart(s);
  let r=finish(s);
  const compass=s.equipment.find(i=>i.relic==="tide");
  assert.ok(compass && r.log.some(e=>e.relic==="tide"));
  assert.equal(compass.owner,1);
  assert.equal(s.equipment.length,1);
  assert.throws(()=>G.orderQuote(s,"hall","tide"));
  s=reload(s);
  G.nextWeek(s); G.depart(s); finish(s);
  assert.equal(s.equipment.length,1);
  G.nextWeek(s);
  for (const p of s.roster) p.level=50;
  G.configure(s,s.party,"mina","bold",0,s,"canal");
  G.depart(s);
  r=finish(s);
  assert.ok(r.log.some(e=>e.relic==="tusk"));
  assert.equal(s.equipment.length,2);
  G.wearOrder(s,1,"mina");
  assert.equal(G.outfittedStat(s,s.roster[0],"atk"),G.stat(s.roster[0],"atk")+9);
  assert.deepEqual(reload(s),s);
});

test("移行前の遠征・倉庫・装備を引き継ぎ、保存し直しても二重に精算しない", () => {
  const old = G.initial();
  old.stock.herb=3; old.supplies.medicine=2;
  G.configure(old,old.party,"mina","safe",2); G.depart(old);
  delete old.bag; delete old.wallet; delete old.tributeRate; delete old.lots;
  delete old.trip.packed; delete old.trip.partyPaid;
  delete old.trip.quote.tributeRate; delete old.trip.quote.tribute; delete old.trip.quote.partyReward;
  old.equipment=[{shopId:"hall",level:2,name:"旅の小刀",slot:"weapon",wearer:"mina",effects:{atk:3}}];
  const s=reload(old);
  assert.deepEqual([s.tributeRate,s.wallet,s.equipment[0].quality,s.equipment[0].owner],[10,0,2,0]);
  const r=finish(s);
  assert.deepEqual([r.actual.tribute,s.supplies.medicine,s.wallet,G.materialAvailable(s,"herb")],[10,2,60,3]);
  assert.deepEqual(reload(s),s);
});
