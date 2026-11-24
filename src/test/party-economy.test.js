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

test("初期の3人隊は薬1本を使っても全依頼で売却前の見積りが黒字になる", () => {
  const s = G.initial();
  G.configure(s,s.party,s.leader,s.policy,1);
  const first = G.estimate(s);
  assert.deepEqual([first.tributeRate,first.tribute,first.partyReward],[25,50,150]);
  assert.deepEqual([first.reward,first.share,first.food,first.medicine,first.wages,first.net],
    [200,60,30,30,36,44]);
  for (const [quest,details] of Object.entries(G.quests)) {
    const quote = G.estimate(s,{...s,quest});
    assert.ok(quote.net >= 30, details.name);
  }
  const before = s.gold;
  G.depart(s);
  assert.deepEqual(s.trip.quote,first);
  const {actual} = finish(s);
  assert.equal(actual.net,first.net + first.medicine - actual.medicine);
  assert.equal(s.gold,before + actual.net);
});

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
  assert.deepEqual(s.stock,failure.surplus);
  assert.equal(s.stock.herb,4);
  assert.equal(second.bag.materials,undefined);
  const first = finish(s);
  assert.deepEqual([first.actual.reward,first.actual.tributeRate,first.actual.tribute,
    first.actual.partyReward,first.actual.share,s.wallet],[200,25,50,150,60,90]);
  assert.equal(G.guildGold(s),240-50-30-36+50);
  assert.deepEqual(first.surplus,{herb:2,ore:1});
  assert.equal(s.bag.materials,undefined);
  assert.equal(G.materialAvailable(s,"herb"),6);
  const treasury = G.guildGold(s);
  G.sell(s,"herb",second);
  assert.deepEqual([s.wallet,second.wallet,s.stock.herb,G.guildGold(s)],[90,0,5,treasury+10]);
  assert.equal(s.stock.ore,2);
  G.sell(s,"ore"); G.sell(s,"ore");
  unchanged(s,() => G.sell(s,"ore"));
  unchanged(s,() => G.returnHome(s));
  assert.deepEqual(reload(s),s);
});

test("早期帰還でも薬代を返金した後に100Gを超えた分だけを帰還した隊から金庫へ戻す", () => {
  for (const [startingWallet,remaining,surplus] of [[109,99,0],[110,100,0],[111,100,1]]) {
    const s = G.initial();
    s.gold = 600;
    G.unlockParty(s);
    const second = s.extraParties[0];
    G.configure(s,["gald"],"gald","safe",1,second);
    s.wallet = 150;
    second.wallet = startingWallet;
    const total = s.gold, treasury = G.guildGold(s);
    G.depart(s,second);
    G.returnHome(s,second);
    const r = G.reportFor(s,second);
    assert.equal(r.actual.walletSurplus,surplus);
    assert.equal(second.wallet,remaining);
    assert.equal(r.returnedWallet,remaining);
    assert.equal(s.wallet,150);
    assert.equal(G.guildGold(s),treasury-r.actual.wages+surplus);
    assert.equal(r.returnedGold,G.guildGold(s));
    assert.equal(s.gold,total+r.actual.net);
    assert.deepEqual(reload(s),s);
  }
});

