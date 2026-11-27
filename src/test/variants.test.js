const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createHash} = require("node:crypto");
const G = require("../engine.js");

const assets = path.join(__dirname,"..","assets");
const jobs = ["sword","warrior","thief","healer","mage","fighter","hunter","bard","apothecary"];
const profile = {name:"ソラ",trait:"careful",tone:"normal"};
const reload = state => G.restore(JSON.parse(JSON.stringify(state)));

test("下位9職の登録・編集で同じ外見を選べ、全72組の顔と32層が個別に揃う", () => {
  const edited = G.initial(), faces = new Set(), models = new Set();
  G.register(edited,{...profile,job:"sword"});
  for (const job of jobs) for (const sex of ["male","female"]) for (const hair of ["gold","silver","black","brown"]) {
    const state = G.initial(), choices = {job,sex,hair};
    G.register(state,{...profile,...choices});
    G.editCustomAppearance(edited,choices);
    const key = [job,sex,hair].join("_"), expected = {stack:key,portrait:"portrait_"+key};
    for (const s of [edited,state]) assert.deepEqual(G.characterArt(G.person(reload(s),"custom")),expected);
    const face = fs.readFileSync(path.join(assets,expected.portrait+".webp"));
    faces.add(createHash("sha256").update(face).digest("hex"));
    const layers = path.join(assets,"stack_"+key);
    const files = Array.from({length:32},(_,z) => String(z).padStart(2,"0")+".webp");
    assert.deepEqual(fs.readdirSync(layers).sort(),files);
    const hash = createHash("sha256");
    for (const file of files) {
      const bytes = fs.readFileSync(path.join(layers,file));
      assert.equal(bytes.toString("ascii",8,12),"WEBP");
      hash.update(bytes);
    }
    models.add(hash.digest("hex"));
  }
  assert.equal(faces.size,72);
  assert.equal(models.size,72);
});

test("旧セーブの一般冒険者に髪色を補い、専用絵とアップロード画像を保持して編集・転職できる", () => {
  const state = G.initial();
  G.register(state,{...profile,job:"sword",sex:"female",portrait:"data:image/png;base64,AA=="});
  for (const member of [...state.roster,...state.registry,state.candidate]) delete member.hair;
  const s = reload(state), p = G.person(s,"custom");
  for (const member of [...s.roster,...s.registry,s.candidate]) {
    if (["mina","gald","popo","shion"].includes(member.id) || G.uniqueGuests[member.id]) {
      assert.deepEqual(G.characterArt(member),{stack:member.id,portrait:member.id});
    } else {
      assert.ok(Object.hasOwn(G.hairColors,member.hair));
      const job = member.job === "guard" ? "knight" : member.job;
      const stack = [job,member.sex,member.hair].join("_");
      assert.deepEqual(G.characterArt(member),{stack,portrait:"portrait_"+stack});
    }
  }
  const uploaded = p.portrait;
  G.editCustomAppearance(s,{job:"sword",sex:"female",hair:"silver",useJobPortrait:true});
  assert.equal(p.portrait,uploaded);
  assert.equal(p.useJobPortrait,true);
  const before = structuredClone(p);
  assert.throws(() => G.editCustomAppearance(s,{job:"fighter",sex:"male",hair:"unknown"}));
  assert.deepEqual(p,before);
  p.level = G.promotionLevel;
  G.promote(s,"custom");
  assert.equal(G.characterArt(p).stack,"fencer_female_silver");
  assert.throws(() => G.editCustomAppearance(s,{job:"mage",sex:"male",hair:"brown"}));
  G.editCustomAppearance(s,{job:"fencer",sex:"male",hair:"brown"});
  assert.equal(p.useJobPortrait,false);
  assert.equal(p.portrait,uploaded);
  assert.equal(G.characterArt(G.person(reload(s),"custom")).stack,"fencer_male_brown");
});

