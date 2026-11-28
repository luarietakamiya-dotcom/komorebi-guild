const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));

function expedition(dungeon,party,policy="gather",setup=()=>{}) {
  const s=G.initial();
  s.gold=8000;
  s.history.push({dungeon:G.dungeons[dungeon].requires,cleared:true,path:["gate","home"],log:[]});
  s.roster.forEach(p=>p.rank=2);
  setup(s);
  G.depart(s,s,{party,leader:party[0],dungeon,policy,meds:3},true);
  return s;
}

// Place the party at a branch on the requested floor, then enter through the normal room event.
function visit(s,floor,room) {
  const from = room === "index" ? "bridge" : room === "cache" ? "bank" : "stairs";
  s.trip.node = floor === 1 && from === "stairs" ? "gate" : floor+"-"+from;
  s.trip.route=floor+"-"+room;
  G.step(s);
}

function wipe(t,floor,roll,member="mina") {
  const s=expedition("canal",[member],"bold");
  visit(s,floor,"cut");
  s.trip.unit[0].hp=1;
  t.mock.method(Math,"random",()=>roll);
  for (let i=0; i<8 && s.trip.fight; i++) G.step(s);
  assert.equal(s.trip.unit[0].state,"captured");
  assert.equal(s.trip.pending,null);
  return s;
}

test("部位欠損と精神崩壊は被害者ごとに発生順で知らせ、同じ症状では再通知しない", t=>{
  const s = expedition("canal",["mina","gald"]);
  t.mock.method(Math,"random",()=>.1);
  visit(s,2,"gallery");
  visit(s,2,"gallery");
  visit(s,3,"gallery");
  assert.deepEqual(s.eventNotices.map(n=>n.personId),["mina","gald","mina","gald"]);
  for (const [i,notice] of s.eventNotices.entries()) {
    const p = G.person(s,notice.personId);
    assert.equal(notice.kind,"injury");
    assert.ok(notice.message.includes(p.name));
    assert.match(notice.message,i < 2 ? /脚の欠損/ : /精神崩壊/);
    assert.ok(p.career.some(e=>e.message===notice.message));
  }
  assert.deepEqual(reload(s).eventNotices,s.eventNotices);
});

test("亜人・人との全滅は捕縛。戦闘不能の判定はゴブリン1％・オーク10％、人は対象外", t=>{
  for (const [floor,roll,pregnant] of [[1,.0099,true],[1,.01,false],[2,.0999,true],[2,.10,false],[3,0,false]]) {
    const s=wipe(t,floor,roll);
    assert.equal(Object.hasOwn(s.roster[0].debuffs,"pregnancy"),pregnant);
    assert.throws(()=>G.returnHome(s),/救出/);
    G.dispatchRescue(s);
    for (let i=0;i<3;i++) G.step(s);
    assert.equal(s.phase,"report");
    assert.equal(s.children.length,0);
    t.mock.restoreAll();
  }
});

test("救助の猶予、派遣、遅延被害は再開可能。お城では1手で救出する", t=>{
  let s=wipe(t,3,.8);
  for(let i=0;i<G.rescueGrace-1;i++) G.step(s);
  G.buildLandmark(s,"castle");
  s=reload(s);
  G.dispatchRescue(s);
  assert.throws(()=>G.dispatchRescue(s));
  G.step(s);
  assert.equal(s.phase,"report");
  assert.deepEqual(s.roster[0].debuffs,{});

  t.mock.restoreAll();
  s=wipe(t,3,.20);
  for(let i=0;i<G.rescueGrace+1;i++) G.step(s);
  let p=G.person(s,"mina");
  assert.deepEqual(p.debuffs,{breakdown:0,pregnancy:0});
  assert.equal(p.recovery.pregnancy,s.week+12);
  s=reload(s);
  t.mock.restoreAll();
  t.mock.method(Math,"random",()=>0);
  G.dispatchRescue(s);
  for(let i=0;i<3;i++) G.step(s);
  p=G.person(s,"mina");
  assert.ok(p);
  assert.equal(s.phase,"report");
  G.buildLandmark(s,"cathedral");
  G.treatDebuff(s,p.id,"pregnancy"); G.treatDebuff(s,p.id,"breakdown");
  assert.throws(()=>G.treatDebuff(s,p.id,"pregnancy"));
  assert.equal(p.recovery.pregnancy,s.week+4);
  for(let i=0;i<4;i++) {
    assert.ok(!G.available(s,p));
    assert.ok(!G.raidDefenders(s).includes(p));
    G.nextWeek(s,i>0);
  }
  assert.deepEqual(p.debuffs,{});
  assert.ok(G.available(s,p));
  assert.equal(s.children.length,0);
});

