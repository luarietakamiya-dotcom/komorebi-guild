"use strict";
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const storageKey = "komorebi-guild-v1";
const params = new URLSearchParams(window.location.search);
const demo = params.get("view") === "dungeon" && params.get("demo") === "1";
const stackDemo = params.get("view") === "stack" && params.get("demo") === "1";
let saveWarning = "", state = Guild.initial();
try {
  const saved = !demo && !stackDemo && localStorage.getItem(storageKey);
  if (saved) state = Guild.restore(JSON.parse(saved));
} catch { saveWarning = "保存を利用できないため、この画面で続けます。"; }
let page = demo ? "hall" : "town", modal = "", draft = null, customImage = "", imageBusy = false, imageTicket = 0;
const panes = { town: ["home","町の風景"], hall: ["scroll","ギルドホール"], roster: ["team","冒険者名簿"], shops: ["hammer","町のショップ"], mail: ["mail","伝書箱"], history: ["book","帰還記録"] };
const labels = ["実力","信用","生存率","満足度"];
const names = { ok: "無事", down: "戦闘不能", severe: "重傷", lost:"消失", missing:"行方不明", captured:"捕縛", resting:"療養中" };
const money = n => `${n.toLocaleString("ja-JP")} <small>G</small>`;
const signed = n => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
const g = Guild;
const teams = () => g.parties(state);
const selected = () => teams()[state.selectedParty - 1];
const teamName = team => esc(team.partyProfile.name);
const teamBadge = team => drawEmblem(team.partyProfile.emblem) + teamName(team);
const urgent = () => g.emergencyParty(state);
const who = id => g.knownPerson(state, id);
const assetUrl = id => `assets/${id}.webp`;
const asset = (id, cls = "", alt = "") => `<img src="${assetUrl(id)}" class="${cls}" alt="${esc(alt)}">`;
const portrait = (p, cls = "") => `<img class="avatar ${cls}" alt="${esc(p.name)}" src="${esc(p.portrait || assetUrl(g.jobs[p.job].face))}">`;
const action = (id, label, cls = "btn", attrs = "") => `<button type="button" class="${cls}" data-action="${id}" ${attrs}>${label}</button>`;
const tag = (txt, cls = "") => `<span class="tag ${cls}">${txt}</span>`;
const title = (symbol, txt, end = "") => `<div class="section-title"><h2>${icon(symbol,23)}${txt}</h2>${end}</div>`;
const cap = (txt, cls = "") => `<span class="caption ${cls}">${txt}</span>`;
function save() {
  if (demo) return;
  rememberProgress();
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { saveWarning = "ブラウザに保存できません。この画面を開いたまま遊んでください。"; }
}
let toastTimer;
function toast(message) {
  const host = $("#dialog").open ? $("#dialog") : document.body;
  host.append($("#toast"));
  $("#toast").textContent = message; $("#toast").classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 3200);
}
function hallLabel() {
  if (selected().phase === "explore") return selected().trip.pending ? "通信に返信" : "遠征を見守る";
  return selected().phase === "report" ? "帰還報告" : "ギルドホール";
}
function sidebar() {
  $("#sidebar").innerHTML = `<nav aria-label="ギルド運営">${Object.entries(panes).map(([id,[sym,name]]) =>
    action("nav",`${icon(sym,20)}<span>${name}${id === "mail" && waitingLetters().length ? " ("+waitingLetters().length+")" : ""}</span>`,"nav-btn"+(id===page?" active":""),
      `data-id="${id}" ${id===page?'aria-current="page"':""}`)).join("")}</nav>`;
}
function clockText() {
  const seconds = Math.ceil((g.weekMillis - state.clock.elapsed) / (1000 * state.clock.speed));
  return "翌週まで " + Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2,"0");
}
function weekSpeedControl() {
  const options = g.weekSpeeds.map(speed =>
    `<option value="${speed}" ${state.clock.speed === speed ? "selected" : ""}>${g.weekMillis / (60000 * speed)}分${speed === 1 ? "（標準）" : ""}</option>`);
  return `<label>1週間の長さ <select id="week-speed">${options.join("")}</select></label>`;
}
function chatterControl() {
  const options = Object.entries(g.chatterRates).map(([id,rate]) =>
    `<option value="${id}" ${id === state.chatterRate ? "selected" : ""}>${rate.name}</option>`);
  return `<label>町・遠征の会話吹き出し <select id="chatter-rate">${options.join("")}</select></label>`;
}
function worldPauseButton() {
  return action("world-pause",state.clock.paused ? "全体を再開" : "全体を一時停止","btn",
    `aria-pressed="${state.clock.paused}"`);
}
function topbar() {
  const profile = state.guildProfile;
  document.title = profile.name + " ｜ ギルド運営手帳";
  $("#top").innerHTML = `<div class="village-title">${drawEmblem(profile.emblem)}<div><small>${esc(profile.name)} ・ ギルドランク${g.guildStanding(state).grade}</small><h1>木もれびの里</h1>${state.raids.active || state.raids.warning ? action("nav",state.raids.active ? "襲撃中 ・ 町を見守る" : "襲撃予告 ・ 町で確認","text-btn",'data-id="town"') : ""}</div></div>
    <div class="balances">${action("help",icon("help",17),"icon-btn",'aria-label="遊び方"')}<span class="date">${icon("sun",18)} ${1+g.ageYears(g.calendarDate(state))}年目・第${state.week}週 <i></i><span id="world-time">${clockText()}</span></span>${worldPauseButton()}<span class="balance">ギルド金庫 ${icon("coin",20)}${money(g.guildGold(state))}</span></div>`;
}
function questCard(id) {
  const q = g.quests[id], chosen = selected().quest === id, taken = g.claimed(state, id, selected());
  const locked = selected().party.length && !g.partyQualifies(state,selected().party,q.rank);
  return `<button type="button" class="quest ${chosen ? "selected" : ""}" data-action="quest" data-id="${id}" aria-pressed="${chosen}" ${taken || locked?"disabled":""}>
    <span class="item-art ${q.item}">${asset(q.item)}</span>
    <span class="quest-body"><span class="quest-label">${tag(q.item === "herb" ? "採集依頼" : id === "order" ? "特別注文" : "探索依頼",q.item === "herb"?"mint":"lavender")}<span class="stars" aria-label="難度">${q.risk==="低"?"★":id==="order"?"★★★":"★★"}</span></span>
    <strong>${q.name}${taken?"（受注済み）":""}</strong><span class="quest-desc">${q.note} 必要階級：${esc(g.rankLabel(state,q.rank))}${locked?"（編成の階級不足）":""}</span></span>
    <span class="selection">${chosen ? icon("check",13) : ""}</span>
    <span class="quest-meta"><span>${icon(q.item==="herb"?"leaf":"gem",15)}${g.items[q.item].name} ×${q.count}</span><span>${icon("clock",15)}今週中</span><span class="${q.risk==="低"?"calm":"risk"}">${icon("shield",15)}危険度 ${q.risk}</span><b>${icon("coin",17)}${money(q.reward)}</b></span></button>`;
}
function board() {
  const list = g.postedQuests(state);
  return `<section class="board">${title("scroll","ギルドホール",cap(list.length+" 件の依頼"))}
    <div class="quests">${list.map(questCard).join("")}</div></section>`;
}
const moraleText = p => `士気 ${p.morale} / 100（能力 ×${g.moraleMultiplier(p).toFixed(1)}）`;
function partyRow(id, u) {
  const p = who(id), max = g.outfittedStat(state,p, "hp"), leader = (selected().trip?.leader || selected().leader) === id;
  const hp = u?.hp ?? g.currentHP(state,p);
  return `<div class="party-row">${portrait(p, "face-"+p.job)}<div class="member"><div class="name-line"><b>${esc(p.name)}</b>${leader?tag(icon("crown",11)+"リーダー","gold"):""}<small>Lv.${p.level}</small></div>
    <p>${g.jobs[p.job].name}<i>・</i>${g.traits[p.trait]}${u && u.state!=="ok"?" ・"+names[u.state]:""}${selected().trip?.fight?.shaken[id] ? " ・動揺" : ""}</p>
    <div class="hp"><i><em style="width:${100*hp/max}%"></em></i><small>HP ${hp}/${max}</small></div><small>MP ${u?.mp ?? g.currentMP(p)}/${g.maxMP(p)} ・ ${lifeStatus(p)}<br>${moraleText(p)}</small>${action("gambits","戦術オーダー","text-btn",`data-id="${id}" aria-label="${esc(p.name)}の戦術オーダーを編集"`)}</div></div>`;
}
function partyPanel() {
  const preparing = selected().phase === "prep", t = selected().trip, party = preparing ? selected().party : t.unit.map(u=>u.id);
  return `<section class="panel party-panel"><div class="panel-heading"><h2>${icon("team",22)}遠征パーティー</h2>${cap(party.length+" / 3")}</div>
   <div class="party-members">${party.map(id=>partyRow(id, preparing?null:t.unit.find(u=>u.id===id))).join("") || '<p class="muted">冒険者を編成してください。</p>'}</div>
   <div class="party-bottom"><div class="policy-line"><span>${icon("flag",16)}探索方針</span><b>${g.policies[selected().policy]}</b></div>
   ${preparing?action("prepare",`${icon("pack",18)} 出発準備へ ${icon("arrow",17)}`,"primary wide"):action("nav",icon("team",17)+" 名簿を見る","btn wide",'data-id="roster"')}${preparing&&!who("shion")?action("nav","雇用候補：狩人シオン "+icon("chevron",12),"text-btn roster-link",'data-id="roster"'):""}</div></section>`;
}
function townSnippet() {
  const facilities = [["guild","ギルド"],["forge","鍛冶屋"],["inn","宿屋"],["plaza","広場"],["house","民家"]];
  const chips = facilities.map(([id, name]) => {
    const up = id === "forge" ? state.research : state.unlocked;
    return `<figure>${asset(`chip_town_${id}_${up ? "up" : "normal"}`, "", up ? "発展後" : "通常")}<figcaption>${name}</figcaption></figure>`;
  }).join("");
  return `<section class="town-panel"><div class="toto-art">${asset("toto","","鍛冶見習いトトが金床で槌を振るう")}</div><div class="town-copy"><span class="small-kicker">${icon("hammer",14)} 町のたより</span><h3>${state.research?"トトの新作が完成！":"トトの鍛冶工房"}</h3><p>${state.research?"「鉱石のおかげで、いい刃が打てたよ！」":"「鉱石がひとつあれば、新しい刃を打てるよ！」"}</p>${action("nav","工房をのぞく "+icon("arrow",14),"text-btn",'data-id="forge"')}</div>
    <div class="town-chips">${chips}</div></section>`;
}
function metricsPanel() {
  const {grade,points,members,minimum,bonus,score,next} = g.guildStanding(state);
  const rank = esc(g.rankLabel(state,g.seniorRank));
  const feats = state.guildProgress.feats;
  const progress = next ? `<h3>ランク${next.name}への条件</h3>
    <ul><li>偉業ポイント　${points} / ${next.points}点</li><li>「${rank}」以上の所属冒険者　${members} / ${next.members}人</li>
    <li>ギルド評価　${score} / ${next.score}</li></ul><p>昇格で掲示される依頼「${g.quests[next.quest].name}」</p>` :
    `<p>目標のランクCに到達しました。「${rank}」以上の所属冒険者は${members}人です。</p>`;
  return `<section class="panel padded metrics-panel">${title("chart","ギルドランク"+grade)}
    <div class="metric-mini">${labels.map((label,i)=>`<div><small>${label}</small><b>${state.metrics[i]}</b></div>`).join("")}</div>
    ${progress}<p class="fine">ギルド評価 ${score}（上限100）。4指標の最低値 ${minimum} に実績加点 ${bonus} を加算。偉業1点につき＋1（最大20）、上位階級の所属1人につき＋4（最大8）。</p>
    <details id="guild-feats"><summary>偉業ポイントの内訳（計${points}点）</summary>${feats.length ?
      `<ul class="logs">${feats.map(e=>`<li><small>第${e.week}週</small>${esc(e.message)}　＋${e.points}点</li>`).join("")}</ul>` :
      "<p>踏破、ボス討伐、襲撃の撃退、ヌシ討伐、昇級試験の合格がここに記録されます。</p>"}</details></section>`;
}
function guildCharter() {
  const { name, purpose, policy, emblem } = state.guildProfile;
  return `<section class="guild-charter"><div class="charter-sign">${drawEmblem(emblem)}<h2>${esc(name)}</h2></div>
    ${action("guild-settings", icon("edit",15)+" ギルド設定", "btn")}
    <dl><div><dt>目的</dt><dd>${esc(purpose) || "未設定"}</dd></div><div><dt>方針</dt><dd>${esc(policy) || "未設定"}</dd></div></dl></section>`;
}
function partyBoard(inHall) {
  const cards = teams().map((team, index) => {
    const status = team.leaveWeek === state.week ? "休暇中" : team.phase === "prep" ? "出発前" : team.phase === "report" ? "帰還済み" :
      team.trip.pending?.type === "crisis" ? "緊急通信" : team.trip.pending ? "伝書・返信待ち" :
      team.trip.rescue ? rescueStatus(team.trip) : team.trip.paused ? "一時停止" : "遠征中";
    return action("party", `<strong>${teamBadge(team)}</strong><span>${status} ・ ${team.wallet} G</span><small>${team.party.map(id => esc(who(id).name)).join("・") || "未編成"}</small>`,
      "team-card", `data-id="${index+1}" aria-pressed="${inHall && team === selected()}"`);
  }).join("");
  const price = g.unlockCost(state);
  const unlock = inHall && teams().length < g.maxParties ? action("unlock-party",
    `第${teams().length+1}隊を開設 ・ ${price} G`, "btn", g.guildGold(state) < price ? "disabled" : "") : "";
  const settings = inHall ? action("party-settings", icon("edit",15)+" 選択中の隊の設定", "btn") : "";
  return `<section class="team-board"><div class="section-title"><h2>${icon("team",20)}${inHall?"遠征パーティー":"今週の出発・帰還"}</h2><div class="actions">${settings}${unlock}</div></div><div class="team-list">${cards}</div>${teams().map(rescueNotice).join("")}${inHall ? partyInventory() + morningControls() : morningLetters(true)}${!inHall && waitingLetters().length ? waitUntilNextWeek() : ""}</section>`;
}
function morningControls() {
  const team = selected(), resting = team.leaveWeek === state.week;
  const plan = g.morningPlans(state).find(p => p.team === team);
  const options = Object.entries(g.priorities).map(([id,name]) =>
    `<option value="${id}" ${team.priority === id ? "selected" : ""}>${name}</option>`).join("");
  return `<div class="morning-orders"><label>今週の依頼で優先するもの <select id="morning-priority">${options}</select></label>
    ${team.phase === "prep" && team.party.length && !resting ? action("vacation","今週は隊を休ませる") : ""}
    ${resting && !g.anyAway(state) ? action("next","休暇を終えて翌週へ") : ""}
    ${plan ? `<p>${esc(plan.message)} ${action("hold","今週の自動判断を止める","text-btn",`data-party="${state.selectedParty}"`)}</p>` : ""}</div>`;
}
function morningLetters(thisWeekOnly) {
  const plans = g.morningPlans(state);
  const notices = state.morningMail.filter(n => !thisWeekOnly || n.week === state.week);
  if (!plans.length && !notices.length) return "";
  return `<section class="morning-mail"><h3>${icon("mail",17)} 週初めの伝書</h3>${plans.map(({team,message}) =>
    `<p><b>${teamName(team)}</b>　${esc(message)} ${action("hold","今週の自動判断を止める","text-btn",`data-party="${g.partyNumber(state,team)}"`)}</p>`).join("")}
    ${plans.length ? '<small>週初めの支度は標準で12秒です。判断を止めると、その週は手動で指示できます。</small>' : ""}
    ${notices.map(n => `<p><small>第${n.week}週 ・ ${teamName(teams()[n.partyNumber-1])}</small>　${esc(n.message)}</p>`).join("")}</section>`;
}
function lifeStatus(p) {
  return `死亡 ${p.deaths}/${g.deathThreshold(state)}回` + (p.deaths >= g.deathThreshold(state)-1 ? "（次は永久消失）" : "") +
    (p.injury ? ` ・ ${esc(p.injury.kind)}（第${p.readyWeek}週復帰）` : "") +
    (p.recovery?.pregnancy ? ` ・ 妊娠療養（第${p.recovery.pregnancy}週復帰）` : "");
}
function assignmentHint(p) {
  const owner = teams().find(team => team.party.includes(p.id));
  if (owner?.phase === "explore") return " ・ "+teamName(owner)+"が遠征中";
  if (p.leaveWeek === state.week) return " ・ 今週は休暇";
  if (!g.available(state,p)) return " ・ 第"+g.fitWeek(p)+"週に復帰";
  return owner && owner !== selected() ? " ・ "+teamName(owner)+"から移籍" : "";
}
const waitingLetters = () => teams().filter(team => team.phase === "explore" && team.trip.pending);
const waitUntilNextWeek = () => `<p class="fine">翌週になると、今週受注したすべての依頼が納品期限を過ぎます。</p>` + action("next","返信せず翌週へ","btn");
const deadlineText = c => `第${c.expiresWeek}週の始めまでに返事がなければ、リーダーが判断します。`;
const choiceLabel = (id, trip) => choiceText[id] ?? g.tripRooms(trip)[id].name + "へ進む";
function mailbox() {
  const pending = waitingLetters().map(team => {
    const t = team.trip, c = t.pending, sender = who(t.leader);
    const reply = g.choices(state,team).map(id => action("reply",choiceLabel(id,t),"btn",
      `data-party="${g.partyNumber(state,team)}" data-id="${id}"`)).join("");
    return `<article class="comms ${c.priority === "urgent" ? "urgent" : ""}"><h3>${teamBadge(team)} ・ ${c.type === "crisis" ? "緊急通信" : "分岐の相談"}</h3>
      <div class="speech">${portrait(sender)}<div><b>${esc(c.senderName ?? sender.name)}</b><p>${esc(c.line)}</p></div></div>
      <p>${g.quests[t.quest].name} ・ ${g.tripRooms(t)[t.node].name} ・ 薬 ${t.meds} 本</p>
      <p>${c.type === "crisis" ? lifeStatus(who(c.target)) : t.dungeon === "moss" ? "採集路は薬草2・鉱石1。岩場の近道は戦闘に勝つごとに鉱石2。" : ""} ${deadlineText(c)}</p>
      <div class="actions">${reply}</div></article>`;
  });
  const records = [...teams().filter(t => t.phase === "explore").map(t => ({
    ...t.trip, partyNumber:g.partyNumber(state,t) })), ...state.history];
  const archive = records.flatMap(r => r.log.filter(e => e.letter?.answer).map(e =>
    `<li><b>第${e.letter.answeredWeek ?? r.week}週 ・ ${teamBadge(teams()[r.partyNumber - 1])}</b>　${esc(e.letter.senderName ?? who(r.leader)?.name)}<p>${esc(e.letter.line)}</p><small>${esc(e.letter.decision || "返信済み")} ・ ${choiceLabel(e.letter.answer,r)}</small></li>`));
  const archiveTitle = records.some(r => r.log.some(e => e.letter?.decision)) ? "通信履歴" : "返信済み";
  const promotions = state.milestones.filter(e => e.guildGrade);
  const guildMail = promotions.length ? `<section class="panel padded">${title("mail","ギルド昇格の伝書")}
    ${promotions.map(e => `<p><small>第${e.week}週</small>　${esc(e.message)}</p>`).join("")}</section>` : "";
  return pageTitle("GUILD MAIL","伝書箱","隊から届いた相談に返信できます。") +
    (pending.join("") || '<p class="fine">返信を待っている隊はありません。</p>') +
    teams().map(rescueNotice).join("") + guildMail + raidBulletin() + morningLetters(false) +
    (pending.length ? waitUntilNextWeek() : "") +
    (archive.length ? `<details class="rules"><summary>${archiveTitle}（${archive.length}件）</summary><ul>${archive.join("")}</ul></details>` : "");
}
function hall() {
  if (selected().phase === "explore") return explore();
  if (selected().phase === "report") return report(g.reportFor(state, selected()),true);
  if (selected().leaveWeek === state.week) return `<section class="panel padded"><h2>今週は休暇です</h2><p>隊は町で休み、翌週のHP・MP回復量が増えます。</p></section>`;
  const newOrder = state.unlocked && state.history.length===1 && state.week===state.history[0].week+1;
  return `<div class="dashboard"><div class="left-col">${newOrder ? '<p class="fine">マルタから、ひとつ大きな注文が届きました。</p>' : ""}${board()}${townSnippet()}</div><div class="right-col">${partyPanel()}</div></div>`;
}
function pageTitle(english,name,desc) {
  return `<div class="page-title"><span class="small-kicker">${english}</span><h1>${name}</h1><p>${desc}</p></div>`;
}
function ageLabel(p) {
  return g.species[p.species].name+" ・ "+p.age+"歳"+({female:" ・ 女性",male:" ・ 男性"}[p.sex] || "");
}
function ageDetails(p) {
  const r = g.species[p.species];
  const decline = r.decline === null ? "加齢による能力低下はありません。" :
    r.decline+"歳から年に"+r.annualLoss+"％ずつ基礎能力が低下します（累計上限75％）。";
  return `<section><h3>${ageLabel(p)}</h3><p>${r.description} ${decline}</p>
    <p>経験値倍率 ${Math.round(100*g.growthRate(p))}％ ・ 加齢による低下 ${p.frailty}％ ・ 寿命 ${r.lifespan}歳</p>
    <p>魔力 ${g.stat(p,"magic")} ・ 精神 ${g.stat(p,"spirit")} ・ 器用 ${g.stat(p,"dex")} ・ 対魔術防御 ＋${g.spellDefense(p)}</p>
    <small>${r.favored.length ? "得意職："+r.favored.map(id=>g.jobs[id].name).join("・")+"。 " : ""}魔力は魔術と回復、精神は最大MPと対魔術防御、器用は弓技に影響します。</small></section>`;
}
function yearLengthControl() {
  return `<label>1年の長さ <select id="year-length">${g.yearLengths.map(n =>
    `<option value="${n}" ${state.calendar.length === n ? "selected" : ""}>${n}週</option>`).join("")}</select></label>`;
}
const axes = {...g.effectNames,dex:"器用",magic:"魔力",spirit:"精神"};
function inheritanceText(p) {
  return [p.jobAffinity ? g.jobs[p.jobAffinity].name+"系の経験値＋5％" : g.jobs[p.job].name+"向き", g.traits[p.trait], p.aptitude && axes[p.aptitude]+"に素質",
    p.skillTalent && "家伝の技「"+g.abilities[p.skillTalent].name+"」"].filter(Boolean).join(" ・ ");
}
function relationshipPanel(p) {
  const spouse = g.spouseOf(state,p.id);
  const friends = [...state.roster,...state.alumni].filter(q => q !== p &&
    (!q.departure || q.departure.kind === "retired" || g.affinity(state,p.id,q.id)))
    .sort((a,b) => g.affinity(state,p.id,b.id)-g.affinity(state,p.id,a.id));
  return `<section><h3>好感度と家族</h3>
    ${p.parents ? `<p>${p.parents.map(id => esc(who(id).name)).join("と")}の子 ・ ${inheritanceText(p)}</p>` : ""}
    ${spouse ? `<p>配偶者　${esc(spouse.name)}。町で一緒に休暇を過ごすと、二人とも休暇の回復と士気＋2を得ます。</p>` : ""}
    <p class="fine">共闘・かばう・救出・酒場・休暇で親しくなります。好感度40から同じ敵への連携、かばい合い、帰還時の士気に効果があります。100になると町にいる成人同士が結婚できます。</p>
    <div class="training-rows">${friends.map(q => {
      const score = g.affinity(state,p.id,q.id), id = `data-id="${esc(q.id)}"`;
      const status = q.departure ? {retired:"引退",lost:"消失", missing:"行方不明",lifespan:"天寿"}[q.departure.kind] : "";
      return `<div><span><b>${esc(q.name)}</b>　${score} / 100 <small>${[q === spouse ? "配偶者" : "",status].filter(Boolean).join(" ・ ")}</small></span>
        ${g.canMarry(state,p.id,q.id) ? action("marry","結婚する","primary",id) :
        score < 100 && (!q.departure || q.departure.kind === "retired") ? action("give-gift","贈り物（"+g.giftCost+"G）","btn",id+(g.canGift(state,p.id,q.id) ? "" : " disabled")) : ""}</div>`;
    }).join("")}</div><small>贈り物は町にいる二人に週1回。好感度が12上がります。</small></section>`;
}
function familyPanel() {
  const households = new Map();
  function household(parents) {
    const key = [...parents].sort().join("|");
    if (!households.has(key)) households.set(key,{parents,children:[]});
    return households.get(key);
  }
  for (const m of state.marriages) household(m.partners).week = m.week;
  for (const p of [...state.children,...state.roster,...state.alumni]) {
    if (p.parents) household(p.parents).children.push(p);
  }
  const retired = state.alumni.filter(p => p.departure.kind === "retired");
  const departed = p => ({lost:"（消失）",lifespan:"（天寿）",retired:"（引退）"})[p.departure?.kind] || "";
  function childRow(p) {
    const inTown = state.children.includes(p), adult = p.age >= g.species[p.species].adult;
    const status = inTown ? g.childStage(p) : departed(p) || "所属冒険者";
    return `<li><b>${esc(p.name)}</b> ・ ${ageLabel(p)} ・ ${status}
      ${inTown ? `<small>${inheritanceText(p)} ・ ${g.species[p.species].adult}歳から入団</small>` : ""}
      ${inTown && adult ? action("enlist-child","ギルドに迎える","btn",`data-id="${esc(p.id)}" ${g.weekStarted(state) ? "disabled" : ""}`) : ""}</li>`;
  }
  return `<details class="panel padded" id="family-panel"><summary>家系図と町の子供</summary>
    <p>夫婦がそろって町にいると、子供が生まれることがあります。幼年期・少年期・見習いを経て、種族ごとの成人年齢から週初めに入団できます。</p>
    ${yearLengthControl()}
    ${[...households.values()].map(h => `<section><h3>${h.parents.map(id => { const p = who(id); return esc(p.name)+departed(p); }).join(" と ")}</h3>
      ${h.week ? `<small>第${h.week}週に結婚</small>` : ""}
      ${h.children.length ? `<ul>${h.children.map(childRow).join("")}</ul>` : "<p>子供の記録はまだありません。</p>"}</section>`).join("")}
    ${retired.length ? `<h3>引退した住人</h3>${retired.map(p => action("resident-family",esc(p.name)+"の交友","btn",`data-id="${esc(p.id)}"`)).join(" ")}` : ""}
    </details>`;
}
function roster() {
  const prep = selected().phase === "prep", candidate = !who("shion");
  const card = p=>{
    const visitor = !who(p.id), resting = !g.available(state,p);
    const owner = teams().find(team => team.party.includes(p.id));
    const unit = owner?.trip?.unit.find(u=>u.id===p.id);
    const status = visitor?"雇用候補":p.leaveWeek === state.week?"休暇中":unit && owner.phase==="report" ? (unit.injury || unit.state==="severe"?"療養予定":"帰還") :unit && unit.state!=="ok" ? names[unit.state] :resting?"療養中":owner?teamName(owner)+(owner.phase==="explore"?"・遠征中":"・編成中"):"控え";
    return `<article class="panel roster-card">${tag(status,visitor?"gold":resting?"rose":"mint")}${portrait(p)}
      <h2>${esc(g.formalName(p))}</h2><p>${g.jobs[p.job].name} ・ ${g.traits[p.trait]} ・ Lv.${p.level}</p><p>${ageLabel(p)}</p><p>階級　${esc(g.rankName(state,p))}</p>
      <div class="character-stats"><span>HP <b>${g.outfittedStat(state,p,"hp")}</b></span><span>攻 <b>${g.outfittedStat(state,p,"atk")}</b></span><span>防 <b>${g.outfittedStat(state,p,"def")}</b></span><span>速 <b>${g.outfittedStat(state,p,"spd")}</b></span></div>
      <p class="fine">${visitor?"採集時に薬草＋1個。雇用費＝Lv × 50G":resting && g.fitWeek(p)>state.week+(selected().phase==="report"?1:0)?"復帰予定：第"+g.fitWeek(p)+"週の始め":"経験値 "+p.xp+" / "+(20*p.level**2)+"　週給 "+(10+2*p.level)+"G"}</p>
      ${visitor ? "" : `<p class="fine">現在HP ${owner?.phase === "explore" ? unit.hp : g.currentHP(state,p)}/${g.outfittedStat(state,p,"hp")} ・ MP ${unit?.mp ?? g.currentMP(p)}/${g.maxMP(p)}<br>${moraleText(p)} ・ ${lifeStatus(p)}</p>`}
      ${p.backstory ? `<p class="backstory-excerpt">${esc(p.backstory)}</p>` : ""}
      ${visitor ? "" : action("character","人物詳細・育成","primary wide",`data-id="${p.id}" aria-label="${esc(p.name)}の人物詳細・育成"`)}
      ${visitor?action("hire",g.hireCost(p)+" G で雇う","btn wide",g.weekStarted(state)||g.guildGold(state)<g.hireCost(p)?"disabled":""):prep&&!resting&&!g.awayMember(state,p.id)?action("prepare",icon("team",16)+" 編成する","btn wide"):""}</article>`;
  };
  return pageTitle("ADVENTURERS","冒険者名簿","仲間の得意な仕事を確かめて、今週の遠征を任せましょう。")+
    `<div class="section-title"><h2>${icon("team")}所属冒険者 ${state.roster.length} 人</h2>${!who("custom")?action("create","＋ 自作冒険者を登録","btn",g.weekStarted(state)?"disabled":""):""}</div><div class="roster-grid">${state.roster.map(card).join("")}</div>
    ${candidate ? `<h2>所属を希望する応募者</h2><div class="roster-grid">${card(g.recruit(state))}</div>` : ""}${visitorBoard()}${familyPanel()}`;
}
function examPanel(p) {
  const exam = g.examStatus(state,p);
  const focusNotes = {practice:"攻撃・防御", knowledge:"習得技の数・最大MP", record:"依頼参加回数", escort:"最深到達層・防御"};
  return `<section><h3>階級　${esc(g.rankName(state,p))}</h3>
    ${exam.next < state.ranks.names.length ? `<p>次の階級：${esc(g.rankLabel(state,exam.next))}</p>
      <p>${g.examFocuses[state.ranks.focus]}（${focusNotes[state.ranks.focus]}を審査）・ ${g.examLines[state.ranks.strictness]}<br>
      合格見込み ${exam.chance}% ／ 合格時の名声 ＋${exam.renown}</p>
      ${action("exam","昇級試験を受ける","btn",exam.reason?"disabled":"")}` : ""}
    ${exam.reason ? `<p class="fine">${esc(exam.reason)}</p>` : ""}</section>`;
}
let guestId, guestOffer;
function visitorBoard() {
  const visitors = g.visitorList(state), market = state.market;
  return `<section class="panel padded guest-board">${title("team","一般冒険者",cap("名声 "+g.fame(state)))}
    <p class="fine">複数のギルドで仕事をする冒険者です。週の前半はホールで会えます。専属契約を結ぶと所属冒険者として編成できます。週後半は一般冒険者向けの継続依頼に出発します。</p>
    <div class="guest-list">${visitors.map(p=>action("guest",portrait(p)+`<span><b>${esc(p.name)}</b><small>${g.jobs[p.job].name} ・ ${esc(g.rankName(state,p))} ・ ${ageLabel(p)}</small>
      <small>${p.mission ? g.dungeons[p.mission.dungeon].name+"で「"+g.quests[p.mission.quest].name+"」を受注中" : "ホールに滞在中"}</small></span>`,"btn",`data-id="${p.id}"`)).join("") || "今週の来訪者はいません。"}</div>
    <details><summary>訪問のうわさ</summary>${state.registry.filter(p=>g.uniqueGuests[p.id]).map(p=>`<p>${g.jobs[p.job].name}${esc(p.name)}（${ageLabel(p)}）　${g.uniqueGuests[p.id].invitation}</p>`).join("")}</details>
    ${market.returns.length || market.gold ? `<details><summary>町に届いた分け前</summary>
      ${market.returns.map(r=>`<p>${esc(r.name)}が「${g.quests[r.quest].name}」から帰還。町に${g.items[g.quests[r.quest].item].name}1個と${r.gold}Gを納めました。</p>`).join("")}
      ${action("market",`金庫と倉庫へ（${market.gold}G・薬草${market.herb}・鉱石${market.ore}）`,"btn",market.gold?"":"disabled")}</details>` : ""}</section>`;
}
function guestDetail() {
  const p = g.visitorList(state).find(p=>p.id===guestId);
  if (!p) return modalHead("team","今週の訪問は終わりました");
  const status = g.scoutStatus(state,p,guestOffer);
  const unique = g.uniqueGuests[p.id];
  return modalHead("team",esc(p.name)+"の登録票")+`<div class="character-detail"><section>
    ${portrait(p)}<p>一般冒険者 ・ ${g.jobs[p.job].name} ・ ${g.traits[p.trait]} ・ Lv.${p.level}</p>
    <p>${esc(p.backstory || "他のギルドの仕事も引き受け、町を行き来している。")}</p>
    <p>得意技　${p.skills.map(id=>g.abilities[id].name).join("・")}</p></section>
    <section><h3>専属契約の交渉</h3><p>この町で終えた依頼 ${p.contacts || 0}件 ・ ギルドの信用 ${state.metrics[1]}</p>
    ${unique ? `<p>${unique.invitation}</p>` : ""}
    <label>提示する条件<select id="guest-offer">${Object.entries(g.offers).map(([id,o])=>
      `<option value="${id}" ${id===guestOffer?"selected":""}>${o.name} ${o.gold}G</option>`).join("")}</select></label>
    <p class="fine">契約成立時に支度金を払い、次の給与見積から週給${10+2*p.level}Gを支給します。</p>
    ${action("scout","条件を提示する","primary",status.reason?"disabled":"")}
    ${status.reason ? `<p>${esc(status.reason)}</p>` : ""}</section>
    ${ageDetails(p)}${examPanel(p)}
    <section><h3>活動の履歴</h3>${p.career.slice().reverse().map(e=>`<p>第${e.week}週　${esc(e.message)}</p>`).join("") || "まだ記録がありません。"}</section></div>`;
}
let characterId;
function skillDescription(id,p) {
  const a = {...g.abilities[id]};
  if (p) for (const key of ["atk","def","spd","heal"]) a[key] = g.abilityPower(p,id,key);
  const effect = a.heal ? `行動時、傷を負った仲間で残りHPが最も低い1人を${a.heal}回復` :
    a.spd ? `行動順の速さ＋${a.spd}` : a.def ? `被攻撃時の防御＋${a.def}` : `攻撃時の攻撃力＋${a.atk}`;
  return (a.round ? `第${a.round}ラウンド以降、` : "") + effect;
}
function debuffCare(p) {
  return Object.entries(p.debuffs || {}).map(([kind,bonus]) => {
    const symptom = g.debuffs[kind];
    if (!symptom) return "";
    const away = g.awayMember(state,p.id);
    const treated = p.treatment?.[kind];
    const service = kind === "pregnancy" ? "療養を発症から4週に短縮" : kind === "breakdown" ? "4週間の治療を開始" : "大聖堂で完治";
    const guidance = kind === "pregnancy" ? "大聖堂で療養を発症から4週に短縮できます。" :
      kind === "breakdown" ? "大聖堂で4週間の治療を受けられます。" : "大聖堂で完治できます。";
    const cure = treated ? "大聖堂で治療中" : state.town.landmark === "cathedral" ? action("cure-debuff",service+" ・ "+g.cureCost+" G","btn",
      `data-id="${kind}" ${away || g.guildGold(state)<g.cureCost ? "disabled" : ""}`) : guidance;
    const limb = symptom.limb ? action("fit-limb","からくり工房の"+symptom.limb+" ⭐"+g.prosthesisQuality(state)+"（補正＋"+g.prosthesisBonus(state)+"％） ・ "+g.limbCost+" G","btn",
      `data-id="${kind}" ${away || bonus>=g.prosthesisBonus(state) || g.guildGold(state)<g.limbCost || state.town.repairs.hall || state.town.smithReadyWeek>state.week ? "disabled" : ""}`) : "";
    const effect = symptom.axes.length ? symptom.axes.map(key=>axes[key]).join("・")+"が基礎値の"+(50+bonus)+"％" : "戦闘不可";
    const recovery = p.recovery?.[kind] ? " ・ 第"+p.recovery[kind]+"週に回復" : "";
    return `<div><b>${symptom.name}</b> ・ ${effect}${recovery}<div class="actions">${limb}${cure}</div></div>`;
  }).join("");
}
function characterProgress(p) {
  const job = g.jobs[p.job], away = g.awayMember(state,p.id), points = g.freePoints(p);
  const rows = Object.entries(g.statGains).map(([key,gain]) =>
    `<div><span>${g.effectNames[key]} <b>${g.outfittedStat(state,p,key)}</b><small>配分 ${p.allocation[key]} pt</small></span>
      ${action("allocate",`＋${gain}`,"btn",`data-id="${key}" aria-label="${g.effectNames[key]}に1ポイント配分" ${away || !points ? "disabled" : ""}`)}</div>`).join("");
  const learned = p.skills.map(id => `<li><b>${g.abilities[id].name}</b>　${skillDescription(id,p)}</li>`).join("");
  const choices = g.learnableSkills(p,state).filter(id => !p.skills.includes(id)).map(id =>
    `<div><span><b>${g.abilities[id].name}</b><small>${skillDescription(id,p)}</small></span>${action("learn-ability","習得","btn",
      `data-id="${id}" aria-label="${g.abilities[id].name}を習得" ${away || p.skills.length >= g.skillLimit ? "disabled" : ""}`)}</div>`).join("");
  const counts = new Map();
  for (const e of p.career) if (e.quest) counts.set(e.quest,(counts.get(e.quest) || 0) + 1);
  return ageDetails(p) + relationshipPanel(p) + examPanel(p) + `<section><h3>能力配分 <small>残り ${points} pt</small></h3>
    <p>${job.name} ・ Lv.${p.level} ・ 経験値 ${p.xp} / ${20*p.level**2}</p>
    <p class="fine">${away ? "遠征中です。育成は帰還後にできます。" : "1レベルにつき2ポイント。表示値には装備と士気の効果も含みます。"}</p>
    <p>${moraleText(p)}。士気70以上で能力1.1倍、30以下で0.9倍。依頼達成で＋6、未達で−4、負傷して帰るとさらに−4。週末に町にいる仲間は、士気の高い人が低い人より多いと満足度＋1、少ないと−1。</p>
    <div class="training-rows">${rows}</div>
    ${action("reset-allocation",`配分を戻す（${g.resetCost} G）`,"btn",away || !state.allowStatReset || !g.spentPoints(p) || g.guildGold(state) < g.resetCost ? "disabled" : "")}
    ${state.allowStatReset ? "" : '<small>ギルド設定で振り直しが無効です。</small>'}</section>
    <section><h3>スキル <small>習得 ${p.skills.length} / ${g.skillLimit} 枠</small></h3><ul>${learned}</ul>
    <p class="fine">習得枠は全職共通です。一度覚えたスキルは転職後も自動戦闘で使います。家伝の技の素質があれば、その1技だけは職業や転職時期を問わず通常の空き枠で習得できます。</p>
    ${choices ? `<h4>現在習得できる技</h4><div class="training-rows">${choices}</div>` : "<p>この職業の技はすべて習得済みです。</p>"}
    ${job.next ? `<details class="rules"><summary>${g.jobs[job.next].name}への転職（Lv.${g.promotionLevel}から）</summary>
      <p>転職すると${job.name}には戻れません。家伝の技を除き、今の職の技は転職前に選んでください。転職先の技は「${g.jobs[job.next].skills.map(id=>g.abilities[id].name).join("」「")}」です。</p>
      ${action("promote",g.jobs[job.next].name+"に転職する","btn",away || p.level < g.promotionLevel ? "disabled" : "")}</details>` : ""}</section>
    <section><h3>健康と引退</h3><p>${lifeStatus(p)}。死亡${g.deathThreshold(state)}回で永久消失します。</p>
    ${debuffCare(p)}
    ${action("retirement","引退について相談する","btn",away ? "disabled" : "")}</section>
    <section><h3>歩みの記録</h3><p>最深到達　${g.deepest(p) ? "第"+g.deepest(p)+"層" : "未記録"}</p>
    <p>依頼参加　${[...counts].map(([quest,n])=>g.quests[quest].name+" ×"+n+"回").join(" ／ ") || "未記録"}</p>
    <ol class="logs career-log">${[...p.career].reverse().map(e=>`<li><small>第${e.week}週</small><span>${esc(e.message)}</span></li>`).join("") || "<li>まだ記録がありません。</li>"}</ol></section>`;
}
function gambitEditor() {
  const p = who(characterId);
  const select = (index,field,label,choices,current) =>
    `<label>${label}<select data-rule="${index}" data-field="${field}">${Object.entries(choices).map(([id,name]) =>
      `<option value="${esc(id)}" ${String(current) === id ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></label>`;
  const rows = p.gambits.map((r,i) => {
    const hasSubject = ["hp","status"].includes(r.condition);
    const control = (cmd,label,disabled) => action("rule-"+cmd,label,"btn",`data-id="${i}" aria-label="${i+1}番を${label}" ${disabled ? "disabled" : ""}`);
    const pool = g.subjects(state);
    if (r.condition === "status") delete pool.foe;
    return `<li><div class="rule-head"><b>優先 ${i+1}</b><div class="actions">${control("up","上へ",!i)}${control("down","下へ",i === p.gambits.length-1)}${control("remove","削除")}</div></div>
      <div class="rule-fields">${select(i,"condition","条件",g.conditions,r.condition)}
      ${hasSubject ? select(i,"subject","誰が",pool,r.subject) : ""}
      ${r.condition === "hp" ? `<label>残HP（％以下）<input type="number" min="1" max="100" value="${r.value}" data-rule="${i}" data-field="value"></label>` : ""}
      ${r.condition === "count" ? select(i,"value","敵の数",{1:"1体以上",2:"2体以上"},r.value) : ""}
      ${select(i,"action","行動",g.actionList(p),r.action)}${select(i,"target","誰に",g.targets(state,r.action,p.id),r.target)}</div>
      ${r.action === "cover" ? "<small>次の自分の手番まで、選んだ仲間への攻撃を1回、自分の防御で引き受けます。</small>" : ""}</li>`;
  }).join("");
  return modalHead("flag",esc(p.name)+"の戦術オーダー") +
    `<div class="rule-intro"><p>上から順に調べ、最初に実行できる行動を選びます。該当しないときは従来の自動戦闘を行います。変更は次の手番から有効です。</p>${worldPauseButton()}</div>
    <div class="rule-presets"><b>プリセットで置き換え</b>${action("rule-preset","回復役","btn",'data-id="healer"')}${action("rule-preset","攻撃役","btn",'data-id="attacker"')}</div>
    <ol class="gambit-list">${rows}</ol><div class="actions">${action("rule-add","＋ 条件を追加","primary",p.gambits.length >= g.gambitLimit ? "disabled" : "")}<small>${p.gambits.length} / ${g.gambitLimit} 件 ・ 自動保存</small></div>`;
}
function storeRules(rules,focus) {
  g.setGambits(state,characterId,rules);
  save();
  drawModal();
  if (focus) $(focus)?.focus({preventScroll:true});
}
function editRule(cmd,id) {
  const p = who(characterId), rules = [...p.gambits], i = Number(id);
  if (cmd === "rule-preset") return storeRules(g.preset(p,id));
  if (cmd === "rule-add") rules.push({condition:"always",subject:"self",value:50,action:"attack",target:"nearest"});
  else if (cmd === "rule-remove") rules.splice(i,1);
  else {
    const to = i + (cmd === "rule-up" ? -1 : 1);
    if (!rules[to]) return;
    [rules[i],rules[to]] = [rules[to],rules[i]];
  }
  storeRules(rules);
}

function characterNameFields(p = {}) {
  return `<div class="form-pair"><label>愛称（任意）<input name="nickname" maxlength="${g.nameLimits.nickname}" value="${esc(p.nickname)}"></label>
    <label>二つ名（任意）<input name="epithet" maxlength="${g.nameLimits.epithet}" value="${esc(p.epithet)}"></label></div>`;
}
function characterDetail() {
  const p = who(characterId);
  return modalHead("book",esc(g.formalName(p))+"の人物手帳") +
    `<div class="character-detail"><form id="character-names">${characterNameFields(p)}<button type="submit" class="btn">愛称・二つ名を保存</button></form>
    ${action("gambits","戦術オーダーを編集（"+p.gambits.length+" / 10）","btn",`data-id="${p.id}"`)}<section><label>過去・生い立ち<textarea data-note="backstory" rows="3" placeholder="出身や、ギルドを訪れた理由">
${esc(p.backstory)}</textarea></label>
    <label>手書きメモ<textarea data-note="memo" rows="2" placeholder="覚えておきたい出来事">
${esc(p.memo)}</textarea></label>
    <small>入力すると自動で保存されます。</small></section><div id="character-progress">${characterProgress(p)}</div></div>`;
}
function refreshCharacter() {
  if (modal !== "character") return;
  if (!g.person(state,characterId)) { closeModal(); return; }
  const panel = $("#character-progress"), promotionOpen = panel.querySelector("details")?.open;
  const focused = document.activeElement?.dataset;
  panel.innerHTML = characterProgress(who(characterId));
  const details = panel.querySelector("details");
  if (details && promotionOpen) details.open = true;
  if (focused?.action) panel.querySelector(`[data-action="${focused.action}"]${focused.id ? '[data-id="'+focused.id+'"]' : ""}`)?.focus({preventScroll:true});
}
const stars = quality => "⭐".repeat(quality);
const slotName = {weapon:"武器",armor:"防具",charm:"アクセサリ"};
const supplyEffect = (key,quality) => {
  const power = g.supplyPower(key,quality);
  return {medicine:`HP ${power} 回復`,ration:"食費10 G節約"+(power ? `・HP ${power} 回復` : ""),tonic:`全員の攻撃＋${power}`,spark:`初戦で${power}ダメージ`}[key];
};
function supplyList(store) {
  const rows = [];
  for (const [key,count] of Object.entries(store.supplies)) {
    const lots = store.lots.filter(l => l.key === key);
    const plain = count-lots.reduce((n,l) => n+l.count,0);
    for (const lot of [...(plain ? [{count:plain,quality:1}] : []), ...lots])
      rows.push(`<li>${g.effectNames[key]} ×${lot.count}　${stars(lot.quality)}（${supplyEffect(key,lot.quality)}）</li>`);
  }
  return rows.length ? '<ul>'+rows.join("")+'</ul>' : '<p class="fine">補給品なし</p>';
}
function equipmentList(owner,site) {
  return state.equipment.map((item,i) => {
    if (item.owner !== g.partyNumber(state,owner) || (site && item.shopId !== site)) return "";
    const locked = owner?.phase === "explore" || g.awayMember(state,item.wearer);
    return `<label class="made-item"><span><b>${esc(item.mark || "")} ${esc(item.name)}</b><small>${item.relic ? "一点物の" : ""}${slotName[item.slot]} ・ ${stars(item.quality)} ・ ${effectText(item.effects)}</small></span>
      <select data-equipment="${i}" aria-label="${esc(item.name)}の装備者" ${locked ? "disabled" : ""}>${wearerOptions(item.wearer,owner)}</select></label>`;
  }).join("");
}
function partyInventory() {
  const team = selected(), materials = team.bag.materials, t = team.phase === "explore" && team.trip;
  return `<details class="rules" id="party-inventory"><summary>${teamName(team)}の持ち物・装備　${team.wallet} G</summary>
    <p>薬草 ×${materials.herb} ・ 鉱石 ×${materials.ore}</p>
    ${t ? `<p>今回の採集　薬草 ×${t.cargo.herb} ・ 鉱石 ×${t.cargo.ore} ／ 携行薬 ×${t.meds}
      ${t.meds ? "（次の1本 "+supplyEffect("medicine",t.packed?.medicine[0]?.quality || 1)+"）" : ""}</p>` : ""}
    ${supplyList(team.bag)}${equipmentList(team) || '<p class="fine">隊の装備品なし</p>'}
    ${state.weapon && state.weaponOwner === state.selectedParty ? bladeSelect() : ""}</details>`;
}
function stockPanel(owner = selected()) {
  const stock = key => g.materialAvailable(state,key,owner);
  return `<section class="panel padded">${title("bag",(owner ? teamName(owner) : "ギルド")+"の余剰素材")}
    ${Object.entries(g.items).map(([key,it])=>`<div class="stock-row">${asset(key)}<div><b>${it.name} ×${stock(key)}</b><small>売値 ${g.salePrice(state,key)} G / 個</small></div>${action("sell","1個売る","btn",`data-id="${key}" ${stock(key)&&owner?.phase!=="explore"?"":"disabled"}`)}</div>`).join("")}
    <div class="stock-choice">${action("donate",state.research?"鉱石研究は完了":"鉱石1個をトトに卸す","btn wide",!state.town.repairs.hall&&!(state.town.smithReadyWeek>state.week)&&stock("ore")&&!state.research&&owner?.phase!=="explore"?"":"disabled")}<small>研究完成後、準備中に武器を80Gで購入可</small></div></section>`;
}
let activeShop = null, shopView = "orders", recipeId, finishId, buyerNumber = 0;
const buyer = () => teams()[buyerNumber-1] || null;
const shopSite = id => g.territoryPlots.find(p => p.id === id)?.name || "ギルド併設";
const materialName = type => g.items[type.material]?.name || "畑の食料";
const effectText = effects => Object.entries(effects).map(([key,value]) => g.effectNames[key] + signed(value)).join(" ／ ");
const shopStock = type => g.materialAvailable(state,type.material,buyer());
function buyerPicker() {
  return `<label>支払い・受取先<select id="shop-buyer">${[null,...teams()].map((team,i) =>
    `<option value="${i}" ${i === buyerNumber ? "selected" : ""}>${team ? teamName(team) : "ギルド"}（${g.balance(state,team)} G${team?.phase === "explore" ? "・遠征中" : ""}）</option>`).join("")}</select></label>`;
}

function shops() {
  if (activeShop) return shopPanel();
  const workshops = Object.entries(state.town.workshops);
  return pageTitle("WORKSHOPS","町のショップ","店を選んで、素材の納品や加工を依頼できます。") +
    '<div class="shop-list">' + workshops.map(([id,shop]) => {
      const type = g.shopTypes[shop.type];
      return action("open-shop", asset("scenery_"+type.building) +
        `<span><small>${shopSite(id)}</small><strong>${type.name}</strong>${g.artisanName(shop)} ・ ${g.shopRanks[shop.level-1]}</span>${tag(state.town.repairs[id] || (id==="hall" && state.town.smithReadyWeek>state.week) ? "休業中" : "Lv."+shop.level,"gold")}`,
        "shop-card", `data-id="${id}"`);
    }).join("") + '</div><p class="fine">空き地に鍛冶屋・専門商店・酒場を建てると、店が増えます。同じ業種でも区画ごとに育ちます。</p>' + buyerPicker() + stockPanel(buyer());
}
function shopTree(shop, type) {
  function nodeCard(node) {
    const status = g.skillStatus(shop,node), cost = node.parent ? 2 : 1;
    return `<div class="skill-node ${shop.skills.includes(node.id) ? "learned" : ""}">
      <b>${node.name}</b>${type.recipes.filter(r=>r.skill===node.id).map(r=>`<small>新商品「${r.name}」</small>`).join("")}<small>仕上げ「${node.finish}」</small><span>${effectText(node.effects)}</span>
      ${action("learn-skill", status || `習得 ・ ${cost} pt`, "btn", `data-id="${node.id}" ${status ? "disabled" : ""}`)}</div>`;
  }
  return `<section class="panel padded">${title("sprout","職人のスキルツリー",tag(shop.points+" pt","mint"))}
    <p>専門は一系統を選びます。${type.canReset ? "料理の専門は選び直せます。" : "一度選ぶと変更できません。"}店 Lv.3 でその系統の奥義を習得できます。</p>
    <div class="skill-root">基礎加工</div><div class="skill-branches">${type.skills.filter(n=>!n.parent).map(root=>
      '<div class="skill-branch">'+nodeCard(root)+type.skills.filter(n=>n.parent===root.id).map(nodeCard).join("")+'</div>').join("")}</div>
    ${type.canReset && shop.skills.length ? action("reset-skills","料理の専門を選び直す（ポイント返還）","btn") : ""}</section>`;
}
function bladeSelect() {
  const owner = teams()[state.weaponOwner-1];
  return `<label>木洩れ日の刃 ${stars(state.weaponQuality)}（攻撃×${g.bladeMultiplier(state.weaponQuality)}）の装備者<select id="equip" ${(owner || selected()).phase !== "prep" || g.awayMember(state,state.wielder) ? "disabled" : ""}>${wearerOptions(state.wielder,owner)}</select></label>`;
}
function legacyBlade() {
  const owner = buyer(), team = owner || selected();
  const smith = state.town.workshops.hall;
  const quality = smith.level+smith.skills.length+g.craftBonus(smith)+g.craftSupport(state);
  return `<section class="panel padded">${title("hammer","トトの研究品")}<h3>木洩れ日の刃</h3>
    <p>余剰鉱石1個を研究に卸すと、木洩れ日の刃を80Gで購入できます。${!state.weapon ? stars(quality)+" 攻撃×"+g.bladeMultiplier(quality) : ""}</p>
    ${!state.research ? action("donate","研究に鉱石1個を卸す","btn",g.materialAvailable(state,"ore",owner) && owner?.phase !== "explore" ? "" : "disabled") :
      !state.weapon ? action("buy","木洩れ日の刃を購入 ・ 80 G","primary",team.phase === "prep" && g.balance(state,owner)>=80 ? "" : "disabled") :
      (state.weaponOwner || 0) === buyerNumber ? bladeSelect() : "購入済み"}</section>`;
}
function wearerOptions(wearer, owner) {
  return `<option value="" ${wearer ? "" : "selected"}>保管中</option>` +
    state.roster.filter(p => !owner || owner.party.includes(p.id)).map(p=>`<option value="${p.id}" ${p.id===wearer ? "selected" : ""} ${g.awayMember(state,p.id) ? "disabled" : ""}>${esc(p.name)}</option>`).join("");
}
function shopOrders(shop, type) {
  const owner = buyer(), funds = g.balance(state,owner);
  const quote = g.orderQuote(state,activeShop,recipeId,finishId);
  const material = materialName(type);
  const powers = type.slot ? "" : Object.keys(quote.effects).map(key => {
    const quality = quote.supplyQuality[key];
    return g.effectNames[key]+" "+stars(quality)+" "+supplyEffect(key,quality);
  }).join(" ／ ");
  const stock = type.slot ? equipmentList(owner,activeShop) : supplyList(owner?.bag || state);
  return `<section class="panel padded">${title("hammer","加工の注文")}
    <div class="form-pair"><label>品揃え<select id="shop-recipe">${type.recipes.map(r=>{
      const needs = g.recipeRequirement(shop,r);
      return `<option value="${r.id}" ${recipeId===r.id?"selected":""} ${needs?"disabled":""}>${r.name}${needs?"（"+needs+"）":""}</option>`;
    }).join("")}</select></label>
    <label>仕上げ<select id="shop-finish"><option value="plain">標準仕上げ</option>${type.skills.filter(n=>shop.skills.includes(n.id)).map(n=>
      `<option value="${n.id}" ${finishId===n.id?"selected":""}>${n.finish}</option>`).join("")}</select></label></div>
    <div class="ledger"><div>仕上がり ・ ${stars(quote.quality)}<b>${effectText(quote.effects)}</b></div>
    ${powers ? `<p>${powers}</p>` : ""}<div>加工料<b>${quote.fee} G</b></div><div>加工に使う素材<b>${material} ×${quote.cost}（在庫 ${shopStock(type)}）</b></div></div>
    ${action("place-order",quote.name+"を注文","primary wide",owner?.phase !== "explore" && funds>=quote.fee && shopStock(type)>=quote.cost?"":"disabled")}
    ${action("purchase-order",`素材込みで購入 ・ ${quote.price} G`,"btn wide",owner?.phase !== "explore" && funds>=quote.price?"":"disabled")}</section>
    <section class="panel padded">${title("bag",type.slot?"仕立てた装備":"補給品")}${stock || '<p class="fine">注文した装備はここで冒険者に渡せます。</p>'}</section>
    ${activeShop==="hall" ? legacyBlade() : ""}`;
}
function shopPanel() {
  const shop = state.town.workshops[activeShop], type = g.shopTypes[shop.type];
  if (state.town.repairs[activeShop] || (activeShop==="hall" && state.town.smithReadyWeek>state.week)) {
    return action("nav","ショップ一覧へ","text-btn",'data-id="shops"')+'<section class="panel padded">'+
      title("hammer",type.name+" ・ 休業中")+repairStatus(activeShop)+
      (activeShop==="hall" && state.town.smithReadyWeek>state.week ? '<p>'+g.artisanName(shop)+'は第'+state.town.smithReadyWeek+'週まで療養中です。</p>' : "")+'</section>';
  }
  const max = shop.level === g.shopRanks.length;
  return `<div class="shop-panel">${action("nav","ショップ一覧へ","text-btn",'data-id="shops"')}
    <div class="forge-intro">${asset(activeShop==="hall"?"toto":"scenery_"+type.building,"smith")}
    <div><small>${shopSite(activeShop)} ・ 店 Lv.${shop.level}</small><h2>${type.name}</h2>
    <b>${g.shopRanks[shop.level-1]}の${g.artisanName(shop)}</b><p>「${type.lines[shop.level-1]}」</p>
    ${activeShop!=="hall" ? `<small>${buildingEffect(type.building,g.territoryPlots.find(p=>p.id===activeShop),shop)}</small>` : ""}</div></div>
    <section class="shop-training"><div><b>工房の技術継承 ・ ${shop.lineage.generation}代目</b>
    <p>${g.species[shop.lineage.species].name} ・ 職人 ${shop.lineage.age}歳 ／ 見習い ${shop.lineage.apprenticeAge}歳（修業${shop.lineage.apprenticeYears}年・実習${shop.lineage.lessons}/6）</p>
    <small>営業4年ごとに加工品の品質と主効果＋1（上限＋8、現在＋${g.craftBonus(shop)}）。見習いは4年で継承の準備が整います。納品・加工で実習が6に達すると3年に短縮されます。代替わり後も店の技・品質を受け継ぎます。</small></div></section>
    ${activeShop === "hall" ? `<section class="shop-training"><div><b>からくり工房</b><p>義肢の品質 ⭐${g.prosthesisQuality(state)} ・ 補正＋${g.prosthesisBonus(state)}％ ・ ${g.limbCost} G</p><small>職人の腕と品質で補正は最大＋80％。帰還後に人物手帳から注文できます。</small>
      <div class="actions">${state.roster.filter(p=>Object.keys(p.debuffs).some(k=>g.debuffs[k]?.limb) && !g.awayMember(state,p.id)).map(p=>action("character",esc(p.name)+"の義肢を選ぶ","btn",`data-id="${p.id}"`)).join("")}</div></div></section>` : ""}
    ${buyerPicker()}<section class="shop-training"><div><b>${max?"親方の腕前":"店の経験 "+shop.xp+" / "+(3*shop.level)+" EXP"}</b>
    <small>${max?"最高品質で加工できます。":"納品で1 EXP、加工で2 EXP。店の成長で品質が上がります。"}</small></div>
    ${!max ? action("deliver",materialName(type)+"を1個納品（在庫 "+shopStock(type)+"）","btn",buyer()?.phase !== "explore" && shopStock(type)>0?"":"disabled") : ""}</section>
    <div class="shop-tabs">${[["orders","注文・品揃え"],["tree","スキルツリー"]].map(([id,label])=>
      action("shop-view",label,"btn",`data-id="${id}" aria-pressed="${shopView===id}"`)).join("")}</div>
    ${shopView==="tree"? shopTree(shop,type) : shopOrders(shop,type)}</div>`;
}
function openShop(id) {
  const shop = state.town.workshops[id];
  if (!shop) return;
  activeShop = id;
  recipeId = g.shopTypes[shop.type].recipes[0].id;
  finishId = "plain";
  shopView = "orders";
  navigate("shops", true);
}
function journalPage() {
  return pageTitle("GUILD JOURNAL","帰還記録","遠征の判断と、仲間が持ち帰った成果の記録。")+
    state.raids.reports.map(r => `<details class="panel archive"><summary>第${r.week}週の町の防衛</summary><p>${raidReport(r)}</p></details>`).join("") +
    state.milestones.map(e => `<p class="panel padded">第${e.week}週　${esc(e.message)}</p>`).join("") +
    state.alumni.slice().reverse().map(p => `<details class="panel archive"><summary>第${p.departure.week}週　${esc(p.departure.message)}</summary>
      <p>${ageLabel(p)}</p><ol class="logs">${p.career.map(e => `<li><small>第${e.week}週</small>${esc(e.message)}</li>`).join("")}</ol></details>`).join("") +
    (state.history.length ? state.history.map((r,i)=>`<details class="panel archive" ${i===0?"open":""}><summary>第${r.week}週　${teamName(teams()[r.partyNumber - 1])}　${g.quests[r.quest].name}　${r.success?"達成":"未達"}</summary>${report(r,false)}</details>`).join("") :
    `<div class="empty panel">${icon("book",36)}<h2>最初の帰還を待っています</h2><p>遠征から帰ると、ここに精算と判断の記録が残ります。</p>${action("nav",hallLabel(),"btn",'data-id="hall"')}</div>`);
}
function townPeople() {
  const villagers = [...state.roster.filter(p => !g.awayMember(state, p.id)), ...state.alumni.filter(p => p.departure.kind === "retired")];
  if (!who("shion")) villagers.push(g.recruit(state));
  return [...villagers.map(p => ({ id: p.id, voice:p, sprite: g.jobs[p.job].face, name: g.familiarName(p), role: p.departure ? "引退した"+g.jobs[p.job].name : g.jobs[p.job].name })),
    ...state.children.map(p => ({id:p.id,voice:p,growing:true,name:g.familiarName(p),sprite:g.jobs[p.job].face,
      role:g.childStage(p)+" ・ "+p.age+"歳",scale:.5+.5*Math.min(1,p.age/g.species[p.species].adult)})),
    { id: "toto", voice:{trait:"kind",pronoun:"おいら",tone:"casual"}, sprite: "toto", name: g.artisanName(state.town.workshops.hall), role: "鍛冶屋 ・ "+g.shopRanks[state.town.workshops.hall.level-1] }];
}
function expeditionPeople(t) {
  return [t.unit.find(u => u.id === t.leader), ...t.unit.filter(u => u.id !== t.leader)]
    .map(u => ({ ...u, name:g.familiarName(who(u.id)), voice:who(u.id), maxHP:g.outfittedStat(state,who(u.id),"hp"), sprite: g.jobs[who(u.id).job].face }));
}
const townViewKey = "komorebi-town-view";
let townStep = 0, townCamera = GuildVoxel.townCamera(townStep);
try {
  const savedView = JSON.parse(localStorage.getItem(townViewKey));
  if (Number.isInteger(savedView?.step)) {
    townStep = GuildVoxel.townCamera(savedView.step).step;
    townCamera = savedView.mode === "paint" ? null : GuildVoxel.townCamera(townStep);
  }
} catch { /* The view controls also work without browser storage. */ }

// Once surveyed, the outer territory remains part of the simulation in either view.
if (townCamera) state.town.outerTerritory = true;
function markerPosition(id) {
  const view = GuildVoxel.views.town;
  if (id === "hill") {
    const [x,y] = GuildVoxelMaps.hillPoint(townCamera);
    return `left:${100*x/view.width}%;top:${100*y/view.height}%`;
  }
  const site = id === "hall" ? GuildVoxelMaps.hallSite :
    GuildVoxel.projectGround(...GuildVoxelMaps.plotCenter(g.territoryPlots.find(p=>p.id===id)),0,view);
  const [x,y] = townCamera ? townCamera.project(...site) : site;
  return `left:${100*x/view.width}%;top:${100*y/view.height}%`;
}
function changeTownView(stack,delta=0) {
  const next = GuildVoxel.townCamera(townStep + delta);
  townStep = next.step;
  townCamera = stack ? next : null;
  if (stack) state.town.outerTerritory = true;
  townScene.viewport.dataset.mode = stack ? "stack" : "paint";
  townScene.stop.setCamera(townCamera);
  for (const marker of townScene.viewport.querySelectorAll(".plot-marker"))
    marker.style.cssText = markerPosition(marker.dataset.id);
  const controls = $(".town-view-controls");
  for (const button of controls.querySelectorAll("[data-action=town-mode]"))
    button.setAttribute("aria-pressed",String(stack === (button.dataset.id === "stack")));
  for (const button of controls.querySelectorAll("[data-action=town-turn]")) button.disabled = !stack;
  controls.querySelector("output").textContent = stack ? townStep*360/GuildVoxel.directions+"°" : "固定";
  try { localStorage.setItem(townViewKey,JSON.stringify({mode:stack ? "stack" : "paint",step:townStep})); }
  catch { /* Keep the current view for this session. */ }
}
function townViewControls() {
  return `<div class="town-view-controls" role="group" aria-label="町の表示">
    ${action("town-mode","立体地形","btn",`data-id="stack" aria-pressed="${!!townCamera}"`)}
    ${action("town-mode","水彩地図","btn",`data-id="paint" aria-pressed="${!townCamera}"`)}
    <div class="town-turns" role="group" aria-label="視点の回転">
    ${action("town-turn","↶","btn",`data-id="-1" aria-label="左に回転" ${townCamera?"":"disabled"}`)}
    <output>${townCamera ? townStep*360/GuildVoxel.directions+"°" : "固定"}</output>
    ${action("town-turn","↷","btn",`data-id="1" aria-label="右に回転" ${townCamera?"":"disabled"}`)}</div></div>`;
}
function plotMarkers() {
  const hallDamage = state.town.repairs.hall;
  const hallMarker = action("nav",hallDamage ? "ホール ・ "+(hallDamage.remaining ? "修理中" : "損傷") : panes.hall[1],"plot-marker developed"+(hallDamage ? " damaged" : ""),
    `data-id="hall" aria-controls="management" style="${markerPosition("hall")}"`);
  const hill = g.landmarks[state.town.landmark];
  const hillMarker = action("plot",hill?.name || "見晴らしの丘 ・ 建築","plot-marker hill-marker",
    `data-id="hill" aria-haspopup="dialog" aria-expanded="false" style="${markerPosition("hill")}"`);
  return hallMarker + hillMarker + g.territoryPlots.map(plot => {
    const building = g.buildings[state.town.plots[plot.id]];
    const shop = state.town.workshops[plot.id];
    const name = shop ? g.shopTypes[shop.type].name : building?.name || "空き地";
    const controls = shop ? 'aria-controls="management"' : 'aria-haspopup="dialog" aria-expanded="false"';
    const job = state.town.repairs[plot.id];
    const status = job ? (job.remaining ? " ・ 修理中" : " ・ 損傷") : "";
    return action("plot", plot.name+" ・ "+name+status, "plot-marker"+(plot.road ? " outer-plot" : "")+(building ? " developed" : "")+(job ? " damaged" : ""),
      `data-id="${plot.id}" ${controls} aria-label="${plot.name}、${name}${status}、${plot.size**2}タイル" style="${markerPosition(plot.id)}"`);
  }).join("");
}
function panorama(kind, label) {
  const town = kind === "town";
  const {width,height} = town ? GuildVoxel.views.town : {width:900,height:300};
  return `<div class="panorama-scroll ${kind}-scroll" ${town ? `data-mode="${townCamera ? "stack" : "paint"}" tabindex="0" role="region" aria-label="街の区画図。横にスクロールできます"` : ""}>
    <div class="panorama"><canvas width="${width}" height="${height}" data-scene="${kind}" role="img" aria-label="${esc(label)}"></canvas><div class="scene-bubble" hidden><b></b><span></span></div>${town ? plotMarkers() : ""}</div></div>`;
}
function sceneHead(symbol, section, name, detail) {
  return `<div class="scene-head"><div><span class="small-kicker">${icon(symbol,15)}${section}</span><h1>${name}</h1></div>${detail}</div>`;
}
function siteName(id) {
  if (id==="hall") return "ギルドホール";
  const shop = state.town.workshops[id];
  return shopSite(id)+"の"+(shop ? g.shopTypes[shop.type].name : g.buildings[state.town.plots[id]].name);
}
function repairStatus(id) {
  const job = state.town.repairs[id];
  if (!job) return "";
  if (job.remaining) return '<p class="repair-job">修理中 ・ あと'+job.remaining+'週'+(job.delayed ? "（追加工事）" : "")+'</p>';
  const q = g.repairQuote(state,id);
  return '<div class="repair-job"><p>損傷のため休止中 ・ '+(q.local ? "町の職人" : "外部の職人")+
    'が担当。工期 '+q.weeks+'週、予定通りに仕上がる確率 '+Math.round(100*q.chance)+'％。</p>'+
    action("repair","修理を発注 ・ "+q.cost+" G","btn",`data-id="${id}" ${g.guildGold(state)<q.cost ? "disabled" : ""}`)+'</div>';
}
function raidReport(r) {
  const losses = r.damaged.length ? r.damaged.map(id=>esc(siteName(id))).join("・")+"が損傷" : "建物の被害なし";
  return `第${r.week}週 ・ ${g.roadNames[r.road]}の${r.surprise ? "奇襲" : "襲撃"}　${r.repelled ? "撃退" : "防衛戦終了"}（討伐 ${r.ore}/${r.count}体）${r.knights ? " ・ 騎士団派遣" : ""}<br>${losses}。略奪 ${r.gold} G・食料 ${r.food}、満足度 −${r.discontent}。${r.injured.length ? "負傷："+r.injured.map(esc).join("・")+"。" : ""} 工房用の倉庫へ鉱石 ${r.ore}・薬草 ${r.herb}。信用 ＋${r.credit}。`;
}
function raidDays() {
  const warning = state.raids.warning;
  return Math.max(1,7*((warning.dueWeek ?? state.week)-state.week) + Math.ceil(7*(warning.due-state.clock.elapsed)/g.weekMillis));
}
function raidBulletin() {
  const {warning,active} = state.raids;
  if (warning) return `<section class="raid-bulletin">${title("mail",warning.observed ? "天文台の襲撃予報" : "斥候からの伝書")}<p>第${warning.dueWeek ?? state.week}週、<b class="raid-days">${raidDays()}</b>日後に${g.roadNames[warning.road]}から襲撃の兆し。${warning.observed ? `敵は${warning.count}体。ヌシ${warning.boss ? "あり" : "なし"}。` : `斥候の見立ては約${warning.count}体です。`}${warning.outer ? "立体地形図で" + g.outerPlots.filter(p=>p.road===warning.road).map(p=>p.name).join("・") + "に防衛施設を建てると、町に入る前に迎撃できます。" : ""}</p><div class="actions">${teams().filter(team=>team.phase==="prep" && team.decisionWeek!==state.week && team.party.length).map(team=>action("hold",teamName(team)+"を町に残す","btn",`data-party="${g.partyNumber(state,team)}"`)).join("")}</div></section>`;
  if (!active) return "";
  const fallen = active.enemies.filter(e=>!e.hp).length;
  const defenders = g.raidDefenders(state);
  return `<section class="raid-bulletin">${title("shield",g.roadNames[active.road]+(active.surprise ? "から奇襲" : "で迎撃中"))}<p>討伐 ${fallen} / ${active.count}体 ・ 町の守り手 ${defenders.map(p=>esc(p.name)).join("・") || "なし"}${active.knights ? " ・ 城の騎士団が参戦" : ""}${active.boss ? " ・ ヌシ出現" : ""}</p><div class="actions">${teams().filter(t=>t.phase==="explore" && !t.trip.rescue).map(t=>action("raid-recall",teamName(t)+"を緊急帰還","btn",`data-id="${g.partyNumber(state,t)}"`)).join("")}</div></section>`;
}
function raidAftermath() {
  const jobs = Object.keys(state.town.repairs);
  const report = state.raids.reports[0];
  return (jobs.length ? '<section class="panel padded">'+title("hammer","町の復旧")+
    jobs.map(id=>'<div class="repair-row"><strong>'+esc(siteName(id))+'</strong>'+repairStatus(id)+'</div>').join("")+'</section>' : "")+
    (report ? '<details class="panel padded"><summary>直近の防衛報告</summary><p>'+raidReport(report)+'</p></details>' : "");
}
function townRaidScene() {
  const raid = state.raids.active;
  if (!raid) return null;
  const extra = state.clock.paused || document.hidden ? 0 : (performance.now()-lastWorldTick)*state.clock.speed;
  return {raid,defenders:g.raidDefenders(state),fraction:Math.min(1,(raid.elapsed+extra)/g.raidBeat)};
}

function townView(people) {
  const totals = g.townTotals(state.town);
  const omen = state.town.landmark === "observatory" ? `<p class="raid-bulletin"><b>今週の星読み ・ ${g.luckyWeek(state.week) ? "吉" : "凶"}</b>　${g.luckyWeek(state.week) ? "深層の罠は静かです。宝箱では星図の導きで鉱石をもう1個拾えます。" : "深層の罠が活発です。星図を携えた隊は罠を感知できます。"}</p>` : "";
  return raidBulletin() + omen + `<figure class="village-map">${townViewControls()}${panorama("town","円形広場にギルドホールが面する木もれびの里。空き地を選ぶと建築できます。")}
    <figcaption>${icon("map",17)} 石畳に沿った空き地を選んで建築 <span>外周の街道と防衛区画は立体地形で確認できます。</span></figcaption></figure>
    <dl class="town-ledger">
      <div><dt>${icon("home",16)} 領地の建築済み区画</dt><dd>${Object.keys(state.town.plots).length}<small> / ${g.territoryPlots.length} 区画</small></dd></div>
      <div><dt>${icon("shield",16)} 防衛値</dt><dd>${totals.defense}</dd></div>
      <div><dt>${icon("sprout",16)} 食料ストック</dt><dd>${state.town.food}<small>（＋${totals.food} / 週）</small></dd></div>
      <div><dt>${icon("coin",16)} 施設収入</dt><dd>${totals.income}<small> G / 週</small></dd></div>
    </dl>${facilityList()}${raidAftermath()}<section class="panel padded"><h2>ホールの一般冒険者</h2><p>${g.visitorList(state).filter(p=>!p.mission).length}人が滞在中 ・ 名声 ${g.fame(state)}</p>${action("nav","一般冒険者に会う","btn",'data-id="roster"')}</section>${partyBoard(false)}<details class="town-residents"><summary>住人・雇用候補のうち町にいる人（${people.length}人）</summary>
    <ul>${people.map(p => `<li>${asset(g.uniqueGuests[p.id] ? p.sprite : "px_"+p.sprite+"_front","resident-art")}<div><b>${esc(p.name)}</b><small>${p.role}</small></div></li>`).join("")}</ul></details>`;
}

function sceneChatterRate(kind) {
  if (state.chatterRate === "off" || modal || document.hidden || state.clock.paused) return "off";
  if (kind === "town" && page !== "town") return "off";
  if (kind === "dungeon" && (page !== "hall" || selected().trip?.paused || selected().trip?.pending)) return "off";
  if (urgent()) return "off";
  return state.chatterRate;
}
let townScene, stopDungeon, previousDrawer;
function render() {
  const people = townPeople();
  const walkers = people.concat(g.visitorList(state).filter(p=>!p.mission).map(p=>({id:p.id,sprite:g.jobs[p.job].face,name:g.familiarName(p),voice:p})));
  const repairs = Object.entries(state.town.repairs).map(([id,job])=>[id,job.remaining>0]);
  const layout = JSON.stringify([state.town.plots,state.town.landmark,repairs,walkers.map(p=>[p.id,p.sprite,p.name,p.scale])]);
  const previous = townScene;
  const scroll = previous?.viewport.scrollLeft;
  const featsOpen = $("#guild-feats")?.open;
  const familyOpen = $("#family-panel")?.open;
  const inventoryOpen = $("#party-inventory")?.open;
  const drawerScroll = $("#management")?.scrollTop || 0;
  stopDungeon?.();
  stopDungeon = null;
  sidebar(); topbar();
  // Keep the hall ready behind the closed drawer, including restored expedition controls.
  const drawerId = page==="town" ? "hall" : page;
  const [symbol,tabLabel] = panes[drawerId];
  const label = drawerId === "hall" ? hallLabel() : drawerId === "shops" && activeShop ? (activeShop === "hall" ? "町の鍛冶屋" : g.shopTypes[state.town.workshops[activeShop].type].name) : tabLabel;
  const drawer = (drawerId === "hall" ? guildCharter() + metricsPanel() + facilityList() + partyBoard(true) : "") +
    ({hall,roster,shops,mail:mailbox,history:journalPage}[drawerId])() + (drawerId === "hall" ? visitorBoard() : "");
  $("#screen").innerHTML = (saveWarning?`<p role="status" class="warning">${esc(saveWarning)}</p>`:"")+
    townView(people)+`<section id="management" aria-label="${label}" ${page==="town"?"hidden":""}>
    <div class="drawer-bar">${icon(symbol,19)}<b>${label}</b>
    ${action("nav",icon("close",18),"icon-btn",'data-id="town" aria-label="引き出しを閉じて町に戻る"')}</div>
    <div class="drawer-body">${drawer}</div></section>`;
  if (familyOpen && $("#family-panel")) $("#family-panel").open = true;
  if (featsOpen && $("#guild-feats")) $("#guild-feats").open = true;
  if (inventoryOpen && $("#party-inventory")) $("#party-inventory").open = true;
  const canvas = $("canvas[data-scene]");
  if (canvas) {
    const viewport = canvas.closest(".town-scroll");
    if (previous && previous.layout === layout) {
      viewport.replaceWith(previous.viewport);
    } else {
      previous?.stop();
      townScene = {layout,viewport,stop:GuildScenery.mount(canvas,
        {people:walkers,chatterRate:sceneChatterRate,camera:townCamera,turn:delta=>changeTownView(true,delta),url:assetUrl,time:worldSeconds,raidScene:townRaidScene,built:state.town.plots,landmark:state.town.landmark,selectPlot,activePlot,openHall:()=>navigate("hall")})};
    }
    if (scroll !== undefined) townScene.viewport.scrollLeft = scroll;
    if (page==="hall" && selected().phase==="explore") {
      stopDungeon = GuildScenery.mount($('canvas[data-scene="dungeon"]'),
        {people:expeditionPeople(selected().trip),chatterRate:sceneChatterRate,trip:selected().trip,url:assetUrl,fraction:stepFraction});
    }
  }
  const drawerKey = page === "shops" ? page + "/" + (activeShop || "") : page;
  $("#management").scrollTop = previousDrawer === drawerKey ? drawerScroll : 0;
  previousDrawer = drawerKey;
}
const stepSpeed = (team = selected()) => team.trip?.speed === 2 ? 2 : 1;
const clocks = new Map();
function stepFraction(team = selected()) {
  const clock = clocks.get(team);
  if (!clock) return 0;
  if (!clock.timer) return clock.fraction;
  if (!clock.delay) return 1;
  return Math.min(1, clock.fraction + (1 - clock.fraction) * (performance.now() - clock.started) / clock.delay);
}
function clockStage(t) {
  if (t.rescue) return t.node + "/rescue/" + t.rescue.elapsed;
  return t.node + "/" + (t.fight?.turn ?? "walk");
}
function scheduleStep() {
  const emergency = urgent();
  for (const team of teams()) {
    const t = team.trip, old = clocks.get(team);
    if (team.phase !== "explore") {
      clearTimeout(old?.timer); clocks.delete(team); continue;
    }
    const stage = clockStage(t);
    const waitingForRescue = t.rescue?.dispatched === false && t.rescue.elapsed > g.rescueGrace;
    const running = !waitingForRescue && !state.clock.paused && !document.hidden && !emergency && !t.paused && !t.pending;
    const speed = stepSpeed(team);
    if (old && old.trip === t && old.stage === stage && old.speed === speed && Boolean(old.timer) === running) continue;
    const previous = old?.trip === t && old.stage === stage ? stepFraction(team) : old ? 0 : t.progress || 0;
    const fraction = previous < .01 ? 0 : previous;
    clearTimeout(old?.timer);
    const duration = t.fight && t.paced ? 1000 : 2000;
    const delay = duration / speed * (1 - fraction);
    const clock = { trip:t, stage, speed, fraction, timer:null, delay, started:performance.now() };
    clocks.set(team, clock);
    if (running) clock.timer = setTimeout(() => advanceExpedition(team), clock.delay);
  }
}
let interruptedModal = "";
function surfaceEmergency() {
  const team = urgent();
  if (!team) {
    if (modal === "urgent") {
      if (interruptedModal) {
        modal = interruptedModal;
        interruptedModal = "";
        drawModal();
      } else closeModal();
    }
    return;
  }
  if (modal !== "urgent") {
    interruptedModal = modal;
    if (modal === "profile") profileDraft = readProfile($("#profile-editor"));
  }
  if (!interruptedModal) {
    state.selectedParty = g.partyNumber(state, team);
    page = "hall";
  }
  showModal("urgent");
}
function advanceExpedition(team) {
  delete team.trip.progress;
  const featCount = state.guildProgress.feats.length;
  g.step(state, team);
  const previousWarning = saveWarning;
  surfaceEmergency();
  if (["character","gambits","retirement"].includes(modal) && !g.person(state,characterId)) closeModal();
  save();
  if (team.phase === "report" || team.trip.unit.some(u=>u.id===characterId)) refreshCharacter();
  if (team.phase === "report" || team.trip.rescue || team.trip.pending || state.guildProgress.feats.length !== featCount || saveWarning !== previousWarning) {
    render();
    if (urgent()) focusEmergency();
    else if (team.phase === "report" && (modal === "prepare" || modal === "plot")) drawModal();
  } else if (page === "hall" && team === selected()) {
    const inventory = $("#party-inventory");
    if (inventory) {
      const open = inventory.open;
      inventory.outerHTML = partyInventory();
      $("#party-inventory").open = open;
    }
    $("#scene-location").textContent = sceneLocation(team.trip);
    $("#trip-progress").innerHTML = tripProgress(team.trip);
    $("#combat-readout").innerHTML = combatReadout(team.trip);
    $("#trip-log").innerHTML = logs([...team.trip.log].reverse());
    $(".party-members").innerHTML = team.trip.unit.map(u => partyRow(u.id, u)).join("");
  }
  scheduleStep();
}
function focusEmergency() {
  $("#dialog-body [data-action='reply']")?.focus();
}
const choiceText = { grove:"採集路へ進む", pass:"岩場の近道へ", return:"今すぐ帰還する", delegate:"リーダーに任せる", carry:"担いで続行", med:"回復薬を1本使う" };
function mapView(t) {
  if (t.dungeon && t.dungeon !== "moss") {
    const rooms = g.tripRooms(t), here = rooms[t.node];
    return `<p>第${here.sheet}階 ・ ${here.name}</p><p class="fine">進める場所　${here.next.map(id => rooms[id].name).join(" ／ ")}</p>`;
  }
  const groveGathered = t.route === "grove" && t.cargo.ore > 0;
  const places = [
    ["gate", "入口", "spring", 8, 53, t.steps > 0],
    ["meadow", "野原", "gather", 26, 53, t.cargo.herb > 0],
    ["fork", "分岐", "path", 44, 53, Boolean(t.route)],
    ["grove", "採集路", "gather", 65, 24, groveGathered],
    ["pass", "近道", "rock", 60, 76, t.wins >= 1],
    ["vein", "鉱脈", "chest", 77, 76, t.wins >= 2],
    ["home", "帰還", "stairs", 92, 53, groveGathered || t.wins >= 2]
  ];
  const chips = places.map(([id, name, kind, x, y, done]) => {
    const current = id === t.node;
    return `<span style="left:${x}%;top:${y}%" class="map-node ${current ? "here" : ""}" ${current ? 'aria-current="location"' : ""}>
      ${asset(`chip_dun_${kind}_${done ? "done" : "normal"}`, "", done ? "探索済み" : "")}<small>${name}</small></span>`;
  }).join("");
  return `<div class="map-view" role="group" aria-label="固定1階の分岐図。現在地：${g.tripRooms(t)[t.node].name}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="8,53 26,53 44,53 65,24 92,53"/><polyline points="44,53 60,76 77,76 92,53"/></svg>${chips}</div>`;
}
function logs(entries) {
  return `<ol class="logs">${entries.map(e=>`<li><small>${e.step}歩</small><span>${esc(e.message)}</span></li>`).join("")}</ol>`;
}
function combatNotes() {
  return `<details class="rules"><summary>自動戦闘の計算と療養</summary><div class="enemy-info">${asset("boar")}<p><b>苔イノシシ</b><br>HP13 ／ 攻31 ／ 防4 ／ 速10</p></div><p>速の高い順に行動。敵は残HPが最も低い仲間を狙います。同値は編成順です。ダメージ＝max(1, ⌊攻×武器倍率−相手の防×0.5⌋)。10ラウンドで未決着なら帰還します。</p><p>技や手当てはMPを2消費。HPが0になるたび死亡回数が増え、${g.deathThreshold(state)}回目で永久消失します。重度の捻挫は2週間、骨折は4週間で復帰します。錬金術師の店があると骨折は3週間に短縮されます。宿屋と食べ物屋は週ごとの回復を助けます。</p></details>`;
}
function tripProgress(t) {
  return `${mapView(t)}<div class="location">${tag(t.steps+" 歩","mint")}<b>${g.tripRooms(t)[t.node].name}</b></div>
    <div class="ledger"><div>受注依頼<b>${g.quests[t.quest].name}</b></div><div>荷物<b>薬草 ${t.cargo.herb} ・ 鉱石 ${t.cargo.ore} ・ 薬 ${t.meds}</b></div></div>`;
}
function combatReadout(t) {
  const f = t.fight, events = t.effects || [];
  if (!f && !events.length) return "";
  const enemies = f?.enemies.map(e => g.foes[e.kind].name+" HP "+e.hp+"/"+g.foes[e.kind].hp+(e.casting ? " ・ 詠唱中" : "")).join(" ／ ");
  return `<div class="battle-readout"><b>${f ? "戦闘中" : "戦闘終了"}${enemies ? "　"+enemies : ""}</b>
    ${events.map(e => `<span>${esc(e.message)}</span>`).join("")}</div>`;
}
function rescueStatus(t) {
  return t.rescue.dispatched === false ? "救助隊の派遣待ち" : "救助隊が捜索中";
}
function rescueNotice(team) {
  const t = team.trip, search = t?.rescue;
  if (team.phase !== "explore" || !search || !t.unit.some(u=>u.state === "captured")) return "";
  const left = Math.max(0,g.rescueGrace-search.elapsed);
  const travel = Math.max(1,(state.town.landmark === "castle" ? 1 : 3)-(search.travel || 0));
  return `<section class="raid-bulletin"><b>${teamBadge(team)} ・ ${rescueStatus(t)}</b><p>${t.unit.filter(u=>u.state === "captured").map(u=>esc(who(u.id).name)).join("・")}が捕縛されています。救出の猶予は残り${left}手、到着まで${travel}手です。期限を過ぎると負傷や精神崩壊、妊娠、死亡の恐れがあります。</p>
    ${search.dispatched ? "" : action("dispatch-rescue","救助隊を派遣","primary",`data-party="${g.partyNumber(state,team)}"`)}</section>`;
}
function sceneLocation(t) {
  const status = t.rescue ? rescueStatus(t) : t.pending ? "返信待ち" : t.paused || state.clock.paused ? "一時停止" : `${t.steps} 歩`;
  return `${g.tripRooms(t)[t.node].name} ・ ${status}`;
}
function explore() {
  const t = selected().trip, c = t.pending;
  const comm = c ? action("nav",teamName(selected())+(c.type === "crisis" ? "から緊急通信" : "の伝書を読む"),"btn",'data-id="mail"') : "";
  return sceneHead("compass",demo ? "探索の見守り窓 ・ デモ" : "探索の見守り窓",teamBadge(selected())+" ・ "+g.dungeons[t.dungeon || "moss"].name,cap("第 "+g.tripRooms(t)[t.node].sheet+" 階"))+
    `<figure class="scene-frame">${panorama("dungeon","苔むす洞窟の小道を、遠征メンバーが隊列を組んで進む。")}
    <figcaption class="scene-caption"><h2>${icon(c?"mail":"flag",19)}<span id="scene-location">${sceneLocation(t)}</span></h2>
    <div class="actions">${action("pause",t.paused?"隊を再開":"隊を一時停止","btn",c?"disabled":"")}${action("speed","速度 ×"+stepSpeed(),"btn",c?"disabled":"")}</div></figcaption><div id="combat-readout" role="status">${combatReadout(t)}</div></figure>
    <div class="dashboard"><div class="left-col">${comm}<section class="panel padded">${title("map","探索地図")}
    <div id="trip-progress">${tripProgress(t)}</div>
    <div class="actions">${action("return","帰還する","btn",c || t.rescue ? "disabled" : "")}</div>${combatNotes()}</section></div>
    <div class="right-col">${partyPanel()}<section class="panel padded">${title("book","探索日誌")}<div id="trip-log">${logs([...t.log].reverse())}</div></section></div></div>`;
}
function ledger(r) {
  const rows=[["reward","依頼報酬",1],...(r.actual.tribute === undefined ? [] : [["tribute",`ギルドへ上納（${r.actual.tributeRate}%）`,-1],["partyReward","上納後の隊の取り分",1]]),["share","仲間への分配",-1],["food","食料",-1],["medicine","使用した薬",-1],["wages","所属冒険者の給与",-1],["net","ギルド・隊の合計収支",1]];
  return `<table class="accounts"><thead><tr><th>帳簿</th><th>見積</th><th>実額</th></tr></thead><tbody>${rows.map(([k,name,sign])=>`<tr><th>${name}</th><td>${r.quote[k] === undefined ? "—" : signed(sign*r.quote[k])}</td><td>${signed(sign*r.actual[k])} G</td></tr>`).join("")}</tbody></table>`;
}
function report(r, live) {
  const q=g.quests[r.quest], reasons=[`勝利${r.wins}戦・依頼${r.success?"達成":"未達"}`,"直近の達成率と消失による減点",`重傷の新規発生 ${r.severe}人`,`達成分配 ${r.success?"+2":"0"}・負傷 ${r.wounded}人`];
  return `<div class="report-wrap"><div class="section-title"><h2>${icon("flag",23)}第${r.week}週　${teamName(teams()[r.partyNumber - 1])}の帰還報告</h2>${tag(r.success?"依頼達成":"依頼未達",r.success?"mint":"rose")}</div>
    <div class="split"><section class="panel padded"><h3>${q.name}</h3><p>${esc(r.reason)}。${g.items[q.item].name}${r.delivered}個を納品。</p>${ledger(r)}
    <p class="fine">精算時のギルド金庫 ${r.returnedGold} G${r.returnedWallet === undefined ? "" : ` ／ 隊の残高 ${r.returnedWallet} G（今回の補給費負担 ${r.actual.partyCosts} G）`} ／ 帰還後の売却 ＋${r.sold} G</p>
    ${r.log.filter(e => e.relic).map(e => `<p><b>一点物の発見</b>　${esc(e.message)}</p>`).join("")}
    <div class="ledger"><div>今回の余剰<b>薬草 ×${r.surplus.herb} ・ 鉱石 ×${r.surplus.ore}</b></div><div>研究に卸した鉱石<b>${r.donated}個</b></div></div></section>
    <section class="panel padded">${title("chart","ギルドの指標")}<div class="report-metrics">${labels.map((name,i)=>`<div><b>${name}</b><span>${r.before[i]} → ${r.after[i]}</span>${tag(signed(r.after[i]-r.before[i]),r.after[i]<r.before[i]?"rose":"mint")}<small>${reasons[i]}</small></div>`).join("")}</div></section></div>
    <div class="split"><section class="panel padded">${title("team","仲間の様子",cap("基礎 EXP ＋"+r.xp))}${r.unit.map(u=>`<div class="return-row">${portrait(who(u.id))}<b>${esc(who(u.id).name)}</b><span>${names[u.state]}${u.state==="lost" ? "" : " ・ EXP ＋"+(u.xp ?? r.xp)} ・ ${u.state==="lost"?"永久消失":u.endOfLife?"帰還後に天寿を全う":u.recoveryWeek?"第"+u.recoveryWeek+"週以降に復帰":u.injury?esc(u.injury.kind)+"・第"+u.injury.readyWeek+"週復帰":u.state==="severe"?"翌週は療養":"翌週出撃可"}${u.moraleChange == null ? "" : " ・ 士気 "+signed(u.moraleChange)}</span></div>`).join("")}
    <details class="rules"><summary>判断と結果の記録</summary>${logs(r.log)}</details></section>${live?stockPanel():""}</div>
    ${live && waitingLetters().length ? `<div class="close-day">${waitUntilNextWeek()}</div>` : live?`<div class="close-day"><p>${g.anyAway(state)?"遠征中の隊がすべて帰還すると、週を締められます。":state.unlocked?"翌週へ向けて、仲間を休ませましょう。":"トトがマルタに帰還を知らせました。来週、新しい注文が届きます。"}</p>${action("next",icon("sun",17)+" 週を締めて翌週へ","primary",g.anyAway(state)?'disabled title="全隊の帰還を待ってください"':"")}</div>`:""}</div>`;
}
function modalHead(sym,name) {
  return `<div class="modal-head"><h2 id="dialog-title">${icon(sym,24)}${name}</h2>${action("close",icon("close",19),"icon-btn",'aria-label="閉じる"')}</div>`;
}
let profileSlot, profileDraft, emblemUpload;
const policySuggestions = ["安全第一", "深く潜る", "稼ぎ重視"];
const emblemPalette = [
  ["深緑","#456449"], ["青磁","#72a693"], ["藍","#345778"], ["空色","#83bddd"],
  ["藤","#8973aa"], ["葡萄","#703756"], ["茜","#b14d49"], ["琥珀","#ca8842"],
  ["金","#f4dfa4"], ["象牙","#fff6df"], ["銀","#b8c3c8"], ["墨","#343b32"]
];
function emblemColorField(name, label, color) {
  return `<div class="emblem-color"><label>${label}<input type="color" name="${name}" value="${color}"></label>
    <div class="emblem-palette" role="group" aria-label="${label}の候補">${emblemPalette.map(([tone,hex]) =>
      action("emblem-color", "", "emblem-swatch", `data-field="${name}" data-id="${hex}" style="--swatch:${hex}" title="${tone}" aria-label="${label}を${tone}にする"`)
    ).join("")}</div></div>`;
}
function emblemPreview(emblem) {
  return emblem.mode === "upload" && !emblem.image ? "" : drawEmblem(emblem);
}
function profileForm() {
  const guild = profileSlot === 0, p = profileDraft, emblem = p.emblem;
  const choices = (items, current) => Object.entries(items).map(([key, label]) =>
    `<option value="${key}" ${key === current ? "selected" : ""}>${label}</option>`).join("");
  return modalHead("edit", guild ? "ギルド設定" : `第${profileSlot}隊の設定`) +
    `<form id="profile-editor">
      <label>${guild ? "ギルド名" : "パーティー名"}<input name="name" required value="${esc(p.name)}"></label>
      ${guild ? `<label>目的<input name="purpose" value="${esc(p.purpose)}" placeholder="辺境の平和を守る"></label>
        <label>ギルド方針<input name="policy" value="${esc(p.policy)}"></label>
        <div class="policy-suggestions" role="group" aria-label="方針の候補">${policySuggestions.map(label =>
          action("suggest-policy", label, "btn", `data-id="${label}"`)).join("")}</div>
        <label>所属隊の依頼報酬の上納率（%）<input name="tributeRate" type="number" min="0" max="30" step="1" required value="${p.tributeRate ?? state.tributeRate}"></label>
        <fieldset><legend>階級と昇級試験</legend>
          <label>階級名（低い順に1行1段）<textarea name="rankNames" required rows="5">${esc((p.rankNames || state.ranks.names).join("\n"))}</textarea></label>
          <small>段を減らしても取得済みの段位は記録されます。設定にない段位を要する依頼は休止します。</small>
          <label>試験の重点<select name="examFocus">${choices(g.examFocuses,p.examFocus || state.ranks.focus)}</select></label>
          <label>合格ライン<select name="examStrictness">${choices(g.examLines,p.examStrictness || state.ranks.strictness)}</select></label>
          <small>厳格な試験ほど、合格時にギルドの名声が上がります。</small>
        </fieldset>
        <label>能力の振り直し<select name="allowStatReset">${choices({yes:"許可（"+g.resetCost+" G）",no:"禁止"},(p.allowStatReset ?? state.allowStatReset) ? "yes" : "no")}</select></label>` : ""}
      <fieldset class="emblem-editor"><legend>エンブレム</legend>
        <div class="emblem-fields"><div id="emblem-preview">${emblemPreview(emblem)}</div>
        <div class="emblem-controls">
          <label class="emblem-wide">作成方法<select name="mode" id="emblem-mode">${choices({compose:"組み合わせ",upload:"画像アップロード"}, emblem.mode || "compose")}</select></label>
          <label>土台の形<select name="shape">${choices(g.emblemShapes, emblem.shape)}</select></label>
          <label>装飾<select name="frame">${choices(g.emblemFrames, emblem.frame || "line")}</select></label>
          <div id="emblem-symbol" class="emblem-wide" ${emblem.mode === "upload" ? "hidden" : ""}>
            <label>紋様<select name="symbol">${choices(g.emblemSymbols, emblem.symbol)}</select></label></div>
          <div id="emblem-upload" class="emblem-wide" ${emblem.mode === "upload" ? "" : "hidden"}>
            <label>エンブレム画像<input type="file" id="emblem-file" accept="image/png,image/jpeg,image/webp" aria-describedby="emblem-hint emblem-status"></label>
            <small id="emblem-hint">PNG・JPEG・WebP。中央を正方形に切り抜いて保存します。</small>
            <small id="emblem-status" role="status">${emblemUpload ? "画像を読み込み中…" : ""}</small></div>
          ${emblemColorField("ground", "地色", emblem.ground)}
          ${emblemColorField("ink", "紋様・装飾色", emblem.ink)}
        </div></div></fieldset>
      <div class="actions"><button type="submit" id="profile-save" class="primary" ${emblem.mode === "upload" && (emblemUpload || !emblem.image) ? "disabled" : ""}>設定を保存</button>${action("close", "キャンセル")}</div>
    </form>`;
}
function readProfile(form) {
  const { name, purpose, policy, shape, symbol, ground, ink, frame, mode, tributeRate, allowStatReset, rankNames, examFocus, examStrictness } = Object.fromEntries(new FormData(form));
  return { name, purpose, policy, tributeRate:tributeRate === undefined ? undefined : Number(tributeRate), rankNames:rankNames?.trim().split(/\r?\n/), examFocus, examStrictness, allowStatReset: allowStatReset !== "no",
    emblem: { shape, symbol, ground, ink, frame, mode, image:profileDraft.emblem.image } };
}
function updateEmblem(form) {
  const emblem = readProfile(form).emblem, upload = emblem.mode === "upload";
  $("#emblem-upload").hidden = !upload;
  $("#emblem-symbol").hidden = upload;
  $("#profile-save").disabled = upload && (Boolean(emblemUpload) || !emblem.image);
  $("#emblem-preview").innerHTML = emblemPreview(emblem);
}
async function readEmblem(input) {
  const file = input.files[0];
  if (!file) return;
  const ticket = emblemUpload = {};
  const current = () => emblemUpload === ticket && (modal === "profile" || interruptedModal === "profile");
  $("#emblem-status").textContent = "画像を読み込み中…";
  updateEmblem(input.form);
  let message = "";
  try {
    const canvas = await squareImage(file, 128);
    let image = canvas.toDataURL("image/webp", .8);
    if (!g.validEmblemImage(image)) {
      const small = document.createElement("canvas");
      small.width = small.height = 64;
      small.getContext("2d").drawImage(canvas, 0, 0, 64, 64);
      image = small.toDataURL("image/png");
    }
    if (!g.validEmblemImage(image)) throw Error("画像を保存サイズに変換できませんでした。");
    if (current()) profileDraft.emblem.image = image;
  } catch (error) {
    message = error.message;
  } finally {
    if (current()) {
      emblemUpload = null;
      input.value = "";
      if (modal === "profile") {
        $("#emblem-status").textContent = message;
        updateEmblem($("#profile-editor"));
      }
    }
  }
}
let selectedPlot;
function activePlot() {
  if (modal === "plot") return selectedPlot;
  const button = document.activeElement;
  if (button?.dataset.action === "plot" && button.matches(":focus-visible"))
    return button.dataset.id === "hill" ? GuildVoxelMaps.hillPlot : g.territoryPlots.find(plot => plot.id === button.dataset.id);
}
function selectPlot(id) {
  selectedPlot = id === "hill" ? GuildVoxelMaps.hillPlot : g.territoryPlots.find(plot => plot.id === id);
  if (selectedPlot && (!selectedPlot.road || townCamera)) {
    if (state.town.workshops[id]) return openShop(id);
    if (page !== "town") navigate("town");
    $(`[data-action="plot"][data-id="${id}"]`).ariaExpanded = "true";
    showModal("plot");
  }
}
function productionText(shop) {
  const type = g.shopTypes[shop.type];
  return `${materialName(type)}を加工（${type.recipes[0].name}など・店 Lv.${shop.level}）`;
}
function buildingEffect(kind, plot, shop) {
  const effects = g.facilityEffects(kind,plot,shop);
  const lines = Object.entries(effects).map(([key,n]) => g.facilityEffectText[key](n));
  if (shop) lines.push(productionText(shop));
  return lines.join(" ／ ");
}
function facilityList() {
  const town = state.town;
  const stopped = town.repairs.hall || town.smithReadyWeek > state.week;
  const rows = [`<li><b>ギルド併設の鍛冶屋${stopped ? "（休業中）" : ""}</b><br>${productionText(town.workshops.hall)}</li>`];
  for (const plot of g.territoryPlots) {
    const kind = town.plots[plot.id];
    if (!kind) continue;
    const shop = town.workshops[plot.id];
    const name = kind === "tavern" ? "酒場（食べ物屋）" : shop ? g.shopTypes[shop.type].name : g.buildings[kind].name;
    const status = town.repairs[plot.id] ? " ・ 損傷のため効果休止中" : "";
    rows.push(`<li><b>${plot.name}の${name}${status}</b><br>${buildingEffect(kind,plot,shop)}</li>`);
  }
  const landmark = g.landmarks[town.landmark];
  if (landmark) rows.push(`<li><b>見晴らしの丘の${landmark.name}</b><br>${landmark.effect}</li>`);
  return `<details class="rules"><summary>施設一覧と効果（${rows.length}件）</summary><ul>${rows.join("")}</ul></details>`;
}
function hillPanel() {
  const kind = state.town.landmark, current = g.landmarks[kind], price = g.landmarkPrice(state);
  const choices = Object.entries(g.landmarks).filter(([id])=>id !== kind).map(([id,b]) =>
    action("build-landmark",`<i class="landmark-stamp" aria-hidden="true" style="background-image:url('${assetUrl("turn_"+id)}')"></i><strong>${b.name}</strong><small>${b.effect}</small>`,
      "catalog-item landmark-choice",`data-id="${id}" ${g.guildGold(state)<price ? "disabled" : ""}`)).join("");
  let service = "";
  if (kind === "cathedral") {
    const patients = state.roster.filter(p=>Object.keys(p.debuffs).length);
    service = "<h4>大聖堂の診療</h4>"+(patients.map(p=>action("character",esc(p.name)+"の治療手帳","btn",`data-id="${p.id}"`)).join(" ") || "<p>治療が必要な冒険者はいません。</p>");
  }
  if (kind === "memorial") {
    const retired = state.alumni.filter(p=>p.retiredWeek || p.departure.kind === "retired");
    service = "<h4>引退者の芳名録</h4>"+(retired.map(p=>`<details><summary>第${p.retiredWeek || p.departure.week}週　${esc(g.formalName(p))}</summary><ol class="logs">${p.career.map(e=>`<li><small>第${e.week}週</small><span>${esc(e.message)}</span></li>`).join("")}</ol></details>`).join("") || "<p>顕彰する引退者はまだいません。</p>");
  }
  return modalHead("map","見晴らしの丘")+
    (current ? `<h3>${current.name}</h3><p>${current.effect}</p>${service}` : "<p>町を見渡す丘に、ギルドの特殊建造物を1棟建てられます。</p>")+
    `<div class="catalog-heading"><h3>${current ? "建て替え" : "建築"} ・ ${price} G</h3><span>ギルド金庫　${money(g.guildGold(state))}</span></div>
     <p class="fine">${current ? "候補を選ぶと今の建造物を取り替えます。" : "候補を選ぶと建築費を支払います。"}</p><div class="hill-catalog">${choices}</div>`;
}
function plotPanel(plot) {
  if (plot.id === "hill") return hillPanel();
  const built = g.buildings[state.town.plots[plot.id]];
  const heading = modalHead("map",plot.name) +
    `<div class="plot-meta">${tag(plot.size+" × "+plot.size+" タイル","mint")}<span>${plot.road ? g.roadNames[plot.road]+"沿い ・ " : ""}${built ? built.group : "空き地"} ・ ${plot.size**2} タイル</span></div>`;
  if (built && state.town.repairs[plot.id]) return heading + `<h3>${built.name}</h3>` + repairStatus(plot.id);
  if (built) return heading + `<h3 class="plot-name">${built.name}</h3><p>${buildingEffect(state.town.plots[plot.id],plot)}</p>`;
  const groups = new Map();
  for (const [id,building] of Object.entries(g.buildings)) {
    if (!groups.has(building.group)) groups.set(building.group,[]);
    const price = g.townPrice(plot,building);
    let choice = action("build",
      `<strong>${id==="shop" ? "選んだ専門商店を建築" : id==="tavern" ? "酒場（食べ物屋）" : building.name}</strong><span>${price} G</span><small>${buildingEffect(id,plot)}</small>`,
      "catalog-item", `data-id="${id}" ${g.guildGold(state) < price ? "disabled" : ""}`);
    if (id === "shop") {
      const specialties = Object.fromEntries(Object.entries(g.shopTypes).filter(([,t])=>t.building==="shop"));
      choice = `<div class="shop-build"><label>商店の専門<select id="build-specialty">${options(specialties)}</select></label>${choice}</div>`;
    }
    groups.get(building.group).push(choice);
  }
  return heading + `<div class="catalog-heading"><h3>建築カタログ</h3><span>所持金　${money(g.guildGold(state))}</span></div>
    <p class="fine">施設を選ぶと、表示額を支払ってこの区画に建築します。</p>` +
    Array.from(groups, ([group,items])=>`<section class="catalog-group"><h4>${group}</h4><div>${items.join("")}</div></section>`).join("");
}
function showModal(type) {
  modal=type; $("#dialog").setAttribute("aria-labelledby","dialog-title");
  if (type==="prepare") {
    const team = selected(), party = team.party.filter(id => g.available(state,who(id)));
    draft = {party,dungeon:team.dungeon,leader:party.includes(team.leader) ? team.leader : party[0],policy:team.policy,meds:team.meds};
  }
  if(type==="create"){ customImage="";imageBusy=false;imageTicket++; }
  drawModal();
  if (!$("#dialog").open) $("#dialog").showModal();
}
function drawModal() {
  const body=$("#dialog-body");
  if (modal === "urgent") {
    const team = urgent(), t = team.trip, c = t.pending, leader = who(t.leader);
    const buttons = g.choices(state,team).map(id => action("reply",choiceText[id],id === "return" ? "primary" : "btn",
      `data-id="${id}" data-party="${g.partyNumber(state,team)}"`)).join("");
    body.innerHTML = `<h2 id="dialog-title">${teamBadge(team)}から緊急通信</h2>
      <div class="speech">${portrait(leader)}<div><b>${esc(c.senderName ?? leader.name)}</b><p>${esc(c.line)}</p></div></div>
      <p>${g.tripRooms(t)[t.node].name}で${esc(who(c.target).name)}が戦闘不能。${lifeStatus(who(c.target))}。${who(c.target).injury ? "骨折の治療には町での療養が必要です。" : `回復薬でHP${Math.min(g.outfittedStat(state,who(c.target),"hp"),g.supplyPower("medicine",t.packed?.medicine[0]?.quality || 1))}に復帰します。担いで再戦すると重傷になります。`}</p>
      ${t.effects?.length ? `<p>${esc(t.effects.at(-1).message)}</p>` : ""}
      <p>${deadlineText(c)}</p>
      <div class="cargo">薬 ${t.meds} 本 ・ ${g.items[g.quests[t.quest].item].name} ${t.cargo[g.quests[t.quest].item]} / ${g.quests[t.quest].count} 個</div>
      <div class="actions">${buttons}${state.raids.active ? action("raid-recall","防衛のため緊急帰還","btn",`data-id="${g.partyNumber(state,team)}"`) : ""}${worldPauseButton()}${waitUntilNextWeek()}</div>`;
  }
  if(modal==="plot") body.innerHTML=plotPanel(selectedPlot);
  if(modal==="prepare") body.innerHTML=prepForm();
  if(modal==="create") body.innerHTML=createForm();
  if(modal==="guest") body.innerHTML=guestDetail();
  if(modal==="character") body.innerHTML=characterDetail();
  if(modal==="resident-family") body.innerHTML=modalHead("book",esc(who(characterId).name)+"の交友")+relationshipPanel(who(characterId));
  if(modal==="retirement") body.innerHTML=modalHead("book",esc(who(characterId).name)+"の引退")+
    `${ageDetails(who(characterId))}<p>引退すると遠征と育成を終え、町の住人になります。歩みは帰還記録に残ります。引退後の再入団はできません。</p><div class="actions">${action("retire","引退して町に残る","primary")}${action("character","人物手帳に戻る","btn",`data-id="${characterId}"`)}</div>`;
  if(modal==="gambits") body.innerHTML=gambitEditor();
  if(modal==="profile") body.innerHTML=profileForm();
  if(modal==="help") body.innerHTML=modalHead("book","遊び方") + weekSpeedControl() + chatterControl() + `<ol class="help-list"><li><b>週の初めに仕事を選ぶ</b><p>リーダーが週初めの伝書で行き先を知らせ、標準で12秒の支度を終えると出発します。ホールで隊ごとの優先条件を選べます。手動で依頼や編成を決めたい週は、伝書の「今週の自動判断を止める」を押してください。</p></li><li><b>遠征パーティーを送り出す</b><p>出発準備で1〜3人とリーダーを選択。体調が悪いとリーダーは休暇を取り、プレイヤーもホールから休暇を指示できます。安全第一は戦闘を避け、素材優先では性格が分岐の決め方に影響します。</p></li><li><b>探索と通信を見守る</b><p>出発すると、仲間は約2秒に1歩進み、採集も戦闘も自分たちで行います。全員の動きと相談の期限を止めるには「全体を一時停止」を選びます。標準では、ゲームを表示している実時間4分で翌週になります。遠征パーティーの「戦術オーダー」から、手番で優先する条件・対象・行動を編集できます。隊だけを止めるには「隊を一時停止」、早く見届けるには速度を×2に。分岐の相談は伝書箱に届き、送信した隊が返事を待ちます。仲間が倒れたときは緊急通信が割り込み、全隊が待機します。通常・緊急ともに翌週が返信期限です。「返信せず翌週へ」で週を進めると、未返信の相談は各隊のリーダーが判断します。早めに切り上げたいときは「帰還する」を選びましょう。</p></li><li><b>成果を翌週へ</b><p>帰還時に自動納品・精算。余った品は売却や工房の研究に使えます。週を締めると翌週です。</p></li></ol>${combatNotes()}<p class="fine">探索の歩みと操作はそのつど保存されます。開き直すと、速度や一時停止、返信待ちも復元されます。</p>${action("close","手帳を閉じる","primary wide")}`;
  if(modal==="work") body.innerHTML=modalHead("sun","今週は休養する")+`<p>遠征を休み、町の手伝いをして翌週を迎えます。週給支給後の収入は＋30G。受注前なので信用は変わりません。</p><div class="actions">${action("do-work","町を手伝い、週を締める","primary")}${action("close","戻る","btn")}</div>`;
}
function prepForm() {
  const q=g.quests[selected().quest], quote=g.estimate(state,{...selected(),...draft});
  const canDepart = !state.town.repairs.hall && g.partyQualifies(state,draft.party,q.rank) && g.partyQualifies(state,draft.party,g.dungeonRank(draft.dungeon));
  const destinations = Object.entries(g.dungeons).filter(([id])=>g.dungeonOpen(state,id)).map(([id,d])=>{
    const rank = g.dungeonRank(id);
    return `<option value="${id}" ${id===draft.dungeon?"selected":""} ${g.partyQualifies(state,draft.party,rank)?"":"disabled"}>${d.name}（${esc(g.rankLabel(state,rank))}以上）</option>`;
  }).join("");
  return modalHead("pack",teamName(selected())+"の出発準備")+`<div class="prep-order">${asset(q.item)}<div><small>受注する依頼 ・ 受注した週限り</small><h3>${q.name}</h3><span>${g.items[q.item].name} ×${q.count} ／ 報酬 ${q.reward}G ／ 危険度 ${q.risk}</span></div></div>
    <div class="form-title"><b>遠征メンバー</b><small>${draft.party.length} / 3 人</small></div>
    <div class="pick-list">${state.roster.map(p=>`<label class="pick ${draft.party.includes(p.id)?"picked":""}"><input type="checkbox" data-pick="${p.id}" ${draft.party.includes(p.id)?"checked":""} ${g.available(state,p)&&!g.awayMember(state,p.id)?"":"disabled"}>${portrait(p)}<span><b>${esc(p.name)}</b><small>${g.jobs[p.job].name} ・ ${g.traits[p.trait]} ・ ${esc(g.rankName(state,p))}${assignmentHint(p)}</small></span></label>`).join("")}</div>
    <label>行き先<select id="dungeon">${destinations}</select></label><small>依頼の必要階級：${esc(g.rankLabel(state,q.rank))}以上。隊員全員が条件を満たすと出発できます。</small>
    ${state.town.landmark === "academy" ? `<p><b>学院の古地図</b>　最初の分岐の先は${g.surveyDungeon(state,draft.dungeon).join(" ／ ")}。</p>` : ""}
    <div class="form-pair"><label>リーダー<select id="leader">${draft.party.map(id=>`<option value="${id}" ${draft.leader===id?"selected":""}>${esc(who(id).name)}</option>`).join("")}</select></label><label>探索方針<select id="policy">${Object.entries(g.policies).map(([id,name])=>`<option value="${id}" ${draft.policy===id?"selected":""}>${name}</option>`).join("")}</select></label></div>
    <p class="fine">${draft.policy==="safe"?"安全第一は採集路へ。薬草が主な収穫で、鉱石は1個です。":"素材優先では両路が候補。大胆は近道へ進み、他の性格は判断を仰ぎます。"}</p>
    <label class="med-row">${asset("potion")}<span><b>回復薬</b><small>隊 ${selected().bag.supplies.medicine} 本・ギルド ${state.supplies.medicine} 本 ・ 不足分は1本30G</small></span><select id="meds">${[0,1,2,3].map(n=>`<option value="${n}" ${draft.meds===n?"selected":""}>${n} 本</option>`).join("")}</select></label>
    <p class="fine">保存食 ${quote.rations} 食・調合済み回復薬 ${quote.packedMeds} 本を携行。隊の持ち物を優先し、不足分はギルドから補給します。</p>
    <details class="rules"><summary>装備・戦闘の詳細</summary><p>${state.weapon?"木洩れ日の刃："+esc(who(state.wielder)?.name || "未装備")+`（攻撃×${g.bladeMultiplier(state.weaponQuality)}）。工房で付替えできます。`:"武器の基本倍率は1.0。余剰鉱石1個で研究完了、次の準備から80Gで木洩れ日の刃を購入できます。"}</p>${combatNotes()}</details>
    ${draft.policy==="safe"&&q.item==="ore"&&q.count>1?'<p class="warning">安全第一では鉱石は1個までです。この依頼の必要数を集めるには、素材優先で岩場の近道へ。</p>':""}
    <div class="estimate"><div><b>出発前の見積（合計収支）</b><strong>${signed(quote.net)} G</strong></div><p>報酬 ${quote.reward} → 上納 ${quote.tribute}（${quote.tributeRate}%）→ 隊の取り分 ${quote.partyReward} G</p><p>仲間への分配 −${quote.share} ／ 食料 −${quote.food} ／ 薬 −${quote.medicine} ／ 給与 −${quote.wages} G</p><small>達成・全薬使用を想定。全員の週給は最初に出発する隊で精算します。補給費 ${quote.food+quote.medicine} G は隊が負担し、不足分をギルドが支援します。</small></div>
    ${action("depart",state.town.repairs.hall ? "ギルドホールの修理待ち" : icon("flag",18)+" この編成で出発する","primary wide",canDepart&&!g.claimed(state,selected().quest,selected())&&g.expeditionFunds(state,selected())>=quote.food+quote.medicine?"":"disabled")}
    <div class="prep-footer">${action("keep-party","編成を保存","text-btn",draft.party.length?"":"disabled")}${action("manage","名簿で雇用・登録","text-btn")}${action("work","遠征を休んで町を手伝う","text-btn",g.weekStarted(state)?"disabled":"")}</div>`;
}
function options(obj) { return Object.entries(obj).map(([k,v])=>`<option value="${k}">${esc(v.name || v)}</option>`).join(""); }
function initialSkillOptions(job) {
  return g.jobs[job].skills.map(id=>`<option value="${id}">${g.abilities[id].name}（${skillDescription(id)}）</option>`).join("");
}
function creationAgeHint(id) {
  const r = g.species[id];
  return r.description+" 成人"+r.adult+"歳・寿命"+r.lifespan+"歳。"+(r.decline === null ? "加齢による衰えはありません。" : r.decline+"歳から衰えが始まります。");
}
function createForm() {
  return modalHead("team","自作冒険者の登録")+`<form id="creator"><p class="fine">1人を無料で登録できます。年長者は経験と技能を持って入団します。若いほど遠征で得る経験値が多くなります。</p>
    <label>名前<input name="name" maxlength="8" required placeholder="冒険者の名前"></label>${characterNameFields()}<div class="form-pair"><label>職業<select name="job" id="creator-job">${g.startingJobs.map(id=>`<option value="${id}">${g.jobs[id].name}</option>`).join("")}</select></label><label>性格<select name="trait">${options(g.traits)}</select></label></div>
    <div class="form-pair"><label>種族<select name="species" id="creator-species">${options(g.species)}</select></label>
    <label>年齢（歳）<input name="age" id="creator-age" type="number" step="1" min="${g.species.human.adult}" max="${g.species.human.lifespan-1}" value="${g.species.human.adult}" required></label></div>
    <small id="creator-aging">${creationAgeHint("human")}</small>
    <label>性別<select name="sex">${options({unspecified:"未指定",female:"女性",male:"男性"})}</select></label>
    <label>初期スキル<select name="initialSkill" id="initial-skill">${initialSkillOptions(g.startingJobs[0])}</select></label>
    <label>過去・生い立ち（任意）<textarea name="backstory" rows="3" placeholder="ギルドを訪れた理由など"></textarea></label>
    <div class="form-pair"><label>一人称<input name="pronoun" value="私" maxlength="12"></label><label>マスターの呼び方<input name="master" value="マスター" maxlength="16"></label></div>
    <div class="form-pair"><label>話し方<select name="tone">${options({polite:"丁寧",normal:"普通",casual:"くだけた",rough:"乱暴"})}</select></label><label>語尾（任意）<input name="ending" maxlength="12" placeholder="例：ですわ"></label></div>
    <label>顔画像（任意）<input type="file" id="portrait-file" accept="image/png,image/jpeg,image/webp"></label><p class="fine">PNG・JPEG・WebP。名簿と通信に同じ顔が表示されます。</p>
    <div id="voice-preview"></div><button class="primary wide" type="submit">名簿に登録する</button></form>`;
}
function updatePreview() {
  const form=$("#creator"); if(!form) return;
  const p=Object.fromEntries(new FormData(form)); p.pronoun ||= "私"; p.master ||= "マスター"; p.portrait=customImage;
  const friend = state.roster[0] ? g.familiarName(state.roster[0]) : "仲間";
  const race = p.species || "human", r = g.species[race], age = Number(p.age ?? r.adult);
  const training = g.entryTraining(p.job,race,age,p.initialSkill);
  const summary = Number.isInteger(age) && age >= r.adult && age < r.lifespan ?
    `<p>入団時　Lv.${training.level} ・ 経験値 ${training.xp} ・ ${training.skills.map(id=>g.abilities[id].name).join("、")}</p>` : "";
  $("#voice-preview").innerHTML=`${summary}<div class="speech">${portrait(p)}<div><b>通信のプレビュー</b><p>「${esc(g.speak(p,"crisis",friend))}」</p></div></div>`;
}
async function squareImage(file, size) {
  if (!["image/png","image/jpeg","image/webp"].includes(file.type)) throw Error("PNG・JPEG・WebPを選んでください。");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw Error("画像を読み込めませんでした。"); }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    canvas.getContext("2d").drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,size,size);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}
