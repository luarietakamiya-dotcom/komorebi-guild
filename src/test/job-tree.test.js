const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = state => G.restore(JSON.parse(JSON.stringify(state)));
const member = state => G.person(state,"mina");
function take(state,...jobs) {
  for (const job of jobs) G.promote(state,"mina",job);
}

test("4階層44職がすべて到達でき、実効能力・技能・得意分野を持つ", () => {
  const s = G.initial(), p = member(s);
  p.level = 10;
  assert.deepEqual([1,2,3,4].map(tier => G.treeJobs.filter(id => G.jobs[id].tier === tier).length),[9,12,12,11]);
  assert.deepEqual(new Set(G.startingJobs),new Set(G.treeJobs.filter(id => G.jobs[id].tier === 1)));
  // Walk through the actual change action, including jobs requiring two branches.
  for (const tier of [1,2,3,4]) {
    for (const id of G.treeJobs.filter(id => G.jobs[id].tier === tier)) {
      const job = G.jobs[id];
      if (job.from) {
        const parent = job.from.find(from => p.jobHistory.includes(from));
        assert.ok(parent,id);
        if (p.job !== parent) take(s,parent);
      }
      if (p.job !== id) take(s,id);
      assert.equal(p.job,id);
      assert.ok(job.specialty);
      for (const axis of ["hp","atk","def","spd","magic","spirit","dex"]) assert.ok(G.stat(p,axis) > 0);
      assert.ok(job.skills.length && job.skills.every(key => G.abilities[key] && G.learnableSkills(p,s).includes(key)));
    }
  }
  assert.equal(p.jobHistory.length,44);
  assert.deepEqual(reload(s).roster[0].jobHistory,p.jobHistory);
});

test("到達レベル、現在職、複数職の経由を個別に判定し、失敗時は履歴を変えない", () => {
  let s = G.initial(), p = member(s);
  assert.deepEqual(G.promotionStatus(p,"knight").missing,["Lv.2まであと1"]);
  assert.throws(() => take(s,"knight"),/Lv.2まであと1/);
  p.level = 5;
  take(s,"knight","paladin");
  const before = structuredClone(p);
  assert.throws(() => take(s,"hero"),/あと5.*聖騎士以外/);
  assert.throws(() => take(s,"dragonKnight"),/獣使いを経験/);
  assert.throws(() => take(s,"agito"),/忍者/);
  assert.deepEqual(p,before);
  p.level = 10;
  take(s,"hunter","beastmaster","paladin","dragonKnight");
  s = reload(s); p = member(s);
  take(s,"knight","darkKnight","paladin","hero");
  assert.deepEqual(p.jobHistory.filter(id => id === "paladin"),["paladin"]);
  assert.equal(p.job,"hero");
  assert.throws(() => take(s,"overlord"),/固有職/);
  assert.throws(() => take(s,"missing"));
});

test("侍・忍者の直系と剣聖の分岐、転職後のスキル枠を守る", () => {
  const s = G.initial(), p = member(s);
  p.level = 10;
  take(s,"fighter","monk","samurai");
  G.learnAbility(s,p.id,"drawCut");
  assert.throws(() => take(s,"bladeSaint"),/フェンサーを経験/);
  take(s,"magatsu");
  assert.equal(G.jobName(p.job),"禍津刀神");
  assert.throws(() => G.learnAbility(s,p.id,"parry"));
  take(s,"sword","fencer","samurai","bladeSaint","thief","assassin","ninja","agito");
  assert.equal(G.jobName(p.job),"アギト");
  assert.deepEqual(p.skills,["rally","drawCut"]);
  G.learnAbility(s,p.id,"shadowFang");
  assert.ok(G.abilityPower(p,"shadowFang","atk") > 0);
  assert.throws(() => G.learnAbility(s,p.id,"shuriken"));
});

test("旧セーブの職・技・経歴を引き継ぎ、魔術系の二つの上級職を経て大賢者に進める", () => {
  const old = G.initial(), saved = member(old);
  Object.assign(saved,{job:"sage",level:10,skills:["ember","prayer"],career:[
    {week:1,message:"剣士から魔術師に職業を変更。"}, {week:3,message:"魔術師から賢者に転職。"}
  ]});
  delete saved.jobHistory;
  const s = reload(old), p = member(s);
  assert.equal(p.job,"sage");
  assert.deepEqual(p.career,saved.career);
  assert.deepEqual(p.skills,saved.skills);
  assert.deepEqual(p.jobHistory,["sword","mage","sage"]);
  assert.throws(() => take(s,"greatSage"),/大魔導師を経験/);
  take(s,"mage","wizard","archmage","greatSage");
  assert.deepEqual(reload(s).roster[0],p);
});

test("性別で表示名を切り替え、同一職の能力・種族補正・転職履歴を使う", () => {
  for (const [sex,name] of [["female","聖女"],["male","聖人"],["unspecified","聖者"]]) {
    const s = G.initial(), p = member(s);
    Object.assign(p,{sex,species:"elf",age:25,level:5});
    take(s,"healer","cleric","saint");
    assert.equal(G.jobName(p.job,sex),name);
    assert.ok(p.career.at(-1).message.includes(name+"に転職"));
    assert.equal(G.growthRate(p),G.species.elf.learning*1.15);
    assert.deepEqual(p.jobHistory,["sword","healer","cleric","saint"]);
  }
});