test("遅延した救助で捕虜ごとに判定し、男性への妊娠判定と死亡後の二重処理を防ぐ", t=>{
  let s=expedition("canal",["gald","mina"]);
  t.mock.method(Math,"random",()=>.1);
  visit(s,4,"gallery");
  assert.deepEqual(s.trip.unit.map(u=>u.state),["captured","captured"]);
  for(let i=0;i<G.rescueGrace;i++) G.step(s);
  const rolls=[.5,.29,.8,.8, .019];
  Math.random.mock.mockImplementation(()=>rolls.shift() ?? .9);
  G.step(s);
  assert.deepEqual(G.person(s,"gald").debuffs,{eye:0});
  assert.equal(s.trip.unit[1].state,"lost");
  s=reload(s);
  G.dispatchRescue(s);
  for(let i=0;i<3;i++) G.step(s);
  assert.equal(s.alumni.filter(p=>p.id==="mina").length,1);
  assert.equal(s.phase,"report");
  assert.equal(s.history[0].unit[1].state,"lost");
});

test("罠の難度と個人判定、特殊枠1％・3％の境界、男女とも12週間の戦闘制限", t=>{
  for(const [roll,state] of [[.9599,"ok"],[.96,"resting"],[.9899,"resting"],[.99,"lost"]]) {
    const s=expedition("canal",["gald","mina"]);
    const rolls=[0,roll,.8,.9];
    t.mock.method(Math,"random",()=>rolls.shift() ?? .9);
    visit(s,2,"gallery");
    assert.deepEqual(s.trip.unit.map(u=>u.state),[state,"ok"]);
    G.returnHome(s);
    if(state==="lost") assert.ok(!G.person(s,"gald"));
    if(state==="resting") {
      let saved=reload(s), p=G.person(saved,"gald");
      for(let week=1;week<=12;week++){
        assert.ok(!G.available(saved,p));
        assert.ok(!G.raidDefenders(saved).includes(p));
        G.nextWeek(saved,week>1);
        if(week===1) assert.throws(()=>G.configure(saved,[p.id],p.id,"safe",0),/療養/);
      }
      assert.ok(G.available(saved,p));
      assert.equal(saved.children.length,0);
    }
    t.mock.restoreAll();
  }
  for(const [dungeon,hit] of [["canal",false],["archive",true]]) {
    const s=expedition(dungeon,["mina"]);
    t.mock.method(Math,"random",()=>.30);
    visit(s,2,"gallery");
    assert.equal(Object.hasOwn(s.roster[0].debuffs,"leg"),hit);
    t.mock.restoreAll();
  }
});

