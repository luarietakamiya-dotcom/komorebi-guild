const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Guild = require("../engine.js");
const waitForGuest = require("./wait-for-guest");

const app = ["icons.js", "voxel.js", "voxel-maps.js", "scenery.js", "app.js"].map(file => fs.readFileSync(path.join(__dirname, "..", file), "utf8")).join("\n");

// Run the actual click handlers and save/restore path with a controllable timer.
function openGame(saved, world, media = {}) {
  const timers = new Map(), elements = new Map(), handlers = {};
  let nextId = 0;
  function element(selector) {
    if (selector === "canvas[data-scene]") return null;
    if (!elements.has(selector)) elements.set(selector, { innerHTML: "", focus() {}, append() {}, querySelector() { return null; }, classList: { add() {}, remove() {} } });
    return elements.get(selector);
  }
  const dialogEvents = {};
  Object.assign(element("#dialog"), {
    setAttribute() {}, addEventListener(type, fn) { dialogEvents[type] = fn; },
    showModal() { this.open = true; }, close() { this.open = false; }
  });
  element("#creator").fields = {job:"sword",trait:"bold",tone:"polite"};
  const scenePeople = vm.runInNewContext(app + "\n;({townPeople, expeditionPeople, selected})", {
    Guild, URLSearchParams, performance:world || performance, cancelAnimationFrame() {}, window: { setInterval:world?.setInterval, location: { search: "" }, scrollTo() {} },
    FormData: class extends Map { constructor(form) { super(Object.entries(form.fields)); } },
    Image:media.Image, URL:media.URL,
    document: { body: element("body"), querySelector: element, createElement:media.createElement, addEventListener(type, fn) { handlers[type] = fn; } },
    localStorage: { getItem() { return saved; }, setItem(key, value) { saved = value; } },
    setTimeout(fn, delay) { timers.set(++nextId, { fn, delay }); return nextId; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    click(action, id, party) { handlers.click({ target: { closest: () => ({ dataset: { action, id, party } }) } }); },
    clickDrawerClose() {
      const button = element("#screen").innerHTML.match(/<div class="drawer-bar">[\s\S]*?(<button[^>]*>)/)[1];
      this.click(button.match(/data-action="([^"]+)"/)[1], button.match(/data-id="([^"]+)"/)?.[1]);
    },
    escape() {
      let prevented = false;
      const event = {key:"Escape", preventDefault() { prevented = true; }};
      handlers.keydown(event);
      const dialog = element("#dialog");
      if (dialog.open && !prevented) {
        dialogEvents.cancel(event);
        if (!prevented) { dialog.close(); dialogEvents.close(); }
      }
    },
    element,
    townSprite(id) { return scenePeople.townPeople().find(p => p.id === id)?.sprite; },
    expeditionSprite(id) {
      return scenePeople.expeditionPeople(scenePeople.selected().trip).find(p => p.id === id)?.sprite;
    },
    select(id, value) {
      const el = element("#"+id);
      Object.assign(el,{id,value,dataset:{}});
      handlers.change({target:el});
    },
    assign(id,value) { handlers.change({target:{dataset:{guard:id},value}}); },
    equipDefense(id,option) { handlers.click({target:{closest:()=>({dataset:{action:"equip-defense",id,option}})}}); },
    changeRule(rule, field, value) { handlers.change({target:{dataset:{rule:String(rule),field},value}}); },
    changePick(id, checked) { handlers.change({ target:{dataset:{pick:id}, checked} }); },
    writeNote(note,value) { handlers.input({target:{dataset:{note},value}}); },
    previewAppearance(fields) {
      const form = element("#appearance-editor");
      Object.assign(form,{id:"appearance-editor",fields});
      handlers.change({target:{form}});
      return element("#appearance-preview").innerHTML;
    },
    submitAppearance(fields) { handlers.submit({target:{id:"appearance-editor",fields},preventDefault() {}}); },
    submitCreator(fields) { handlers.submit({target:{id:"creator",fields},preventDefault() {}}); },
    submitNames(fields) { handlers.submit({target:{id:"character-names",fields},preventDefault() {}}); },
    fillProfile(fields) {
      Object.assign(element("#profile-editor"), {id:"profile-editor", fields,
        elements:Object.fromEntries(["policy","ground","ink"].map(key =>
          [key, {set value(value) { fields[key] = value; }}]))});
    },
    emblemColor(field, id) { handlers.click({target:{closest:() => ({dataset:{action:"emblem-color",field,id}})}}); },
    emblemMode(mode) {
      const form = element("#profile-editor");
      form.fields.mode = mode;
      handlers.change({target:{id:"emblem-mode",form}});
    },
    previewEmblem() {
      handlers.input({target:{form:element("#profile-editor"), closest:selector=>selector === ".emblem-controls"}});
      return element("#emblem-preview").innerHTML;
    },
    uploadEmblem(file) { return handlers.change({target:{id:"emblem-file", files:[file], form:element("#profile-editor")}}); },
    submitProfile() { handlers.submit({target:element("#profile-editor"), preventDefault() {}}); },
    tickFirst() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.fn();
    },
    delays() { return Array.from(timers.values(), timer => timer.delay); },
    tick() {
      assert.equal(timers.size, 1);
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.fn();
    },
    state: () => JSON.parse(saved),
    reload: () => openGame(saved,world,media),
    html: selector => element(selector).innerHTML
  };
}

test("出発から採集・帰還まで自動で進み、地図・日誌・保存が更新される", () => {
  const game = openGame();
  assert.match(game.html("#screen"), /chip_town_guild_normal\.webp/);
  assert.deepEqual(game.delays(), []);
  game.click("prepare");
  game.click("depart");
  assert.match(game.html("#screen"), /chip_dun_spring_normal\.webp/);
  assert.deepEqual(game.delays(), [2000]);
  game.tick();
  assert.equal(game.state().trip.cargo.herb, 2);
  assert.match(game.html("#trip-progress"), /現在地：薬草の野原/);
  assert.match(game.html("#trip-progress"), /chip_dun_spring_done\.webp/);
  assert.match(game.html("#trip-progress"), /chip_dun_gather_done\.webp/);
  assert.match(game.html("#trip-progress"), /chip_dun_gather_normal\.webp/);
  assert.match(game.html("#trip-log"), /薬草を2個採集/);
  game.tick();
  game.tick();
  assert.doesNotMatch(game.html("#trip-progress"), /chip_dun_gather_normal\.webp/);
  assert.match(game.html("#trip-progress"), /chip_dun_stairs_done\.webp/);
  assert.match(game.html("#trip-progress"), /chip_dun_chest_normal\.webp/);
  game.tick();
  assert.equal(game.state().phase, "report");
  assert.equal(game.state().history.length, 1);
  assert.deepEqual(game.delays(), []);
  assert.deepEqual(game.reload().delays(), []);
  game.click("next");
  const hall = game.html("#screen");
  for (const name of ["guild", "inn", "plaza", "house"]) {
    assert.ok(hall.includes(`chip_town_${name}_up.webp`));
  }
  assert.match(hall, /chip_town_forge_normal\.webp/);
  const restored = game.state();
  Guild.donate(restored);
  assert.match(openGame(JSON.stringify(restored)).html("#screen"), /chip_town_forge_up\.webp/);
});

test("速度と一時停止を復元し、連続切替・再開でもタイマーは1つ、緊急帰還で解除", () => {
  let game = openGame();
  game.click("prepare");
  game.click("depart");
  for (const delay of [1000, 2000, 1000]) {
    game.click("speed");
    assert.deepEqual(game.delays(), [delay]);
  }
  game.click("pause");
  assert.deepEqual(game.delays(), []);
  game = game.reload();
  assert.deepEqual(game.delays(), []);
  assert.match(game.html("#screen"), /再開/);
  game.click("pause");
  assert.deepEqual(game.delays(), [1000]);
  game.tick();
  game = game.reload();
  game.click("nav", "forge");
  assert.deepEqual(game.delays(), [1000]);
  game.tick();
  assert.equal(game.state().trip.steps, 2);
  game.click("nav", "hall");
  game.click("return");
  assert.equal(game.state().phase, "report");
  assert.deepEqual(game.delays(), []);
});

test("旧版の探索を等速で復元し、分岐と戦闘の着信中は再読込後も止まり、続行の返信で再開", () => {
  const legacy = Guild.initial();
  Guild.configure(legacy, legacy.party, "gald", "gather", 0);
  Guild.depart(legacy);
  let game = openGame(JSON.stringify(legacy));
  assert.deepEqual(game.delays(), [2000]);
  game.click("speed");
  game.tick();
  game.tick();
  for (const [type, reply] of [["fork", "pass"], ["crisis", "carry"]]) {
    assert.equal(game.state().trip.pending.type, type);
    assert.deepEqual(game.delays(), []);
    game = game.reload();
    assert.deepEqual(game.delays(), []);
    const waiting = game.html("#screen");
    assert.ok(waiting.includes(type === "fork" ? "chip_dun_path_normal.webp" : "chip_dun_path_done.webp"));
    assert.match(waiting, /chip_dun_rock_normal\.webp/);
    game.click("reply", reply);
    if (type === "crisis") {
      assert.match(game.html("#screen"), /chip_dun_rock_done\.webp/);
      assert.match(game.html("#screen"), /chip_dun_chest_normal\.webp/);
    }
    assert.deepEqual(game.delays(), [1000]);
    game.tick();
  }
  assert.equal(game.state().trip.wins, 2);
  assert.match(game.html("#trip-progress"), /chip_dun_chest_done\.webp/);
  assert.match(game.reload().html("#screen"), /chip_dun_stairs_done\.webp/);
});

test("旧セーブの街でカタログから建築し、再読込後も建物・効果・所持金を復元", () => {
  const old = Guild.initial();
  delete old.town;
  old.week = 8;
  let game = openGame(JSON.stringify(old));
  game.click("nav","town");
  assert.equal((game.html("#screen").match(/class="plot-marker"/g) || []).length, Guild.plots.length);
  game.click("plot","brook");
  assert.equal((game.html("#dialog-body").match(/data-action="build"/g) || []).length, 10);
  assert.match(game.html("#dialog-body"), /200 G/);
  game.click("build","farm");
  let saved = game.state();
  assert.deepEqual([saved.gold,saved.town.plots.brook,saved.week],[40,"farm",8]);
  assert.match(game.html("#screen"), /小川のほとり、畑、25タイル/);
  game = game.reload();
  game.click("nav","town");
  game.click("plot","brook");
  assert.match(game.html("#dialog-body"), /毎週、食料 ＋25/);
  assert.doesNotMatch(game.html("#dialog-body"), /data-action="build"/);
  game.click("close");
  game.click("plot","square");
  assert.match(game.html("#dialog-body"), /data-id="forge" disabled/);
  game.click("close");
  game.click("nav","hall");
  game.click("work");
  game.click("do-work");
  saved = game.state();
  assert.deepEqual([saved.town.food,saved.gold,saved.week],[25,70,9]);
});

test("起動時は町がホームで、運営の引き出しを開閉しても町が背景に残る", () => {
  const game = openGame();
  const screen = () => game.html("#screen");
  const closed = /<section id="management"[^>]* hidden>/;
  assert.match(screen(), /data-scene="town"/);
  assert.match(screen(), closed);
  assert.doesNotMatch(game.html("#sidebar"), /眺める/);
  for (const [id, name] of Object.entries({hall:"ギルドホール",roster:"冒険者名簿",forge:"町の鍛冶屋",history:"帰還記録"})) {
    game.click("nav",id);
    assert.match(screen(), /data-scene="town"/);
    assert.ok(screen().includes(`id="management" aria-label="${name}"`));
    assert.doesNotMatch(screen(), closed);
    game.click("nav","town");
    assert.match(screen(), closed);
  }
});

test("第2隊の探索から伝書箱を開き、✕・Escで同じ隊の現在地と表示位置に戻る", () => {
  const s = Guild.initial();
  Guild.unlockParty(s);
  Guild.depart(s, s.extraParties[0], {party:["gald"],leader:"gald",policy:"gather",meds:0});
  const game = openGame(JSON.stringify(s));
  game.click("party","2");
  game.element("#management").scrollTop = 480;
  game.click("nav","mail");
  game.tick();
  game.click("nav","mail");
  game.clickDrawerClose();
  const hall = game.html("#screen");
  assert.match(hall, /id="management" aria-label="遠征を見守る"\s*>/);
  assert.match(hall, /第2隊 ・ 苔むす森の洞/);
  assert.equal(game.element("#management").scrollTop,480);
  assert.equal(game.state().extraParties[0].trip.steps,1);

  game.click("nav","roster");
  game.click("help");
  game.escape();
  assert.equal(game.element("#dialog").open,false);
  assert.match(game.html("#screen"), /id="management" aria-label="冒険者名簿"\s*>/);
  game.escape();
  assert.match(game.html("#screen"), /id="management" aria-label="遠征を見守る"\s*>/);
  assert.match(game.html("#screen"), /第2隊 ・ 苔むす森の洞/);
  game.click("plot","brook");
  game.click("close");
  assert.match(game.html("#screen"), /id="management" aria-label="遠征を見守る"\s*>/);
});

test("町からの伝書箱は町へ、商店からの帰還記録は開いていた商店へ戻る", () => {
  const game = openGame();
  const town = /<section id="management"[^>]* hidden>/;
  game.click("nav","mail");
  game.clickDrawerClose();
  assert.match(game.html("#screen"), town);
  game.click("nav","forge");
  game.click("shop-view","tree");
  game.click("nav","history");
  game.escape();
  assert.match(game.html("#screen"), /id="management" aria-label="町の鍛冶屋"\s*>/);
  assert.match(game.html("#screen"), /data-id="tree" aria-pressed="true"/);
  game.click("nav","mail");
  game.click("nav","town");
  game.click("nav","history");
  game.escape();
  assert.match(game.html("#screen"), town);
});

test("伝書箱に割り込んだ他隊の緊急通信に返信しても、元の隊への戻り先を保つ", () => {
  const s = Guild.initial();
  Guild.unlockParty(s);
  Guild.depart(s, s, {party:["mina","popo"],leader:"mina",policy:"gather",meds:0});
  Guild.step(s); Guild.step(s);
  Guild.depart(s, s.extraParties[0], {party:["gald"],leader:"gald",policy:"gather",meds:0});
  const game = openGame(JSON.stringify(s));
  game.click("party","2");
  game.click("nav","mail");
  game.tickFirst();
  assert.match(game.html("#dialog-body"), /第1隊から緊急通信/);
  game.escape();
  assert.equal(game.element("#dialog").open,true);
  game.click("reply","return","1");
  assert.match(game.html("#screen"), /id="management" aria-label="伝書箱"\s*>/);
  assert.equal(game.state().selectedParty,2);
  game.clickDrawerClose();
  assert.match(game.html("#screen"), /id="management" aria-label="遠征を見守る"\s*>/);
  assert.match(game.html("#screen"), /第2隊 ・ 苔むす森の洞/);
});

test("町から2隊を同時出発し、表示切替・一時停止・帰還・再読込が他隊の時計に干渉しない", () => {
  let game = openGame();
  game.click("nav","hall");
  game.click("unlock-party");
  game.click("prepare"); game.changePick("gald",true); game.click("depart");
  game.click("party","1"); game.click("prepare"); game.click("depart");
  assert.deepEqual(game.delays(),[2000,2000]);
  game.click("nav","town");
  assert.match(game.html("#screen"),/町にいる人（2人）/);
  game.click("party","2"); game.click("pause");
  assert.deepEqual(game.delays(),[2000]);
  game.tick();
  assert.equal(game.state().trip.steps,1);
  assert.equal(game.state().extraParties[0].trip.steps,0);
  game = game.reload();
  assert.deepEqual(game.delays(),[2000]);
  assert.match(game.html("#screen"),/第2隊 ・ 苔むす森の洞/);
  game.click("party","1"); game.click("return");
  assert.match(game.html("#screen"),/第1週　第1隊の帰還報告/);
  assert.match(game.html("#screen"),/data-action="next" disabled/);
  game.click("party","2"); game.click("return"); game.click("next");
  assert.equal(game.state().week,2);
  assert.match(game.html("#screen"),/町にいる人（5人）/);
});

test("伝書2件を任意の順で処理し、緊急通信だけが別画面に割り込み全隊を停止する", () => {
  const s = Guild.initial();
  Guild.unlockParty(s);
  const second = s.extraParties[0];
  Guild.depart(s,second,{party:["popo"],leader:"popo",policy:"gather",meds:0});
  Guild.depart(s,s,{party:["gald"],leader:"gald",policy:"gather",meds:0});
  let game = openGame(JSON.stringify(s));
  game.click("nav","forge");
  for (let i=0; i<4; i++) game.tickFirst();
  assert.deepEqual(game.delays(),[]);
  assert.match(game.html("#screen"),/id="management" aria-label="町の鍛冶屋"/);
  game = game.reload();
  game.click("nav","mail");
  assert.match(game.html("#screen"),/第1隊 ・ 分岐の相談/);
  assert.match(game.html("#screen"),/第2隊 ・ 分岐の相談/);
  game.click("reply","pass","2");
  assert.equal(game.state().trip.pending.type,"fork");
  assert.equal(game.state().extraParties[0].trip.route,"pass");
  game.click("reply","grove","1");
  game.click("nav","forge");
  game.tickFirst();
  assert.deepEqual(game.delays(),[]);
  assert.match(game.html("#screen"),/第2隊から緊急通信/);
  assert.equal(game.state().selectedParty,2);
  game = game.reload();
  assert.match(game.html("#screen"),/id="management" aria-label="通信に返信"\s*>/);
  assert.deepEqual(game.delays(),[]);
  game.click("reply","return");
  assert.deepEqual(game.delays(),[2000]);
  game.click("nav","mail");
  assert.match(game.html("#screen"),/返信済み（3件）/);
  game.tick(); game.tick();
  assert.match(game.html("#screen"),/id="management" aria-label="伝書箱"/);
  assert.equal(game.state().history.length,2);
});

test("他隊の緊急通信に返信した後、開いていた出発準備の編成に戻る", () => {
  const s = Guild.initial();
  Guild.unlockParty(s);
  Guild.depart(s,s,{party:["mina","popo"],leader:"mina",policy:"gather",meds:0});
  Guild.step(s); Guild.step(s);
  const game = openGame(JSON.stringify(s));
  game.click("party","2"); game.click("prepare"); game.changePick("gald",true);
  game.tick();
  assert.match(game.html("#dialog-body"),/第1隊から緊急通信/);
  game.click("reply","return","1");
  assert.match(game.html("#dialog-body"),/第2隊の出発準備/);
  assert.match(game.html("#dialog-body"),/data-pick="gald" checked/);
  game.click("depart");
  assert.equal(game.state().extraParties[0].trip.leader,"gald");
  assert.equal(game.state().history[0].partyNumber,1);
});

test("旧セーブの分岐相談を翌週まで保留すると探索が再開し、伝書と帰還記録に判断が残る", () => {
  const s = Guild.initial();
  Guild.configure(s, s.party, "gald", "gather", 0);
  Guild.depart(s); Guild.step(s); Guild.step(s);
  delete s.trip.pending.expiresWeek;
  delete s.trip.log.find(e => e.letter).letter.expiresWeek;
  let game = openGame(JSON.stringify(s));
  game.click("nav", "mail");
  assert.match(game.html("#screen"), /第2週の始めまで/);
  assert.match(game.html("#screen"), /data-action="next"[^>]*>返信せず翌週へ/);
  assert.deepEqual(game.delays(), []);
  game.click("next");
  const resumed = game.state();
  assert.equal(resumed.week, 2);
  assert.equal(resumed.phase, "explore");
  assert.equal(resumed.trip.steps, 2);
  assert.equal(resumed.trip.pending, null);
  assert.equal(resumed.trip.route, "grove");
  assert.match(game.html("#screen"), /第2週[^]*返事がなかったので、ガルドが自分で判断[^]*採集路へ進む/);
  assert.doesNotMatch(game.html("#screen"), /data-action="reply"/);
  game = game.reload();
  assert.deepEqual(game.delays(), [2000]);
  game.tick(); game.tick();
  assert.equal(game.state().history[0].delivered, 0);
  game.click("nav", "history");
  assert.match(game.html("#screen"), /返事がなかったので、ガルドが自分で判断[^<]*木漏れ日の採集路へ/);
  game.click("nav", "mail");
  assert.match(game.html("#screen"), /通信履歴（1件）[^]*採集路へ進む/);
});

test("緊急通信の画面から翌週へ進むと、返信済みの指示を保ち、全隊の待機を解除する", () => {
  const s = Guild.initial();
  Guild.unlockParty(s);
  const second = s.extraParties[0];
  Guild.depart(s, second, {party:["mina","popo"], leader:"mina", policy:"gather", meds:0});
  Guild.depart(s, s, {party:["gald"], leader:"gald", policy:"gather", meds:0});
  Guild.step(s); Guild.step(s); Guild.reply(s, "pass");
  Guild.step(s,second); Guild.step(s,second); Guild.step(s,second);
  const game = openGame(JSON.stringify(s));
  assert.match(game.html("#dialog-body"), /第2週の始めまで[^]*data-action="next"/);
  game.click("next");
  const after = game.state(), t = after.extraParties[0].trip;
  assert.equal(after.trip.route, "pass");
  assert.equal(after.trip.log.find(e => e.letter).letter.decision, undefined);
  assert.equal(t.pending, null);
  assert.equal(t.log.find(e => e.letter).letter.answer, "carry");
  assert.equal(t.wins, 1);
  assert.deepEqual(game.delays(), [2000,2000]);
  game.click("nav", "mail");
  assert.match(game.html("#screen"), /第1週[^]*返信済み ・ 岩場の近道へ/);
  assert.match(game.html("#screen"), /第2週[^]*返事がなかったので、ミナが自分で判断[^]*担いで続行/);
});

test("ホールで保存した名と紋章がヘッダー・隊一覧・探索・伝書と返信記録に反映される", () => {
  let game = openGame();
  game.click("nav","hall");
  game.click("guild-settings");
  assert.match(game.html("#dialog-body"), /安全第一.*深く潜る.*稼ぎ重視/s);
  const emblem = {shape:"banner", symbol:"key", ground:"#345678", ink:"#fedcba"};
  game.fillProfile({name:"灯台＆森", purpose:"<辺境>を照らす", policy:"灯りを運ぶ", ...emblem});
  game.submitProfile();
  assert.match(game.html("#top"), /fill="#345678".*灯台＆森/s);
  assert.match(game.html("#screen"), /&lt;辺境&gt;を照らす.*灯りを運ぶ/s);

  game.click("unlock-party");
  game.click("party-settings");
  game.fillProfile({name:"白夜<隊>", ...emblem, ground:"#465789"});
  game.submitProfile();
  game = game.reload();
  game.click("party","2");
  assert.match(game.html("#screen"), /data-action="party" data-id="2" aria-pressed="true"><strong><svg[^]*?fill="#465789"[^]*?白夜&lt;隊&gt;/);
  const s = game.state(), team = s.extraParties[0];
  Guild.depart(s, team, {party:["gald"], leader:"gald", policy:"gather", meds:0});
  Guild.step(s, team); Guild.step(s, team);
  game = openGame(JSON.stringify(s));
  assert.match(game.html("#screen"), /白夜&lt;隊&gt; ・ 苔むす森の洞/);
  game.click("nav", "mail");
  assert.match(game.html("#screen"), /<h3><svg[^]*?fill="#465789"[^]*?白夜&lt;隊&gt; ・ 分岐の相談/);
  game.click("reply","grove","2");
  assert.match(game.html("#screen"), /返信済み（1件）[^]*?fill="#465789"[^]*?白夜&lt;隊&gt;/);
  assert.equal(game.state().partyProfile.name, "第1隊");
});

test("緊急通信後も編集中の隊と入力内容を保ち、キャンセルすると保存されない", () => {
  const s = Guild.initial();
  Guild.unlockParty(s);
  Guild.depart(s,s,{party:["mina","popo"],leader:"mina",policy:"gather",meds:0});
  Guild.step(s); Guild.step(s);
  const game = openGame(JSON.stringify(s));
  game.click("party","2"); game.click("party-settings");
  game.fillProfile({name:"宵の翼", shape:"banner", symbol:"wing", ground:"#abcdef", ink:"#123456"});
  game.tick();
  assert.match(game.html("#dialog-body"), /第1隊から緊急通信/);
  game.click("reply","return","1");
  assert.match(game.html("#dialog-body"), /第2隊の設定[^]*?宵の翼[^]*?fill="#abcdef"/);
  game.click("close");
  game.click("party-settings");
  assert.doesNotMatch(game.html("#dialog-body"), /宵の翼/);
  assert.equal(game.state().extraParties[0].partyProfile.name, "第2隊");
});

test("方針候補を採用でき、全ての土台・紋様の組み合わせを指定色でプレビューできる", () => {
  const game = openGame();
  game.click("nav","hall"); game.click("guild-settings");
  const fields = {name:"黎明", purpose:"町を結ぶ", policy:"", ground:"#441122", ink:"#efefaa"};
  game.fillProfile(fields);
  game.click("suggest-policy","深く潜る");
  const previews = new Set();
  for (const shape of Object.keys(Guild.emblemShapes)) for (const symbol of Object.keys(Guild.emblemSymbols)) {
    Object.assign(fields, {shape, symbol});
    const svg = game.previewEmblem();
    assert.match(svg, /fill="#441122"/);
    assert.match(svg, /fill="#efefaa"/);
    assert.doesNotMatch(svg, /undefined/);
    previews.add(svg);
  }
  assert.equal(previews.size, Object.keys(Guild.emblemShapes).length * Object.keys(Guild.emblemSymbols).length);
  assert.ok(Object.keys(Guild.emblemShapes).length >= 7);
  assert.ok(Object.keys(Guild.emblemSymbols).length >= 16);
  game.submitProfile();
  assert.equal(game.state().guildProfile.policy, "深く潜る");
});

test("地色と紋様のパレット・各装飾をプレビューし、画像未選択でも組み合わせに戻って保存できる", () => {
  const game = openGame();
  game.click("nav","hall"); game.click("party-settings");
  const form = game.html("#dialog-body");
  for (const field of ["ground","ink"]) assert.equal(form.split(`data-field="${field}"`).length - 1, 12);
  const fields = {name:"星の書庫", shape:"tower", symbol:"book", frame:"line", ground:"#000000", ink:"#000000"};
  game.fillProfile(fields);
  game.emblemColor("ground","#345778"); game.emblemColor("ink","#ca8842");
  assert.match(game.html("#emblem-preview"), /fill="#345778"[^]*fill="#ca8842"/);
  for (const [frame, pattern] of [["line", /scale\(\.85\)/], ["stitches", /stroke-dasharray/], ["sash", /clip-path=/]]) {
    fields.frame = frame;
    assert.match(game.previewEmblem(), pattern);
  }
  fields.frame = "plain";
  assert.doesNotMatch(game.previewEmblem(), /scale\(\.85\)|clip-path=/);
  game.emblemMode("upload");
  assert.equal(game.previewEmblem(),"");
  game.emblemMode("compose"); game.submitProfile();
  assert.deepEqual(game.state().partyProfile.emblem, {shape:"tower", symbol:"book", frame:"plain", ground:"#345778", ink:"#ca8842"});
});

test("画像を中央で切り抜き、枠と組み合わせを保ったままギルド・隊ごとに表示を切り替える", async () => {
  const draws = [], released = [];
  let slowDecode, oversized = false;
  const media = {
    URL:{createObjectURL:file => file.name, revokeObjectURL:url => released.push(url)},
    Image:class {
      naturalWidth = 360;
      naturalHeight = 200;
      decode() {
        if (this.src === "slow") return new Promise(resolve => { slowDecode = resolve; });
        if (this.src === "broken") return Promise.reject(Error());
      }
    },
    createElement:() => ({
      getContext:() => ({drawImage:(source, ...coords) => draws.push(coords)}),
      toDataURL:type => "data:" + type + ";base64," + (oversized && type === "image/webp" ? "A".repeat(40000) : "AAAA")
    })
  };
  let game = openGame(JSON.stringify(Guild.initial()),undefined,media);
  const fields = {name:"月桂の庭", mode:"upload", shape:"laurel", frame:"sash", symbol:"fox", ground:"#345778", ink:"#f4dfa4"};
  game.click("nav","hall"); game.click("guild-settings"); game.fillProfile(fields);
  const pending = game.uploadEmblem({name:"slow",type:"image/jpeg"});
  game.submitProfile();
  assert.equal(game.state().guildProfile.name, "木もれびギルド");
  await game.uploadEmblem({name:"first",type:"image/png"});
  assert.deepEqual(draws.at(-1), [80,0,200,200,0,0,128,128]);
  assert.ok(game.previewEmblem().includes("<image href="));
  await game.uploadEmblem({name:"broken",type:"image/png"});
  assert.ok(game.previewEmblem().includes("<image href="));
  game.submitProfile();
  game.click("party-settings"); game.fillProfile({...fields,name:"山猫隊"});
  oversized = true;
  await game.uploadEmblem({name:"second",type:"image/webp"});
  assert.deepEqual(draws.at(-1), [0,0,64,64]);
  slowDecode(); await pending;
  assert.deepEqual(released, ["first","broken","second","slow"]);
  game.submitProfile();
  game = game.reload();
  const guild = game.state().guildProfile.emblem, party = game.state().partyProfile.emblem;
  assert.equal(guild.mode,"upload");
  assert.ok(guild.image.startsWith("data:image/webp;"));
  assert.ok(party.image.startsWith("data:image/png;"));
  assert.ok(game.html("#top").includes("<image href="));
  game.click("guild-settings"); game.fillProfile({...fields,mode:"compose"}); game.submitProfile();
  game = game.reload();
  assert.ok(!game.html("#top").includes("<image href="));
  const composed = game.state().guildProfile.emblem;
  assert.equal(composed.symbol,"fox");
  assert.equal(composed.frame,"sash");
  assert.ok(composed.image === guild.image);
  game.click("guild-settings"); game.fillProfile(fields);
  assert.ok(game.previewEmblem().includes("<image href="));
  await game.uploadEmblem({name:"discard",type:"image/png"});
  game.click("close");
  assert.ok(game.state().guildProfile.emblem.image === guild.image);
  game.click("guild-settings"); game.fillProfile(fields); game.submitProfile();
  assert.ok(game.reload().html("#top").includes("<image href="));
});

test("町で選んだ専門商店を建築し、ショップ一覧・建物の両方から育成と注文ができる", () => {
  const s = Guild.initial();
  s.stock.herb = 8;
  let game = openGame(JSON.stringify(s));
  game.click("plot","east");
  game.select("build-specialty","alchemy");
  game.click("build","shop");
  game.click("plot","east");
  assert.match(game.html("#screen"), /id="management" aria-label="錬金術師"/);
  game.click("shop-view","tree");
  game.click("learn-skill","boost");
  game.click("shop-view","orders");
  game.select("shop-recipe","elixir");
  game.select("shop-finish","boost");
  game.click("place-order");
  game.click("deliver");
  assert.equal(game.state().supplies.tonic,2);
  assert.equal(game.state().stock.herb,5);
  game = game.reload();
  game.click("nav","shops");
  assert.match(game.html("#screen"), /data-action="open-shop" data-id="east"/);
  game.click("open-shop","east");
  assert.match(game.html("#screen"), /一人前のリゼ/);
  assert.match(game.html("#screen"), /強壮食薬 ×2/);
  game.click("shop-view","tree");
  assert.match(game.html("#screen"), /習得済み/);
});

test("作成時と人物手帳で呼び名を設定し、名簿・町・再開後の手帳に反映する", () => {
  let game = openGame();
  game.click("nav","roster");
  game.click("create");
  assert.match(game.html("#dialog-body"), /name="nickname"[\s\S]*name="epithet"/);
  game.submitCreator({name:"ユキ", nickname:"ゆっきー", epithet:"雪の剣士", job:"sword", trait:"kind", tone:"normal"});
  assert.match(game.html("#screen"), /〈雪の剣士〉ユキ/);
  game.click("character","custom");
  assert.match(game.html("#dialog-body"), /〈雪の剣士〉ユキの人物手帳[\s\S]*value="ゆっきー"/);
  game.submitNames({nickname:" ユキ坊 ", epithet:"蒼の<剣士>"});
  assert.match(game.html("#dialog-body"), /〈蒼の&lt;剣士&gt;〉ユキの人物手帳/);
  game = game.reload();
  assert.match(game.html("#screen"), /<b>ユキ坊<\/b>/);
  game.click("nav","roster");
  assert.match(game.html("#screen"), /<h2>〈蒼の&lt;剣士&gt;〉ユキ<\/h2>/);
  game.click("character","custom");
  assert.match(game.html("#dialog-body"), /value="ユキ坊"/);
  game.submitNames({nickname:"", epithet:" "});
  assert.match(game.html("#screen"), /<h2>ユキ<\/h2>/);
  assert.match(game.html("#dialog-body"), /ユキの人物手帳/);
});

test("緊急通信では仲間を愛称で呼び、返信後も送信時の二つ名で署名する", () => {
  const s = Guild.initial();
  Guild.setCharacterNames(Guild.person(s,"mina"), {epithet:"疾風の剣士"});
  Guild.setCharacterNames(Guild.person(s,"popo"), {nickname:"ぽーちゃん"});
  Guild.depart(s,s,{...s,policy:"gather"});
  Guild.step(s);
  Guild.step(s);
  Guild.step(s);
  const game = openGame(JSON.stringify(s));
  assert.match(game.html("#dialog-body"), /〈疾風の剣士〉ミナ[\s\S]*ぽーちゃんが倒れた/);
  game.click("reply","return");
  game.click("nav","roster");
  game.click("character","mina");
  game.submitNames({nickname:"",epithet:"森の守り手"});
  game.click("close");
  game.click("nav","mail");
  assert.match(game.html("#screen"), /〈疾風の剣士〉ミナ<p>[^<]*ぽーちゃんが倒れた/);
});

test("登録から人物手帳を開き、過去・メモ・能力・技を保存して読み直せる", () => {
  let game = openGame();
  game.click("nav","roster");
  game.click("create");
  assert.match(game.html("#dialog-body"), /name="backstory"/);
  game.select("creator-job","hunter");
  assert.match(game.html("#initial-skill"), /value="aim"/);
  assert.doesNotMatch(game.html("#initial-skill"), /value="slash"/);
  game.submitCreator({name:"ユキ", job:"hunter", trait:"bold", tone:"normal", backstory:"北の出身", initialSkill:"aim"});
  assert.match(game.html("#screen"), /北の出身/);
  game.click("character","custom");
  assert.match(game.html("#dialog-body"), /ユキの人物手帳[\s\S]*北の出身[\s\S]*狙い撃ち/);
  game.writeNote("backstory","<旅人>\n北の出身");
  game.writeNote("memo","次は岩場へ");
  game.click("allocate","atk");
  game.click("learn-ability","scout");
  assert.match(game.html("#character-progress"), /残り 1 pt[\s\S]*先読みを習得/);
  game = game.reload();
  game.click("nav","roster");
  game.click("character","custom");
  assert.match(game.html("#dialog-body"), /&lt;旅人&gt;\n北の出身[\s\S]*次は岩場へ[\s\S]*習得 2 \/ 3 枠/);
  assert.deepEqual(game.state().roster.at(-1).skills,["aim","scout"]);
});

test("ギルド設定で振り直しを切り替え、再読込後も条件が反映される", () => {
  const game = openGame();
  game.click("nav","hall");
  game.click("guild-settings");
  const fields = {name:"木もれび",purpose:"",policy:"安全第一",shape:"shield",symbol:"leaf",ground:"#456449",ink:"#f4dfa4",allowStatReset:"no"};
  game.fillProfile(fields);
  game.submitProfile();
  const resumed = game.reload();
  resumed.click("nav","roster");
  resumed.click("character","mina");
  resumed.click("allocate","hp");
  assert.match(resumed.html("#character-progress"), /ギルド設定で振り直しが無効/);
  resumed.click("reset-allocation");
  assert.equal(resumed.state().roster[0].allocation.hp,1);
  resumed.click("close");
  resumed.click("nav","hall");
  resumed.click("guild-settings");
  resumed.fillProfile({...fields,allowStatReset:"yes"});
  resumed.submitProfile();
  resumed.click("nav","roster");
  resumed.click("character","mina");
  resumed.click("reset-allocation");
  assert.equal(resumed.state().roster[0].allocation.hp,0);
  assert.equal(resumed.state().gold,240-Guild.resetCost);
});

test("町・遠征・戦闘の全体停止、途中再開、戦術オーダーの並べ替えと再読込を画面操作で確認", () => {
  let now = 0, tickWorld;
  const world = {now:()=>now,setInterval(fn) { tickWorld=fn; }};
  let game = openGame(undefined,world);
  now=5000; tickWorld();
  assert.equal(game.state().clock.elapsed,5000);
  game.click("prepare");
  game.changePick("popo",false);
  game.select("policy","gather"); game.click("depart");
  now+=500; game.click("world-pause");
  assert.deepEqual(game.delays(),[]);
  now+=5000; tickWorld();
  assert.equal(game.state().clock.elapsed,5500);

  game.click("nav","roster"); game.click("character","mina"); game.click("gambits","mina");
  game.click("rule-preset","attacker");
  game.changeRule(0,"condition","hp"); game.changeRule(0,"subject","mina");
  game.changeRule(0,"value","60"); game.changeRule(0,"action","heal");
  game.changeRule(0,"target","self");
  game.click("rule-add"); game.click("rule-up","1"); game.click("rule-remove","2");
  assert.match(game.html("#dialog-body"),/2 \/ 10 件/);
  game = game.reload();
  assert.deepEqual(game.state().roster[0].gambits.map(r=>r.action),["attack","heal"]);
  assert.deepEqual(game.delays(),[]);
  game.click("party","1"); game.click("world-pause");
  assert.deepEqual(game.delays(),[1500]);
  game.tick(); game.tick(); game.tick();
  assert.equal(game.state().trip.fight.turn,0);
  game.tick(); // Boar attacks Mina.
  assert.equal(game.state().trip.fight.turn,1);
  game.click("world-pause");
  game.click("gambits","mina"); game.click("rule-down","0");
  game.click("close"); game.click("world-pause");
  game.tick();
  assert.match(game.html("#combat-readout"),/戦術オーダー1.*ミナのHPが60％以下.*手当て/);
  assert.match(game.html("#trip-log"),/戦術オーダー1.*手当て/);
  assert.equal(game.state().trip.unit[0].hp,17);
  game.click("return");
  assert.equal(game.state().history.length,1);
});

test("戦術オーダー画面から盾役を適用し、HPの比較方法と優先順を編集・保存できる", () => {
  const game = openGame();
  game.click("nav","roster"); game.click("character","gald"); game.click("gambits","gald");
  assert.match(game.html("#dialog-body"),/data-id="tank">盾役<\/button>/);
  game.click("rule-preset","tank");
  const rules = () => game.state().roster.find(p => p.id === "gald").gambits;
  assert.deepEqual(rules(),Guild.preset(Guild.person(Guild.initial(),"gald"),"tank"));
  assert.match(game.html("#dialog-body"),/value="ratio" selected>最大HPに対する割合/);
  game.changeRule(0,"hpOrder","amount");
  game.changeRule(0,"value","60");
  game.click("rule-down","0");
  const edited = rules();
  assert.equal(edited[0].target,"leader");
  assert.equal(edited[1].value,60);
  assert.equal(edited[1].hpOrder,undefined);
  const resumed = game.reload();
  resumed.click("nav","roster"); resumed.click("character","gald"); resumed.click("gambits","gald");
  assert.match(resumed.html("#dialog-body"),/value="amount" selected>残りHPの実数/);
  assert.deepEqual(resumed.state().roster.find(p => p.id === "gald").gambits,edited);
});

test("戦術オーダーの画面でかばう条件と優先相手を選び、再読込後も戦闘に反映する", () => {
  let game = openGame();
  game.click("prepare");
  game.changePick("popo",false);
  game.select("policy","gather"); game.click("depart");
  game.click("gambits","gald");
  game.click("rule-add");
  game.changeRule(0,"action","cover");
  const editor = game.html("#dialog-body");
  assert.match(editor,/ガルドの戦術オーダー/);
  const options = editor.match(/data-field="target">([\s\S]*?)<\/select>/)[1];
  assert.match(options,/残HPが最も低い味方/);
  assert.match(options,/リーダー/);
  assert.match(options,/ミナ/);
  assert.doesNotMatch(options,/ガルド|自分/);
  game.click("rule-add");
  game.changeRule(1,"action","cover"); game.changeRule(1,"target","mina");
  game.changeRule(1,"condition","hp"); game.changeRule(1,"subject","mina");
  game.click("rule-up","1");
  game = game.reload();
  game.click("party","1");
  for (let i=0; i<6; i++) game.tick();
  assert.match(game.html("#combat-readout"),/戦術オーダー1「ミナのHPが50％以下」 ガルドがミナをかばう構え/);
  game.tick();
  assert.match(game.html("#combat-readout"),/ガルドがミナをかばった/);
  assert.match(game.html("#trip-log"),/ガルドに20ダメージ/);
});

test("週初めの伝書から出発を見送り、休暇・翌週の自動受注・帰還後の引退を画面で操作できる", () => {
  let now = 0, tickWorld;
  const world = {now:()=>now,setInterval(fn) { tickWorld=fn; }};
  let game = openGame(undefined,world);
  game.click("party","1");
  game.select("morning-priority","ore");
  game.click("nav","mail");
  assert.match(game.html("#screen"),/ミナより「今週は.*洞窟のきらめき鉱石/);
  game.click("hold",undefined,"1");
  game = game.reload();
  now += Guild.departureDelay; tickWorld();
  assert.equal(game.state().phase,"prep");
  game.click("party","1"); game.click("vacation");
  assert.match(game.html("#screen"),/今週は休暇です/);
  game.click("next");
  now += Guild.departureDelay; tickWorld();
  assert.deepEqual([game.state().phase,game.state().trip.quest],["explore","ore"]);
  assert.ok(game.delays().includes(2000));
  game.click("party","1"); game.click("return");
  game.click("nav","roster"); game.click("character","mina"); game.click("retirement");
  assert.match(game.html("#dialog-body"),/引退後の再入団はできません/);
  game.click("retire");
  assert.ok(!game.state().roster.some(p=>p.id==="mina"));
  game = game.reload();
  assert.match(game.html("#screen"),/引退した剣士/);
  game.click("nav","history");
  assert.match(game.html("#screen"),/ミナは冒険者を引退/);
  assert.match(game.html("#screen"),/第2週.*帰還報告/s);
});

test("死亡限界と骨折の復帰週を表示し、消失後も過去の帰還報告と人物履歴を開ける", () => {
  const s = Guild.initial();
  const p = Guild.person(s,"popo");
  p.deaths = 1;
  Guild.depart(s,s,{party:["popo"],leader:"popo",policy:"gather",meds:0});
  Guild.step(s); Guild.step(s); Guild.reply(s,"pass"); Guild.step(s);
  let game = openGame(JSON.stringify(s));
  assert.match(game.html("#dialog-body"),/骨折（第5週復帰）/);
  Guild.reply(s,"return");
  Guild.nextWeek(s);
  while (!Guild.available(s,p)) Guild.nextWeek(s,true);
  game = openGame(JSON.stringify(s));
  game.click("nav","roster");
  assert.match(game.html("#screen"),/死亡 2\/3回（次は永久消失）/);
  Guild.depart(s,s,{party:["popo"],leader:"popo",policy:"gather",meds:0});
  Guild.step(s); Guild.step(s); Guild.reply(s,"pass"); Guild.step(s);
  game = openGame(JSON.stringify(s));
  game.click("nav","history");
  assert.match(game.html("#screen"),/ポポは消失/);
  assert.match(game.html("#screen"),/死亡3回目/);
  assert.match(game.html("#screen"),/永久消失/);
});

test("遊び方から週の長さを変え、一時停止・再開・再読込を経ても週内の進捗を保つ", () => {
  let now = 0, tickWorld;
  const world = {now:()=>now,setInterval(fn) { tickWorld=fn; }};
  let game = openGame(undefined,world);
  assert.match(game.html("#top"),/第1週.*翌週まで 4:00/);
  game.click("help");
  assert.match(game.html("#dialog-body"),/1週間の長さ.*id="week-speed"/);
  now = 6000;
  game.select("week-speed","2");
  assert.deepEqual([game.state().clock.elapsed,game.state().clock.speed],[6000,2]);
  assert.match(game.html("#top"),/翌週まで 1:57/);
  now += 3000; tickWorld();
  assert.equal(game.state().phase,"explore");
  assert.ok(game.delays().includes(2000));
  game.click("world-pause");
  game = game.reload();
  now += 120000; tickWorld();
  assert.equal(game.state().week,1);
  game.click("help"); game.select("week-speed","0.5");
  assert.match(game.html("#top"),/翌週まで 7:36/);
  game.click("close"); game.click("world-pause");
  now += 456000; tickWorld();
  assert.equal(game.state().week,2);
  assert.match(game.html("#top"),/第2週.*翌週まで 8:00/);
});

test("ギルド設定の階級が人物手帳に反映され、一般冒険者を交渉して出発できる", () => {
  const game = openGame();
  game.click("nav","hall");
  game.click("guild-settings");
  game.fillProfile({name:"若葉会",rankNames:"つぼみ\n若葉\n大樹",examFocus:"knowledge",examStrictness:"strict"});
  game.submitProfile();
  game.click("nav","roster");
  game.click("character","mina");
  assert.match(game.html("#dialog-body"),/階級　若葉/);
  assert.match(game.html("#dialog-body"),/知識（習得技の数・最大MPを審査）・ 厳格/);
  game.click("close");
  const id=game.state().visitors[0];
  game.click("guest",id);
  game.click("scout");
  assert.ok(game.state().visitors.includes(id));
  game.select("guest-offer","premium");
  game.click("scout");
  assert.ok(game.state().roster.some(p=>p.id===id));
  const resumed=game.reload();
  resumed.click("nav","hall");
  resumed.click("prepare");
  resumed.changePick("mina",false);
  resumed.changePick("gald",false);
  resumed.changePick("popo",false);
  resumed.changePick(id,true);
  resumed.click("depart");
  assert.equal(resumed.state().trip.leader,id);
  resumed.click("nav","history");
  assert.match(resumed.html("#screen"),/が仲間になった/);
});

test("リィナの来訪伝書から契約し、人物手帳・町・遠征で固有の姿が表示される", () => {
  const s = Guild.initial();
  Guild.depart(s);
  for (let i=0; i<8 && s.phase==="explore"; i++) Guild.step(s);
  s.metrics[0] = 16;
  Guild.nextWeek(s);
  waitForGuest(s,"riina");
  const game = openGame(JSON.stringify(s));
  assert.match(game.html("#screen"),/class="special-visits"[\s\S]*?特別な来訪[\s\S]*?退魔忍リィナ/);
  game.click("nav","mail");
  assert.match(game.html("#screen"),/退魔忍リィナがホールを訪れた/);
  game.click("nav","roster");
  game.click("guest","riina");
  assert.match(game.html("#dialog-body"),/riina\.webp/);
  game.select("guest-offer","premium");
  game.click("scout");
  game.click("character","riina");
  assert.ok(game.html("#dialog-body").includes("破邪の印"));
  assert.ok(game.html("#dialog-body").includes("riina.webp"));
  assert.equal(game.townSprite("riina"),"riina");
  const joined = game.state();
  Guild.configure(joined,["riina"],"riina","safe",0);
  const resumed = openGame(JSON.stringify(joined));
  resumed.click("prepare");
  resumed.click("depart");
  assert.equal(resumed.expeditionSprite("riina"),"riina");
});

test("ユキナの来訪伝書から契約でき、名簿と人物手帳、町と遠征に専用の姿が出る", () => {
  const s = Guild.initial();
  s.metrics[0] = 18;
  s.gold = 3000;
  Guild.build(s,"west","shop","alchemy");
  waitForGuest(s,"yukina");
  const game = openGame(JSON.stringify(s));
  game.click("nav","mail");
  assert.match(game.html("#screen"),/巫女ユキナが薬草を携えて/);
  game.click("nav","roster");
  game.click("guest","yukina");
  assert.match(game.html("#dialog-body"),/yukina\.webp/);
  game.select("guest-offer","premium");
  game.click("scout");
  assert.match(game.html("#screen"),/data-person="yukina"/);
  game.click("character","yukina");
  assert.match(game.html("#dialog-body"),/鈴の祈り/);
  assert.match(game.html("#dialog-body"),/yukina\.webp/);
  assert.equal(game.townSprite("yukina"),"yukina");
  const joined = game.state();
  Guild.configure(joined,["yukina"],"yukina","safe",0);
  const resumed = openGame(JSON.stringify(joined));
  resumed.click("prepare");
  resumed.click("depart");
  assert.equal(resumed.expeditionSprite("yukina"),"yukina");
});

test("第2弾の4人とメニーヤは伝書から契約でき、名簿・人物手帳・町・遠征に専用の姿が出る", () => {
  const s = Guild.initial();
  s.gold = 3000;
  Guild.build(s,"west","inn");
  Guild.depart(s);
  Guild.step(s);
  Guild.returnHome(s);
  s.raids.warning = {outer:true,routeVersion:2,road:"west",count:1,tier:0,due:1};
  Guild.advanceTime(s,1);
  const raid = s.raids.active;
  const guard = Guild.raidDefenders(s)[0];
  raid.enemies[0].step = Guild.guardPost(raid,guard,0).step;
  raid.enemies[0].hp = 1;
  Guild.advanceTime(s,Guild.raidBeat);
  s.metrics[0] = 22;
  s.metrics[3] = 70;
  Guild.nextWeek(s);
  for (const id of ["jobava","tanaka","shiina","goto","meniya"]) {
    waitForGuest(s,id);
    const game = openGame(JSON.stringify(s)), guest = Guild.uniqueGuests[id];
    game.click("nav","mail");
    assert.ok(game.html("#screen").includes(guest.letter));
    game.click("nav","roster");
    game.click("guest",id);
    assert.ok(game.html("#dialog-body").includes(id+".webp"));
    game.select("guest-offer","premium");
    game.click("scout");
    assert.ok(game.html("#screen").includes('data-person="'+id+'"'));
    game.click("character",id);
    assert.ok(game.html("#dialog-body").includes(id+".webp"));
    assert.ok(game.html("#dialog-body").includes(guest.pledge));
    assert.equal(game.townSprite(id),id);
    const joined = game.state();
    Guild.configure(joined,[id],id,"safe",0);
    const resumed = openGame(JSON.stringify(joined));
    resumed.click("prepare");
    resumed.click("depart");
    assert.equal(resumed.expeditionSprite(id),id);
  }
});

test("町と伝書箱に斥候の到着予告が届き、留守番・修理・報告を画面から扱える", t => {
  t.mock.method(Math,"random",()=>.1);
  let now=0, tickWorld;
  const world={now:()=>now,setInterval(fn) { tickWorld=fn; }};
  const s=Guild.initial();
  Guild.build(s,"west","shop","alchemy");
  while (!s.raids.warning) Guild.nextWeek(s,true);
  delete s.raids.warning.routeVersion; s.raids.warning.outer=false; // Pre-expansion save
  let game=openGame(JSON.stringify(s),world);
  game.click("nav","mail");
  assert.match(game.html("#screen"),/斥候からの伝書/);
  assert.match(game.html("#screen"),/西街道.*約3体/);
  game.click("hold",undefined,"1");
  game.click("open-shop","west");
  now=s.raids.warning.due+Guild.raidBeat;
  tickWorld();
  assert.match(game.html("#screen"),/錬金術師 ・ 休業中/);
  assert.match(game.html("#top"),/襲撃中/);
  assert.equal(game.state().phase,"prep");
  game.click("repair","west");
  assert.match(game.html("#screen"),/修理中 ・ あと4週/);
  game=game.reload();
  assert.equal(game.state().town.repairs.west.remaining,4);
  now+=Guild.raidBeat*20;
  tickWorld();
  game.click("nav","history");
  assert.match(game.html("#screen"),/第4週の町の防衛/);
  assert.equal(game.state().raids.reports.length,1);
});

test("町の地図から緊急帰還を指示すると遠征が精算され、次の迎撃に参加する", t => {
  t.mock.method(Math,"random",()=>.1);
  const s=Guild.initial();
  while (!s.raids.warning) Guild.nextWeek(s,true);
  Guild.advanceTime(s,s.raids.warning.due);
  const game=openGame(JSON.stringify(s));
  assert.match(game.html("#screen"),/data-action="raid-recall"/);
  game.click("raid-recall","1");
  assert.equal(game.state().phase,"report");
  assert.match(game.html("#screen"),/町の守り手 ミナ・ガルド・ポポ/);
  assert.match(game.state().history[0].reason,/緊急帰還/);
});

test("ギルド設定の上納率を精算と帰還記録に残し、隊の財布で買った装備を持ち物に表示する", () => {
  let game = openGame();
  game.click("nav","hall"); game.click("guild-settings");
  assert.match(game.html("#dialog-body"), /name="tributeRate"[^>]*min="0" max="50"[^>]*value="25"/);
  game.fillProfile({name:"木もれびギルド",tributeRate:"50"});
  game.submitProfile();
  game = game.reload();
  game.click("prepare");
  game.select("meds","1");
  assert.match(game.html("#dialog-body"), /出発前の見積（合計収支）<\/b><strong>\+44 G<\/strong>/);
  assert.match(game.html("#dialog-body"), /報酬 200 → 上納 100（50%）→ 隊の取り分 100 G/);
  game.click("depart");
  for (let i=0;i<4;i++) game.tick();
  const settled=game.state();
  assert.equal(settled.history[0].actual.tribute,100);
  assert.equal(settled.wallet,40);
  assert.match(game.html("#screen"), /ギルドへ上納（50%）/);
  game.click("nav","shops"); game.click("open-shop","hall");
  game.select("shop-buyer","1");
  game.click("place-order");
  assert.deepEqual([game.state().wallet,game.state().stock.ore],[38,0]);
  assert.equal(game.state().equipment[0].owner,1);
  assert.equal(Guild.guildGold(game.state()),Guild.guildGold(settled));
  game = game.reload();
  game.click("nav","hall");
  assert.match(game.html("#screen"), /旅の小刀[\s\S]*⭐[\s\S]*攻撃\+2/);
  game.click("nav","history");
  assert.match(game.html("#screen"), /上納後の隊の取り分[\s\S]*100 G/);
});

test("帰還報告と履歴に金庫へ戻した余剰金を表示し、旧履歴も開ける", () => {
  const s = Guild.initial();
  s.wallet = 90;
  const game = openGame(JSON.stringify(s));
  game.click("prepare");
  game.select("meds","0");
  game.click("depart");
  for (let i=0;i<4;i++) game.tick();
  const transferRow = /余剰金をギルド金庫へ<\/th><td>—<\/td><td>\+24 G<\/td>/;
  assert.match(game.html("#screen"),/ミナが鍛冶屋に26 Gを支払い「旅の小刀」を装備/);
  assert.match(game.html("#screen"),/ギルド倉庫へ移した素材/);
  assert.match(game.html("#screen"),transferRow);
  const saved = game.state();
  assert.equal(saved.wallet,100);
  Guild.sell(saved,"herb");
  const restored = openGame(JSON.stringify(saved));
  restored.click("nav","history");
  assert.equal(restored.state().wallet,100);
  assert.match(restored.html("#screen"),/隊の装備購入[\s\S]*旅の小刀/);
  assert.match(restored.html("#screen"),transferRow);

  delete saved.history[0].actual.equipmentCost;
  delete saved.history[0].actual.walletSurplus;
  const legacy = openGame(JSON.stringify(saved));
  legacy.click("nav","history");
  assert.match(legacy.html("#screen"),/ギルド・隊の合計収支/);
  assert.doesNotMatch(legacy.html("#screen"),/余剰金をギルド金庫へ|NaN/);
});

test("町とホールの施設一覧に実効値と休止状態、人物手帳に士気倍率を表示する", () => {
  const s = Guild.initial();
  Guild.build(s,"west","tavern");
  Guild.build(s,"east","school");
  s.town.repairs.east = {remaining:0};
  s.roster[0].morale = 70;
  const game = openGame(JSON.stringify(s));
  const [town,hall] = game.html("#screen").split('<section id="management"');
  for (const html of [town,hall]) {
    assert.match(html,/施設一覧と効果/);
    assert.match(html,/西の街道の酒場（食べ物屋）/);
    assert.match(html,/士気 ＋10 \/ 週/);
    assert.match(html,/東の街道の訓練所 ・ 損傷のため効果休止中/);
  }
  game.click("nav","roster");
  game.click("character","mina");
  assert.match(game.html("#dialog-body"),/士気 70 \/ 100（能力 ×1.1）/);
});

test("立体地形の橋詰から塔を建築し、再読込した区画と施設一覧に反映する", () => {
  const s=Guild.initial(); s.gold+=Guild.buildings.bow.cost;
  let game = openGame(JSON.stringify(s));
  assert.match(game.html("#screen"),/data-mode="stack"/);
  game.click("plot","upperBridge");
  assert.match(game.html("#dialog-body"),/上流の橋詰/);
  assert.match(game.html("#dialog-body"),/北の丘道沿い/);
  game.click("build","bow");
  assert.equal(game.state().gold,s.gold-Guild.buildings.bow.cost);
  assert.equal(game.state().town.outerTerritory,true);
  game = game.reload();
  assert.match(game.html("#screen"),/上流の橋詰のバリスタ台/);
  game.click("plot","upperBridge");
  assert.match(game.html("#dialog-body"),/防衛値 ＋6/);
});

test("偉業の内訳と昇格条件をホールで読め、同じ節目が伝書箱と帰還記録に残る", t => {
  t.mock.method(Math,"random",()=>0.1);
  const s = Guild.initial();
  Guild.depart(s);
  while (s.phase==="explore") Guild.step(s);
  Guild.nextWeek(s);
  for (const id of ["mina","gald"]) Guild.takeExam(s,id);
  Guild.depart(s);
  while (s.phase==="explore") Guild.step(s);

  const game = openGame(JSON.stringify(s));
  game.click("nav","hall");
  const hall = game.html("#screen");
  assert.ok(hall.includes("ギルドランクD") && hall.includes("ランクCへの条件"));
  assert.ok(hall.includes("苔むす森の洞を踏破　＋5点") && hall.includes("偉業ポイントの内訳（計16点）"));
  assert.ok(hall.includes("「熟練」以上の所属冒険者　2 / 2人"));
  for (const page of ["mail","history"]) {
    game.click("nav",page);
    assert.equal(game.html("#screen").split("ギルドランクDに昇格！").length-1,1);
  }
});

test("会話頻度は遊び方で変更・復元でき、オフでも遠征の歩調は変わらない", () => {
  const legacy = Guild.initial();
  delete legacy.chatterRate;
  let game = openGame(JSON.stringify(legacy));
  game.click("help");
  assert.match(game.html("#dialog-body"), /option value="quiet" selected>控えめ/);
  for (const rate of ["rare","often","off"]) {
    game.select("chatter-rate",rate);
    game = game.reload();
    game.click("help");
    assert.ok(game.html("#dialog-body").includes('value="'+rate+'" selected'));
  }
  game.click("close"); game.click("prepare"); game.click("depart");
  assert.deepEqual(game.delays(),[2000]);
  game.tick();
  assert.equal(game.state().trip.node,"meadow");
  assert.equal(game.state().trip.pending,null);
});

test("登録票で種族・年齢を選び、人物手帳と引退相談で経験・衰えを確認できる", () => {
  const game = openGame();
  game.click("nav","roster");
  game.click("create");
  assert.match(game.html("#dialog-body"),/name="species"[\s\S]*name="age"/);
  game.select("creator-species","elf");
  game.submitCreator({name:"シラ",job:"mage",species:"elf",age:"190",trait:"kind",tone:"normal",initialSkill:"ember"});
  game.click("character","custom");
  assert.match(game.html("#dialog-body"),/エルフ ・ 190歳[\s\S]*経験値倍率[\s\S]*魔力/);
  game.click("retirement");
  assert.match(game.html("#dialog-body"),/加齢による能力低下はありません/);
  assert.equal(game.reload().state().roster.at(-1).species,"elf");
});

test("人物手帳の贈り物・結婚から町の家系図、成長後の入団まで操作できる", t => {
  t.mock.method(Math,"random",() => 0);
  const s = Guild.initial();
  s.raids.nextWeek = 1000;
  for (let i=0; i<8; i++) {
    Guild.giveGift(s,"mina","gald");
    Guild.nextWeek(s,true);
  }
  let game = openGame(JSON.stringify(s));
  game.click("character","mina");
  assert.match(game.html("#dialog-body"),/好感度と家族[\s\S]*96 \/ 100/);
  game.click("give-gift","gald");
  assert.match(game.html("#character-progress"),/data-action="marry"/);
  game.click("marry","gald");
  game.click("close");
  game.click("nav","roster");
  assert.match(game.html("#screen"),/家系図と町の子供[\s\S]*ミナ と ガルド[\s\S]*週に結婚/);
  game.select("year-length","1");
  game.click("do-work");
  const baby = game.state().children[0];
  assert.match(game.html("#screen"),/幼年期 ・ 0歳/);
  game = game.reload();
  game.click("nav","roster");
  assert.match(game.html("#screen"),/第9週に結婚[\s\S]*幼年期[\s\S]*剣士系の経験値/);
  assert.doesNotMatch(game.html("#screen"),/data-action="enlist-child"/);
  const resumed = Guild.restore(game.state());
  for (let i=0;i<18;i++) Guild.nextWeek(resumed,true);
  game = openGame(JSON.stringify(resumed));
  game.click("nav","roster");
  assert.match(game.html("#screen"),/ギルドに迎える/);
  game.click("enlist-child",baby.id);
  game.click("character",baby.id);
  assert.match(game.html("#dialog-body"),/ミナとガルドの子/);
  assert.match(game.html("#dialog-body"),/家伝の技[\s\S]*通常の空き枠/);
  assert.ok(game.reload().state().roster.some(p=>p.id===baby.id));
});

test("丘の建築・建て替え・治療を画面から操作し、再読込で結果を保持する", () => {
  const s=Guild.initial();
  s.gold=10000; s.roster[0].debuffs={arm:0};
  let game=openGame(JSON.stringify(s));
  game.click("plot","hill");
  const catalog=game.html("#dialog-body");
  for (const b of Object.values(Guild.landmarks)) assert.ok(catalog.includes(b.name));
  game.click("build-landmark","cathedral");
  assert.equal(game.state().gold,s.gold-Guild.landmarkPrice(s));
  game.click("plot","hill");
  assert.ok(game.html("#dialog-body").includes("ミナの治療手帳"));
  game.click("character","mina");
  assert.ok(game.html("#dialog-body").includes("腕の欠損"));
  game.click("cure-debuff","arm");
  assert.deepEqual(game.state().roster[0].debuffs,{});
  game.click("close");
  game.click("plot","hill");
  game.click("build-landmark","castle");
  game=game.reload();
  game.click("plot","hill");
  assert.ok(game.html("#dialog-body").includes("<h3>お城</h3>"));
  assert.equal(game.state().gold,s.gold-Guild.landmarkPrice(s)-Guild.cureCost-Guild.landmarkPrice(game.state()));
});

test("捜索中のタイマーが同じ部屋で再始動し、再読込を越えて救助完了まで進む", () => {
  const s=Guild.initial();
  Guild.depart(s);
  s.trip.rescue={id:"mina",elapsed:0};
  s.trip.unit[0].state="missing";
  let game=openGame(JSON.stringify(s));
  game.tick();
  assert.equal(game.state().trip.rescue.elapsed,1);
  game=game.reload();
  game.tick(); game.tick();
  assert.equal(game.state().phase,"report");
  assert.equal(game.state().history[0].unit[0].injury.kind,"遭難による負傷");
});

test("捕縛の救助要請を画面で受け、途中セーブから派遣と治療を完了できる", t => {
  const s=Guild.initial();
  s.gold=6000;
  s.history.push({dungeon:"moss",cleared:true,path:["gate","home"],log:[]});
  Guild.depart(s,s,{party:["mina"],leader:"mina",dungeon:"canal",policy:"bold",meds:1},true);
  s.trip.unit[0].hp=1;
  t.mock.method(Math,"random",()=>.005);
  let game=openGame(JSON.stringify(s));
  game.tick(); game.tick();
  assert.match(game.html("#screen"),/救助隊を派遣/);
  assert.equal(game.state().trip.rescue.dispatched,false);
  game.click("dispatch-rescue",undefined,"1");
  game.tick();
  game=game.reload();
  game.tick(); game.tick();
  assert.equal(game.state().phase,"report");
  game.click("plot","hill");
  game.click("build-landmark","cathedral");
  game.click("character","mina");
  assert.match(game.html("#dialog-body"),/療養を発症から4週に短縮/);
  game.click("cure-debuff","pregnancy");
  assert.equal(game.state().roster[0].recovery.pregnancy,5);
  const restored=game.reload();
  restored.click("character","mina");
  assert.match(restored.html("#dialog-body"),/大聖堂で治療中/);
});

test("旧セーブの店と修理を残して2軒目を選び、再開後も別店舗として開ける", () => {
  const old = Guild.initial();
  Guild.build(old,"brook","shop","armor");
  old.town.workshops.brook.xp = 2;
  old.town.repairs.brook = {remaining:1,chance:1};
  old.gold = 300;
  let game = openGame(JSON.stringify(old));
  game.click("plot","brook");
  assert.match(game.html("#dialog-body"),/容量 1\/2/);
  const first = game.state().town.workshops.brook;
  game.select("build-specialty","alchemy");
  game.click("build-addition","shop");
  const s = game.state(), second = Guild.plotForSite("brook").sites[1];
  assert.equal(s.gold,225);
  assert.deepEqual(s.town.workshops.brook,first);
  assert.equal(s.town.workshops[second].type,"alchemy");
  game = game.reload();
  game.click("plot","brook");
  const panel = game.html("#dialog-body");
  assert.match(panel,/容量 2\/2/);
  assert.match(panel,/1軒目[\s\S]*修理中[\s\S]*2軒目 ・ 錬金術師/);
  assert.doesNotMatch(panel,/建築カタログ/);
  game.click("open-shop",second);
  assert.match(game.html("#screen"),/小川のほとり（2軒目） ・ 店 Lv.1/);
  assert.equal(Guild.townTotals(game.state().town).income,8);
});

test("防衛専用地で射程を比較して塔を育て、守備配置と迎撃報告を画面から確認する", t=>{
  t.mock.method(Math,"random",()=>.1);
  const s=Guild.initial();
  s.gold=15000;
  while (!s.raids.warning) Guild.nextWeek(s,true);
  let now=0,tick;
  const world={now:()=>now,setInterval(fn){ tick=fn; }};
  let game=openGame(JSON.stringify(s),world);
  game.click("plot","westGate");
  assert.match(game.html("#dialog-body"),/防衛専用地/);
  assert.doesNotMatch(game.html("#dialog-body"),/data-id="farm"/);
  game.select("preview-kind","magic");
  assert.match(game.html("#defense-preview"),/射程 155.*範囲/s);
  game.click("build","watch");
  game.click("plot","westGate");
  game.click("upgrade-defense","westGate");
  game.equipDefense("westGate","fire");
  assert.match(game.html("#dialog-body"),/火矢 ・ 装備中/);
  assert.match(game.html("#dialog-body"),/Lv.2　耐久 22 \/ 22/);
  game.click("close");
  game.assign("mina","front");
  game=game.reload();
  assert.equal(game.state().raids.warning.assignments.mina,"front");
  now=s.raids.warning.due; tick();
  for (let i=0;i<14 && !game.state().raids.active?.contributions.westGate?.damage;i++) {
    now+=Guild.raidBeat; tick();
  }
  assert.match(game.html("#screen"),/西の木戸/);
  const raid=game.state().raids.active;
  assert.ok(raid.contributions.westGate.damage>0);
  now+=40*Guild.raidBeat; tick();
  game.click("nav","history");
  assert.match(game.html("#screen"),/見張り塔<\/b>（西の木戸）.*ダメージ/);
});

test("名簿で選んだ顔を人物手帳で編集し、再読込後は隊長の伝書にも表示する", () => {
  const game = openGame();
  game.click("nav","roster");
  game.click("create");
  for (const field of ["job","sex","hair"]) assert.ok(game.html("#dialog-body").includes('name="'+field+'"'));
  const first = {job:"bard",sex:"male",hair:"gold"};
  game.submitCreator({name:"ノア",trait:"kind",tone:"normal",...first});
  assert.match(game.html("#screen"),/portrait_bard_male_gold\.webp/);
  game.click("character","custom");
  assert.match(game.html("#dialog-body"),/portrait_bard_male_gold\.webp/);
  game.element("#appearance-editor").fields = first;
  game.click("appearance");
  const second = {job:"fighter",sex:"female",hair:"black"};
  assert.match(game.previewAppearance(second),/portrait_fighter_female_black\.webp/);
  game.submitAppearance(second);
  assert.match(game.html("#dialog-body"),/portrait_fighter_female_black\.webp/);
  assert.equal(game.townSprite("custom"),"fighter_female_black");
  const s = game.state();
  Guild.configure(s,["custom"],"custom","safe",0);
  const resumed = openGame(JSON.stringify(s));
  resumed.click("nav","mail");
  assert.match(resumed.html("#screen"),/portrait_fighter_female_black\.webp/);
  resumed.click("prepare");
  resumed.click("depart");
  assert.equal(resumed.expeditionSprite("custom"),"fighter_female_black");
});

test("外周の新築は一軒までで、以前の二軒目は店の成長と修理を保って開ける", () => {
  const saved = Guild.initial();
  Guild.build(saved,"westBend","farm");
  let game = openGame(JSON.stringify(saved));
  game.click("plot","westBend");
  assert.match(game.html("#dialog-body"),/容量 1\/1/);
  assert.doesNotMatch(game.html("#dialog-body"),/建築カタログ/);

  const second = "westBend-2";
  saved.town.plots[second] = "forge";
  saved.town.workshops[second] = {...saved.town.workshops.hall,xp:2};
  saved.town.repairs[second] = {remaining:1,chance:1};
  game = openGame(JSON.stringify(saved));
  game.click("plot","westBend");
  assert.match(game.html("#dialog-body"),/容量 2\/2[\s\S]*2軒目 ・ 鍛冶屋[\s\S]*修理中/);
  assert.doesNotMatch(game.html("#dialog-body"),/建築カタログ/);
  game.click("open-shop",second);
  assert.match(game.html("#screen"),/榛の曲がり角（2軒目）/);
  assert.deepEqual(game.state().town.workshops[second],saved.town.workshops[second]);
});

test("登録票で進路を確認し、人物手帳で分岐を選び、未達条件と復職先を読み直せる", () => {
  const s = Guild.initial();
  Guild.person(s,"mina").level = 2;
  const game = openGame(JSON.stringify(s));
  game.click("nav","roster");
  game.click("create");
  assert.match(game.html("#voice-preview"),/フェンサー（Lv.2）.*ナイト（Lv.2）/);
  game.click("close");
  game.click("character","mina");
  const html = game.html("#dialog-body");
  assert.match(html,/data-action="promote" data-id="knight"/);
  assert.match(html,/聖騎士以外の上級職を1職経験する/);
  game.click("promote","knight");
  assert.equal(game.state().roster[0].job,"knight");
  const reopened = game.reload();
  reopened.click("character","mina");
  assert.match(reopened.html("#dialog-body"),/ナイトから進める職[\s\S]*聖騎士[\s\S]*Lv.5まであと3/);
  reopened.click("promote","sword");
  assert.equal(reopened.state().roster[0].job,"sword");
});

test("聖女から聖人へ外見を編集し、人物手帳・町・遠征で同じ姿を使う", () => {
  const s = Guild.initial();
  Guild.register(s,{name:"ソラ",trait:"kind",tone:"normal",job:"healer",sex:"female",hair:"silver"});
  Guild.person(s,"custom").level = 5;
  Guild.configure(s,["custom"],"custom","safe",0);
  const game = openGame(JSON.stringify(s));
  game.click("character","custom");
  game.click("promote","cleric");
  game.click("promote","saint");
  assert.match(game.html("#dialog-body"),/portrait_saint_female_silver\.webp/);
  assert.equal(game.townSprite("custom"),"saint_female_silver");
  game.element("#appearance-editor").fields = {job:"saint",sex:"female",hair:"silver"};
  game.click("appearance");
  const edited = {job:"saint",sex:"male",hair:"brown"};
  assert.match(game.previewAppearance(edited),/portrait_saint_male_brown\.webp/);
  game.submitAppearance(edited);
  assert.match(game.html("#dialog-body"),/聖人/);
  const resumed = game.reload();
  assert.equal(resumed.townSprite("custom"),"saint_male_brown");
  resumed.click("prepare");
  resumed.click("depart");
  assert.equal(resumed.expeditionSprite("custom"),"saint_male_brown");
});

test("商業カタログで二軒建てし、観光の見込みと確定した税の内訳を読み分けられる", () => {
  const s = Guild.initial();
  s.gold = 2000;
  const game = openGame(JSON.stringify(s));
  for (const [build,kind] of [["build","guide"],["build-addition","souvenir"]]) {
    game.click("plot","brook");
    game.click("plot-catalog","commercial");
    assert.match(game.html("#dialog-body"),/洋服屋/);
    assert.doesNotMatch(game.html("#dialog-body"),/商店の専門/);
    game.click(build,kind);
  }
  assert.match(game.html("#screen"),/今週の税収見込み　35 G/);
  game.click("work");
  game.click("do-work");
  const restored = game.reload();
  restored.click("nav","history");
  assert.match(restored.html("#screen"),/第1週　ギルド金庫 ＋35 G/);
  assert.match(restored.html("#screen"),/観光客 11人 ・ 町内消費税 22 G（1人2 G）・ 土産物税 13 G/);
});