test("注文は購入者の資金と倉庫の素材を使い、装備の交換・移籍で所有権を守る", () => {
  const s = G.initial();
  s.gold = 650;
  G.unlockParty(s);
  const second = s.extraParties[0];
  G.configure(s,["popo"],"popo","safe",0,second);
  s.wallet=120;
  unchanged(s,() => G.placeOrder(s,"hall","knife"));
  s.stock.ore=3;
  const treasury=G.guildGold(s);
  unchanged(s,() => G.placeOrder(s,"hall","knife","plain",second,true));
  unchanged(s,() => G.placeOrder(s,"hall","knife","plain",second));
  const order = G.placeOrder(s,"hall","knife","plain",s);
  assert.deepEqual([s.wallet,s.stock.ore,G.guildGold(s)],[120-order.fee,2,treasury]);
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

test("旧セーブは初期値10%だけを移行し、受注済みの見積りと移行後に選んだ10%を保つ", () => {
  const old = G.initial();
  G.setProfile(old,0,{name:"森のギルド",tributeRate:10});
  G.depart(old);
  delete old.tributeRateMigrated;
  const s = reload(old);
  assert.equal(s.tributeRate,25);
  assert.deepEqual(s.trip.quote,old.trip.quote);
  assert.equal(finish(s).actual.tribute,20);
  G.setProfile(s,0,{name:"森のギルド",tributeRate:10});
  assert.equal(reload(s).tributeRate,10);
  for (const rate of [0,12,30]) {
    old.tributeRate = rate;
    assert.equal(reload(old).tributeRate,rate);
  }
  for (const rate of [51,12.5]) {
    unchanged(s,() => G.setProfile(s,0,{name:"森のギルド",tributeRate:rate}));
  }
});

test("移行前の遠征・倉庫・装備を引き継ぎ、保存し直しても二重に精算しない", () => {
  const old = G.initial();
  old.stock.herb=3; old.supplies.medicine=2;
  G.configure(old,old.party,"mina","safe",2); G.depart(old);
  // 報酬改定前に受注した遠征の見積り。
  Object.assign(old.trip.quote, {reward:100, share:30, net:4});
  delete old.bag; delete old.wallet; delete old.tributeRate; delete old.tributeRateMigrated; delete old.lots;
  delete old.trip.packed; delete old.trip.partyPaid;
  delete old.trip.quote.tributeRate; delete old.trip.quote.tribute; delete old.trip.quote.partyReward;
  old.equipment=[{shopId:"hall",level:2,name:"旅の小刀",slot:"weapon",wearer:"mina",effects:{atk:3}}];
  const s=reload(old);
  assert.deepEqual([s.tributeRate,s.wallet,s.equipment[0].quality,s.equipment[0].owner],[25,0,2,0]);
  const r=finish(s);
  assert.deepEqual([r.actual.tribute,s.supplies.medicine,s.wallet,G.materialAvailable(s,"herb")],[25,2,45,5]);
  assert.deepEqual(reload(s),s);
});

test("旧セーブの全隊の素材を共有在庫に戻し、遠征中の荷物と高品質の補給品を引き継ぐ", () => {
  const old = G.initial();
  G.unlockParty(old);
  const second = old.extraParties[0];
  G.configure(old,["gald"],"gald","safe",0,second);
  G.depart(old,second);
  G.step(old,second);
  old.stock = {herb:40,ore:20}; // 第1隊31/15、第2隊4/2、残りは倉庫
  old.bag.materials = {herb:31,ore:15};
  second.bag.materials = {herb:4,ore:2};
  second.bag.supplies.medicine = 3;
  second.bag.lots = [{key:"medicine",quality:2,count:3}];
  const s = reload(old), team = s.extraParties[0];
  assert.deepEqual([G.materialAvailable(s,"herb"),G.materialAvailable(s,"ore")],[40,20]);
  assert.ok(G.parties(s).every(t => !("materials" in t.bag)));
  assert.deepEqual(team.bag.supplies,second.bag.supplies);
  assert.deepEqual(team.bag.lots,second.bag.lots);
  assert.deepEqual(team.trip.cargo,{herb:2,ore:0});
  assert.deepEqual(reload(s),s);
  G.returnHome(s,team);
  assert.deepEqual(s.stock,{herb:42,ore:20});
  assert.deepEqual(reload(s),s);
});

test("帰還報酬と返金から購入できる境界を判定し、隊の支出後に残った超過額だけを戻す", () => {
  for (const [initialWallet,cost,transfer] of [[65,0,25],[66,26,0],[67,26,1]]) {
    const s = G.initial();
    s.wallet = initialWallet;
    const total = s.gold, treasury = G.guildGold(s);
    G.configure(s,s.party,s.leader,"safe",1);
    G.depart(s);
    const r = finish(s);
    assert.deepEqual([r.actual.equipmentCost,r.actual.walletSurplus,r.returnedWallet],[cost,transfer,100]);
    assert.equal(s.gold,total+r.actual.net);
    assert.equal(G.guildGold(s),treasury+r.actual.tribute-r.actual.wages+transfer);
    assert.deepEqual(s.stock,r.surplus);
    assert.equal(s.town.workshops.hall.xp,cost ? 2 : 0);
    assert.equal(r.log.filter(e => e.outfit).length,cost ? 1 : 0);
    if (cost) {
      const item = s.equipment[0];
      assert.deepEqual([item.name,item.wearer,item.owner,item.price],["旅の小刀","mina",1,26]);
      assert.equal(G.outfittedStat(s,s.roster[0],"atk"),G.stat(s.roster[0],"atk")+2);
    }
    assert.deepEqual(reload(s),s);
  }
});

test("週初めに方針と職業が合う隊員を選び、素材込みの代金をその隊の財布だけから払う", () => {
  for (const [policy,slot,wearer] of [["safe","armor","gald"],["bold","weapon","mina"],["gather","charm","popo"]]) {
    const s = G.initial();
    s.gold=1000;
    G.build(s,"east","shop","armor");
    G.build(s,"west","shop","magic");
    s.policy=policy;
    s.wallet=126;
    const treasury=G.guildGold(s);
    G.nextWeek(s,true);
    assert.deepEqual(s.equipment.map(i => [i.slot,i.wearer,i.owner]),[[slot,wearer,1]]);
    assert.equal(s.wallet,100);
    assert.equal(G.guildGold(s),treasury+30+G.facilityTotals(s.town).income);
    assert.equal(s.morningMail[0].partyNumber,1);
    assert.match(s.morningMail[0].message,/26 G/);
    assert.ok(G.morningPlans(s).length);
    assert.deepEqual(reload(s),s);
  }
});

test("帰還した隊だけが営業中の工房で上位装備を購入し、同等品は買い直さない", () => {
  const s=G.initial();
  s.gold=1000;
  G.unlockParty(s);
  const second=s.extraParties[0];
  G.configure(s,["gald"],"gald","bold",0,second);
  G.build(s,"west","forge");
  G.learnSkill(s,"west","sword");
  second.wallet=26;
  G.placeOrder(s,"hall","knife","plain",second,true);
  G.wearOrder(s,0,"gald");
  G.depart(s);
  s.wallet=160;
  second.wallet=162; // 食料10G、運転資金100G、買い替え予算52G
  G.depart(s,second);
  s.town.smithReadyWeek=s.week+2;
  G.returnHome(s,second);
  const r=G.reportFor(s,second);
  assert.equal(r.actual.equipmentCost,52);
  assert.equal(s.equipment[0].wearer,null);
  const item=s.equipment[1];
  assert.deepEqual([item.shopId,item.owner,item.wearer,item.name],["west",2,"gald","街道の長剣・剣仕立て"]);
  assert.deepEqual([s.wallet,second.wallet],[160,100]);
  second.wallet=152;
  G.advanceTime(s,G.weekMillis);
  assert.equal(s.phase,"explore");
  assert.equal(s.equipment.length,2);
  assert.deepEqual([s.wallet,second.wallet],[160,152]);
  assert.deepEqual(reload(s),s);
});

test("休業中の工房には発注せず、同じ装備が袋にあれば購入費をかけずに使う", () => {
  const s=G.initial();
  s.gold=500;
  G.configure(s,["mina"],"mina","bold",0);
  G.build(s,"west","forge");
  G.learnSkill(s,"west","axe");
  s.town.repairs.west={remaining:0};
  s.town.smithReadyWeek=4;
  s.wallet=152;
  G.nextWeek(s,true);
  assert.equal(s.wallet,152);
  assert.deepEqual(s.equipment,[]);
  assert.equal(s.morningMail.length,0);

  delete s.town.smithReadyWeek;
  G.placeOrder(s,"hall","knife","plain",s,true);
  const total=s.gold;
  G.nextWeek(s,true);
  assert.deepEqual(s.equipment.map(i => i.wearer),["mina"]);
  assert.equal(s.wallet,126);
  assert.equal(s.gold,total+30+G.facilityTotals(s.town).income);
  assert.match(s.morningMail[0].message,/隊の持ち物から「旅の小刀」/);
});
