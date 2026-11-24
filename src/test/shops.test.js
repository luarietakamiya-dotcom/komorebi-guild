const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

function unchanged(s, operation) {
  const before = JSON.stringify(s);
  assert.throws(operation);
  assert.equal(JSON.stringify(s), before);
}

test("旧セーブの建物・研究・装備・遠征を引き継ぎ、再読込で経験を重複加算しない", () => {
  const old = G.initial();
  old.town = {plots:{west:"forge", east:"shop", square:"tavern"}, food:8};
  old.weapon = true;
  old.wielder = "gald";
  old.research = 1;
  G.depart(old);
  delete old.supplies;
  delete old.equipment;
  delete old.trip.quote.packedMeds;
  delete old.trip.quote.rations;
  const s = G.restore(old);
  assert.deepEqual(Object.values(s.town.workshops).map(shop=>shop.type), ["forge","forge","armor","kitchen"]);
  assert.deepEqual([s.town.workshops.hall.level,s.town.workshops.west.level,s.research,s.town.food,s.wielder], [2,1,1,8,"gald"]);
  assert.deepEqual(G.restore(JSON.parse(JSON.stringify(s))), s);
  G.returnHome(s);
  assert.equal(s.history[0].actual.food, 30);
});

test("建物と専門店が対応し、同業の2区画で異なる専門を保持する", () => {
  const s = G.initial();
  s.gold = 500;
  unchanged(s, () => G.build(s,"east","shop","kitchen"));
  unchanged(s, () => G.deliverMaterial(s,"east"));
  G.build(s,"east","shop","armor");
  G.build(s,"west","shop","armor");
  G.learnSkill(s,"east","plate");
  G.learnSkill(s,"west","leather");
  unchanged(s, () => G.learnSkill(s,"east","leather"));
  unchanged(s, () => G.resetSkills(s,"east"));
  unchanged(s, () => G.placeOrder(s,"east","jacket"));
  unchanged(s, () => G.placeOrder(s,"east","vest","leather"));
  unchanged(s, () => G.learnSkill(s,"east","rivet"));
  assert.deepEqual(G.restore(JSON.parse(JSON.stringify(s))).town, s.town);
});

test("5業種の全分岐で納品と加工が経験になり、新商品・品質・仕上げが段階的に開く", () => {
  for (const [id,type] of Object.entries(G.shopTypes)) {
    for (const root of type.skills.filter(n=>!n.parent)) {
      const s = G.initial(), site = "east";
      G.build(s,site,type.building,id);
      const shop = s.town.workshops[site], stock = G.materialStock(s,type);
      const [basic,advanced] = type.recipes;
      const special = type.recipes.find(r=>r.skill===root.id);
      const mastery = type.skills.find(n=>n.parent===root.id);
      unchanged(s, () => G.deliverMaterial(s,site));
      unchanged(s, () => G.placeOrder(s,site,basic.id));
      stock[type.material] = 30;
      unchanged(s, () => G.placeOrder(s,site,special.id));
      unchanged(s, () => G.placeOrder(s,site,advanced.id));
      unchanged(s, () => G.placeOrder(s,site,basic.id,root.id));
      G.learnSkill(s,site,root.id);
      unchanged(s, () => G.learnSkill(s,site,root.id));
      G.deliverMaterial(s,site);
      const first = G.placeOrder(s,site,special.id,root.id);
      assert.match(first.name, new RegExp(root.finish));
      assert.equal(stock[type.material], 29-first.cost);
      assert.deepEqual([shop.level,shop.xp,shop.points], [2,0,1]);
      const plain = G.orderQuote(s,site,basic.id);
      const main = Object.keys(basic.effects)[0];
      assert.equal(plain.effects[main], basic.effects[main]+1);
      for (let i=0; i<3; i++) G.placeOrder(s,site,advanced.id);
      G.learnSkill(s,site,mastery.id);
      assert.deepEqual([shop.level,shop.xp,shop.points], [3,0,0]);
      const order = G.placeOrder(s,site,advanced.id,mastery.id);
      if (type.slot) assert.deepEqual(s.equipment.at(-1).effects, order.effects);
      else for (const [supply,count] of Object.entries(order.effects)) assert.ok(s.supplies[supply] >= count);
      if (mastery.id==="ward") assert.equal(G.townTotals(s.town).defense,2);
      unchanged(s, () => G.deliverMaterial(s,site));
      if (type.canReset) {
        const inventory = {...s.supplies};
        G.resetSkills(s,site);
        assert.deepEqual([shop.level,shop.points,shop.skills,s.supplies], [3,3,[],inventory]);
        unchanged(s, () => G.placeOrder(s,site,special.id,mastery.id));
      }
    }
  }
});