test("外見プレビューと歩行描画が同じ断面を足元から32枚積み、髪色を切り替えられる", async () => {
  const vm = require("node:vm"), painted = [];
  const ctx = new Proxy({drawImage(image) { if (image.src) painted.push(image.src); }},
    {get:(target,key) => target[key] ?? (()=>{})});
  const canvas = {getContext:()=>ctx, isConnected:true};
  class Picture {
    constructor() { this.complete = true; this.naturalWidth = 32; }
    async decode() { assert.ok(fs.existsSync(path.join(assets,this.src+".webp"))); }
  }
  const stacks = vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","stacks.js"),"utf8")+"\nGuildStacks",
    {Image:Picture,document:{createElement:()=>({getContext:()=>ctx})}});
  for (const hair of ["black","silver"]) {
    const {stack} = G.characterArt({job:"hunter",sex:"female",hair});
    const expected = Array.from({length:32},(_,i) => "stack_"+stack+"/"+String(i).padStart(2,"0"));
    await stacks.preview(canvas,stack,id=>id);
    assert.deepEqual(painted.splice(0),expected);
    stacks.draw(ctx,stack,id=>id,80,54,1,Math.PI,{bob:2,tilt:.04});
    assert.deepEqual(painted.splice(0),expected);
  }
});

test("転職と復元を通じて44職×男女×4色の顔絵・32層モデルを切り替える", () => {
  const faces = new Set(), stacks = new Set();
  for (const sex of ["female","male"]) for (const hair of Object.keys(G.hairColors)) {
    const s = G.initial();
    G.register(s,{...profile,job:"sword",sex,hair});
    const p = G.person(s,"custom");
    p.level = 10;
    for (const tier of [1,2,3,4]) for (const id of G.treeJobs.filter(id => G.jobs[id].tier === tier)) {
      const from = G.jobs[id].from?.find(parent => p.jobHistory.includes(parent));
      if (from && from !== p.job) G.promote(s,p.id,from);
      if (p.job !== id) G.promote(s,p.id,id);
      const key = [id,sex,hair].join("_"), face = "portrait_"+key;
      for (const member of [p,G.person(reload(s),p.id)])
        assert.deepEqual(G.characterArt(member),{stack:key,portrait:face});
      const image = fs.readFileSync(path.join(assets,face+".webp"));
      assert.equal(image.toString("ascii",8,12),"WEBP");
      faces.add(createHash("sha256").update(image).digest("hex"));
      const dir = path.join(assets,"stack_"+key);
      const files = Array.from({length:32},(_,z) => String(z).padStart(2,"0")+".webp");
      assert.deepEqual(fs.readdirSync(dir).sort(),files);
      const hash = createHash("sha256");
      for (const name of files) {
        const bytes = fs.readFileSync(path.join(dir,name));
        assert.equal(bytes.toString("ascii",8,12),"WEBP");
        hash.update(bytes);
      }
      stacks.add(hash.digest("hex"));
    }
  }
  assert.equal(faces.size,352);
  assert.equal(stacks.size,352);
});

test("一般来訪者と子供の生成・移行で有効な外見を持ち、他の人物データと既存の選択を保つ", () => {
  const s = G.initial();
  const guests = s.registry.filter(p => !G.uniqueGuests[p.id]);
  const child = G.welcomeChild(s,"mina","gald","ハル");
  for (const p of [...guests,child]) {
    assert.ok(["male","female"].includes(p.sex));
    assert.ok(Object.hasOwn(G.hairColors,p.hair));
  }
  assert.deepEqual(new Set(guests.map(p => p.hair)),new Set(Object.keys(G.hairColors)));
  const retired = guests[1];
  s.registry = s.registry.filter(p => p !== retired);
  Object.assign(retired,{departure:{kind:"retired",week:1},retiredWeek:1,hair:"blue"});
  s.alumni.push(retired);
  Object.assign(guests[0],{hair:"silver",sex:"unspecified"});
  delete child.hair;
  delete child.sex;
  const before = structuredClone([retired,guests[0],child]);
  const saved = reload(s);
  const recovered = [saved.alumni[0],saved.registry.find(p => p.id === guests[0].id),saved.children[0]];
  for (const [i,p] of recovered.entries()) {
    const {sex,hair} = p;
    assert.deepEqual(p,{...before[i],sex,hair});
    assert.ok(["male","female"].includes(sex));
    assert.ok(Object.hasOwn(G.hairColors,hair));
    const job = p.job === "guard" ? "knight" : p.job;
    const stack = [job,sex,hair].join("_");
    assert.deepEqual(G.characterArt(p),{stack,portrait:"portrait_"+stack});
  }
  assert.equal(recovered[0].sex,retired.sex);
  assert.equal(recovered[1].hair,"silver");
  assert.deepEqual(reload(saved),saved);
});
