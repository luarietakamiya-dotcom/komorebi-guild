const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");
const waitForGuest = require("./wait-for-guest");
const reload = s => G.restore(JSON.parse(JSON.stringify(s)));

function visit() {
  const s = G.initial();
  s.metrics[0] = 17;
  s.gold = 3000;
  waitForGuest(s,"meniya");
  return s;
}

function join(s) {
  G.depart(s);
  G.step(s);
  G.returnHome(s);
  assert.ok(G.scout(s,"meniya","premium"));
  G.nextWeek(s);
  return G.person(s,"meniya");
}

test("メニーヤは名声と隊の帰還を見て契約し、伝書・加入履歴と固定職を保つ", () => {
  const s = visit(), guest = G.uniqueGuests.meniya;
  s.metrics[0] = 16;
  assert.ok(!guest.meet(s));
  s.metrics[0] = 17;
  assert.ok(guest.meet(s));
  assert.throws(() => G.scout(s,"meniya","premium"),{message:guest.invitation});
  assert.ok(!guest.join({...s,history:[{unit:[{state:"ok"},{state:"down"}]},{unit:[{state:"ok"}]}]}));
  const p = join(s);
  assert.equal(G.jobs[p.job].name,"踊り子");
  assert.equal(p.sex,"female");
  assert.ok(!G.startingJobs.includes(p.job));
  assert.throws(() => G.promote(s,p.id,"fighter"));
  assert.ok(G.stat(p,"spd") > G.stat(p,"atk") && G.stat(p,"dex") > G.stat(p,"def"));
  assert.equal(p.career.find(e => e.firstVisit).message,guest.letter);
  assert.ok(s.morningMail.some(m => m.message === guest.letter));
  assert.ok(p.career.at(-1).message.includes(guest.pledge));
  assert.deepEqual(G.person(reload(s),p.id),p);
  G.retire(s,p.id);
  assert.ok(!reload(s).registry.some(q => q.id === p.id));
});

test("旧セーブに候補を一度だけ補い、進行中の遠征と特別来訪の間隔を保つ", () => {
  const old = G.initial();
  old.registry = old.registry.filter(p => p.id !== "meniya");
  old.uniqueVisitWeeks.goto = old.week;
  G.depart(old);
  G.step(old);
  const s = reload(old);
  assert.deepEqual(reload(s),s);
  assert.deepEqual(s.registry.filter(p => p.id === "meniya").map(p => p.job),["dancer"]);
  s.registry = s.registry.filter(p => p.id !== "meniya");
  assert.deepEqual(s,old);
});

test("霞扇の舞は保存をまたいで狙った敵の次の攻撃だけを弱める", () => {
  const s = visit(), p = join(s);
  G.depart(s,s,{party:[p.id,"gald"],leader:p.id,policy:"bold",meds:0},true);
  G.step(s); G.step(s); G.step(s);
  const foe = s.trip.fight.enemies[0];
  foe.hp = 100;
  G.step(s);
  assert.match(s.trip.log.at(-1).message,/霞扇の舞.*惑わされ/);
  assert.equal(foe.feint,4);
  assert.equal(s.trip.fight.enemies[1].feint,undefined);
  const danced = reload(s), normal = reload(s);
  delete normal.trip.fight.enemies[0].feint;
  for (const state of [danced,normal]) {
    G.step(state);
    assert.equal(state.trip.effects[0].actor,foe.id);
    assert.equal(state.trip.fight.enemies[0].feint,undefined);
  }
  assert.equal(danced.trip.effects[0].amount,normal.trip.effects[0].amount-4);
});

test("街道と広場の最終ラインで扇を使い、迫る敵の反撃を軽減する", () => {
  const base = visit();
  join(base);
  for (const post of ["front","plaza"]) {
    const wounds = [];
    for (const action of ["attack","fanFeint"]) {
      const s = reload(base), p = G.person(s,"meniya");
      G.holdDeparture(s);
      s.raids.warning = {outer:true,routeVersion:2,road:"west",count:1,tier:1,due:1};
      for (const q of G.raidDefenders(s)) G.assignGuard(s,q.id,q.id === p.id ? post : "gate");
      G.setGambits(s,p.id,[{condition:"always",action,target:"nearest"}]);
      G.advanceTime(s,1);
      const raid = s.raids.active, foe = raid.enemies[0];
      foe.step = G.guardPost(raid,p,0).step;
      foe.hp = foe.maxHP = 90;
      G.advanceTime(s,G.raidBeat);
      assert.ok(raid.contributions[p.id].damage > 0);
      if (action === "fanFeint") {
        assert.match(raid.contributions[p.id].lastAction,/霞扇の舞/);
        assert.equal(p.spentMP,2);
        assert.equal(foe.feint,undefined);
      }
      wounds.push(p.missingHP);
    }
    assert.equal(wounds[1],wounds[0]-4);
  }
});

test("誘いの輪舞は味方を指定して次のラウンドの足を速める", () => {
  const s = visit(), p = join(s);
  G.learnAbility(s,p.id,"circleDance");
  G.setGambits(s,p.id,[{condition:"opening",action:"circleDance",target:"gald"}]);
  G.depart(s,s,{party:[p.id,"gald"],leader:p.id,policy:"bold",meds:0},true);
  G.step(s); G.step(s); G.step(s);
  G.step(s);
  const f = s.trip.fight;
  assert.equal(f.haste.gald,G.abilities.circleDance.spd);
  assert.equal(f.haste[p.id],undefined);
  assert.match(s.trip.log.at(-1).message,/誘いの輪舞でガルドの次ラウンドの行動速度が上昇/);
});
