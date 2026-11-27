const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

function town() {
  const s = G.initial();
  s.gold = 4000;
  s.raids.nextWeek = 100;
  return s;
}
const reload = s => G.restore(JSON.parse(JSON.stringify(s)));

test("商業8種は金庫から建築でき、工房を作らず二軒目でも営業する", () => {
  assert.equal(Object.keys(G.commercialBuildings).length,8);
  for (const [kind,b] of Object.entries(G.commercialBuildings)) {
    const s = town(), [first,second] = G.plotForSite("brook").sites;
    G.build(s,first,"forge");
    s.wallet = 50;
    s.gold = b.cost + s.wallet - 1;
    assert.throws(() => G.build(s,second,kind),/資金/);
    s.gold++;
    assert.throws(() => G.build(s,"westGate",kind),/防衛/);
    G.build(s,second,kind);
    assert.equal(G.guildGold(s),0);
    assert.equal(s.town.workshops[second],undefined);
    assert.equal(reload(s).town.plots[second],kind);
    assert.ok(Object.keys(G.facilityEffects(kind,G.plotForSite(second))).length);
  }
});

test("来訪規模には名声・ランク・二軒目を含む町の規模が反映される", () => {
  const s = town();
  assert.equal(G.tourismReport(s).visitors,0);
  G.build(s,"west","florist");
  assert.equal(G.tourismReport(s).visitors,2);
  G.build(s,"brook","guide");
  assert.equal(G.tourismReport(s).visitors,12);
  G.build(s,G.plotForSite("brook").sites[1],"spaInn");
  assert.equal(G.tourismReport(s).visitors,28);
  s.metrics[0] += 20;
  assert.equal(G.tourismReport(s).visitors,30);
  s.guildProgress.grade = 1;
  assert.equal(G.tourismReport(s).visitors,33);
});

test("観光税・土産物税・市場税を手動と自動の週末に一度ずつ金庫へ入れ、旧セーブを引き継ぐ", () => {
  let s = town();
  delete s.town.taxHistory;
  s = reload(s);
  assert.deepEqual(s.town.taxHistory,[]);
  G.build(s,"west","guide");
  G.build(s,"east","souvenir");
  G.build(s,"square","market");
  s.wallet = 20;
  const expected = {week:1,visitors:12,visitorTax:24,souvenirSales:72,souvenirTax:14,marketTax:3,total:41};
  assert.deepEqual(G.tourismReport(s),expected);
  const before = G.guildGold(s);
  G.nextWeek(s,true);
  assert.equal(G.guildGold(s),before+30+41);
  const after = s.gold;
  G.holdDeparture(s);
  G.advanceTime(s,G.weekMillis-1);
  s = reload(s);
  assert.deepEqual(s.town.taxHistory,[expected]);
  assert.equal(s.gold,after);
  G.advanceTime(s,1);
  assert.equal(s.wallet,20);
  assert.equal(s.gold,after+41);
  assert.deepEqual(reload(s).town.taxHistory,[{...expected,week:2},expected]);
});

test("損傷した観光施設は来客・購買・税収を停止し、市場の素材値引きも修理後に戻る", () => {
  const s = town();
  const quote = () => G.orderQuote(s,"hall","knife");
  const regular = quote();
  for (const [site,kind] of [["west","guide"],["east","souvenir"],["square","market"]]) {
    G.build(s,site,kind);
    s.town.repairs[site] = {remaining:1,chance:1};
  }
  assert.equal(quote().price,regular.price);
  const before = s.gold;
  G.nextWeek(s,true);
  assert.equal(s.gold,before+30);
  assert.equal(quote().fee,regular.fee);
  assert.equal(quote().price,regular.price-1);
  const tax = G.tourismReport(s);
  assert.equal(tax.total,41);
  G.nextWeek(s,true);
  assert.deepEqual(s.town.taxHistory[0],tax);
});

test("洋服屋は在町の女性と引退者・子供に効き、遠征中の女性は対象外", () => {
  const s = town();
  G.build(s,"west","boutique");
  const mina = G.person(s,"mina"), child = G.welcomeChild(s,"mina","gald","ミオ");
  assert.equal(child.sex,"female");
  G.configure(s,["mina"],"mina","gather",0);
  G.depart(s);
  G.advanceTime(s,G.weekMillis);
  assert.deepEqual([mina.morale,child.morale,G.person(s,"gald").morale,s.metrics[3]],[50,57,50,61]);
  G.returnHome(s);
  G.retire(s,"mina");
  const before = mina.morale;
  G.nextWeek(s);
  assert.equal(mina.morale,before+7);
  const alone = town();
  G.build(alone,"west","boutique");
  G.configure(alone,["mina"],"mina","gather",0);
  G.depart(alone);
  G.advanceTime(alone,G.weekMillis);
  assert.equal(alone.metrics[3],60);
});

test("喫茶店は休息と満足度を改善し、劇場は在町のアイドルと踊り子で効果が増す", () => {
  const s = town(), mina = G.person(s,"mina");
  G.build(s,"west","cafe");
  mina.missingHP = 20;
  mina.spentMP = G.maxMP(mina);
  G.nextWeek(s,true);
  assert.equal(mina.missingHP,20-Math.ceil(G.outfittedStat(s,mina,"hp")*.26));
  assert.equal(G.currentMP(mina),Math.ceil(G.maxMP(mina)*.26));
  assert.equal(s.metrics[3],62);
  for (const id of ["shiina","meniya"]) {
    s.roster.push({...structuredClone(mina),id,job:G.uniqueGuests[id].job});
  }
  G.build(s,"east","theater");
  G.nextWeek(s,true);
  assert.equal(mina.morale,50+9+8+5);
  assert.equal(s.metrics[3],62+1+2+3+2+2);
});
