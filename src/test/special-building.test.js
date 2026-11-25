const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
function guild(kind) {
  const s = G.initial();
  s.gold = 18000;
  if (kind) G.buildLandmark(s,kind);
  return s;
}
function archive(s) {
  s.history.push({dungeon:"canal",cleared:true,path:["gate","home"],log:[],partyNumber:1});
  s.roster.forEach(p=>p.rank=2);
  G.depart(s,s,{party:["mina"],leader:"mina",dungeon:"archive",policy:"gather",meds:0});
}
function fallInCombat(s) {
  G.depart(s,s,{party:["popo"],leader:"popo",policy:"gather",meds:1});
  G.step(s); G.step(s); G.reply(s,"pass"); G.step(s);
}

test("丘は専用の一枠。建築・建て替えはギルド金庫から一度だけ支払う", () => {
  const s = guild();
  delete s.town.landmark;
  G.build(s,"west","inn");
  G.restore(s);
  assert.equal(s.town.landmark,null);
  assert.equal(Object.keys(G.landmarks).length,8);
  s.gold=G.landmarkPrice(s)+60; s.wallet=61;
  assert.throws(()=>G.buildLandmark(s,"castle"));
  assert.throws(()=>G.buildLandmark(s,"constructor"));
  assert.throws(()=>G.build(s,"hill","inn"));
  assert.throws(()=>G.build(s,"square","castle"));
  assert.equal(s.gold,G.landmarkPrice(s)+60);
  s.wallet--;
  G.buildLandmark(s,"castle");
  assert.equal(G.guildGold(s),0);
  s.gold+=G.landmarkPrice(s);
  assert.throws(()=>G.buildLandmark(s,"castle"));
  G.buildLandmark(s,"baths");
  assert.equal(G.guildGold(s),0);
  assert.equal(reload(s).town.landmark,"baths");
  assert.deepEqual(s.town.plots,{west:"inn"});
});

test("城は捜索を3手から1手に短縮し、途中セーブから再開しても捜索の負傷を防ぐ", t => {
  t.mock.method(Math,"random",()=>0);
  for (const kind of [null,"castle"]) {
    let s = guild(kind);
    archive(s); G.step(s);
    assert.equal(s.trip.unit[0].state,"missing");
    assert.throws(()=>G.returnHome(s),/救出/);
    s = reload(s);
    G.step(s);
    if (!kind) {
      assert.equal(s.phase,"explore");
      G.step(s); s=reload(s); G.step(s);
    }
    assert.equal(s.phase,"report");
    assert.equal(s.history[0].unit[0].state,kind ? "ok" : "severe");
    assert.equal(!!G.person(s,"mina").injury,!kind);
    assert.match(s.history[0].reason,kind ? /騎士団/ : /救助隊/);
  }
});

test("天文台は前週に実際の侵攻を予告し、城の騎士団は先頭の敵を自動迎撃する", t => {
  t.mock.method(Math,"random",()=>0);
  let s = guild("observatory");
  G.nextWeek(s,true);
  assert.equal(s.raids.warning,null);
  G.nextWeek(s,true);
  const {road,count,boss,due,dueWeek,observed} = s.raids.warning;
  assert.equal(s.week,3); assert.equal(dueWeek,4); assert.ok(observed);
  G.buildLandmark(s,"castle");
  s=reload(s);
  G.nextWeek(s,true);
  assert.equal(s.raids.active,null);
  G.holdDeparture(s);
  G.advanceTime(s,due+G.raidBeat);
  const raid=s.raids.active;
  assert.deepEqual([raid.road,raid.count,raid.boss],[road,count,boss]);
  assert.ok(raid.hits.some(h=>h.source==="knights"));
  assert.ok(raid.enemies[0].hp < raid.enemies[0].maxHP);
});

test("通常の感知職と天文台が各職で罠を回避し、週の吉凶が発動率に反映される", t => {
  t.mock.method(Math,"random",()=>.4);
  const ordinary=guild(), stars=guild("observatory");
  for (const job of Object.keys(G.jobs)) {
    assert.equal(G.canDetectTrap(ordinary,{job}),["thief","druid","beastmaster"].includes(job));
    assert.equal(G.canDetectTrap(stars,{job}),true);
  }
  for (const [s,week,missing] of [[ordinary,1,false],[guild(),2,true],[stars,2,false]]) {
    s.week=week;
    archive(s); G.step(s);
    assert.equal(!!s.trip.rescue,missing);
    if (s===stars) assert.ok(s.trip.log.some(e=>e.message.includes("罠を感知")));
  }
  for (const [week,count] of [[1,4],[2,3]]) {
    const s=guild("observatory");
    s.week=week; archive(s);
    s.trip.route="1-bank";
    G.step(s);
    s.trip.route="1-cache";
    G.step(s);
    assert.equal(s.trip.cargo.ore,count);
  }
});

