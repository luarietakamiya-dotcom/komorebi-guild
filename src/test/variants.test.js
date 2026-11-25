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

test("旧セーブの顔・歩行とアップロード画像を保持し、編集・転職後も保存できる", () => {
  const state = G.initial();
  G.register(state,{...profile,job:"sword",sex:"female",portrait:"data:image/png;base64,AA=="});
  const s = reload(state), p = G.person(s,"custom");
  for (const member of [...s.roster,...s.registry,s.candidate]) {
    assert.equal(member.hair,undefined);
    const face = G.jobs[member.job].face;
    assert.deepEqual(G.characterArt(member),{stack:face,portrait:face});
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
  assert.equal(G.characterArt(p).stack,"sword_female_silver");
  assert.throws(() => G.editCustomAppearance(s,{job:"mage",sex:"male",hair:"brown"}));
  G.editCustomAppearance(s,{job:"fencer",sex:"male",hair:"brown"});
  assert.equal(p.useJobPortrait,false);
  assert.equal(p.portrait,uploaded);
  assert.equal(G.characterArt(G.person(reload(s),"custom")).stack,"sword_male_brown");
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
