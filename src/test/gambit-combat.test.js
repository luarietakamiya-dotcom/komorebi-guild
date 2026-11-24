const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const G = require("../engine.js");

const copy = s => G.restore(JSON.parse(JSON.stringify(s)));
const rule = (action,target,condition="always",subject="self",value=50) => ({condition,subject,value,action,target});
function enterFight(s, party=["mina","gald"], policy="gather", meds=0) {
  G.depart(s,s,{party,leader:party[0],policy,meds},true);
  G.step(s); G.step(s);
  if (s.trip.pending) G.reply(s,"pass");
  G.step(s);
  assert.equal(s.trip.fight.turn,0);
}
test("人物別の設定は10枠。未習得・不適合な対象・不正な閾値をまとめて拒否し旧セーブを移行", () => {
  const s = G.initial(), p = G.person(s,"mina");
  const rows = Array.from({length:10},() => rule("attack","nearest"));
  G.setGambits(s,p.id,rows);
  for (const bad of [[...rows,rows[0]],[rule("slash","nearest")],[rule("heal","nearest")],
    [rule("attack","nearest","hp","self",101)]]) assert.throws(() => G.setGambits(s,p.id,bad));
  assert.deepEqual(p.gambits,rows);
  assert.deepEqual(G.person(copy(s),"mina").gambits,rows);
  delete s.clock;
  delete s.roster[1].gambits;
  assert.deepEqual(copy(s).clock,{elapsed:0,paused:false,speed:1});
  assert.deepEqual(copy(s).roster[1].gambits,[]);
});
test("指定した仲間のHPで回復薬を優先し、回復済み・薬切れ・未解禁ラウンドは次の規則へ", () => {
  const s = G.initial();
  G.setGambits(s,"mina",[rule("medicine","mina","hp","mina",40),rule("rally","strongest"),rule("attack","nearest")]);
  enterFight(s,undefined,"gather",1);
  G.step(s); // Boar hits Mina for 27.
  assert.equal(s.trip.unit[0].hp,13);
  const resume = copy(s);
  for (const state of [s,resume]) {
    G.step(state);
    assert.deepEqual([state.trip.unit[0].hp,state.trip.meds],[29,0]);
    assert.match(state.trip.log.at(-1).message,/戦術オーダー1「ミナのHPが40％以下」.*回復薬.*16回復/);
    assert.equal(state.trip.effects[0].target,"mina");
    assert.equal(state.trip.steps,3);
    G.step(state); G.step(state); G.step(state);
    assert.equal(state.trip.effects[0].rule,2);
    assert.ok(state.trip.log.some(e=>e.message.includes("切り返し")));
  }
  assert.deepEqual(resume,s);
  const other = G.initial();
  G.setGambits(other,"mina",[rule("heal","leader","hp","leader",10),rule("medicine","self"),
    rule("rally","nearest"),rule("attack","nearest")]);
  enterFight(other);
  G.step(other); G.step(other);
  assert.equal(other.trip.effects[0].rule,4);
  assert.equal(other.trip.fight.enemies[0].hp,3);
});
test("複数の敵からHP・種別・詠唱で対象を選び、状態異常を鎮め、撤退時の精算は1回", () => {
  const s = G.initial();
  G.setGambits(s,"mina",[rule("cleanse","self","status"),rule("attack","casting","casting"),
    rule("attack","strongest","count","self",2)]);
  enterFight(s,["mina","gald"],"bold");
  const f = s.trip.fight, caster = f.enemies[1];
  assert.equal(caster.kind,"crystal");
  G.step(s); G.step(s);
  assert.deepEqual([s.trip.effects[0].target,s.trip.effects[0].rule],["caster",3]);
  G.step(s);
  assert.equal(caster.casting,true);
  G.setGambits(s,"gald",[rule("attack","boar")]);
  G.step(s);
  assert.equal(s.trip.effects[0].target,"enemy");
  G.step(s); G.reply(s,"carry"); // Mina is carried and skips her turn.
  G.step(s);
  assert.equal(f.shaken.gald,true);
  G.setGambits(s,"gald",[rule("cleanse","leader","status","leader"),rule("cleanse","self","status")]);
  G.step(s);
  assert.equal(s.trip.effects[0].rule,2);
  assert.equal(f.shaken.gald,undefined);
  G.setGambits(s,"gald",[rule("flee","self","casting"),rule("flee","self")]);
  while (s.phase === "explore") G.step(s);
  assert.match(s.history[0].reason,/戦術オーダーで撤退/);
  assert.equal(s.history.length,1);
  assert.equal(s.history[0].wins,0);
  assert.throws(()=>G.returnHome(s));
});
test("詠唱中の敵を狙う規則と、本人が不在の対象を飛ばす規則", () => {
  const s = G.initial();
  G.setGambits(s,"gald",[rule("heal","popo"),rule("attack","casting","casting"),rule("attack","boar")]);
  enterFight(s,["mina","gald"],"bold");
  for (let i=0; i<4; i++) G.step(s);
  assert.deepEqual([s.trip.effects[0].rule,s.trip.effects[0].target],[2,"caster"]);
});
test("全体停止中は戦闘と町の週が止まり、緊急返信・設定変更は保存され、次の手から有効", () => {
  let s = G.initial();
  enterFight(s,s.party,"gather",1);
  G.step(s);
  assert.equal(s.trip.pending.type,"crisis");
  s.clock.paused = true;
  G.advanceTime(s,G.weekMillis);
  G.reply(s,"med");
  G.setGambits(s,"mina",[rule("heal","popo","hp","popo",80)]);
  s = copy(s);
  assert.deepEqual([s.week,s.trip.fight.turn,s.trip.unit[2].hp,s.trip.meds],[1,1,16,0]);
  assert.throws(()=>G.step(s));
  s.clock.paused = false;
  G.step(s);
  assert.equal(s.trip.unit[2].hp,20);
  assert.match(s.trip.effects[0].message,/手当て.*4回復/);
  G.returnHome(s);
  assert.equal(s.history[0].actual.medicine,30);
});
test("村の時計が遠征中も翌週を迎え、収穫・相談期限・納品期限を一度ずつ処理", () => {
  let s = G.initial();
  G.build(s,"square","farm");
  G.depart(s,s,{party:["gald"],leader:"gald",policy:"gather",meds:0},true);
  G.step(s); G.step(s);
  G.advanceTime(s,G.weekMillis-100);
  s = copy(s);
  assert.equal(s.trip.pending.type,"fork");
  G.advanceTime(s,102);
  assert.deepEqual([s.week,s.clock.elapsed,s.town.food,s.trip.pending],[2,2,1,null]);
  assert.ok(s.trip.log.find(e=>e.letter).letter.decision);
  G.step(s); G.step(s);
  assert.equal(s.history[0].delivered,0);
  G.advanceTime(s,G.weekMillis);
  assert.deepEqual([s.week,s.town.food,s.phase,s.history.length],[3,2,"prep",1]);
});
test("実際の描画経路で行動者が踏み込み、選ばれた敵にダメージ・味方に回復量を表示", async () => {
  const poses = [], labels = [], frames = [];
  const noop = () => {};
  const ctx = new Proxy({fillText:(label,x,y)=>labels.push([label,x,y])},{get:(obj,k)=>obj[k] ?? noop});
  const viewport = {clientWidth:600};
  const canvas = {width:900,height:300,clientWidth:900,dataset:{scene:"dungeon"},getContext:()=>ctx,closest:()=>viewport};
  const draw = (ctx,actors) => actors.forEach(a=>a.paint(ctx));
  draw.prepare = () => Promise.resolve();
  const sandbox = vm.createContext({Guild:G, GuildVoxelMaps:{places:{pass:[0],vein:[8]},trailDepth:()=>0,get:()=>draw},
    GuildStacks:{draw:(_ctx,sprite,_url,x,y)=>poses.push([sprite,x,y])},
    window:{matchMedia:()=>({matches:false})},requestAnimationFrame:fn=>frames.push(fn),cancelAnimationFrame:noop});
  for (const file of ["voxel.js","scenery.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),sandbox);
  const s = G.initial();
  enterFight(s,undefined,"gather",1);
  G.step(s); G.step(s);
  let fraction = 0;
  const people = s.trip.unit.map(u=>({...u,sprite:u.id,maxHP:G.stat(G.person(s,u.id),"hp")}));
  const stop = vm.runInContext("GuildScenery",sandbox).mount(canvas,{trip:s.trip,people,url:id=>id,fraction:()=>fraction});
  await Promise.resolve();
  function paint(time) { poses.length=0; labels.length=0; frames.shift()(time); return JSON.stringify([poses,labels]); }
  const rest = paint(0);
  fraction=.5;
  const strike = paint(500);
  assert.notEqual(strike,rest);
  assert.equal(paint(4500),strike);
  assert.ok(labels.some(([label])=>label==="−10"));
  G.setGambits(s,"gald",[rule("heal","mina")]);
  G.step(s); paint(5500);
  assert.ok(labels.some(([label])=>label==="+4"));
  G.step(s); G.reply(s,"med");
  G.setGambits(s,"mina",[rule("heal","self")]);
  G.setGambits(s,"gald",[rule("cover","mina")]);
  G.step(s); G.step(s); paint(6000);
  assert.ok(labels.some(([label])=>label==="かばう"));
  const ready = poses.find(([sprite])=>sprite==="gald");
  G.step(s); paint(6500);
  assert.ok(labels.some(([label])=>label==="かばった"));
  assert.ok(labels.some(([label])=>label==="−20"));
  assert.notDeepEqual(poses.find(([sprite])=>sprite==="gald"),ready);
  stop();
});

test("旧形式の戦闘途中セーブは残敵HPと手番を保ち、返信・戦利品・精算を重複させない", () => {
  const s = G.initial();
  G.depart(s,s,{party:s.party,leader:"mina",policy:"gather",meds:1});
  G.step(s); G.step(s); G.step(s);
  const {order,turn,enemies} = s.trip.fight;
  s.trip.fight = {order,turn,hp:enemies[0].hp};
  delete s.trip.paced;
  const restored = copy(s);
  assert.equal(restored.trip.fight.enemies[0].hp,enemies[0].hp);
  G.reply(restored,"med");
  assert.equal(restored.trip.wins,1);
  G.returnHome(restored);
  assert.deepEqual([restored.history.length,restored.history[0].actual.medicine],[1,30]);
});
test("防御支援は指定した味方の被害を減らし、付与済みなら次の戦術オーダーを実行", () => {
  const s = G.initial();
  G.learnAbility(s,"mina","parry");
  G.setGambits(s,"mina",[rule("parry","leader"),rule("attack","nearest")]);
  enterFight(s,undefined,"gather",1);
  G.step(s);
  const firstHit = s.trip.effects[0].amount;
  G.step(s);
  assert.equal(s.trip.fight.guards.mina,4);
  assert.equal(s.trip.effects[0].kind,"support");
  G.step(s); G.step(s);
  assert.equal(s.trip.effects[0].amount,firstHit-2);
  G.reply(s,"med"); G.step(s);
  assert.equal(s.trip.effects[0].rule,2);
});

test("条件付きでリーダーをかばい、再開後も盾役の防御で1回だけ引き受ける", () => {
  const s = G.initial();
  G.setGambits(s,"gald",[rule("cover","leader","hp","mina",40),rule("attack","nearest")]);
  enterFight(s);
  G.step(s); G.step(s); G.step(s);
  assert.equal(s.trip.effects[0].target,"mina");
  assert.match(s.trip.effects[0].message,/戦術オーダー1「ミナのHPが40％以下」 ガルドがミナをかばう構え/);
  const resume = copy(s);
  for (const state of [s,resume]) {
    G.step(state);
    const [mina,gald] = state.trip.unit;
    assert.deepEqual([mina.hp,gald.hp],[13,35]); // Round two includes Gald's 踏ん張り.
    assert.deepEqual(state.trip.fight.covers,{});
    const {actor,target,protectedId,amount} = state.trip.log.at(-1).combat;
    assert.deepEqual([actor,target,protectedId,amount],["enemy","gald","mina",20]);
    assert.match(state.trip.effects[0].message,/ガルドがミナをかばった。.*ガルドに20ダメージ/);
  }
  assert.deepEqual(resume,s);
});

test("かばう相手は優先順と条件で変わり、自分・不在・行動不能の仲間を飛ばす", () => {
  const s = G.initial();
  for (const target of ["self","gald","nearest"])
    assert.throws(()=>G.setGambits(s,"gald",[rule("cover",target)]));
  enterFight(s,["gald","mina","popo"]);
  const [gald,mina,popo] = s.trip.unit;
  // Start at Gald's turn, with Gald himself lowest in absolute HP.
  s.trip.fight.turn = s.trip.fight.order.indexOf("gald");
  gald.hp = 5; mina.hp = 20; popo.hp = 18;
  const named = rule("cover","mina","hp","mina",50), lowest = rule("cover","lowest");
  function choose(rules) {
    const state = copy(s);
    G.setGambits(state,"gald",rules);
    G.step(state);
    return [state.trip.effects[0].rule,state.trip.effects[0].target];
  }
  assert.deepEqual(choose([named,lowest]),[1,"mina"]);
  assert.deepEqual(choose([lowest,named]),[1,"popo"]);
  mina.hp++;
  assert.deepEqual(choose([named,lowest]),[2,"popo"]);
  popo.state = "down"; popo.hp = 0;
  assert.deepEqual(choose([rule("cover","leader"),rule("cover","popo"),lowest]),[3,"mina"]);
  const solo = G.initial();
  enterFight(solo,["gald"]);
  G.setGambits(solo,"gald",[rule("cover","mina"),lowest,rule("attack","nearest")]);
  G.step(solo); G.step(solo);
  assert.equal(solo.trip.effects[0].rule,3);
});

test("詠唱では構えを消費せず、術の動揺・瀕死・救護はかばった本人に適用する", () => {
  const s = G.initial();
  enterFight(s,undefined,"bold");
  const [mina,gald] = s.trip.unit;
  G.setGambits(s,"mina",[rule("cover","gald")]);
  G.setGambits(s,"gald",[rule("attack","nearest")]);
  // Mina readies cover before the caster. Gald then defeats the boar.
  mina.hp = 10; gald.hp = 5;
  const f = s.trip.fight;
  f.turn = f.order.indexOf("mina");
  f.enemies[0].hp = 1;
  G.step(s); G.step(s);
  assert.equal(s.trip.effects[0].kind,"cast");
  assert.equal(f.covers.mina,"gald");
  G.step(s);
  G.step(s); // Mina renews cover in the next round.
  G.step(s);
  assert.deepEqual([s.trip.effects[0].kind,s.trip.effects[0].target,s.trip.effects[0].protectedId],["skill","mina","gald"]);
  assert.deepEqual([f.shaken,mina.hp,mina.state,gald.hp,s.trip.pending.target],[{mina:true},0,"down",5,"mina"]);
  assert.equal(G.person(s,"mina").deaths,1);
  assert.equal(G.person(s,"gald").deaths,0);
});

test("守る相手への攻撃がなくても、次の手番で構えを解く", () => {
  const s = G.initial();
  enterFight(s);
  G.setGambits(s,"mina",[rule("cover","gald","opening"),rule("heal","self")]);
  G.setGambits(s,"gald",[rule("heal","mina")]);
  s.trip.fight.turn = s.trip.fight.order.indexOf("mina");
  G.step(s); G.step(s); G.step(s);
  assert.equal(s.trip.effects[0].target,"mina"); // The boar attacked the protector directly.
  assert.equal(s.trip.fight.covers.mina,"gald");
  G.step(s);
  assert.equal(s.trip.effects[0].kind,"heal");
  assert.deepEqual(s.trip.fight.covers,{});
});

test("旧セーブの日誌・戦闘表示・帰還記録を新名称に揃え、人物名は保持する", () => {
  const s = G.initial();
  const oldName = "ガンビット";
  G.person(s,"mina").name = oldName;
  G.setGambits(s,"mina",[rule("flee","self")]);
  enterFight(s);
  G.step(s); G.step(s);
  const oldSave = JSON.stringify(s).replaceAll("戦術オーダー",oldName);
  const restored = G.restore(JSON.parse(oldSave));
  assert.equal(G.person(restored,"mina").name,oldName);
  assert.equal(restored.trip.effects[0].message,`戦術オーダー1「いつでも」 ${oldName}が撤退を指示。`);
  assert.equal(restored.history[0].reason,oldName+"の戦術オーダーで撤退");
  for (const log of [restored.trip.log,restored.history[0].log]) {
    assert.equal(log.at(-2).message,restored.trip.effects[0].message);
    assert.ok(log.at(-1).message.startsWith(restored.history[0].reason+"。"));
  }
});