test("注文武器の仕上げが行動順・打撃に反映され、旧武器や遠征中の装備と競合しない", () => {
  const s = G.initial();
  s.stock.ore = 10;
  G.donate(s);
  G.buy(s);
  G.learnSkill(s,"hall","sword");
  G.placeOrder(s,"hall","sabre","sword");
  G.wearOrder(s,0,"mina");
  const p = G.person(s,"mina");
  assert.equal(s.wielder,null);
  assert.equal(G.outfittedStat(s,p,"spd"),12);
  G.equip(s,"mina");
  assert.equal(s.equipment[0].wearer,null);
  G.wearOrder(s,0,"mina");
  G.configure(s,["mina"],"mina","gather",0);
  G.depart(s);
  unchanged(s, () => G.wearOrder(s,0,"gald"));
  for (let i=0;i<3;i++) G.step(s);
  assert.equal(s.trip.wins,1);
  assert.equal(s.trip.unit[0].hp,G.stat(p,"hp"));
  assert.ok(s.trip.log.some(e=>e.message.includes("14ダメージ")));
});

test("畑からの加工品と調合薬を複数隊が分け合い、未使用の薬は購入分だけ返金する", () => {
  const s = G.initial();
  s.gold = 800;
  G.build(s,"brook","farm");
  G.build(s,"square","tavern");
  G.build(s,"east","shop","alchemy");
  G.unlockParty(s);
  G.nextWeek(s,true);
  G.learnSkill(s,"square","meal");
  G.placeOrder(s,"square","bread","meal");
  assert.deepEqual([s.town.food,s.supplies.ration,s.supplies.tonic],[23,1,1]);
  s.stock.herb=4;
  G.learnSkill(s,"east","blast");
  G.placeOrder(s,"east","vial","blast");
  const second = s.extraParties[0];
  const solo = {party:["mina"],leader:"mina",policy:"gather",meds:2};
  assert.equal(G.estimate(s,{...s,...solo}).medicine,30);
  unchanged(s, () => G.depart(s,s,{...solo,leader:"unknown"}));
  G.depart(s,s,solo);
  assert.deepEqual([s.trip.quote.food,s.trip.quote.medicine,s.trip.tonic,s.trip.spark],[0,30,true,true]);
  G.depart(s,second,{party:["gald"],leader:"gald",policy:"safe",meds:1});
  assert.deepEqual([second.trip.quote.food,second.trip.quote.medicine,second.trip.tonic,second.trip.spark],[10,30,false,false]);
  for (let i=0;i<3;i++) G.step(s);
  assert.equal(s.trip.wins,1);
  assert.ok(s.trip.log.some(e=>e.message.includes("火花玉で先制")));
  assert.ok(s.trip.log.some(e=>e.message.includes("13ダメージ")));
  const resumed = G.restore(JSON.parse(JSON.stringify(s)));
  const before = resumed.gold;
  G.returnHome(resumed);
  assert.deepEqual([resumed.supplies.medicine,resumed.supplies.spark,resumed.history[0].actual.medicine],[1,0,0]);
  const actual = resumed.history[0].actual;
  assert.equal(resumed.gold,before+30+actual.reward-actual.share-actual.wages);
  G.returnHome(resumed,resumed.extraParties[0]);
  assert.equal(resumed.supplies.medicine,1);
});

test("携行した調合薬を先に使い、残った購入薬と調合薬をそれぞれの在庫に戻す", () => {
  for (const packed of [1,2,3]) {
    const s = G.initial();
    s.supplies.medicine = packed;
    G.configure(s,s.party,"mina","gather",3);
    G.depart(s);
    for (let i=0;i<3;i++) G.step(s);
    G.reply(s,"med");
    const gold = s.gold;
    G.returnHome(s);
    const actual = s.history[0].actual;
    assert.equal(actual.medicine,0);
    assert.equal(s.supplies.medicine,packed-1);
    assert.equal(s.gold,gold+30*(3-packed)+actual.reward-actual.share-actual.wages);
  }
});