test("罠ごとの効果、義肢の品質、ふたつの能力の50％から130％への変化",t=>{
  let s=expedition("archive",["mina"]);
  const p=s.roster[0], dex=G.stat(p,"dex"), def=G.stat(p,"def"), atk=G.stat(p,"atk");
  s.trip.cargo.ore=5;
  t.mock.method(Math,"random",()=>.1);
  visit(s,1,"index");
  assert.equal(s.trip.cargo.ore,2);
  assert.equal(s.trip.meds,1);
  assert.equal(G.stat(p,"dex"),Math.floor(dex/2));
  assert.equal(G.stat(p,"def"),Math.floor(def/2));
  assert.equal(G.stat(p,"atk"),atk);
  G.returnHome(s);
  G.treatDebuff(s,p.id,"eye",true);
  assert.equal(p.debuffs.eye,5);
  s.town.workshops.hall.lineage.craftYears=32;
  G.treatDebuff(s,p.id,"eye",true);
  assert.equal(p.debuffs.eye,80);
  assert.equal(G.stat(p,"dex"),Math.floor(dex*1.3));
  assert.equal(G.stat(p,"def"),Math.floor(def*1.3));

  s=expedition("canal",["mina"]);
  visit(s,3,"gallery");
  assert.ok(Object.hasOwn(s.roster[0].debuffs,"breakdown"));
  const rolls=[.1,.5,.8];
  Math.random.mock.mockImplementation(()=>rolls.shift() ?? .9);
  visit(s,1,"gallery");
  assert.ok(Object.hasOwn(s.roster[0].debuffs,"burden"));
});

test("没収の間は被害を受けた隊だけの資産と携行品を精算前に失う", t=>{
  const s=expedition("canal",["mina"],"gather",s=>{
    G.unlockParty(s);
    s.wallet=130;
    s.extraParties[0].wallet=60;
    s.stock.ore=8;
    s.bag.supplies.medicine=1; s.bag.lots=[{key:"medicine",quality:4,count:1}];
    s.equipment=[{owner:1,wearer:null},{owner:2,wearer:null},{owner:0,wearer:null}];
  });
  const guild=G.guildGold(s);
  s.trip.cargo.herb=5;
  s.trip.cargo.ore=2;
  t.mock.method(Math,"random",()=>.1);
  visit(s,4,"cache");
  assert.deepEqual(s.trip.cargo,{herb:0,ore:0});
  assert.equal(s.trip.meds,0);
  assert.deepEqual(s.trip.packed.medicine,[]);
  assert.equal(s.wallet,0);
  assert.equal(G.guildGold(s),guild);
  assert.equal(s.stock.ore,8);
  assert.equal(s.extraParties[0].wallet,60);
  assert.deepEqual(s.equipment.map(i=>i.owner),[2,0]);
  G.returnHome(s);
  assert.equal(s.wallet,0);
  assert.equal(s.supplies.medicine,0);
  assert.equal(s.bag.supplies.medicine,0);
});

test("旧セーブの症状と療養期限を保持し、旧自作キャラの性別補完は再読込で安定する", ()=>{
  const s=G.initial();
  G.register(s,{name:"ソラ",job:"druid",trait:"kind",tone:"normal"});
  for(const p of s.roster) {
    delete p.sex; delete p.recovery; delete p.treatment;
    p.debuffs={leg:25}; p.readyWeek=5;
  }
  const saved=reload(s);
  assert.equal(G.person(saved,"mina").sex,"female");
  assert.ok(["female","male"].includes(G.person(saved,"custom").sex));
  assert.equal(G.fitWeek(saved.roster[0]),5);
  assert.deepEqual(saved.roster[0].debuffs,{leg:25});
  assert.deepEqual(reload(saved),saved);
});

test("戦列に仲間が残る場合は通常の救護通信になり、妊娠療養中は復帰薬で参戦できない",t=>{
  const s=expedition("canal",["mina","gald"],"bold");
  visit(s,1,"cut");
  s.trip.unit[0].hp=1;
  t.mock.method(Math,"random",()=>.005);
  G.step(s);
  assert.equal(s.trip.pending.type,"crisis");
  assert.equal(s.trip.rescue,undefined);
  assert.deepEqual(G.choices(s),["carry","return","delegate"]);
  assert.throws(()=>G.reply(s,"med"));
  G.reply(s,"return");
  assert.equal(s.history[0].unit[0].recoveryWeek,s.week+12);
});