test("欠損・呪いは帰還と休暇を越えて残り、大工房の義肢と大聖堂の完治が能力値に反映される", t => {
  t.mock.method(Math,"random",()=>0);
  let s=guild(), p=G.person(s,"mina");
  const strength=G.stat(p,"atk"), spirit=G.stat(p,"spirit");
  s.history.push({dungeon:"moss",cleared:true,path:["gate","home"],log:[],partyNumber:1});
  G.depart(s,s,{party:[p.id],leader:p.id,dungeon:"canal",policy:"gather",meds:0});
  for (let step=0;step<12 && s.trip.node!=="2-cache";step++) G.step(s);
  assert.equal(s.trip.node,"2-cache");
  assert.deepEqual(p.debuffs,{curse:0,leg:0,arm:0});
  G.returnHome(s); G.nextWeek(s);
  s=reload(s); p=G.person(s,"mina");
  assert.equal(G.stat(p,"spirit"),Math.floor(spirit/2));
  assert.equal(G.stat(p,"atk"),Math.floor(strength/4));
  assert.throws(()=>G.treatDebuff(s,p.id,"curse"));
  G.treatDebuff(s,p.id,"arm",true);
  assert.equal(p.debuffs.arm,5);
  assert.throws(()=>G.treatDebuff(s,p.id,"arm",true));
  G.buildLandmark(s,"manufactory");
  G.treatDebuff(s,p.id,"arm",true);
  assert.equal(p.debuffs.arm,25);
  G.buildLandmark(s,"cathedral");
  const funds=G.guildGold(s);
  for (const kind of ["arm","leg","curse"]) G.treatDebuff(s,p.id,kind);
  assert.equal(G.guildGold(s),funds-3*G.cureCost);
  assert.deepEqual(p.debuffs,{});
  assert.equal(G.stat(p,"atk"),strength);
  assert.equal(G.stat(p,"spirit"),spirit);
});

test("大聖堂では3回目も救護されて5回目に消失し、英雄廟の信用減点は建て替え後も履歴に残る", () => {
  for (const [kind,deaths,lost] of [["cathedral",2,false],["cathedral",4,true],["memorial",2,true]]) {
    const s=guild(kind), p=G.person(s,"popo");
    p.deaths=deaths;
    fallInCombat(s);
    assert.equal(!!G.person(s,p.id),!lost);
    if (lost) {
      assert.equal(p.departure.penalty,kind==="memorial" ? 5 : 15);
      assert.equal(s.metrics[1],50-p.departure.penalty);
      const before=s.metrics[1];
      G.buildLandmark(s,"academy");
      assert.equal(s.metrics[1],before);
      assert.equal(reload(s).alumni[0].departure.penalty,p.departure.penalty);
    }
  }
});

test("学院で上位技を先修し、昇級試験の合格率と行き先の下調べが改善する", () => {
  const s=guild(), p=s.roster[0], chance=G.examStatus(s,p).chance;
  assert.deepEqual(G.surveyDungeon(s,"moss"),[]);
  assert.throws(()=>G.learnAbility(s,p.id,"lunge"));
  G.buildLandmark(s,"academy");
  G.learnAbility(s,p.id,"lunge");
  assert.equal(G.examStatus(s,p).chance,chance+20);
  assert.deepEqual(G.surveyDungeon(s,"moss"),["木漏れ日の採集路（採集）","岩場の近道（戦闘）"]);
  G.buildLandmark(s,"castle");
  assert.ok(p.skills.includes("lunge"));
  assert.equal(G.examStatus(s,p).chance,chance);
});

test("大工房で稼働店だけが毎週成長し、交易会館は購入額・売却額・来訪と週収に効く", t => {
  t.mock.method(Math,"random",()=>.25);
  const s=guild();
  G.build(s,"west","shop","alchemy"); G.build(s,"east","shop","armor");
  const quote=()=>G.orderQuote(s,"west","vial");
  const normal=quote();
  G.buildLandmark(s,"manufactory"); s.town.repairs.east={remaining:0};
  G.nextWeek(s,true);
  assert.deepEqual(["hall","west","east"].map(id=>s.town.workshops[id].xp),[1,1,0]);
  assert.equal(quote().quality,normal.quality+2);
  assert.equal(quote().effects.medicine,normal.effects.medicine+2);
  G.buildLandmark(s,"exchange");
  assert.equal(quote().quality,normal.quality);
  assert.equal(quote().price,normal.price-5);
  const before=G.guildGold(s);
  G.placeOrder(s,"west","vial","plain",null,true);
  assert.equal(G.guildGold(s),before-quote().price);
  s.stock.ore=1;
  const saleBalance=G.guildGold(s);
  G.sell(s,"ore",s);
  assert.equal(G.guildGold(s),saleBalance+30);
  assert.equal(s.wallet,0);
  const funds=G.guildGold(s), income=G.townTotals(s.town).income;
  G.nextWeek(s,true);
  assert.equal(G.guildGold(s),funds+30+income);
  assert.equal(income,24+8);
  assert.ok(s.visitors.length>=4);
});

test("温泉は湯治と休暇の回復を早め、英雄廟は士気と引退週を代替わり後も支える", () => {
  const s=guild("baths"), p=s.roster[0];
  p.injury={kind:"骨折",readyWeek:5}; p.readyWeek=5;
  p.missingHP=40; p.spentMP=10;
  G.takeLeave(s); G.nextWeek(s);
  assert.deepEqual([p.readyWeek,p.injury.readyWeek,p.missingHP,p.spentMP,p.morale],[4,4,4,1,58]);
  G.buildLandmark(s,"memorial");
  G.retire(s,"gald");
  G.nextWeek(s,true);
  assert.equal(p.morale,64);
  assert.equal(reload(s).alumni[0].retiredWeek,2);
});