async function readFace(input) {
  const ticket = ++imageTicket; imageBusy=true; customImage="";
  try {
    if (!input.files[0]) return;
    const canvas = await squareImage(input.files[0], 256);
    if (ticket === imageTicket) customImage = canvas.toDataURL("image/png");
  } catch(error){input.value="";toast(error.message || "画像を読み込めませんでした。");}
  finally { if(ticket===imageTicket){imageBusy=false;updatePreview();} }
}
function closeModal() { $("#dialog").close(); modal=""; }
function navigate(id, keepShop = false) {
  if (id === "forge") return openShop("hall");
  if (id === "shops" && !keepShop) activeShop = null;
  if (modal==="plot" && $("#dialog").open) closeModal();
  const closed = id==="town" && page!=="town" ? page : null;
  page=id; render(); window.scrollTo(0,0);
  if (closed) $(`#sidebar [data-id="${closed}"]`)?.focus();
  else if (page!=="town") $("#management .drawer-bar button")?.focus({preventScroll:true});
}
document.addEventListener("click",event=>{
  const button=event.target.closest("[data-action]"); if(!button || button.disabled) return;
  const {action:cmd,id}=button.dataset;
  try {
    switch(cmd) {
      case "town-mode": changeTownView(id==="stack"); return;
      case "town-turn": changeTownView(true,Number(id)); return;
      case "nav": navigate(id); return;
      case "gambits": characterId = id; showModal("gambits"); return;
      case "rule-add": case "rule-remove": case "rule-up": case "rule-down": case "rule-preset":
        if (modal === "gambits") editRule(cmd,id);
        return;
      case "world-pause":
        tickWorld();
        state.clock.paused = !state.clock.paused;
        scheduleStep();
        if (modal === "gambits" || modal === "urgent") drawModal();
        break;
      case "guest": guestId=id; guestOffer="basic"; showModal("guest"); return;
      case "exam": {
        const result = g.takeExam(state,modal==="guest" ? guestId : characterId);
        if (modal==="guest") drawModal();
        toast(result); break;
      }
      case "scout": {
        const p = g.visitorList(state).find(p=>p.id===guestId);
        if (g.scout(state,guestId,guestOffer)) { closeModal(); toast(p.name+"が仲間になりました。"); }
        else toast("今の条件では専属契約を結べません。支度金を増やすか、交流を重ねましょう。");
        break;
      }
      case "market": g.collectMarket(state); toast("一般冒険者の分け前を金庫と倉庫に移しました。"); break;
      case "character": characterId = id; showModal("character"); return;
      case "resident-family": characterId = id; showModal("resident-family"); return;
      case "give-gift":
        g.giveGift(state,characterId,id); toast(who(id).name+"に贈り物を届けました。");
        if (modal === "resident-family") drawModal();
        break;
      case "marry":
        toast(g.marry(state,characterId,id));
        if (modal === "resident-family") drawModal();
        break;
      case "enlist-child": g.enlistChild(state,id); toast("町で育った子が入団しました。"); break;
      case "retirement": showModal("retirement"); return;
      case "retire": g.retire(state,characterId); closeModal(); page="roster"; break;
      case "hold": g.holdDeparture(state,teams()[Number(button.dataset.party)-1]); break;
      case "vacation": g.takeLeave(state,selected()); break;
      case "allocate": g.allocate(state,characterId,id); break;
      case "reset-allocation": g.resetAllocation(state,characterId); break;
      case "learn-ability": g.learnAbility(state,characterId,id); break;
      case "promote": g.promote(state,characterId); break;
      case "open-shop": openShop(id); return;
      case "shop-view":
        shopView = id;
        render();
        $(`[data-action="shop-view"][data-id="${id}"]`).focus({preventScroll:true});
        return;
      case "deliver": g.deliverMaterial(state,activeShop,buyer()); toast("素材を納品しました。"); break;
      case "learn-skill": g.learnSkill(state,activeShop,id); toast("新しい仕上げを習得しました。"); break;
      case "reset-skills":
        g.resetSkills(state,activeShop);
        recipeId = g.shopTypes[state.town.workshops[activeShop].type].recipes[0].id;
        finishId = "plain";
        toast("料理の専門を選び直せます。"); break;
      case "place-order": case "purchase-order": {
        const order = g.placeOrder(state,activeShop,recipeId,finishId,buyer(),cmd === "purchase-order");
        toast(order.name+"が完成しました。"); break;
      }
      case "party": {
        const number = Number(id);
        if (!teams()[number - 1]) return;
        state.selectedParty = number; save(); navigate("hall"); return;
      }
      case "unlock-party":
        state.selectedParty = g.unlockParty(state); page = "hall"; break;
      case "guild-settings": case "party-settings": {
        profileSlot = cmd === "guild-settings" ? 0 : state.selectedParty;
        const profile = profileSlot ? selected().partyProfile : state.guildProfile;
        profileDraft = {...profile, emblem:{...profile.emblem}};
        emblemUpload = null;
        showModal("profile"); return;
      }
      case "emblem-color": {
        const form = $("#profile-editor");
        form.elements[button.dataset.field].value = id;
        updateEmblem(form);
        return;
      }
      case "suggest-policy":
        $("#profile-editor").elements.policy.value = id;
        return;
      case "plot": selectPlot(id); return;
      case "build-landmark": {
        if (modal !== "plot" || selectedPlot?.id !== "hill" || !$("#dialog").open) return;
        g.buildLandmark(state,id);
        closeModal(); save(); render();
        $('.hill-marker').focus({preventScroll:true});
        toast("見晴らしの丘に"+g.landmarks[id].name+"ができました。");
        return;
      }
      case "cure-debuff": case "fit-limb":
        if (modal !== "character") return;
        g.treatDebuff(state,characterId,id,cmd==="fit-limb");
        break;
      case "build": {
        if (modal !== "plot" || page !== "town" || !$("#dialog").open) return;
        g.build(state,selectedPlot.id,id,id==="shop" ? $("#build-specialty").value : undefined);
        const scroll = $(".town-scroll").scrollLeft;
        closeModal(); save(); render();
        $(".town-scroll").scrollLeft = scroll;
        $(`[data-action="plot"][data-id="${selectedPlot.id}"]`).focus({preventScroll:true});
        const shop = state.town.workshops[selectedPlot.id];
        toast(selectedPlot.name+"に"+(shop ? g.shopTypes[shop.type].name : g.buildings[id].name)+"ができました。");
        return;
      }
      case "close": closeModal(); return;
      case "help": case "work": case "prepare": case "create":
        if ((cmd === "prepare" && selected().phase !== "prep") || (cmd === "create" && g.weekStarted(state))) return;
        showModal(cmd); if(cmd==="create")updatePreview(); return;
      case "manage": closeModal(); navigate("roster"); return;
      case "quest": g.setQuest(state,id,selected()); break;
      case "hire": g.hire(state); toast("シオンが名簿に加わりました。編成で起用できます。"); break;
      case "keep-party":
        g.configure(state,draft.party,draft.leader,draft.policy,draft.meds,selected(),draft.dungeon);
        closeModal(); toast("編成と補給の計画を保存しました。"); break;
      case "depart":
        g.depart(state,selected(),draft,true); closeModal(); page="hall"; window.scrollTo(0,0); break;
      case "pause":
      case "speed":
        if (selected().phase !== "explore" || selected().trip.pending) return;
        if (cmd === "pause") selected().trip.paused = !selected().trip.paused;
        else selected().trip.speed = stepSpeed() === 1 ? 2 : 1;
        break;
      case "raid-recall":
        g.raidRecall(state,teams()[Number(id)-1]); surfaceEmergency(); break;
      case "repair":
        g.startRepair(state,id);
        if (modal==="plot") drawModal();
        toast("修理を発注しました。"); break;
      case "dispatch-rescue": g.dispatchRescue(state,teams()[Number(button.dataset.party)-1]); break;
      case "return": g.returnHome(state,selected()); break;
      case "reply": {
        const team = button.dataset.party ? teams()[Number(button.dataset.party) - 1] : selected();
        g.reply(state,id,team); surfaceEmergency(); break;
      }
      case "sell": g.sell(state,id,page === "shops" ? buyer() : selected()); toast(`${g.items[id].name}1個を${g.salePrice(state,id)}Gで売りました。`); break;
      case "donate": g.donate(state,page === "shops" ? buyer() : selected()); toast("トトの研究が完了！ 次の出発準備で武器を買えます。"); break;
      case "buy": g.buy(state,buyer() || selected(),buyer()); toast("木洩れ日の刃を購入し、装備しました。"); break;
      case "next":
        g.nextWeek(state); lastWorldTick = performance.now();
        if (!modal && page !== "mail") page = "town";
        surfaceEmergency(); window.scrollTo(0,0); break;
      case "do-work": g.nextWeek(state,true); lastWorldTick = performance.now(); closeModal(); page="town";window.scrollTo(0,0);toast("町の手伝いを終え、30Gが残りました。");break;
      default: return;
    }
    save(); render(); refreshCharacter(); scheduleStep();
    if (urgent()) focusEmergency();
    if((cmd==="reply"||cmd==="return")&&selected().phase==="report")window.scrollTo(0,0);
  } catch(error) { toast(error.message); }
});
document.addEventListener("change",event=>{
  const el=event.target;
  if (el.id === "guest-offer") {
    guestOffer=el.value; drawModal(); $("#guest-offer").focus(); return;
  }
  if (el.id === "chatter-rate" && Object.hasOwn(g.chatterRates,el.value)) {
    state.chatterRate = el.value;
    save();
    return;
  }
  if (el.id === "year-length") {
    g.setYearLength(state,Number(el.value));
    save(); topbar();
    return;
  }
  if (el.id === "week-speed") {
    const speed = Number(el.value);
    if (!g.weekSpeeds.includes(speed)) return;
    tickWorld();
    state.clock.speed = speed;
    save(); topbar();
    return;
  }
  if (el.id === "morning-priority") {
    g.setPriority(selected(),el.value); save(); render(); $("#morning-priority")?.focus(); return;
  }
  if (modal === "gambits" && el.dataset.rule !== undefined) {
    const i = Number(el.dataset.rule), field = el.dataset.field;
    const rules = who(characterId).gambits.map(r => ({...r})), r = rules[i];
    r[field] = field === "value" ? Number(el.value) : el.value;
    if (field === "condition") {
      r.value = r.condition === "count" ? 2 : 50;
      if (r.condition === "status" && r.subject === "foe") r.subject = "self";
    }
    if (field === "action") {
      const targets = g.targets(state,r.action,characterId);
      if (!Object.hasOwn(targets,r.target)) r.target = Object.keys(targets)[0];
    }
    try { storeRules(rules,`[data-rule="${i}"][data-field="${field}"]`); }
    catch(error) { drawModal(); toast(error.message); }
    return;
  }
  if(el.id==="creator-species") {
    const r = g.species[el.value], age = $("#creator-age");
    age.min = r.adult;
    age.max = r.lifespan-1;
    age.value = Math.max(r.adult,Math.min(r.lifespan-1,Number(age.value) || r.adult));
    $("#creator-aging").textContent = creationAgeHint(el.value);
    updatePreview();
    return;
  }
  if(el.id==="creator-job") { $("#initial-skill").innerHTML=initialSkillOptions(el.value); updatePreview(); return; }
  if(el.id==="portrait-file"){readFace(el);return;}
  if (el.id === "emblem-file") return readEmblem(el);
  if (el.id === "emblem-mode") {
    emblemUpload = null;
    $("#emblem-file").value = "";
    $("#emblem-status").textContent = "";
    updateEmblem(el.form);
    return;
  }
  if(el.id==="shop-buyer"){ buyerNumber=Number(el.value); render(); $("#shop-buyer").focus(); return; }
  if(el.id==="shop-recipe" || el.id==="shop-finish"){
    if(el.id==="shop-buyer"){ buyerNumber=Number(el.value); render(); $("#shop-buyer").focus(); return; }
  if(el.id==="shop-recipe") recipeId=el.value;
    else finishId=el.value;
    render(); $("#"+el.id).focus(); return;
  }
  if(el.dataset.equipment !== undefined){
    try {g.wearOrder(state,Number(el.dataset.equipment),el.value);save();render();toast("装備を変更しました。");}
    catch(e){render();toast(e.message);}
    return;
  }
  if(el.id==="equip"){try{g.equip(state,el.value,teams()[state.weaponOwner-1] || selected());save();render();toast("装備を付け替えました。");}catch(e){toast(e.message);}return;}
  if(modal!=="prepare" || !$("#dialog").open) return;
  if(el.dataset.pick){
    const id=el.dataset.pick;
    if(el.checked && draft.party.length>=3){el.checked=false;toast("先に1人を控えにしてください。");return;}
    draft.party=el.checked?[...draft.party,id]:draft.party.filter(p=>p!==id);
    if(!draft.party.includes(draft.leader)) draft.leader=draft.party[0];
  } else if(el.id==="leader"||el.id==="policy"||el.id==="dungeon") draft[el.id]=el.value;
  else if(el.id==="meds") draft.meds=Number(el.value);
  else return;
  const focusId=el.id,pick=el.dataset.pick;
  drawModal(); (pick?$(`[data-pick="${pick}"]`):$("#"+focusId))?.focus();
});
document.addEventListener("keydown",event=>{
  if (event.key==="Escape" && !$("#dialog").open && page!=="town") navigate("town");
});
document.addEventListener("input",e=>{
  const note = e.target.dataset?.note;
  if (modal === "character" && (note === "backstory" || note === "memo")) {
    who(characterId)[note] = e.target.value;
    save();
    if (saveWarning) toast(saveWarning);
    return;
  }
  if (e.target.closest(".emblem-controls")) {
    updateEmblem(e.target.form);
  }
  if(e.target.closest("#creator"))updatePreview();
});
document.addEventListener("submit",event=>{
  if (event.target.id === "character-names") {
    event.preventDefault();
    const p = g.person(state,characterId);
    if (modal !== "character" || !p) return;
    g.setCharacterNames(p, Object.fromEntries(new FormData(event.target)));
    save(); render(); drawModal();
    $("#character-names button").focus();
    toast(saveWarning || "愛称・二つ名を保存しました。");
    return;
  }
  if (event.target.id === "profile-editor") {
    event.preventDefault();
    try {
      const profile = readProfile(event.target);
      if (profile.emblem.mode === "upload" && (emblemUpload || !profile.emblem.image)) {
        toast(emblemUpload ? "画像を読み込み中です。" : "エンブレム画像を選んでください。");
        return;
      }
      g.setProfile(state, profileSlot, profile);
      if (!profileSlot) state.allowStatReset = profile.allowStatReset;
      closeModal(); save(); render();
      $(profileSlot ? '[data-action="party-settings"]' : '[data-action="guild-settings"]').focus();
      toast(saveWarning || "設定を保存しました。");
    } catch (error) { toast(error.message); }
    return;
  }
  if(event.target.id!=="creator")return; event.preventDefault();
  if(imageBusy){toast("顔画像を読み込んでいます。");return;}
  try {g.register(state,{...Object.fromEntries(new FormData(event.target)),portrait:customImage}); closeModal();save();render();toast("新しい仲間を名簿に登録しました。");}
  catch(error){toast(error.message);}
});
$("#dialog").addEventListener("cancel",event=>{ if (modal === "urgent") event.preventDefault(); });
$("#dialog").addEventListener("close",()=>{
  if ($("#dialog").open) return;
  modal="";
  if (characterId) {
    if (page === "roster") {
      render();
      $(`[data-action="character"][data-id="${characterId}"]`)?.focus({preventScroll:true});
    }
    characterId = null;
  }
  imageTicket++;
  const marker = $('[data-action="plot"][aria-expanded="true"]');
  if (marker) marker.ariaExpanded = "false";
});
// Accumulate only the time the game is open and visible. Use one village clock
// even when every expedition is waiting for a letter or the town is empty.
let lastWorldTick = performance.now(), lastClockSave = lastWorldTick;
function worldSeconds() {
  const sinceTick = state.clock.paused || document.hidden ? 0 : performance.now()-lastWorldTick;
  return (state.clock.elapsed + sinceTick * state.clock.speed)/1000;
}
function rememberProgress() {
  for (const team of teams()) {
    const clock = clocks.get(team), t = team.trip;
    if (team.phase !== "explore" || clock?.trip !== t || clock.stage !== clockStage(t)) continue;
    // Save to animation-frame precision so a freshly scheduled beat stays at zero.
    const fraction = stepFraction(team);
    t.progress = fraction < .01 ? 0 : fraction;
  }
}
function tickWorld() {
  const now = performance.now(), elapsed = now-lastWorldTick;
  lastWorldTick = now;
  if (state.clock.paused || document.hidden) return;
  const changed = g.advanceTime(state,elapsed);
  if (changed) {
    if ((modal === "prepare" && (selected().phase !== "prep" || selected().leaveWeek === state.week)) ||
        (["create","work"].includes(modal) && g.weekStarted(state))) closeModal();
    surfaceEmergency(); render(); scheduleStep();
    if (modal === "guest" && !g.visitorList(state).some(p=>p.id===guestId)) closeModal();
    if (["guest","prepare","plot","resident-family"].includes(modal)) drawModal();
    if (["character","gambits","retirement"].includes(modal) && !g.person(state,characterId)) closeModal();
    if (modal === "character") refreshCharacter();
  } else {
    const time = $("#world-time");
    if (time) time.textContent = clockText();
    if (state.raids.warning) document.querySelectorAll?.(".raid-days").forEach(el => { el.textContent = raidDays(); });
  }
  if (changed || now-lastClockSave >= 5000) {
    save(); lastClockSave = now;
  }
}
function visibilityChanged() {
  lastWorldTick = performance.now();
  scheduleStep(); save();
}
if (demo) {
  g.setQuest(state, "ore");
  g.configure(state, selected().party, "gald", "gather", 1);
  g.depart(state,state,state,true);
}
if (stackDemo) {
  document.body.classList.add("stack-demo");
  GuildStacks.gallery($("#screen"), assetUrl);
} else {
  surfaceEmergency();
  render();
  if (urgent()) focusEmergency();
  scheduleStep();
  window.setInterval?.(tickWorld,250);
  document.addEventListener("visibilitychange",visibilityChanged);
  window.addEventListener?.("pagehide",save);
}
