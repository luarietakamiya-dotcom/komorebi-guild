// Shared by the file:// application and the Node self-tests.
const Guild = (() => {
  "use strict";
  const jobs = {
    sword: { name: "剣士", hp: 40, atk: 12, def: 8, spd: 9, face: "mina", next:"fencer", skills:["rally","slash","parry"] },
    guard: { name: "盾役", hp: 55, atk: 7, def: 14, spd: 5, face: "gald", next:"knight", skills:["brace","shield","counter"] },
    healer: { name: "癒し手", hp: 28, atk: 5, def: 6, spd: 8, face: "popo", next:"cleric", skills:["renew","aid","focus"] },
    hunter: { name: "狩人", hp: 32, atk: 10, def: 6, spd: 12, face: "shion", next:"ranger", skills:["scout","aim","hide"], forage:true },
    mage: { name:"魔術師", hp:26, atk:8, def:4, spd:8, face:"popo", next:"sage", skills:["ember","ward","focus"] },
    sage: { name:"賢者", hp:30, atk:11, def:6, spd:9, face:"popo", skills:["flare","prayer"] },
    fencer: { name:"フェンサー", hp:42, atk:14, def:8, spd:12, face:"mina", skills:["lunge","footwork"] },
    knight: { name:"ナイト", hp:60, atk:9, def:16, spd:5, face:"gald", skills:["bastion","bash"] },
    cleric: { name:"回復術師", hp:32, atk:6, def:7, spd:9, face:"popo", skills:["prayer","ward"] },
    swordmaster: { name:"剣豪", hp:46, atk:18, def:9, spd:15, face:"shusai", skills:["iai","parry"] },
    princess: { name:"姫騎士", hp:58, atk:11, def:18, spd:8, face:"yuria", skills:["royalWard","aid"] },
    thief: {name:"盗賊", hp:30, atk:10, def:5, spd:14, face:"shion", skills:["scout","hide","slash"], detect:true},
    druid: {name:"ドルイド", hp:32, atk:7, def:7, spd:9, face:"popo", skills:["renew","ward","focus"], detect:true},
    beastmaster: {name:"獣使い", hp:38, atk:10, def:8, spd:10, face:"gald", skills:["scout","aim","rally"], detect:true},
    ranger: { name:"レンジャー", hp:36, atk:12, def:7, spd:14, face:"shion", skills:["volley","wind"], forage:true }
  };
  const startingJobs = ["sword","guard","healer","hunter","mage","thief","druid","beastmaster"];
  const abilities = {
    ember: {name:"火の矢", atk:3}, flare: {name:"火炎術", atk:5},
    rally: {name:"切り返し", atk:4, round:2}, slash: {name:"踏み込み斬り", atk:2},
    brace: {name:"踏ん張り", def:8, round:2}, shield: {name:"盾構え", def:4},
    renew: {name:"癒しの余韻", heal:8, round:2}, aid: {name:"応急手当", heal:4},
    scout: {name:"先読み", spd:2}, aim: {name:"狙い撃ち", atk:3},
    parry: {name:"受け流し", def:4}, counter: {name:"反撃の構え", atk:5, round:2},
    focus: {name:"精神統一", spd:3}, hide: {name:"身隠し", def:4},
    lunge: {name:"鋭い突き", atk:4}, footwork: {name:"軽業", spd:4},
    bastion: {name:"鉄壁", def:8}, bash: {name:"盾打ち", atk:4},
    prayer: {name:"癒しの祈り", heal:8}, ward: {name:"護身結界", def:6},
    iai: {name:"燕返し", atk:8}, royalWard: {name:"白百合の守護", def:12},
    volley: {name:"連射", atk:5}, wind: {name:"風読み", spd:5}
  };
  const skillLimit = 3, promotionLevel = 2, resetCost = 30;
  const statGains = {hp:4, atk:1, def:1, spd:1};
  // Birthdays and workshop practice use the original 52-position calendar.
  const calendarUnits = 52, weeksPerYear = 4, yearLengths = [1,4,13,52];
  const newCalendar = length => ({length, anchorWeek:1, anchorDate:1});
  function calendarDate(s, week = s.week) {
    const c = s.calendar;
    return c.anchorDate + (week-c.anchorWeek)*(calendarUnits/c.length);
  }
  function setYearLength(s,length) {
    check(yearLengths.includes(length),"1年の長さを選んでください。");
    s.calendar = {length, anchorWeek:s.week, anchorDate:calendarDate(s)};
  }
  function anniversaryPassed(s,anniversary) {
    const yearAt = week => Math.floor((calendarDate(s,week)-anniversary)/calendarUnits);
    return yearAt(s.week) > yearAt(s.week-1);
  }
  // Growth multiplies level gains. Inborn bonuses also apply outside a favored job.
  const species = {
    human:{name:"人間", adult:18, lifespan:90, decline:55, annualLoss:2, trainingYears:9, learning:1,
      growth:{hp:1,atk:1,def:1,spd:1,magic:1,spirit:1,dex:1}, innate:{}, favored:[], description:"どの能力も均等に伸びる。"},
    elf:{name:"エルフ", adult:25, lifespan:700, decline:null, annualLoss:0, trainingYears:32, learning:.96,
      growth:{hp:.85,atk:.8,def:.85,spd:1.2,magic:1.5,spirit:1.5,dex:1.4}, innate:{spd:2,magic:3,spirit:3,dex:3,resist:2},
      favored:["mage","sage","healer","cleric","hunter","ranger"], description:"魔力・精神・器用が伸びる。どの職でも俊足で、詠唱攻撃に耐性がある。"},
    dwarf:{name:"ドワーフ", adult:22, lifespan:240, decline:145, annualLoss:1, trainingYears:17, learning:.95,
      growth:{hp:1.4,atk:1.35,def:1.3,spd:.85,magic:.8,spirit:1,dex:1}, innate:{hp:3,atk:1,def:1},
      favored:["guard","knight","sword","fencer"], description:"力と体力に優れ、守りが堅い。老年期の衰えは緩やか。"},
    halfling:{name:"小人族", adult:16, lifespan:65, decline:38, annualLoss:3, trainingYears:6, learning:1.08,
      growth:{hp:.9,atk:.9,def:.9,spd:1.4,magic:1,spirit:1,dex:1.5}, innate:{spd:1,dex:3},
      favored:["hunter","ranger","fencer"], description:"足が速く手先が器用。若いうちに伸び、早く老年期を迎える。"}
  };
  const raceOf = p => species[p.species] || species.human;
  const ageYears = week => Math.floor((week-1)/calendarUnits);
  const weekOfYear = week => 1 + (week-1)%calendarUnits;
  function growthRate(p) {
    const r = raceOf(p);
    const years = Math.max(0,p.age-r.adult-3);
    const ageFactor = Math.max(.3,1-years/(r.lifespan-r.adult));
    const familyBonus = p.jobAffinity && familyJob(p) === p.jobAffinity ? 1.05 : 1;
    return ageFactor * r.learning * familyBonus * (r.favored.includes(p.job) ? 1.15 : 1);
  }
  // Sorted parent keys keep inheritance independent of parent order.
  const mixedSpecies = {"elf|human":["elf","human"], "dwarf|human":["dwarf","human"]};
  function inheritSpecies(a,b) {
    const pair = [a,b].sort();
    const options = mixedSpecies[pair.join("|")] || pair;
    return options[Math.floor(Math.random()*options.length)];
  }
  const traits = { bold: "大胆", kind: "仲間思い", shy: "臆病", careful: "慎重" };
  const policies = { safe: "安全第一", gather: "素材優先", bold: "大胆に進む" };
  const priorities = {safe:"安全", reward:"報酬", herb:"薬草", ore:"鉱石", depth:"探索の深さ", shortage:"倉庫の不足資源"};
  const departureDelay = 12000, deathLimit = 3, lossPenalty = 15;
  const emblemShapes = { shield:"盾", circle:"円", banner:"旗", hexagon:"六角", diamond:"菱形", laurel:"月桂冠", tower:"塔" };
  const emblemSymbols = {
    leaf:"葉", sword:"剣", star:"星", moon:"月", wing:"翼", key:"鍵", flame:"炎", drop:"水滴",
    bolt:"雷", book:"魔導書", gear:"歯車", crown:"冠", flower:"花", fox:"狐", paw:"獣の足跡", fish:"魚"
  };
  const emblemFrames = { line:"縁取り", plain:"装飾なし", stitches:"点線の縁", sash:"斜め帯" };
  // Limit the encoded image as well as its dimensions so each profile has a predictable save cost.
  const emblemImageLimit = 32 * 1024;
  const validEmblemImage = image => typeof image === "string" && image.length <= emblemImageLimit &&
    /^data:image\/(webp|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image);
  const partySymbols = ["sword", "star", "moon", "wing", "key"];
  const partyColors = ["#45667a", "#905334", "#635480", "#427a71", "#7c6339"];

  // Slot zero belongs to the guild, followed by the numbered expedition parties.
  function profileFor(slot, data) {
    const emblem = data?.emblem;
    const text = (value, fallback) => typeof value === "string" ? value.trim() : fallback;
    const color = (value, fallback) => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value) ? value : fallback;
    const defaultName = slot ? `第${slot}隊` : "木もれびギルド";
    const profile = {
      name: text(data?.name, defaultName) || defaultName,
      emblem: {
        shape: typeof emblem?.shape === "string" && Object.hasOwn(emblemShapes, emblem.shape) ? emblem.shape : "shield",
        symbol: typeof emblem?.symbol === "string" && Object.hasOwn(emblemSymbols, emblem.symbol) ? emblem.symbol : (partySymbols[slot - 1] ?? "leaf"),
        ground: color(emblem?.ground, slot ? partyColors[slot - 1] : "#456449"),
        ink: color(emblem?.ink, "#f4dfa4")
      }
    };
    if (typeof emblem?.frame === "string" && emblem.frame !== "line" && Object.hasOwn(emblemFrames, emblem.frame))
      profile.emblem.frame = emblem.frame;
    if (validEmblemImage(emblem?.image)) {
      profile.emblem.image = emblem.image;
      if (emblem.mode === "upload") profile.emblem.mode = "upload";
    }
    if (!slot) {
      profile.purpose = text(data?.purpose, "木もれびの里の暮らしを守る");
      profile.policy = text(data?.policy, "安全第一");
    }
    return profile;
  }

  function setProfile(s, slot, data) {
    const team = parties(s)[slot - 1];
    check(Number.isInteger(slot) && (slot === 0 || team), "設定する隊を選んでください。");
    check(typeof data?.name === "string" && data.name.trim(), "名前を入力してください。");
    if (!slot && data.tributeRate !== undefined)
      check(validRate(data.tributeRate), "上納率は0〜30%の整数で指定してください。");
    if (slot === 0 && data.rankNames !== undefined) setRankPolicy(s, data.rankNames, data.examFocus, data.examStrictness);
    if (slot === 0) {
      s.guildProfile = profileFor(slot, data);
      s.tributeRate = data.tributeRate ?? s.tributeRate;
    }
    else team.partyProfile = profileFor(slot, data);
  }
  const items = { herb: { name: "薬草", price: 10 }, ore: { name: "鉱石", price: 24 } };
  const landmarks = {
    castle:{name:"お城", effect:"騎士団が街道で自動迎撃。転送罠の行方不明者を1手で救出し、長い捜索による負傷を防ぐ。"},
    cathedral:{name:"大聖堂", effect:"消失までの死亡回数が3回から5回に。治療費120 Gで身体欠損や呪いを完治。"},
    academy:{name:"大図書館・学院", effect:"上位職の技を転職前から習得でき、昇級試験の合格率が20ポイント上昇。出発前に古地図で分岐の先を読める。"},
    observatory:{name:"天文台", effect:"襲撃を前週から観測し、進路・敵数・ヌシの有無を特定。吉の週には宝箱から鉱石を追加回収。どの職業でも罠を感知できる。"},
    manufactory:{name:"大工房", effect:"営業中の全工房に毎週1点の技術経験。注文品の品質と主効果が2段階上がり、義肢の補正も向上。"},
    memorial:{name:"英雄廟", effect:"消失時の信用減点を15から5に軽減。毎週、所属全員の士気＋6。引退者の歩みを顕彰する。"},
    baths:{name:"大浴場・温泉", effect:"町での休息・休暇のHP・MP回復率＋35ポイント、士気＋8。湯治で怪我の療養が毎週さらに1週進む。"},
    exchange:{name:"交易会館", effect:"素材の売値が25％上昇、素材込み注文の仕入れが25％引き。毎週の交易収入24 G、一般冒険者の来訪枠＋3。"}
  };
  const landmarkPrice = s => s.town.landmark ? 360 : 240;
  function buildLandmark(s,kind) {
    check(Object.hasOwn(landmarks,kind) && kind !== s.town.landmark,"丘に建てる別の建造物を選んでください。");
    spend(s,null,landmarkPrice(s));
    s.town.landmark = kind;
    if (kind === "castle" && s.raids.active) s.raids.active.knights = true;
    if (kind === "observatory") {
      if (s.raids.warning) s.raids.warning.observed = true;
      else forecastIfDue(s);
    }
  }
  const deathThreshold = s => deathLimit + (s.town.landmark === "cathedral" ? 2 : 0);
  const salePrice = (s,key) => Math.floor(items[key].price * (s.town.landmark === "exchange" ? 1.25 : 1));
  const craftSupport = s => s.town.landmark === "manufactory" ? 2 : 0;
  const debuffs = {
    arm:{name:"腕の欠損", axes:["atk","dex"], limb:"義手"},
    leg:{name:"脚の欠損", axes:["atk","spd"], limb:"義足"},
    curse:{name:"封印の呪い", axes:["magic","spirit"]}
  };
  const cureCost = 120, limbCost = 25;
  function prosthesisBonus(s) {
    const smith = s.town.workshops.hall;
    return Math.min(80,5 + 15*(smith.level-1) + 6*smith.skills.length + craftBonus(smith) + 10*craftSupport(s));
  }
  function treatDebuff(s,id,kind,prosthesis = false) {
    const p = trainingMember(s,id);
    check(Object.hasOwn(debuffs,kind) && Object.hasOwn(p.debuffs,kind),"治療する症状を選んでください。");
    if (prosthesis) {
      const smith = workshop(s,"hall");
      const bonus = prosthesisBonus(s);
      check(debuffs[kind].limb && bonus > p.debuffs[kind],"今の工房ではこれ以上の義肢を作れません。");
      spend(s,null,limbCost);
      p.debuffs[kind] = bonus;
      train(smith,1);
      record(p,s.week,debuffs[kind].limb+"を装着。補正＋"+bonus+"％。");
    } else {
      check(s.town.landmark === "cathedral","治療には大聖堂が必要です。");
      spend(s,null,cureCost);
      delete p.debuffs[kind];
      record(p,s.week,"大聖堂で"+debuffs[kind].name+"が完治。");
    }
  }

  // IDs are save keys. The tile count also determines farm cost and weekly yield.
  const plots = [
    { id: "orchard", name: "果樹の丘", size: 4 },
    { id: "birch", name: "白樺の丘", size: 3 },
    { id: "dawn", name: "朝日の丘", size: 3 },
    { id: "wind", name: "風見の丘", size: 4 },
    { id: "west", name: "西の街道", size: 3 },
    { id: "east", name: "東の街道", size: 3 },
    { id: "brook", name: "小川のほとり", size: 5 },
    { id: "square", name: "広場の脇", size: 1 },
    { id: "linden", name: "菩提樹通り", size: 3 },
    { id: "mill", name: "風車通り", size: 4 },
    { id: "clover", name: "クローバー平原", size: 5 },
    { id: "south", name: "南門前", size: 2 },
    { id: "sunny", name: "ひなた原", size: 4 }
  ];
  // The watercolor survey ends at the original thirteen parcels.
  const outerPlots = [
    {id:"westPass", name:"西の切通し", size:3, road:"west", center:[-210,313], radius:38},
    {id:"westBend", name:"榛の曲がり角", size:4, road:"west", center:[-50,450], radius:49},
    {id:"eastRidge", name:"東の岩狭間", size:3, road:"east", center:[1530,280], radius:43},
    {id:"eastTurn", name:"峠下の曲がり角", size:3, road:"east", center:[1415,408], radius:44},
    {id:"upperBridge", name:"上流の橋詰", size:3, road:"north", center:[928,-26], radius:44},
    {id:"northSaddle", name:"北の鞍部", size:4, road:"north", center:[468,12], radius:50},
    {id:"reedBank", name:"葦原の河岸段丘", size:3, road:"riverside", center:[1202,742], radius:42},
    {id:"riverTurn", name:"川沿いの折返し", size:3, road:"riverside", center:[1008,693], radius:40},
    {id:"southRise", name:"南の見晴らし台", size:3, road:"south", center:[510,851], radius:43},
    {id:"southFork", name:"南門の坂下", size:4, road:"south", center:[644,751], radius:48}
  ];
  const territoryPlots = [...plots,...outerPlots];
  const buildings = {
    forge:  { name: "鍛冶屋", group: "生産・生活", cost: 100, ore:1 },
    inn:    { name: "宿屋", group: "生産・生活", cost: 90, income:9, recovery:5 },
    tavern: { name: "酒場", group: "生産・生活", cost: 65, income:6, morale:10 },
    shop:   { name: "商店", group: "生産・生活", cost: 75, income:8 },
    school: { name: "訓練所", group: "生産・生活", cost: 80, strength:1, experience:2 },
    bow:    { name: "弓の塔", group: "防衛", cost: 80, defense:6 },
    watch:  { name: "見張り台", group: "防衛", cost: 45, defense:3 },
    magic:  { name: "魔法の塔", group: "防衛", cost: 125, defense:10 },
    wall:   { name: "城壁", group: "防衛", cost: 55, defense:4 },
    farm:   { name: "畑", group: "畑", cost: 8, perTile: true, food:1 }
  };
  // Each workshop owns its specialty and progress. Buildings keep their original
  // save keys, prices and weekly yields, including older general stores and taverns.
  const shopTypes = {
    forge: {
      name:"鍛冶屋", artisan:"トト", building:"forge", material:"ore", slot:"weapon",
      lines:["火の色、ちゃんと見ててね！","刃先まで、いい色に焼けたよ！","きみに合う一本を打つよ！"],
      recipes:[
        {id:"knife", name:"旅の小刀", cost:1, effects:{atk:2}},
        {id:"blade", name:"鍛鋼の武器", level:2, cost:2, effects:{atk:4}},
        {id:"sabre", name:"街道の長剣", skill:"sword", cost:2, effects:{atk:3, spd:1}},
        {id:"hatchet", name:"山越えの戦斧", skill:"axe", cost:2, effects:{atk:5, spd:-1}}
      ],
      skills:[
        {id:"sword", name:"剣づくり", finish:"剣仕立て", effects:{spd:2}},
        {id:"light", parent:"sword", name:"薄刃研ぎ", finish:"軽量剣仕立て", effects:{spd:4, atk:1}},
        {id:"axe", name:"斧づくり", finish:"斧仕立て", effects:{atk:2}},
        {id:"cleaver", parent:"axe", name:"割鉄打ち", finish:"重斧仕立て", effects:{atk:5, spd:-1}}
      ]
    },
    armor: {
      name:"防具屋", artisan:"ベルタ", building:"shop", material:"ore", slot:"armor",
      lines:["まずは体に合う寸法を取ろうか。","留め金までぴたりと揃ったね。","ひと山越えても肩が凝らないよ。"],
      recipes:[
        {id:"vest", name:"旅の胴衣", cost:1, effects:{def:2}},
        {id:"coat", name:"裏打ちの外套", level:2, cost:2, effects:{def:4}},
        {id:"mail", name:"守衛の板金鎧", skill:"plate", cost:2, effects:{def:5, spd:-1}},
        {id:"jacket", name:"斥候の革鎧", skill:"leather", cost:2, effects:{spd:3, def:1}}
      ],
      skills:[
        {id:"plate", name:"重装", finish:"鋼板張り", effects:{def:3, spd:-1}},
        {id:"rivet", parent:"plate", name:"重ね鋲", finish:"二重鋼板", effects:{def:5, hp:3, spd:-1}},
        {id:"leather", name:"軽装", finish:"革合わせ", effects:{spd:2}},
        {id:"weave", parent:"leather", name:"細糸編み", finish:"風通し編み", effects:{spd:3, def:2}}
      ]
    },
    alchemy: {
      name:"錬金術師", artisan:"リゼ", building:"shop", material:"herb",
      lines:["薬草を一葉ずつ量りましょう。","一滴で色が変わりますよ。","蒸留を重ねて、澄んだお薬になりました。"],
      recipes:[
        {id:"vial", name:"薬草の小瓶", cost:2, effects:{medicine:1}},
        {id:"distill", name:"蒸留薬の組", level:2, cost:3, effects:{medicine:2}},
        {id:"balm", name:"携帯救急箱", skill:"remedy", cost:3, effects:{medicine:3}},
        {id:"elixir", name:"強壮エキス", skill:"boost", cost:2, effects:{tonic:1}},
        {id:"bomb", name:"火花玉", skill:"blast", cost:2, effects:{spark:1}}
      ],
      skills:[
        {id:"remedy", name:"回復薬学", finish:"回復処方", effects:{medicine:1}},
        {id:"extract", parent:"remedy", name:"精密抽出", finish:"濃縮処方", effects:{medicine:2}},
        {id:"boost", name:"強化薬学", finish:"強壮剤つき", effects:{tonic:1}},
        {id:"mature", parent:"boost", name:"熟成法", finish:"熟成強壮剤つき", effects:{tonic:2}},
        {id:"blast", name:"攻撃錬金", finish:"火花玉つき", effects:{spark:1}},
        {id:"flare", parent:"blast", name:"連星の調合", finish:"連星玉つき", effects:{spark:2}}
      ]
    },
    magic: {
      name:"魔法具屋", artisan:"ユノ", building:"shop", material:"ore", slot:"charm",
      lines:["耳をすませて。石にも声があるの。","この石、よく響くでしょう？","星の巡りを紋に写したわ。"],
      recipes:[
        {id:"charm", name:"石のお守り", cost:1, effects:{hp:3}},
        {id:"ring", name:"星紋の指輪", level:2, cost:2, effects:{hp:6}},
        {id:"pin", name:"羽根の髪留め", skill:"wind", cost:2, effects:{spd:3}},
        {id:"bead", name:"岩守の腕輪", skill:"earth", cost:2, effects:{def:3}}
      ],
      skills:[
        {id:"wind", name:"風の紋", finish:"風刻み", effects:{spd:2}},
        {id:"gale", parent:"wind", name:"疾風の刻印", finish:"疾風刻み", effects:{spd:4}},
        {id:"earth", name:"大地の紋", finish:"石刻み", effects:{def:2}},
        {id:"ward", parent:"earth", name:"守護結界", finish:"守護刻み", effects:{def:3, ward:2}}
      ]
    },
    kitchen: {
      name:"食べ物屋", artisan:"マルタ", building:"tavern", material:"food", canReset:true, effectsPerLevel:{recovery:5, satisfaction:1},
      lines:["畑の恵みを包んであげるよ。","歩きながらでも食べやすいだろ？","帰ってきたら、またお腹いっぱいにしておやり！"],
      recipes:[
        {id:"bread", name:"野菜の包み焼き", cost:2, effects:{ration:1}},
        {id:"biscuit", name:"旅人の堅焼きパン", level:2, cost:4, effects:{ration:3}},
        {id:"pack", name:"峠越えの保存食", skill:"dry", cost:3, effects:{ration:3}},
        {id:"stew", name:"根菜の力鍋", skill:"meal", cost:3, effects:{tonic:1, ration:1}}
      ],
      skills:[
        {id:"dry", name:"保存食", finish:"干し野菜添え", effects:{ration:1}},
        {id:"salt", parent:"dry", name:"塩蔵", finish:"塩漬け詰合せ", effects:{ration:3}},
        {id:"meal", name:"滋養食", finish:"活力スープ添え", effects:{tonic:1}},
        {id:"broth", parent:"meal", name:"煮込み料理", finish:"濃厚煮込み添え", effects:{tonic:2}}
      ]
    }
  };
  const shopRanks = ["見習い", "一人前", "親方"];
  const effectNames = {atk:"攻撃", def:"防御", spd:"速さ", hp:"HP", ward:"結界設置で町の防衛",
    medicine:"回復薬", ration:"保存食", tonic:"強壮食薬", spark:"火花玉"};
  const defaultSpecialty = {forge:"forge", shop:"armor", tavern:"kitchen"};
  const validRate = rate => Number.isInteger(rate) && rate >= 0 && rate <= 30;
  const supplyCounts = () => ({medicine:0, ration:0, tonic:0, spark:0});
  function restorePurse(team) {
    team.wallet ??= 0;
    team.bag ??= {};
    team.bag.materials ??= {herb:0, ore:0};
    team.bag.supplies ??= supplyCounts();
    team.bag.lots ??= [];
  }
  // gold and stock retain their consolidated save totals. The unassigned
  // balance belongs to the guild, including all assets in pre-economy saves.
  const guildGold = s => s.gold - parties(s).reduce((sum,t) => sum + t.wallet,0);
  const balance = (s,team) => team ? team.wallet : guildGold(s);
  function materialAvailable(s,key,team) {
    if (team) return team.bag.materials[key] || 0;
    if (key === "food") return s.town.food;
    return s.stock[key] - parties(s).reduce((sum,t) => sum + t.bag.materials[key],0);
  }
  function spend(s,team,amount) {
    check(balance(s,team) >= amount, "支払い元の資金が足りません。");
    if (team) team.wallet -= amount;
    s.gold -= amount;
  }
  function useMaterial(s,key,team,amount) {
    check(materialAvailable(s,key,team) >= amount, "素材が足りません。");
    if (team) team.bag.materials[key] -= amount;
    if (key === "food") s.town.food -= amount;
    else s.stock[key] -= amount;
  }
  function addSupply(store,key,quality,count) {
    store.supplies[key] += count;
    if (quality === 1) return;
    const lot = store.lots.find(l => l.key === key && l.quality === quality);
    if (lot) lot.count += count;
    else store.lots.push({key,quality,count});
  }
  function packSupplies(s,team,key,count) {
    const packed = [];
    for (const [owner,store] of [["party",team.bag],["guild",s]]) {
      while (packed.length < count && store.supplies[key] > 0) {
        const lot = store.lots.filter(l => l.key === key).sort((a,b) => b.quality-a.quality)[0];
        packed.push({owner,quality:lot?.quality || 1});
        if (lot && --lot.count === 0) store.lots.splice(store.lots.indexOf(lot),1);
        store.supplies[key]--;
      }
    }
    return packed;
  }
  const supplyPower = (key,quality) => ({medicine:16+4*(quality-1), spark:6+2*(quality-1),
    tonic:3+quality-1, ration:2*(quality-1)})[key];
  function useMedicine(t) {
    t.meds--;
    return supplyPower("medicine",t.packed?.medicine.shift()?.quality || 1);
  }
  const workshopFounders = {
    forge:["dwarf",23], armor:["dwarf",62], alchemy:["human",42], magic:["elf",79], kitchen:["human",48]
  };
  function workshopLineage(type,week = 1) {
    const [species,age] = workshopFounders[type];
    return {species,age, generation:1, anniversary:weekOfYear(week), apprenticeAge:raceOf({species}).adult, apprenticeYears:0, lessons:0, craftYears:0, practiceWeeks:0};
  }
  function newWorkshop(type,week) {
    return {type, level:1, xp:0, points:1, skills:[], lineage:workshopLineage(type,week)};
  }
  const craftBonus = shop => Math.min(8,Math.floor(shop.lineage.craftYears/4));
  const artisanName = shop => (shop.lineage.generation > 1 ? shop.lineage.generation+"代目" : "") + shopTypes[shop.type].artisan;
  function advanceWorkshop(s,id,shop) {
    const line = shop.lineage, r = raceOf(line);
    if (!s.town.repairs[id] && !(id === "hall" && s.town.smithReadyWeek > s.week-1)) {
      if (s.town.landmark === "manufactory") train(shop,1);
      line.practiceWeeks += calendarUnits/s.calendar.length;
      if (line.practiceWeeks >= calendarUnits) {
        line.practiceWeeks -= calendarUnits;
        line.apprenticeYears++;
        line.craftYears++;
      }
    }
    if (!anniversaryPassed(s,line.anniversary)) return;
    line.age++;
    line.apprenticeAge++;
    // A trained apprentice takes over before both generations reach old age.
    const ready = line.apprenticeYears >= (line.lessons >= 6 ? 3 : 4);
    const retiring = line.age >= (r.decline ?? r.lifespan/2) || line.apprenticeYears >= 20;
    if (line.age >= r.lifespan || (ready && retiring)) {
      line.age = line.apprenticeAge;
      line.apprenticeAge = r.adult;
      line.apprenticeYears = 0;
      line.lessons = 0;
      line.generation++;
      s.milestones.unshift({week:s.week,message:artisanName(shop)+"が師の技と道具を継ぎ、"+shopTypes[shop.type].name+"を引き継いだ。"});
    }
  }
  function train(shop, amount) {
    shop.lineage.lessons = Math.min(6,shop.lineage.lessons+amount);
    if (shop.level >= shopRanks.length) return;
    shop.xp += amount;
    if (shop.xp >= 3 * shop.level) {
      shop.xp -= 3 * shop.level;
      shop.level++;
      shop.points++;
      if (shop.level === shopRanks.length) shop.xp = 0;
    }
  }
  function restoreWorkshops(s) {
    if (!validRate(s.tributeRate)) s.tributeRate = 10;
    s.lots ??= [];
    parties(s).forEach(restorePurse);
    s.supplies ??= {medicine:0, ration:0, tonic:0, spark:0};
    s.equipment ??= [];
    for (const item of s.equipment) {
      item.owner ??= 0;
      item.quality ??= item.level || 1;
    }
    if (s.weapon) {
      s.weaponOwner ??= 0;
      s.weaponQuality ??= 1;
    }
    s.town.workshops ??= {};
    if (!s.town.workshops.hall) {
      const hall = s.town.workshops.hall = newWorkshop("forge");
      if (s.research) train(hall, 1);
      if (s.weapon) train(hall, 2);
    }
    for (const [id, kind] of Object.entries(s.town.plots)) {
      if (defaultSpecialty[kind]) s.town.workshops[id] ??= newWorkshop(defaultSpecialty[kind]);
    }
    for (const shop of Object.values(s.town.workshops)) shop.lineage ??= workshopLineage(shop.type);
  }
  function workshop(s, id) {
    check(Object.hasOwn(s.town.workshops, id), "営業中の店を選んでください。");
    check(!s.town.repairs?.[id] && !(id==="hall" && s.town.smithReadyWeek>s.week),"この工房は復旧・療養中です。");
    return s.town.workshops[id];
  }
  function materialStock(s, type) {
    return type.material === "food" ? s.town : s.stock;
  }
  function deliverMaterial(s, id, team = null) {
    const shop = workshop(s, id), type = shopTypes[shop.type];
    check(shop.level < shopRanks.length && team?.phase !== "explore", "納品する隊と店レベルを確認してください。");
    useMaterial(s,type.material,team,1);
    train(shop, 1);
  }
  function skillStatus(shop, node) {
    if (shop.skills.includes(node.id)) return "習得済み";
    const tree = shopTypes[shop.type].skills;
    if (!node.parent && tree.some(n => !n.parent && shop.skills.includes(n.id))) return "別の専門を選択済み";
    if (node.parent && !shop.skills.includes(node.parent)) return "前提の技が必要";
    if (node.parent && shop.level < 3) return "店 Lv.3 で開放";
    if (shop.points < (node.parent ? 2 : 1)) return "育成ポイント不足";
    return "";
  }
  function learnSkill(s, id, skillId) {
    const shop = workshop(s, id), node = shopTypes[shop.type].skills.find(n => n.id === skillId);
    check(node, "この店の技を選んでください。");
    const reason = skillStatus(shop, node);
    check(!reason, reason);
    shop.points -= node.parent ? 2 : 1;
    shop.skills.push(node.id);
  }
  function resetSkills(s, id) {
    const shop = workshop(s, id);
    check(shopTypes[shop.type].canReset && shop.skills.length, "この店の専門は変更できません。");
    shop.skills = [];
    shop.points = shop.level;
  }
  function recipeRequirement(shop, recipe) {
    if (shop.level < (recipe.level || 1)) return "店 Lv." + recipe.level;
    if (recipe.skill && !shop.skills.includes(recipe.skill)) {
      return shopTypes[shop.type].skills.find(n => n.id === recipe.skill).name + "の習得";
    }
    return "";
  }
  function orderQuote(s, id, recipeId, finishId = "plain") {
    const shop = workshop(s, id), type = shopTypes[shop.type];
    const recipe = type.recipes.find(r => r.id === recipeId);
    check(recipe && !recipeRequirement(shop,recipe), "この品はまだ注文できません。");
    const finish = type.skills.find(n => n.id === finishId);
    check(finishId === "plain" || (finish && shop.skills.includes(finishId)), "習得した仕上げを選んでください。");
    const effects = {...recipe.effects};
    const mainEffect = Object.keys(recipe.effects)[0];
    effects[mainEffect] += shop.level - 1 + craftBonus(shop) + craftSupport(s);
    for (const [key, value] of Object.entries(finish?.effects || {})) effects[key] = (effects[key] || 0) + value;
    const quality = shop.level + craftBonus(shop) + craftSupport(s) + (finish?.parent ? 2 : finish ? 1 : 0);
    const fee = 2 * recipe.cost;
    const materials = recipe.cost * (items[type.material]?.price || 5);
    const price = fee + Math.ceil(materials * (s.town.landmark === "exchange" ? .75 : 1));
    const order = {name:recipe.name + (finish ? "・" + finish.finish : ""), effects, cost:recipe.cost, level:shop.level, quality, fee, price};
    if (!type.slot) {
      // A finish can bundle a different supply with the main recipe.
      order.supplyQuality = Object.fromEntries(Object.keys(effects).map(key =>
        [key,Object.hasOwn(recipe.effects,key) ? quality : shop.level]));
    }
    return order;
  }
  function placeOrder(s, id, recipeId, finishId, team = null, buyMaterials = false) {
    const shop = workshop(s, id), type = shopTypes[shop.type];
    const order = orderQuote(s, id, recipeId, finishId);
    check(!team || (partyNumber(s,team) && team.phase !== "explore"), "町にいる隊を選んでください。");
    check(buyMaterials || materialAvailable(s,type.material,team) >= order.cost, "注文に使う素材が足りません。");
    spend(s,team,buyMaterials ? order.price : order.fee);
    if (!buyMaterials) useMaterial(s,type.material,team,order.cost);
    if (type.slot) {
      if (order.effects.ward) s.town.ward = (s.town.ward || 0) + order.effects.ward;
      s.equipment.push({...order, owner:partyNumber(s,team), shopId:id, slot:type.slot, wearer:null});
    } else {
      for (const [key, count] of Object.entries(order.effects))
        addSupply(team?.bag || s,key,order.supplyQuality[key],count);
    }
    train(shop, 2);
    return order;
  }
  function wearOrder(s, index, id) {
    const item = s.equipment[index];
    check(Number.isInteger(index) && item && (!id || person(s,id)), "装備と装備者を確認してください。");
    check(!awayMember(s,item.wearer) && !awayMember(s,id), "遠征中の装備は変更できません。");
    const owner = parties(s)[item.owner-1];
    check(!owner || (owner.phase !== "explore" && (!id || owner.party.includes(id))), "所有している隊のメンバーを選んでください。");
    if (id) {
      for (const other of s.equipment) if (other.slot === item.slot && other.wearer === id) other.wearer = null;
      if (item.slot === "weapon" && s.wielder === id) s.wielder = null;
    }
    item.wearer = id || null;
  }
  function outfittedStat(s, p, key) {
    const equipped = stat(p, key) + s.equipment.reduce((sum, item) => sum + (item.wearer === p.id ? item.effects[key] || 0 : 0), 0);
    return Math.round(equipped * moraleMultiplier(p));
  }
  function townPrice(plot, building) {
    return building.cost * (building.perTile ? plot.size ** 2 : 1);
  }
  function build(s, plotId, kind, specialty = defaultSpecialty[kind]) {
    const plot = territoryPlots.find(p => p.id === plotId);
    check(plot && Object.hasOwn(buildings, kind), "区画と建物を選んでください。");
    check(!s.town.plots[plotId], "この区画は使用中です。");
    const price = townPrice(plot, buildings[kind]);
    check(guildGold(s) >= price, "建築資金が足りません。");
    if (specialty !== undefined) {
      check(Object.hasOwn(shopTypes, specialty) && shopTypes[specialty].building === kind, "建物に合う専門店を選んでください。");
      s.town.workshops[plotId] = newWorkshop(specialty,calendarDate(s));
    }
    s.gold -= price;
    s.town.plots[plotId] = kind;
    if (plot.road) s.town.outerTerritory = true;
  }
  const hasInn = s => Object.entries(s.town.plots).some(([id,kind]) => kind==="inn" && !s.town.repairs?.[id]);
  const hasWorkingShop = (s,type) => Object.entries(s.town.workshops).some(([id,shop]) =>
    shop.type===type && !s.town.repairs?.[id]);
  const facilityEffectText = {
    defense:n => `防衛値 ＋${n}`, food:n => `毎週、食料 ＋${n}`,
    income:n => `毎週、収入 ＋${n} G`, ore:n => `毎週、鉱石 ＋${n}`,
    strength:n => `毎週、実力 ＋${n}（上限100）`,
    morale:n => `町にいる冒険者の士気 ＋${n} / 週`,
    recovery:n => `休息・休暇で最大HP・MPの${n}％を追加回復`,
    satisfaction:n => `町で食事をすると満足度 ＋${n} / 週`,
    experience:n => `遠征から帰った冒険者の経験値 ＋${n}`
  };
  function facilityEffects(kind, plot, shop) {
    const building = buildings[kind];
    const effects = {};
    for (const key of Object.keys(facilityEffectText)) {
      if (building[key]) effects[key] = building[key] * (building.perTile ? plot.size ** 2 : 1);
    }
    const type = shopTypes[shop?.type ?? defaultSpecialty[kind]];
    for (const [key,n] of Object.entries(type?.effectsPerLevel || {}))
      effects[key] = (effects[key] || 0) + n * (shop?.level ?? 1);
    return effects;
  }
  function facilityTotals(town) {
    const total = Object.fromEntries(Object.keys(facilityEffectText).map(key => [key,0]));
    for (const plot of territoryPlots) {
      const kind = town.plots[plot.id];
      if (!Object.hasOwn(buildings,kind) || town.repairs?.[plot.id]) continue;
      const effects = facilityEffects(kind,plot,town.workshops?.[plot.id]);
      for (const [key,n] of Object.entries(effects)) total[key] += n;
    }
    if (town.landmark === "exchange") total.income += 24;
    if (town.landmark === "baths") {
      total.recovery += 35;
      total.morale += 8;
    }
    total.defense += town.ward || 0;
    return total;
  }
  function townTotals(town) {
    const {defense, food, income, ore, strength} = facilityTotals(town);
    return {defense, food, income, ore, strength};
  }
  const quests = {
    herb: { name: "木もれびの薬草採集", item: "herb", count: 2, reward: 100, risk: "低", note: "道具屋に届ける、新鮮な薬草を集めよう。" },
    ore: { rank:1, name: "洞窟のきらめき鉱石", item: "ore", count: 2, reward: 180, risk: "高", note: "岩場の近道で、青く光る鉱石を採ろう。" },
    provisions: { name: "宿屋の薬草仕入れ", item: "herb", count: 3, reward: 110, risk: "低", note: "旅人のために、宿屋へ薬草を届けよう。" },
    tools: { name: "工房の道具修理", item: "ore", count: 1, reward: 85, risk: "低", note: "修理に使う鉱石をひとつ持ち帰ろう。" },
    garden: { name: "薬草園の植え替え", item: "herb", count: 4, reward: 130, risk: "低", note: "採集路で、薬草園に植える株を集めよう。" },
    survey: {rank:2, name:"薬師会の標本採取", item:"herb", count:4, reward:225, risk:"中", note:"薬師会に、群生地の標本を届けよう。"},
    vault: {rank:3, name:"王立工房の晶鉱調達", item:"ore", count:4, reward:360, risk:"高", note:"遠征装備のため、晶鉱をまとめて持ち帰ろう。"},
    crown: {rank:4, name:"王都の秘薬調達", item:"herb", count:6, reward:450, risk:"高", note:"王都の調薬師へ、深層に育つ薬草を届けよう。"},
    waystation: {rank:1, name:"街道の救護所へ", item:"herb", count:3, reward:160, risk:"低", note:"街道の救護所に傷薬の材料を届けよう。"},
    townworks: {rank:2, name:"町を守る門の補修", item:"ore", count:2, reward:260, risk:"中", note:"町の門を補強する鍛冶職人に鉱石を届けよう。"},
    order: { rank:1, name: "マルタの特別注文", item: "ore", count: 3, reward: 300, risk: "高", note: "トトの工房に、まとめて鉱石を届けよう。" }
  };
  // Coordinates locate rooms on a map sheet. The surface exit has no depth.
  function room(name, event, depth, x, y, next = []) {
    return {name, event, depth, sheet:depth || 1, x, y, next};
  }
  const nodes = {
    gate: room("森の入口", "gate", 0, 8, 50, ["meadow"]),
    meadow: room("薬草の野原", "herb", 1, 25, 50, ["fork"]),
    fork: room("森の分かれ道", "fork", 2, 42, 50, ["grove", "pass", "vein"]),
    grove: room("木漏れ日の採集路", "grove", 3, 64, 20, ["home"]),
    pass: room("岩場の近道", "fight", 3, 58, 75, ["vein"]),
    vein: room("水晶の鉱脈", "fight", 4, 76, 75, ["home"]),
    home: room("ギルドへ帰還", "exit", 0, 92, 50)
  };
  for (const n of Object.values(nodes)) n.sheet = 1;
  const dungeons = {
    moss: {name:"苔むす森の洞", level:1, floors:4, pattern:"森の分かれ道", rooms:nodes},
    canal: {name:"銀泉の地下水路", level:2, floors:5, lanes:3, pattern:"支流と合流", requires:"moss",
      landmarks:["水門", "水草の岸", "崩れた水管", "舟着き場", "沈んだ薬棚"]},
    archive: {name:"星灯りの大書庫", level:3, floors:8, lanes:4, pattern:"交差する回廊", requires:"canal",
      landmarks:["螺旋階段", "薬師の書架", "番獣の抜け穴", "封印書庫", "星図の小箱"]}
  };
  function makeFloors(d) {
    const rooms = {};
    const [stairs, garden, danger, gallery, cache] = d.landmarks;
    for (let f = 1; f <= d.floors; f++) {
      const id = key => f + "-" + key;
      const entry = f === 1 ? "gate" : id("stairs");
      const onward = f === d.floors ? "home" : (f+1) + "-stairs";
      const lanes = ["bank", "cut", "gallery"];
      if (d.lanes === 4) lanes.push("bridge");
      rooms[entry] = room(stairs, "fork", f, 9, 50, lanes.map(id));
      rooms[id("bank")] = room(garden, "herb", f, 33, 17, [id("grove"), id("cache")]);
      rooms[id("cut")] = room(danger, "fight", f, 55, 40, [onward]);
      rooms[id("gallery")] = room(gallery, "passage", f, 32, 64, [id("cache")]);
      rooms[id("grove")] = room("薬草の群生地", "grove", f, 69, 16, [onward]);
      rooms[id("cache")] = room(cache, "treasure", f, 69, 64, [onward]);
      if (d.lanes === 4) {
        rooms[id("bridge")] = room("渡り廊下", "shortcut", f, 22, 83, [id("index"), id("cache")]);
        rooms[id("index")] = room("索引の間", "passage", f, 49, 83, [id("grove"), id("vault")]);
        rooms[id("vault")] = room("星銀の宝物庫", "treasure", f, 78, 83, [onward]);
        rooms[id("gallery")].next.push(id("index"));
        if (f % 2 === 0) rooms[id("bank")].next.push(id("index"));
        if (f % 3 === 0) rooms[id("bridge")].next = [id("vault"), onward];
      }
    }
    rooms.home = room("地上への出口", "exit", 0, 92, 50);
    rooms.home.sheet = d.floors;
    return rooms;
  }
  for (const d of Object.values(dungeons)) d.rooms ??= makeFloors(d);
  const dungeonOpen = (s, id) => Object.hasOwn(dungeons, id) && (!dungeons[id].requires ||
    s.history.some(r => r.dungeon === dungeons[id].requires && r.cleared));
  const tripRooms = t => dungeons[t.dungeon || "moss"].rooms;
  const nextRoom = t => {
    const routes = tripRooms(t)[t.node].next;
    return routes.length > 1 ? t.route : routes[0];
  };
  function tripResult(dungeon, path) {
    const rooms = dungeons[dungeon].rooms;
    return {dungeon, path:[...path], depth:Math.max(...path.map(id => rooms[id].depth)), cleared:path.at(-1) === "home"};
  }
  // Old saves contain the step count and the chosen arm of the original fork.
  function oldPath(steps, rocky) {
    return ["gate","meadow","fork", ...(rocky ? ["pass","vein"] : ["grove"]), "home"].slice(0, steps+1);
  }
  const enemy = { name: "苔イノシシ", hp: 13, atk: 31, def: 4, spd: 10 };
  const tones = { polite: "です", normal: "だ", casual: "だよ", rough: "だぜ" };
  const dialogue = {
    fork: {
      bold: "{マ}！ 近道の鉱石は{私}の狙い{断}",
      kind: "{マ}、{仲間}も一緒だ。{私}は歩きやすい道が安心{断}",
      shy: "{マ}…岩場から物音が。{私}は採集路のほうが安心{断}",
      careful: "{マ}、採集路には薬草、岩場には鉱石。{私}の見立てではどちらも候補{断}"
    },
    crisis: {
      bold: "{マ}！ {仲間}が倒れた。ここからは{私}の踏ん張りどころ{断}",
      kind: "{マ}、{仲間}が動けない。{私}には仲間が一番大事{断}",
      shy: "{マ}…{仲間}のHPがゼロに。{私}、もう心配でいっぱい{断}",
      careful: "{マ}、{仲間}が戦闘不能。{私}の判断では退路の確保が先決{断}"
    }
  };
  const chatterRates = {
    quiet:{name:"控えめ", town:15000, dungeon:4100},
    rare:{name:"少なめ", town:24000, dungeon:7500},
    often:{name:"多め", town:8500, dungeon:2500},
    off:{name:"オフ"}
  };
  // Each entry is a pool for one scene and personality. End on a noun before {断}
  // so the character's own copula (including custom endings) fits the line.
  const chatter = {
    start:{
      bold:["先頭は{私}の出番{断}","一番乗りは{私}の役目{断}"],
      kind:["{私}はしんがり{断}。足元に気をつけて"],
      shy:["{私}、ちょっと緊張気味{断}"], careful:["地図は{私}の手元{断}"]
    },
    fork:{
      bold:["{私}は近道に一票{断}"], kind:["{私}は歩きやすい道に一票{断}"],
      shy:["{私}は明るい方が好き{断}"], careful:["ここが地図の分かれ道{断}"]
    },
    gather:{
      bold:["この茂みは{私}の狙い通り{断}"], kind:["これはみんなのお土産{断}"],
      shy:["{私}にも摘めそうな薬草{断}"], careful:["この葉の形は薬草の印{断}"]
    },
    treasure:{
      bold:["おっ、{私}の大発見{断}！"], kind:["みんなで見つけた宝物{断}"],
      shy:["本当に宝箱……夢みたい{断}"], careful:["留め金は無事。次は中身の確認{断}"]
    },
    fight:{
      bold:["先手は{私}のもの{断}！"], kind:["背中は{私}の受け持ち{断}"],
      shy:["{私}も覚悟はできたつもり{断}"], careful:["まずは相手の動きを見る番{断}"]
    },
    victory:{
      bold:["よし、{私}たちの勝ち{断}！"], kind:["みんな、ひと息つく時間{断}"],
      shy:["ふう……やっとひと安心{断}"], careful:["次は装備の点検{断}"]
    },
    hurt:{
      bold:["{私}はまだ踏ん張りどころ{断}"], kind:["{私}も少し手当てが必要{断}"],
      shy:["{私}、もうふらふら{断}……"], careful:["傷が深い。{私}は後退が先決{断}"]
    },
    home:{
      bold:["さあ、胸を張って凱旋{断}！"], kind:["いっしょに帰る時間{断}"],
      shy:["帰り道が見えてほっとしたところ{断}"], careful:["収穫も確認済み。次は帰還{断}"]
    },
    greet:{
      bold:["やあ、{仲間}！ 今日もいい天気{断}"], kind:["{仲間}、元気そうで何より{断}"],
      shy:["あ、{仲間}……奇遇{断}"], careful:["{仲間}、この先は人通りが多め{断}"]
    },
    chat:{
      bold:["{仲間}、次は宝探しに行くつもり{断}！"], kind:["{仲間}、次の遠征も楽しみ{断}"],
      shy:["{仲間}、森で聞いたあの音がまだ心配{断}"], careful:["{仲間}、次の持ち物はもう確認済み{断}"]
    },
    town:{
      bold:["今日は{私}が広場へ一番乗り{断}","坂の上まで競走{断}！"],
      kind:["{私}は広場で待ち合わせ{断}","焼きたてのパンの匂い{断}"],
      shy:["この木陰が{私}のお気に入り{断}"], careful:["{私}は道具の買い出し中{断}"]
    },
    shop:{
      bold:["今日の刃は会心の出来{断}！"], kind:["刃こぼれの手当ては{私}の仕事{断}","道具の手入れなら今が狙い目{断}"],
      shy:["これ、{私}の自信作{断}"], careful:["研ぎ直しなら今が空き時間{断}"]
    }
  };
  function voiceLine(person, template, friend) {
    const tags = { マ: person.master, 私: person.pronoun || "私", 仲間: friend, 断: person.ending || tones[person.tone] || tones.normal };
    return template.replace(/\{(マ|私|仲間|断)\}/gu, (_, tag) => tags[tag]);
  }
  function speak(person, type, friend) {
    return voiceLine(person, dialogue[type][person.trait], friend);
  }
  function chatterLine(person, scene, friend) {
    const lines = chatter[scene][person.trait] || chatter[scene].careful;
    return voiceLine(person, lines[Math.floor(Math.random()*lines.length)], friend);
  }
  const boundedScore = n => Math.max(0,Math.min(100,n));
  const moraleBand = p => p.morale >= 70 ? 1 : p.morale <= 30 ? -1 : 0;
  const moraleMultiplier = p => (10 + moraleBand(p)) / 10;
  function restoreMorale(p) {
    p.morale = Number.isFinite(p.morale) ? boundedScore(Math.round(p.morale)) : 50;
  }
  const clean = (v, max) => [...String(v ?? "").trim()].slice(0, max).join("");
  const nameLimits = {nickname:12, epithet:24};
  const formalName = p => p.epithet ? "〈" + p.epithet + "〉" + p.name : p.name;
  const familiarName = p => p.nickname || p.name;
  function setCharacterNames(p, {nickname, epithet}) {
    p.nickname = clean(nickname, nameLimits.nickname);
    p.epithet = clean(epithet, nameLimits.epithet);
  }
  function origin(id) {
    if (uniqueGuests[id]) return uniqueGuests[id];
    if (id.startsWith("guest-")) {
      const index = Number(id.slice(6)), races = Object.keys(species);
      const race = races[index % races.length];
      if (race) return {species:race, age:species[race].adult + (index % 6)*species[race].trainingYears};
    }
    return {species:"human", age:id === "gald" ? 21 : 18};
  }
  function restoreAge(p) {
    const defaults = origin(p.id);
    if (!Object.hasOwn(species,p.species) || uniqueGuests[p.id]) p.species = defaults.species;
    if (!Number.isInteger(p.age) || p.age < 0) p.age = p.species === defaults.species ? defaults.age : raceOf(p).adult;
    p.frailty ??= 0;
    p.birthdayWeek ??= 1;
    p.xpRemainder ??= 0;
  }
  function restoreCharacter(p) {
    restoreAge(p);
    restoreMorale(p);
    setCharacterNames(p, p);
    p.rank ??= 1;
    p.missingHP ??= 0;
    p.spentMP ??= 0;
    p.deaths ??= 0;
    p.debuffs ??= {};
    p.injury ??= null;
    p.leaveWeek ??= 0;
    p.gambits = Array.isArray(p.gambits) ? p.gambits.slice(0,gambitLimit) : [];
    p.backstory ??= "";
    p.memo ??= "";
    p.career ??= [];
    p.allocation ??= {hp:0, atk:0, def:0, spd:0};
    p.skills ??= [jobs[p.job].skills[0]];
    return p;
  }
  function entryTraining(job,race,age,firstSkill = jobs[job].skills[0]) {
    const r = species[race];
    const experience = Math.max(0,age-r.adult-3) / r.trainingYears;
    const level = 1 + Math.floor(experience);
    const xp = Math.floor((experience % 1)*20*level**2);
    const slots = Math.min(skillLimit,1+Math.floor(experience/2));
    const skills = [firstSkill,...jobs[job].skills.filter(id => id !== firstSkill)].slice(0,slots);
    return {level,xp,skills};
  }
  function makePerson(id, name, job, trait, pronoun, tone, master = "マスター", ending = "", background = origin(id), firstSkill) {
    const {species,age} = background;
    return restoreCharacter({id, name, job, trait, pronoun, tone, master, ending, species, age,
      ...entryTraining(job,species,age,firstSkill), portrait:"", readyWeek:1});
  }
  function record(p, week, message, fields) {
    // Future feats can award an epithet alongside their career entry.
    if (fields?.epithet) setCharacterNames(p, {nickname:p.nickname, epithet:fields.epithet});
    p.career.push({week, message, ...fields});
  }
  const recordJoining = (p, week) => record(p, week, jobs[p.job].name + "として入団し、" + p.skills.map(id => abilities[id].name).join("・") + "を習得。");
  const recruit = s => s?.candidate || makePerson("shion", "シオン", "hunter", "careful", "私", "polite");
  const defaultRanks = ["見習い","一人前","熟練","達人","英雄"];
  const examFocuses = {practice:"実技", knowledge:"知識", record:"実績審査", escort:"同行審査"};
  const examLines = {gentle:"緩やか", standard:"標準", strict:"厳格"};
  const examStandards = {gentle:{line:35, renown:1}, standard:{line:55, renown:3}, strict:{line:75, renown:6}};
  const rankName = (s,p) => s.ranks.names[Math.min(p.rank, s.ranks.names.length - 1)];
  const rankLabel = (s,n = 0) => s.ranks.names[n] ?? "第" + (n+1) + "階級（設定で段の追加が必要）";
  const qualifies = (s,p,n = 0) => !!p && Math.min(p.rank,s.ranks.names.length-1) >= n;
  const partyQualifies = (s,ids,n) => ids.length > 0 && ids.every(id => qualifies(s,person(s,id),n));
  const dungeonRank = id => dungeons[id].level - 1;
  function setRankPolicy(s, names, focus, strictness) {
    check(Array.isArray(names) && names.length && names.every(n => typeof n === "string" && n.trim()),
      "階級名を低い順に1行ずつ入力してください。");
    const trimmed = names.map(n => n.trim());
    check(new Set(trimmed).size === trimmed.length, "階級ごとに異なる名前を付けてください。");
    check(Object.hasOwn(examFocuses,focus) && Object.hasOwn(examLines,strictness), "試験の重点と厳しさを選んでください。");
    Object.assign(s.ranks,{names:trimmed,focus,strictness});
    checkGuildPromotion(s);
  }
  const guildGrades = [
    {name:"E"},
    {name:"D", points:8, members:1, score:25, quest:"waystation"},
    {name:"C", points:20, members:2, score:40, quest:"townworks"}
  ];
  const featValues = {clear:5, boss:6, repel:4, raidBoss:6, exam:3};
  const seniorRank = 2;
  function recordFeat(s, kind, message, week = s.week) {
    s.guildProgress.feats.unshift({week, kind, message, points:featValues[kind]});
  }
  function guildStanding(s) {
    const progress = s.guildProgress;
    const points = progress.feats.reduce((total,e) => total + e.points, 0);
    const members = s.roster.filter(p => qualifies(s,p,seniorRank)).length;
    const minimum = Math.min(...s.metrics);
    const bonus = Math.min(20,points) + 4*Math.min(2,members);
    return {grade:guildGrades[progress.grade].name, points, members, minimum, bonus,
      score:Math.min(100,minimum+bonus), next:guildGrades[progress.grade+1]};
  }
  function checkGuildPromotion(s) {
    const standing = guildStanding(s);
    for (const grade of guildGrades.slice(s.guildProgress.grade+1)) {
      if (standing.points < grade.points || standing.members < grade.members || standing.score < grade.score) break;
      s.guildProgress.grade++;
      const message = "ギルドランク"+grade.name+"に昇格！ 新しい依頼「"+quests[grade.quest].name+"」が届きました。";
      s.milestones.unshift({week:s.week,guildGrade:grade.name,message});
    }
  }
  function recordRaidFeats(s,r) {
    const road = roadNames[r.road];
    if (r.repelled) recordFeat(s,"repel",road+"の襲撃を撃退",r.week);
    if (r.herb) recordFeat(s,"raidBoss",road+"の襲撃のヌシを討伐",r.week);
  }
  function restoreGuildProgress(s) {
    if (s.guildProgress) return;
    s.guildProgress = {grade:0, feats:[]};
    // Reports and active trips are disjoint. A victory at the final fight room
    // identifies a defeated warden even after the unique relic was claimed.
    const trips = [...s.history, ...parties(s).filter(t => t.phase === "explore").map(t => t.trip)];
    for (const trip of trips) {
      const dungeon = dungeons[trip.dungeon];
      if (!dungeon) continue;
      if (trip.cleared) recordFeat(s,"clear",dungeon.name+"を踏破",trip.week);
      if (trip.dungeon === "moss") continue;
      for (const e of trip.log || []) {
        const room = dungeon.rooms[trip.path[e.step]];
        if (room?.event === "fight" && room.depth === dungeon.floors && e.message === "勝利。鉱石2個を回収。")
          recordFeat(s,"boss",dungeon.name+"の"+foes.warden.name+"を討伐",trip.week);
      }
    }
    for (const r of s.raids.reports) recordRaidFeats(s,r);
    for (const p of [...s.roster,...s.registry,...s.alumni])
      for (const e of p.career || [])
        if (e.exam) recordFeat(s,"exam",p.name+"："+e.message,e.week);
    s.guildProgress.feats.sort((a,b) => b.week-a.week);
    checkGuildPromotion(s);
  }
  const fame = s => s.metrics[0] + s.ranks.renown + Math.max(0,Math.floor((s.metrics[1]-50)/5));
  const uniqueGuests = {
    shusai:{species:"human", age:58, name:"シュウサイ", job:"swordmaster", trait:"careful", pronoun:"拙者", tone:"normal", ending:"でござる",
      rank:3, level:4, story:"諸国の道場を巡る剣豪。立ち合う前に、相手の足運びを見る。", invitation:"名声12で来訪。討伐勝利を記録した隊に力を貸します。",
      meet:s => fame(s) >= 12, join:s => s.history.some(r => r.wins > 0)},
    yuria:{species:"elf", age:86, name:"ユーリア", job:"princess", trait:"kind", pronoun:"わたくし", tone:"polite", ending:"ですわ",
      rank:3, level:4, story:"領民を守るため旅に出た姫騎士。盾には故郷の白百合を刻んでいる。", invitation:"名声20で来訪。宿屋を備え、信用70以上のギルドへの所属を望んでいます。",
      meet:s => fame(s) >= 20, join:s => s.metrics[1] >= 70 && hasInn(s)}
  };
  const regularNames = ["ナギ","ベルタ","カイ","リタ","アオ","リゼ","ダン","エマ","ソラ","ユノ","レン","ネネ","トワ","イオ","メル","ジン","アニカ","セナ","キリ","ロイ"];
  function createRegistry(s) {
    const otherGuilds = [["海灯ギルド","波の子","潮読み","灯守"],["銀峰ギルド","山の芽","尾根歩き","峰守"]];
    const people = regularNames.map((name,i) => {
      const p = makePerson("guest-"+i,name,startingJobs[i%startingJobs.length],Object.keys(traits)[Math.floor(i/3)%4],"私","normal");
      p.rank = i%3;
      p.level = Math.max(p.level,p.rank+1);
      const guild = otherGuilds[i%otherGuilds.length];
      p.backstory = guild[0]+"で「"+guild[p.rank+1]+"」の階級を授かった。";
      return p;
    });
    for (const [id,d] of Object.entries(uniqueGuests)) {
      const p = makePerson(id,d.name,d.job,d.trait,d.pronoun,d.tone,"マスター",d.ending);
      Object.assign(p,{rank:d.rank, level:Math.max(p.level,d.level), backstory:d.story});
      people.push(p);
    }
    return people.filter(p => !knownPerson(s,p.id));
  }
  function restoreGuildRegister(s) {
    s.ranks ??= {names:[...defaultRanks], focus:"practice", strictness:"standard", renown:0};
    s.registry ??= createRegistry(s);
    s.registry.forEach(restoreCharacter);
    s.market ??= {gold:0, herb:0, ore:0, returns:[]};
    s.milestones ??= [];
    if (!s.visitors) welcomeVisitors(s);
  }
  function welcomeVisitors(s) {
    const previous = new Set(s.visitors);
    const regulars = s.registry.filter(p => !uniqueGuests[p.id]);
    const count = Math.min(regulars.length, 1 + Math.floor(fame(s)/8) + (s.town.landmark === "exchange" ? 3 : 0));
    const newcomers = regulars.filter(p => !previous.has(p.id));
    const familiar = regulars.filter(p => previous.has(p.id));
    s.visitors = [];
    while (s.visitors.length < count) {
      const pool = newcomers.length ? newcomers : familiar;
      const [p] = pool.splice(Math.floor(Math.random()*pool.length),1);
      s.visitors.push(p.id);
    }
    for (const p of s.registry) if (uniqueGuests[p.id]?.meet(s)) s.visitors.push(p.id);
  }
  const visitorList = s => s.registry.filter(p => s.visitors.includes(p.id));
  function startGuestMissions(s) {
    if (s.town.repairs?.hall) return false;
    let changed = false;
    for (const p of visitorList(s)) {
      if (p.mission) continue;
      const eligible = postedQuests(s).filter(id => qualifies(s,p,quests[id].rank));
      const quest = eligible[Math.floor(Math.random()*eligible.length)];
      const dungeon = Object.keys(dungeons).filter(id => dungeonOpen(s,id) && qualifies(s,p,dungeonRank(id))).at(-1);
      p.mission = {week:s.week, quest, dungeon};
      changed = true;
    }
    return changed;
  }
  function settleGuestMissions(s) {
    startGuestMissions(s);
    s.market.returns = [];
    for (const p of visitorList(s)) {
      if (!p.mission) continue;
      const {quest,dungeon} = p.mission, q = quests[quest];
      const gold = Math.floor(q.reward/10);
      s.market.gold += gold;
      s.market[q.item]++;
      s.market.returns.push({name:p.name, quest, dungeon, gold});
      record(p,s.week,"「"+q.name+"」を終え、"+dungeons[dungeon].name+"から帰還。",{quest});
      p.contacts = (p.contacts || 0)+1;
      delete p.mission;
    }
  }
  function collectMarket(s) {
    const m = s.market;
    check(m.gold || m.herb || m.ore, "受け取れる分け前がありません。");
    s.gold += m.gold;
    s.stock.herb += m.herb;
    s.stock.ore += m.ore;
    m.gold = m.herb = m.ore = 0;
  }
  function examStatus(s,p) {
    const next = p.rank+1, experience = p.career.filter(e => e.quest).length;
    const weights = {
      practice:stat(p,"atk") + stat(p,"def"),
      knowledge:p.skills.length*6 + maxMP(p),
      record:experience*6, escort:deepest(p)*4 + stat(p,"def")
    };
    const {line,renown} = examStandards[s.ranks.strictness];
    const score = 36 + 7*p.level + weights[s.ranks.focus] - 5*next;
    const chance = Math.max(5, Math.min(95,50+score-line+(s.town.landmark === "academy" ? 20 : 0)));
    let reason = "";
    if (next >= s.ranks.names.length) reason = "現在の最高階級です。";
    else if (p.mission || awayMember(s,p.id) || !available(s,p)) reason = "町で活動できる週に受験できます。";
    else if (p.examWeek === s.week) reason = "再受験は翌週からです。";
    else if (p.level < next && experience < next-1) reason = "Lv."+next+" または依頼参加"+(next-1)+"回で受験できます。";
    return {reason,next,chance,renown};
  }
  function takeExam(s,id) {
    const p = person(s,id) || visitorList(s).find(v => v.id === id);
    check(p,"受験者が町にいません。");
    const {reason,next,chance,renown} = examStatus(s,p);
    check(!reason,reason);
    const pass = Math.random()*100 < chance;
    p.examWeek = s.week;
    if (pass) { p.rank = next; s.ranks.renown += renown; }
    const message = rankLabel(s,next)+"への昇級試験（"+examFocuses[s.ranks.focus]+"・"+examLines[s.ranks.strictness]+"）に"+(pass?"合格。":"不合格。");
    record(p,s.week,message,{exam:pass});
    if (pass) {
      recordFeat(s,"exam",p.name+"："+message);
      checkGuildPromotion(s);
    }
    return message;
  }
  const offers = {basic:{name:"支度金",gold:30}, generous:{name:"厚遇の支度金",gold:75}, premium:{name:"特別支度金",gold:150}};
  function scoutStatus(s,p,offer) {
    const unique = uniqueGuests[p.id];
    const price = offers[offer].gold;
    const score = price + Math.floor(s.metrics[1]/2) + Math.min(40,fame(s)) + 8*(p.contacts || 0);
    const accepts = score >= 65 + p.rank*18 + Math.min(12,p.level-1) + (unique ? 30 : 0);
    let reason = "";
    if (p.mission) reason = "依頼で遠征中です。";
    else if (unique && !unique.join(s)) reason = unique.invitation;
    else if (guildGold(s) < price) reason = "支度金が不足しています。";
    return {reason,accepts,price};
  }
  function scout(s,id,offer) {
    const p = visitorList(s).find(p => p.id === id);
    check(p && Object.hasOwn(offers,offer),"来訪中の一般冒険者と契約条件を選んでください。");
    const {reason,accepts,price} = scoutStatus(s,p,offer);
    check(!reason,reason);
    if (!accepts) return false;
    s.gold -= price;
    s.visitors = s.visitors.filter(v => v !== id);
    s.registry = s.registry.filter(v => v.id !== id);
    s.roster.push(p);
    const message = p.name+"が仲間になった。専属契約を結び、所属冒険者になった。";
    record(p,s.week,message);
    s.milestones.unshift({week:s.week,message});
    checkGuildPromotion(s);
    return true;
  }
  function initial() {
    const s = {
      clock:{elapsed:0,paused:false,speed:1}, chatterRate:"quiet", alumni:[], morningMail:[], priority:"safe", decisionWeek:0, leaveWeek:0,
      guildProfile: profileFor(0), partyProfile: profileFor(1), allowStatReset:true,
      extraParties: [], selectedParty: 1, town: { plots: {}, food: 0, landmark:null }, week: 1, phase: "prep", gold: 240, roster: [
        makePerson("mina", "ミナ", "sword", "bold", "あたし", "casual"),
        makePerson("gald", "ガルド", "guard", "kind", "俺", "normal", "マスター", "だな"),
        makePerson("popo", "ポポ", "healer", "shy", "ぼく", "polite", "マスターさん", "ですぅ…")
      ], party: ["mina", "gald", "popo"], leader: "mina", quest: "herb", dungeon:"moss", policy: "safe", meds: 0,
      stock: { herb: 0, ore: 0 }, research: 0, weapon: false, wielder: null,
      guildProgress:{grade:0,feats:[]}, unlocked: false, outcomes: [], metrics: [0, 50, 100, 60], trip: null, history: []
    };
    s.children = [];
    s.bonds = {};
    s.marriages = [];
    s.calendar = newCalendar(weeksPerYear);
    s.candidate = recruit();
    s.roster.forEach(p => recordJoining(p, s.week));
    restoreWorkshops(s);
    restoreRaids(s);
    restoreGuildRegister(s);
    return s;
  }
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const prep = s => check(s.phase === "prep", "準備中に操作できます。");
  const person = (s, id) => s.roster.find(p => p.id === id);
  const knownPerson = (s,id) => person(s,id) || s.alumni.find(p => p.id === id);
  const maxMP = p => stat(p,"spirit");
  const currentHP = (s,p) => Math.max(0, outfittedStat(s,p,"hp") - p.missingHP);
  const currentMP = p => Math.max(0, maxMP(p) - p.spentMP);
  const hireCost = p => p.level * 50;
  const payroll = s => s.roster.reduce((sum, p) => sum + 10 + 2 * p.level, 0);
  function stat(p,key) {
    const r = raceOf(p), job = jobs[p.job];
    const caster = ["healer","cleric","mage","sage","druid"].includes(p.job);
    const base = job[key] ?? ({magic:caster ? 10 : 5, spirit:caster ? 16 : 10, dex:job.forage ? 10 : 6})[key];
    const step = key === "spirit" ? 2 : base/10;
    const trained = base + (p.level-1)*step*r.growth[key];
    const inherited = p.aptitude === key ? statGains[key] || 1 : 0;
    const value = trained + inherited + (r.innate[key] || 0) + (p.allocation?.[key] || 0)*(statGains[key] || 0);
    let modifier = 1;
    for (const [kind,bonus] of Object.entries(p.debuffs || {}))
      if (debuffs[kind]?.axes.includes(key)) modifier *= (.5 + bonus/100);
    return Math.max(1,Math.floor(value * (100-(p.frailty || 0))/100 * modifier));
  }
  const skillAxis = {ember:"magic",flare:"magic",renew:"magic",aid:"magic",prayer:"magic",ward:"spirit",
    aim:"dex",volley:"dex",scout:"dex",wind:"dex"};
  function abilityPower(p,id,effect) {
    const power = abilities[id]?.[effect] || 0;
    const axis = skillAxis[id];
    return power && axis ? power + Math.max(0,Math.floor((stat(p,axis)-10)/3)) : power;
  }
  const spellDefense = p => (raceOf(p).innate.resist || 0) + Math.max(0,Math.floor((stat(p,"spirit")-16)/3));
  const spentPoints = p => Object.values(p.allocation).reduce((total, n) => total + n, 0);
  const freePoints = p => 2 * p.level - spentPoints(p);
  function trainingMember(s, id) {
    const p = person(s, id);
    check(p && !awayMember(s,id), "育成はギルドにいる仲間が対象です。");
    return p;
  }
  function allocate(s, id, key) {
    const p = trainingMember(s,id);
    check(Object.hasOwn(statGains,key) && freePoints(p) > 0, "能力と残りポイントを確認してください。");
    p.allocation[key]++;
  }
  function resetAllocation(s, id) {
    const p = trainingMember(s,id);
    check(s.allowStatReset && spentPoints(p) && guildGold(s) >= resetCost, "振り直しの設定・配分・資金を確認してください。");
    s.gold -= resetCost;
    for (const key of Object.keys(statGains)) p.allocation[key] = 0;
  }
  function learnableSkills(p,s) {
    const advanced = s?.town.landmark === "academy" ? jobs[jobs[p.job].next]?.skills || [] : [];
    return [...new Set([...jobs[p.job].skills, ...advanced, ...(p.skillTalent ? [p.skillTalent] : [])])];
  }
  function learnAbility(s, id, skill) {
    const p = trainingMember(s,id);
    check(learnableSkills(p,s).includes(skill) && !p.skills.includes(skill) && p.skills.length < skillLimit, "現在の職業・習得済みスキル・空き枠を確認してください。");
    p.skills.push(skill);
    record(p, s.week, abilities[skill].name + "を習得。");
  }
  function promote(s, id) {
    const p = trainingMember(s,id), job = jobs[p.job];
    check(job.next && p.level >= promotionLevel, "転職条件を満たしていません。");
    p.job = job.next;
    record(p, s.week, job.name + "から" + jobs[p.job].name + "に転職。");
  }
  const available = (s, p) => !!p && !p.departure && p.readyWeek <= s.week && p.leaveWeek !== s.week;
  const damage = (atk, factor, def) => Math.max(1, Math.floor(atk * factor - def * 0.5));
  // The original top-level party remains party 1, including in existing saves.
  const maxParties = 5;
  const parties = s => [s, ...(s.extraParties || [])];
  const partyNumber = (s, team) => parties(s).indexOf(team) + 1;
  const anyAway = s => parties(s).some(team => team.phase === "explore");
  const weekStarted = s => parties(s).some(team => team.phase !== "prep");
  const unlockCost = s => 50 * parties(s).length;
  function postedQuests(s) {
    return [...(s.unlocked ? ["order", "survey", "vault", "crown"] : []), "herb", "ore",
      ...["provisions", "tools", "garden"].slice(0, Math.max(0, parties(s).length - 2)),
      ...guildGrades.slice(1,s.guildProgress.grade+1).map(grade => grade.quest)];
  }
  const claimed = (s, id, team) => parties(s).some(other =>
    other !== team && other.phase !== "prep" && other.trip.quest === id);
  function unlockParty(s) {
    const count = parties(s).length, price = unlockCost(s);
    check(count < maxParties && guildGold(s) >= price, "増隊に必要な資金または編成枠を確認してください。");
    const team = { partyProfile:profileFor(count + 1), priority:"safe", decisionWeek:0, leaveWeek:0, phase:"prep", party:[], leader:null, policy:"safe", meds:0, quest:"herb", dungeon:"moss", trip:null };
    const existing = parties(s);
    restorePurse(team);
    (s.extraParties ??= []).push(team);
    team.quest = postedQuests(s).find(id => !existing.some(other => other.quest === id)) || "herb";
    s.gold -= price;
    return count + 1;
  }
  // Each turn in a daily save becomes the same numbered week. This keeps
  // relative deadlines, past reports and partially completed turns together.
  const legacyDates = {day:"week", readyDay:"readyWeek", leaveDay:"leaveWeek", morningDay:"decisionWeek",
    dispatchedDay:"dispatchedWeek", expiresDay:"expiresWeek", answeredDay:"answeredWeek"};
  function migrateDailyDates(entry) {
    if (!entry || typeof entry !== "object") return;
    for (const [key, value] of Object.entries(entry)) {
      if (Object.hasOwn(legacyDates,key) && Number.isInteger(value)) {
        entry[legacyDates[key]] = value;
        delete entry[key];
      } else if (typeof value === "object") migrateDailyDates(value);
    }
  }
  // Only rename generated order labels in old journals, keeping character names intact.
  function restoreOrderMessages(entries) {
    for (const entry of entries || []) {
      if (entry.combat?.rule || entry.rule)
        entry.message = entry.message.replace(/^ガンビット(?=\d+「)/, "戦術オーダー");
      entry.message = entry.message.replace(/のガンビットで撤退(?=。(?:未達のため納品なし|.+個を自動納品)。$)/, "の戦術オーダーで撤退");
    }
  }
  function restore(s) {
    if (s?.week == null && Number.isInteger(s?.day)) migrateDailyDates(s);
    check(s && Array.isArray(s.roster) && Array.isArray(s.history) && Number.isInteger(s.week), "保存データを確認してください。");
    s.clock ??= {elapsed:0,paused:false};
    if (!Object.hasOwn(chatterRates,s.chatterRate)) s.chatterRate = "quiet";
    if (!weekSpeeds.includes(s.clock.speed)) s.clock.speed = 1;
    // Older saves without a mailbox may already be past this week's departure.
    if (!s.morningMail && s.clock.elapsed >= departureDelay) s.clock.dispatchedWeek = s.week;
    s.children ??= [];
    s.bonds ??= {};
    s.marriages ??= [];
    s.calendar ??= newCalendar(calendarUnits);
    s.alumni ??= [];
    for (const p of [...s.children,...s.roster,...s.alumni]) {
      if (/^child-\d+$/.test(p.id)) s.nextChildId = Math.max(s.nextChildId || 1,Number(p.id.slice(6))+1);
    }
    s.morningMail ??= [];
    s.extraParties ??= [];
    s.allowStatReset ??= true;
    const legacyMembers = new Set(s.roster.filter(p => !p.career).map(p => p.id));
    if (knownPerson(s,"shion")) delete s.candidate;
    else s.candidate = restoreCharacter(s.candidate || recruit());
    s.roster.forEach(restoreCharacter);
    s.children.forEach(restoreCharacter);
    for (const p of s.alumni) {
      restoreAge(p);
      if (p.departure?.kind === "retired") p.retiredWeek ??= p.departure.week;
      p.career ??= [];
      p.rank ??= 1;
      restoreMorale(p);
      setCharacterNames(p, p);
    }
    s.town ??= {plots:{},food:0};
    if (!Object.hasOwn(landmarks,s.town.landmark)) s.town.landmark = null;
    restoreGuildRegister(s);
    check(Array.isArray(s.extraParties) && parties(s).length <= maxParties && parties(s).every(team =>
      team && Array.isArray(team.party) && ["prep","explore","report"].includes(team.phase) &&
      (team.phase === "prep" || team.trip)), "遠征の保存データを確認してください。");
    s.selectedParty = Number.isInteger(s.selectedParty) && parties(s)[s.selectedParty - 1] ? s.selectedParty : 1;
    restoreWorkshops(s);
    restoreRaids(s);
    s.guildProfile = profileFor(0, s.guildProfile);
    for (const [index, team] of parties(s).entries()) {
      team.partyProfile = profileFor(index + 1, team.partyProfile);
      team.priority ??= "safe";
      team.decisionWeek ??= 0;
      team.leaveWeek ??= 0;
      const t = team.trip, c = t?.pending;
      team.dungeon ??= "moss";
      if (t && !t.path) {
        t.dungeon = "moss";
        t.path = oldPath(t.steps, t.route === "pass");
      }
      if (team.phase === "explore") {
        if (t.quote.tributeRate === undefined) {
          t.quote.tributeRate = s.tributeRate;
          t.quote.tribute = Math.floor(t.quote.reward * s.tributeRate / 100);
          t.quote.partyReward = t.quote.reward - t.quote.tribute;
        }
        for (const u of t.unit) u.mp ??= currentMP(person(s,u.id));
        for (const u of t.unit.filter(u => legacyMembers.has(u.id))) {
          const p = person(s, u.id);
          recordDeparture(p, t);
          recordDepth(p, t);
        }
      }
      if (team.phase === "report") {
        for (const u of t.unit) {
          const p = person(s,u.id);
          if (p && u.mp == null) {
            p.missingHP = Math.max(0,outfittedStat(s,p,"hp") - u.hp);
            u.mp = currentMP(p);
          }
        }
      }
      if (t?.fight && !t.fight.enemies) {
        const f = t.fight, e = newFoe("enemy","boar");
        e.hp = f.hp;
        Object.assign(f,{enemies:[e],guards:{},haste:{},shaken:{}});
        delete f.hp;
      }
      if (t?.fight) t.fight.covers ??= {};
      restoreOrderMessages(t?.log);
      restoreOrderMessages(t?.effects);
      if (!c) continue;
      c.priority ??= c.type === "crisis" ? "urgent" : "normal";
      c.expiresWeek ??= s.week + 1;
      const entry = t.log.findLast(e => e.message.endsWith(c.line));
      if (entry) entry.letter = { ...c };
    }
    for (const r of s.history) {
      if (r.reason) r.reason = r.reason.replace(/のガンビットで撤退$/, "の戦術オーダーで撤退");
      restoreOrderMessages(r.log);
      r.partyNumber ??= 1;
      if (!r.path) {
        const steps = r.log.at(-1)?.step || 0;
        const rocky = r.log.some(e => e.message.includes(" → 岩場の近道へ。"));
        Object.assign(r, tripResult("moss", oldPath(steps, rocky)));
      }
    }
    restoreGuildProgress(s);
    expireCalls(s);
    return s;
  }
  const reportFor = (s, team) => s.history.find(r => r.week === s.week && (r.partyNumber ?? 1) === partyNumber(s, team));
  function setQuest(s, id, team = s, ids = team.party) {
    prep(team);
    check(postedQuests(s).includes(id) && !claimed(s, id, team), "この依頼は受注できません。");
    check(!ids.length || partyQualifies(s,ids,quests[id].rank), "この依頼には全員の階級が足りている必要があります。");
    team.quest = id;
  }
  function configure(s, ids, leader, policy, meds, team = s, dungeon = team.dungeon) {
    prep(team);
    check(team.leaveWeek !== s.week, "休暇中の隊は翌週まで編成を休みます。");
    check(dungeonOpen(s, dungeon), "このダンジョンはまだ解放されていません。");
    check(ids.length >= 1 && ids.length <= 3 && new Set(ids).size === ids.length, "1〜3人を選んでください。");
    check(ids.every(id => available(s,person(s,id)) && currentHP(s,person(s,id)) > 0), "療養中は出発できません。");
    check(partyQualifies(s, ids, dungeonRank(dungeon)), "このダンジョンには全員の階級が足りている必要があります。");
    check(ids.includes(leader), "出撃するリーダーを選んでください。");
    check(Object.hasOwn(policies, policy) && Number.isInteger(meds) && meds >= 0 && meds <= 3, "方針または薬の本数を確認してください。");
    check(!ids.some(id => awayMember(s, id)), "他隊の遠征メンバーは編成できません。");
    for (const other of parties(s)) {
      if (other === team || other.phase !== "prep") continue;
      other.party = other.party.filter(id => !ids.includes(id));
      if (!other.party.includes(other.leader)) other.leader = other.party[0] || null;
    }
    Object.assign(team, { party: [...ids], leader, policy, meds, dungeon });
    for (const item of s.equipment) {
      if (item.owner && !parties(s)[item.owner-1].party.includes(item.wearer)) item.wearer = null;
    }
    if (s.weaponOwner && !parties(s)[s.weaponOwner-1].party.includes(s.wielder)) s.wielder = null;
  }
  function hire(s) {
    check(!weekStarted(s), "雇用はその週の最初の出発前にできます。"); const p = recruit(s);
    check(!knownPerson(s, p.id) && guildGold(s) >= hireCost(p), "雇用枠と資金を確認してください。");
    recordJoining(p, s.week);
    s.gold -= hireCost(p); s.roster.push(p); delete s.candidate;
  }
  function register(s, data) {
    check(!weekStarted(s), "登録はその週の最初の出発前にできます。"); check(!knownPerson(s, "custom"), "自作冒険者は1人までです。");
    const name = clean(data.name, 8);
    check(name && startingJobs.includes(data.job) && Object.hasOwn(traits, data.trait) && Object.hasOwn(tones, data.tone), "名前・職業・性格・口調を確認してください。");
    const race = data.species ?? "human";
    check(Object.hasOwn(species,race), "種族を選んでください。");
    const age = Number(data.age ?? species[race].adult);
    check(Number.isInteger(age) && age >= species[race].adult && age < species[race].lifespan, "種族に合った成人年齢から寿命未満の年齢を入力してください。");
    const skill = data.initialSkill ?? jobs[data.job].skills[0];
    check(jobs[data.job].skills.includes(skill), "職業の初期スキルを選んでください。");
    const p = makePerson("custom", name, data.job, data.trait, clean(data.pronoun, 12) || "私", data.tone, clean(data.master, 16) || "マスター", clean(data.ending, 12), {species:race,age}, skill);
    p.birthdayWeek = weekOfYear(calendarDate(s));
    p.backstory = String(data.backstory ?? "");
    setCharacterNames(p, data);
    recordJoining(p, s.week);
    if (data.portrait) {
      check(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(data.portrait), "PNG・JPEG・WebPを選んでください。");
      p.portrait = data.portrait;
    }
    s.roster.push(p);
  }
  const giftCost = 10;
  const pairKey = (a,b) => [a,b].sort().join("|");
  const affinity = (s,a,b) => s.bonds[pairKey(a,b)]?.score || 0;
  function bondTime(s,a,b,amount) {
    const bond = s.bonds[pairKey(a,b)] ??= {score:0};
    bond.score = boundedScore(bond.score + amount);
    return bond;
  }
  function eachPair(ids,visit) {
    ids.forEach((a,i) => ids.slice(i+1).forEach(b => visit(a,b)));
  }
  const livingAdult = p => p && p.age >= raceOf(p).adult && p.age < raceOf(p).lifespan &&
    (!p.departure || p.departure.kind === "retired");
  const homeAdult = (s,id) => livingAdult(knownPerson(s,id)) && !awayMember(s,id);
  function canGift(s,a,b) {
    return a !== b && homeAdult(s,a) && homeAdult(s,b) && guildGold(s) >= giftCost &&
      affinity(s,a,b) < 100 && s.bonds[pairKey(a,b)]?.giftWeek !== s.week;
  }
  function giveGift(s,a,b) {
    check(canGift(s,a,b),"贈り物は町にいる二人に週1回、金庫から10Gを使います。");
    s.gold -= giftCost;
    bondTime(s,a,b,12).giftWeek = s.week;
  }
  function spouseOf(s,id) {
    const marriage = s.marriages.findLast(m => m.partners.includes(id) && m.partners.every(key => livingAdult(knownPerson(s,key))));
    return marriage && knownPerson(s,marriage.partners.find(key => key !== id));
  }
  function ancestors(s,p) {
    const found = new Set(), pending = [...(p.parents || [])];
    while (pending.length) {
      const id = pending.pop();
      if (found.has(id)) continue;
      found.add(id);
      pending.push(...(knownPerson(s,id)?.parents || []));
    }
    return found;
  }
  function canMarry(s,a,b) {
    if (a === b || affinity(s,a,b) !== 100 || !homeAdult(s,a) || !homeAdult(s,b) || spouseOf(s,a) || spouseOf(s,b)) return false;
    const first = knownPerson(s,a), second = knownPerson(s,b);
    return !ancestors(s,first).has(b) && !ancestors(s,second).has(a) && !first.parents?.some(id => second.parents?.includes(id));
  }
  function familyEvent(s,people,message) {
    for (const p of people) record(p,s.week,message);
    s.milestones.unshift({week:s.week,message});
    return message;
  }
  function marry(s,a,b) {
    check(canMarry(s,a,b),"結婚には町にいる独身の成人二人と、最大の好感度が必要です。");
    const first = knownPerson(s,a), second = knownPerson(s,b);
    s.marriages.push({partners:[a,b],week:s.week});
    return familyEvent(s,[first,second],first.name+"と"+second.name+"が結婚。広場で仲間に祝福され、町に二人の家を構えた。");
  }
  function childStage(p) {
    const adult = raceOf(p).adult;
    if (p.age >= adult) return "成人";
    if (p.age >= Math.ceil(adult*2/3)) return "見習い";
    return p.age >= Math.ceil(adult/3) ? "少年期" : "幼年期";
  }
  const sample = values => values[Math.floor(Math.random()*values.length)];
  function familyJob(p) {
    return startingJobs.find(job => job === p.job || jobs[job].next === p.job) ||
      ({swordmaster:"sword", princess:"guard"})[p.job] || "sword";
  }
  function familyAptitude(p) {
    const trained = Object.keys(statGains).filter(key => p.allocation?.[key] > 0);
    return trained.sort((a,b) => p.allocation[b]-p.allocation[a])[0] || p.aptitude ||
      ({sword:"atk",guard:"def",healer:"spirit",hunter:"dex",mage:"magic",thief:"dex",druid:"spirit",beastmaster:"atk"})[familyJob(p)];
  }
  function growFamilies(s) {
    for (const marriage of s.marriages) {
      const [a,b] = marriage.partners;
      if (!homeAdult(s,a) || !homeAdult(s,b) || marriage.week >= s.week) continue;
      if (marriage.lastBirthDate && calendarDate(s)-marriage.lastBirthDate < 2*calendarUnits) continue;
      const young = s.children.filter(p => p.parents.includes(a) && p.parents.includes(b) && p.age < raceOf(p).adult);
      if (young.length >= 2 || Math.random() >= .18) continue;
      const names = ["アサ","ヒナ","ハル","ミオ","ナツ","トワ","ユキ","ツキ","スイ","カナ"];
      const id = s.nextChildId ?? 1;
      const name = names[(id-1)%names.length] + (id > names.length ? Math.ceil(id/names.length) : "");
      welcomeChild(s,a,b,name);
      marriage.lastBirthDate = calendarDate(s);
    }
  }
  // Also used to register births from the original town records, which predate marriages.
  function welcomeChild(s,firstId,secondId,name) {
    const parents = [firstId,secondId].map(id => knownPerson(s,id));
    check(firstId !== secondId && parents.every(livingAdult), "存命の成人を両親として選んでください。");
    const childName = clean(name,8);
    check(childName, "子供の名前を入力してください。");
    const species = inheritSpecies(parents[0].species,parents[1].species);
    const id = "child-"+(s.nextChildId ?? 1);
    const job = familyJob(sample(parents)), mentor = sample(parents);
    const child = makePerson(id,childName,job,mentor.trait,"私",mentor.tone,"マスター","",{species,age:0});
    child.jobAffinity = job;
    child.aptitude = familyAptitude(sample(parents));
    const talents = [...new Set(parents.flatMap(p => p.skills || []))].filter(skill => !child.skills.includes(skill));
    if (talents.length && Math.random() < .35) child.skillTalent = sample(talents);
    child.birthdayWeek = weekOfYear(calendarDate(s));
    child.parents = [firstId,secondId];
    const message = parents.map(p => p.name).join("と")+"の子、"+childName+"が生まれた。";
    familyEvent(s,[...parents,child],message);
    s.nextChildId = (s.nextChildId ?? 1)+1;
    s.children.push(child);
    return child;
  }
  function enlistChild(s,id) {
    const child = s.children.find(p => p.id === id);
    check(!weekStarted(s) && child && child.age >= raceOf(child).adult,"成人後、週の最初の出発前に入団できます。");
    s.children = s.children.filter(p => p !== child);
    recordJoining(child,s.week);
    s.roster.push(child);
    familyEvent(s,[child],child.name+"が"+child.parents.map(id => knownPerson(s,id).name).join("と")+"の家からギルドに入団した。");
  }
  function advanceAges(s) {
    // Process each living person once, before the new week's visitors and departures.
    const living = [...s.roster,...s.registry,...s.children,...s.alumni.filter(p => p.departure.kind === "retired")];
    if (s.candidate && !knownPerson(s,s.candidate.id)) living.push(s.candidate);
    const growing = new Set(s.children);
    for (const p of living) {
      if (!anniversaryPassed(s,p.birthdayWeek)) continue;
      const r = raceOf(p);
      if (p.awaitingLastReturn) continue;
      const previous = growing.has(p) && childStage(p);
      p.age++;
      if (previous && previous !== childStage(p)) familyEvent(s,[p],p.name+"が"+p.age+"歳になり、"+childStage(p)+"を迎えた。");
      if (p.age >= r.lifespan) {
        if (awayMember(s,p.id)) p.awaitingLastReturn = true;
        else endLifespan(s,p);
      } else if (r.decline !== null && p.age >= r.decline && !p.departure) {
        const before = p.frailty;
        p.frailty = Math.min(75,before+r.annualLoss);
        if (p.frailty === before) continue;
        record(p,s.week,p.age+"歳。加齢で基礎能力が低下（累計 −"+p.frailty+"％）。");
        const team = parties(s).find(t => t.phase === "explore" && t.party.includes(p.id));
        if (team) {
          const unit = team.trip.unit.find(u => u.id === p.id);
          unit.hp = Math.min(unit.hp,outfittedStat(s,p,"hp"));
          unit.mp = Math.min(unit.mp,maxMP(p));
        }
      }
    }
    for (const [id,shop] of Object.entries(s.town.workshops)) advanceWorkshop(s,id,shop);
  }
  function endLifespan(s,p) {
    const message = p.name+"は"+p.age+"歳で天寿を全うした。";
    delete p.awaitingLastReturn;
    if (person(s,p.id)) leaveRoster(s,p,"lifespan",message);
    else {
      record(p,s.week,message);
      if (!s.alumni.includes(p)) s.alumni.push(p);
      s.registry = s.registry.filter(q => q !== p);
      s.visitors = s.visitors.filter(id => id !== p.id);
      s.children = s.children.filter(q => q !== p);
      if (s.candidate === p) delete s.candidate;
      p.departure = {kind:"lifespan",week:s.week,message};
    }
    s.milestones.unshift({week:s.week,message});
  }
  function estimate(s, team = s) {
    const reward = quests[team.quest].reward, share = Math.floor(reward * 0.3);
    const bag = team.bag || s.bag;
    const rations = Math.min(team.party.length, bag.supplies.ration + s.supplies.ration);
    const packedMeds = Math.min(team.meds, bag.supplies.medicine + s.supplies.medicine);
    const food = 10 * (team.party.length - rations), medicine = 30 * (team.meds - packedMeds);
    const wages = parties(s).some(other => other.trip?.week === s.week) ? 0 : payroll(s);
    const tribute = Math.floor(reward * s.tributeRate / 100);
    return { reward, tributeRate:s.tributeRate, tribute, partyReward:reward-tribute, share, food, medicine, wages, rations, packedMeds, net: reward - share - food - medicine - wages };
  }
  const expeditionFunds = (s,team) => Math.min(s.gold,team.wallet + Math.max(0,guildGold(s)));
  const log = (t, message, fields) => t.log.push({ step: t.steps, message, ...fields });
  const recordDeparture = (p, t) => record(p, t.week, "「" + quests[t.quest].name + "」に参加。", {quest:t.quest});
  const deepestIn = (p, dungeon) => p.career.reduce((best, e) =>
    Math.max(best, (!dungeon || (e.dungeon || "moss") === dungeon) ? e.depth || 0 : 0), 0);
  const deepest = p => deepestIn(p);
  function recordDepth(p, t, week = t.week) {
    const n = tripRooms(t)[t.node];
    if (n.depth > deepestIn(p, t.dungeon)) record(p, week,
      dungeons[t.dungeon].name + " 第" + n.depth + "層「" + n.name + "」に初到達。", {depth:n.depth, dungeon:t.dungeon});
  }
  function depart(s, team = s, plan = team, paced = false) {
    check(!s.town.repairs?.hall,"ギルドホールの修理が終わるまで新規出発は休止します。");
    check(team.leaveWeek !== s.week, "休暇中の隊は翌週まで出発できません。");
    setQuest(s, team.quest, team, plan.party);
    const quote = estimate(s, { ...plan, bag:team.bag, quest:team.quest });
    const cost = quote.food + quote.medicine;
    check(expeditionFunds(s,team) >= cost, "食料・薬の購入資金が足りません。");
    configure(s, plan.party, plan.leader, plan.policy, plan.meds, team, plan.dungeon ?? team.dungeon);
    const packed = {medicine:packSupplies(s,team,"medicine",quote.packedMeds),
      tonic:packSupplies(s,team,"tonic",1)[0] || null, spark:packSupplies(s,team,"spark",1)[0] || null};
    const meals = packSupplies(s,team,"ration",quote.rations);
    const partyPaid = Math.min(team.wallet,cost);
    team.trip = {
      tonic:!!packed.tonic, spark:!!packed.spark, packed, partyPaid, paced,
      week: s.week, deadline: s.week, quest: team.quest, quote, startGold: guildGold(s),
      leader: team.leader, policy: team.policy, unit: team.party.map((id,i) => {
        const p = person(s,id);
        const hp = Math.min(outfittedStat(s,p,"hp"),currentHP(s,p)+supplyPower("ration",meals[i]?.quality || 1));
        return {id, hp, mp:currentMP(p), state:"ok"};
      }),
      dungeon:team.dungeon, path:["gate"], node: "gate", route: null, steps: 0, meds: team.meds, cargo: { herb: 0, ore: 0 },
      log: [], wins: 0, calls: 0, lastCall: -10, pending: null, fight: null
    };
    team.wallet -= partyPaid;
    s.gold -= cost; team.phase = "explore";
    for (const id of team.party) recordDeparture(person(s,id), team.trip);
    log(team.trip, person(s, team.leader).name + "が「" + policies[team.policy] + "」で" + dungeons[team.dungeon].name + "へ出発。");
    if (tripRooms(team.trip).gate.next.length > 1) fork(s, team);
    for (const id of team.party) recordDepth(person(s,id), team.trip);
  }
  function beginCall(s, team, type, target, question) {
    const t = team.trip, leader = person(s, t.leader);
    const member = person(s, target) || person(s, team.party.find(id => id !== t.leader)) || leader;
    t.pending = { type, priority: type === "crisis" ? "urgent" : "normal", expiresWeek:s.week + 1, target,
      senderName:formalName(leader), line:question ?? speak(leader, type, familiarName(member)) };
    log(t, t.pending.senderName + (type === "crisis" ? "から必須通信。" : "から分岐の通信。") + t.pending.line, { letter: { ...t.pending } });
  }
  function chooseRoute(s, team, route, reason) {
    team.trip.route = route;
    log(team.trip, reason + " → " + tripRooms(team.trip)[route].name + "へ。");
  }
  function preferredRoute(t, leader) {
    const rooms = tripRooms(t);
    const preference = routePreference(t.policy, leader.trait);
    const rank = id => preference.indexOf(["exit","fork"].includes(rooms[id].event) ? "shortcut" : rooms[id].event);
    return [...rooms[t.node].next].sort((a,b) => rank(a) - rank(b))[0];
  }
  function fork(s, team) {
    const t = team.trip, leader = person(s, t.leader);
    if (t.dungeon !== "moss") {
      const n = tripRooms(t)[t.node];
      if (n.depth > 1 && n.next.length >= 3 && t.policy === "gather" && leader.trait !== "bold" && !t.calls) {
        t.route = null;
        t.calls++; t.lastCall = t.steps;
        beginCall(s, team, "fork", null, leader.master + "、" + n.name + "で道が分かれています。どの道を調べましょう？");
        return;
      }
      return chooseRoute(s, team, preferredRoute(t, leader), policies[t.policy] + "・" + leader.name + "（" + traits[leader.trait] + "）の判断");
    }
    if (t.morningPriority) {
      const q = quests[t.quest];
      if (t.morningPriority === "depth" || (q.item === "ore" && q.count > 1))
        return chooseRoute(s,team,"pass",leader.name + "の判断：鉱石を探して深層へ");
      if (q.item === "herb" && q.count > t.cargo.herb)
        return chooseRoute(s,team,"grove",leader.name + "の判断：納品用の薬草を採集");
    }
    if (t.policy === "bold") return chooseRoute(s, team, leader.trait === "bold" ? "vein" : "pass", "方針「大胆に進む」：岩場を越える");
    if (t.policy === "safe") return chooseRoute(s, team, "grove", "方針「安全第一」：戦闘を避ける");
    log(t, "方針「素材優先」：両方の道に素材があり、判断が分かれる。");
    if (leader.trait !== "bold" && t.calls < 1 && t.steps - t.lastCall >= 4) {
      t.calls++; t.lastCall = t.steps; beginCall(s, team, "fork", null);
    } else {
      chooseRoute(s, team, leader.trait === "bold" ? "pass" : "grove", "独断：" + leader.name + "（" + traits[leader.trait] + "）の判断");
    }
  }
  function routePreference(policy, trait) {
    if (policy === "safe") return ["herb","grove","treasure","passage","shortcut","fight"];
    if (policy === "bold" && trait === "bold") return ["fight","shortcut","treasure","passage","grove","herb"];
    if (policy === "bold") return ["shortcut","passage","treasure","herb","grove","fight"];
    if (trait === "bold") return ["passage","treasure","shortcut","fight","herb","grove"];
    return ["herb","treasure","grove","passage","shortcut","fight"];
  }
  function skillBonus(p, effect, round) {
    return p.skills.reduce((total, id) => {
      const skill = abilities[id];
      return total + (round >= (skill.round || 1) ? abilityPower(p,id,effect) : 0);
    }, 0);
  }
  const gambitLimit = 10;
  const conditions = {always:"いつでも", opening:"戦闘開始時（第1ラウンド）", hp:"HPが指定％以下",
    status:"動揺している", count:"敵が指定数以上", casting:"敵が詠唱中"};
  const actions = {attack:"通常攻撃", cover:"かばう（攻撃を代わりに受ける）", heal:"手当て", medicine:"回復薬", cleanse:"動揺を鎮める", flee:"逃げる"};
  const foes = {
    boar:enemy,
    crystal:{name:"晶角イノシシ", hp:18, atk:18, def:5, spd:6},
    warden:{name:"双月角の番獣", hp:32, atk:33, def:7, spd:9}
  };
  const allySelectors = s => ({self:"自分", lowest:"残HPが最も低い味方", leader:"リーダー",
    ...Object.fromEntries(s.roster.map(p => [p.id,p.name]))});
  const subjects = s => ({...allySelectors(s), lowest:"味方の誰か", foe:"敵のいずれか"});
  const enemySelectors = {nearest:"最も近い敵", strongest:"残HPが最も高い敵", casting:"詠唱中の敵",
    boar:enemy.name, crystal:foes.crystal.name, warden:foes.warden.name};
  const actionList = p => ({...actions,...Object.fromEntries(p.skills.map(id => [id,abilities[id].name]))});
  function targets(s, action, actorId) {
    if (action === "flee") return {self:"自分"};
    if (action === "attack" || abilities[action]?.atk) return enemySelectors;
    const allies = allySelectors(s);
    if (action === "cover") {
      delete allies.self;
      delete allies[actorId];
    }
    return allies;
  }
  function setGambits(s, id, rules) {
    const p = person(s,id);
    check(p && Array.isArray(rules) && rules.length <= gambitLimit, "戦術オーダーは1人10件までです。");
    p.gambits = rules.map(({condition,subject="self",value=50,action,target}) => {
      check(Object.hasOwn(conditions,condition) && Object.hasOwn(subjects(s),subject) &&
        Object.hasOwn(actionList(p),action) && Object.hasOwn(targets(s,action,id),target), "条件・対象・習得技を確認してください。");
      check(Number.isInteger(value) && value >= 1 && value <= (condition === "count" ? 2 : 100), "条件の数値を確認してください。");
      return {condition,subject,value,action,target};
    });
  }
  function preset(p, role) {
    const rule = (condition,action,target,value=50,subject="self") => ({condition,action,target,value,subject});
    const strike = p.skills.find(id => abilities[id].atk);
    const healing = p.skills.find(id => abilities[id].heal) || "heal";
    return role === "healer" ? [rule("status","cleanse","lowest",50,"lowest"),
      rule("hp",healing,"lowest",75,"lowest"),rule("always","attack","nearest")] :
      [...(strike ? [rule("always",strike,"strongest")] : []),rule("always","attack","nearest")];
  }
  function conditionLabel(s,r) {
    if (r.condition === "hp") return subjects(s)[r.subject] + "のHPが" + r.value + "％以下";
    if (r.condition === "status") return subjects(s)[r.subject] + "が動揺";
    if (r.condition === "count") return "敵が" + r.value + "体以上";
    return conditions[r.condition];
  }
  const newFoe = (id,kind) => ({id,kind,hp:foes[kind].hp,casting:false});
  function injure(s,t,u,kind,weeks) {
    const p = person(s,u.id);
    const treatment = hasWorkingShop(s,"alchemy");
    p.readyWeek = Math.max(p.readyWeek,s.week + Math.max(2,weeks - Number(treatment)));
    u.injury = p.injury = {kind,readyWeek:p.readyWeek};
    const message = p.name + "が重傷（" + kind + "）。第" + p.readyWeek + "週の始めまで療養。";
    log(t,message); record(p,s.week,message);
  }
  function startFight(s, team) {
    const t = team.trip;
    for (const u of t.unit.filter(u => u.state === "down")) {
      u.state = "severe";
      if (!u.injury) injure(s,t,u,"重度の捻挫",2);
    }
    const boss = t.dungeon !== "moss" && tripRooms(t)[t.node].depth === dungeons[t.dungeon].floors;
    const enemies = [newFoe("enemy",boss ? "warden" : "boar")];
    if (t.dungeon !== "moss" || (t.node === "vein" && t.policy === "bold")) enemies.push(newFoe("caster","crystal"));
    t.fight = {enemies, turn:0, order:[], guards:{}, haste:{}, shaken:{}, covers:{}};
    eachPair(t.unit.filter(u => u.state === "ok").map(u => u.id),(a,b) => bondTime(s,a,b,4));
    orderRound(s,t);
    log(t,enemies.map(e => foes[e.kind].name).join("と") + "が現れた。");
    if (t.spark) {
      t.spark = false;
      const hit = supplyPower("spark",t.packed?.spark?.quality || 1);
      enemies[0].hp = Math.max(0,enemies[0].hp-hit);
      combatLog(t,"火花玉で先制し、"+hit+"ダメージ。",t.leader,enemies[0].id,"skill",hit);
    }
    if (!t.paced) battle(s,team);
  }
  function orderRound(s,t) {
    const f = t.fight;
    const round = 1 + Math.floor(f.turn / (t.unit.length + f.enemies.length));
    const order = t.unit.map(u => {
      const p = person(s,u.id);
      return {id:u.id,spd:outfittedStat(s,p,"spd") + skillBonus(p,"spd",round) + (f.haste[u.id] || 0)};
    });
    order.push(...f.enemies.map(e => ({id:e.id,spd:foes[e.kind].spd})));
    f.order = order.sort((a,b) => b.spd-a.spd).map(o => o.id);
  }
  function combatLog(t,message,actor,target,kind,amount,rule,protectedId) {
    const event = {actor,target,kind,amount};
    if (rule) event.rule = rule;
    if (protectedId) event.protectedId = protectedId;
    log(t,message,{combat:event});
    (t.effects ??= []).push({...event,message});
  }
  function chooseGambit(s,t,u,round) {
    const p = person(s,u.id), f = t.fight;
    const allies = t.unit.filter(a => a.state === "ok"), enemies = f.enemies.filter(e => e.hp > 0);
    const allyPool = key => key === "lowest" ? allies : allies.filter(a =>
      a.id === (key === "self" ? u.id : key === "leader" ? t.leader : key));
    const maxHP = a => a.kind ? foes[a.kind].hp : outfittedStat(s,person(s,a.id),"hp");
    for (const [i,r] of p.gambits.entries()) {
      const pool = r.subject === "foe" ? enemies : allyPool(r.subject);
      if (r.condition === "hp" && !pool.some(a => 100*a.hp <= r.value*maxHP(a))) continue;
      if (r.condition === "status" && !pool.some(a => f.shaken[a.id])) continue;
      if (r.condition === "opening" && round !== 1) continue;
      if (r.condition === "count" && enemies.length < r.value) continue;
      if (r.condition === "casting" && !enemies.some(e => e.casting)) continue;
      const skill = abilities[r.action];
      if ((skill || ["heal","cleanse"].includes(r.action)) && u.mp < 2) continue;
      if (skill && (!p.skills.includes(r.action) || round < (skill.round || 1))) continue;
      if (r.action === "medicine" && !t.meds) continue;
      let target;
      if (Object.hasOwn(enemySelectors,r.target)) {
        const pool = enemies.filter(e => r.target === "casting" ? e.casting :
          ["nearest","strongest"].includes(r.target) || e.kind === r.target);
        target = r.target === "strongest" ? pool.sort((a,b) => b.hp-a.hp)[0] : pool[0];
      } else {
        const pool = allyPool(r.target).filter(a => {
          if (r.action === "cover") return a.id !== u.id && !Object.values(f.covers).includes(a.id);
          if (skill?.heal || ["heal","medicine"].includes(r.action)) return a.hp < maxHP(a);
          if (r.action === "cleanse") return f.shaken[a.id];
          if (skill?.def) return (f.guards[a.id] || 0) < skill.def;
          if (skill?.spd) return (f.haste[a.id] || 0) < skill.spd;
          return true;
        });
        target = [...pool].sort((a,b) => a.hp-b.hp)[0];
      }
      if (target) return {action:r.action,target,rule:i+1,condition:conditionLabel(s,r)};
    }
  }
  function allyTurn(s,team,u,round) {
    const t = team.trip, f = t.fight, p = person(s,u.id);
    delete f.covers[u.id];
    const pick = p.gambits.length ? chooseGambit(s,t,u,round) : undefined;
    const action = pick?.action, skill = abilities[action];
    if (skill || ["heal","cleanse"].includes(action)) u.mp -= 2;
    const target = pick?.target || f.enemies.find(e => e.hp > 0);
    const name = target.kind ? foes[target.kind].name : person(s,target.id).name;
    const prefix = pick ? "戦術オーダー" + pick.rule + "「" + pick.condition + "」 " : "";
    const write = (message,target,kind,amount) => combatLog(t,prefix + message,u.id,target.id,kind,amount,pick?.rule);
    if (action === "cover") {
      f.covers[u.id] = target.id;
      return write(p.name + "が" + name + "をかばう構え。",target,"cover",0);
    }
    if (action === "flee") {
      write(p.name + "が撤退を指示。",u,"flee",0);
      return settle(s,team,p.name + "の戦術オーダーで撤退");
    }
    const heal = (ally,power,label) => {
      const patient = person(s,ally.id);
      const amount = Math.min(power,outfittedStat(s,patient,"hp")-ally.hp);
      ally.hp += amount;
      write(p.name + "の" + label + "で" + patient.name + "のHPが" + amount + "回復。",ally,"heal",amount);
    };
    if (action === "heal" || action === "medicine" || skill?.heal) {
      return heal(target,abilityPower(p,action,"heal") || (action === "medicine" ? useMedicine(t) : 4),skill?.name || actions[action]);
    }
    if (skill?.def || skill?.spd) {
      const bonus = skill.def ? f.guards : f.haste;
      bonus[target.id] = abilityPower(p,action,skill.def ? "def" : "spd");
      return write(p.name + "の" + skill.name + "で" + name + "の" + (skill.def ? "防御" : "次ラウンドの行動速度") + "が上昇。",target,"support",bonus[target.id]);
    }
    if (action === "cleanse") {
      delete f.shaken[target.id];
      return write(p.name + "が" + name + "の動揺を鎮めた。",target,"support",0);
    }
    if (!pick && u.mp >= 2 && skillBonus(p,"heal",round)) {
      const ally = t.unit.filter(a => a.state === "ok" && a.hp < outfittedStat(s,person(s,a.id),"hp")).sort((a,b) => a.hp-b.hp)[0];
      if (ally) {
        u.mp -= 2;
        heal(ally,skillBonus(p,"heal",round),"回復スキル");
      }
    }
    const attackBonus = pick ? abilityPower(p,action,"atk") : u.mp >= 2 ? skillBonus(p,"atk",round) : 0;
    if (!pick && attackBonus) u.mp -= 2;
    const atk = outfittedStat(s,p,"atk") + attackBonus + (t.tonic ? supplyPower("tonic",t.packed?.tonic?.quality || 1) : 0) - (f.shaken[u.id] ? 3 : 0);
    const previous = f.lastStrike;
    const assist = previous && previous.target === target.id && previous.actor !== u.id &&
      t.unit.some(a => a.id === previous.actor && a.state === "ok") && affinity(s,u.id,previous.actor) >= 40 ? 1 : 0;
    f.lastStrike = {target:target.id,actor:u.id};
    const hit = assist + damage(atk,s.wielder === u.id ? bladeMultiplier(s.weaponQuality) : 1,foes[target.kind].def);
    target.hp = Math.max(0,target.hp-hit);
    write((assist ? person(s,previous.actor).name+"と連携。 " : "") + p.name + "の" + (skill?.name || "攻撃") + "。" + name + "に" + hit + "ダメージ。",target,skill ? "skill" : "attack",hit);
  }
  function enemyTurn(s,team,e,round) {
    const t = team.trip, f = t.fight, stats = foes[e.kind];
    const intended = t.unit.filter(u => u.state === "ok").sort((a,b) => a.hp-b.hp)[0];
    if (!intended) return settle(s,team,"全員を救助して帰還");
    if (e.kind === "crystal" && !e.casting) {
      e.casting = true;
      return combatLog(t,stats.name + "が晶鳴りを詠唱。",e.id,e.id,"cast",0);
    }
    let protector = t.unit.find(u => u.state === "ok" && f.covers[u.id] === intended.id);
    if (!protector && intended.hp <= outfittedStat(s,person(s,intended.id),"hp")/2) {
      const spouse = spouseOf(s,intended.id);
      const allies = t.unit.filter(u => u !== intended && u.state === "ok" && !f.covers[u.id] && affinity(s,u.id,intended.id) >= 40);
      const priority = u => affinity(s,u.id,intended.id) + (u.id === spouse?.id ? 100 : 0);
      const helper = allies.sort((a,b) => priority(b)-priority(a))[0];
      if (helper && Math.random() < priority(helper)/1000) protector = helper;
    }
    const target = protector || intended;
    const p = person(s,target.id), hit = damage(stats.atk,1,outfittedStat(s,p,"def") + skillBonus(p,"def",round) + (f.guards[p.id] || 0) + (e.casting ? spellDefense(p) : 0));
    const intercept = protector ? p.name + "が" + person(s,intended.id).name + "をかばった。" : "";
    if (protector) {
      delete f.covers[protector.id];
      bondTime(s,protector.id,intended.id,6);
    }
    target.hp = Math.max(0,target.hp-hit);
    if (e.casting) f.shaken[p.id] = true;
    combatLog(t,intercept + stats.name + " → " + p.name + "に" + hit + "ダメージ（残HP" + target.hp + "）。" + (e.casting ? "晶鳴りで動揺。" : ""),
      e.id,p.id,e.casting ? "skill" : "attack",hit,undefined,protector && intended.id);
    e.casting = false;
    if (!target.hp) {
      for (const [actor,ally] of Object.entries(f.covers))
        if (actor === target.id || ally === target.id) delete f.covers[actor];
      target.state = "down";
      p.deaths++;
      const message = p.name + "が" + tripRooms(t)[t.node].name + "で瀕死に。死亡" + p.deaths + "回目。";
      log(t,message); record(p,s.week,message);
      if (p.deaths >= deathThreshold(s)) {
        target.state = "lost";
        return settle(s,team,p.name + "の消失により遠征を打ち切り帰還");
      }
      if (p.deaths === deathThreshold(s)-1 || e.kind === "crystal") injure(s,t,target,"骨折",4);
      beginCall(s,team,"crisis",target.id);
    }
  }
  function battleTurn(s,team) {
    const t = team.trip, f = t.fight;
    t.effects = [];
    while (f.turn < 10*f.order.length && f.enemies.some(e => e.hp > 0)) {
      if (f.turn % f.order.length === 0) orderRound(s,t);
      const round = 1 + Math.floor(f.turn/f.order.length), id = f.order[f.turn++ % f.order.length];
      const e = f.enemies.find(e => e.id === id);
      if (e) {
        if (!e.hp) continue;
        enemyTurn(s,team,e,round);
      } else {
        const u = t.unit.find(a => a.id === id);
        if (u.state !== "ok") continue;
        allyTurn(s,team,u,round);
      }
      break;
    }
    if (team.phase !== "explore" || t.pending) return;
    if (f.enemies.some(e => e.hp > 0)) {
      if (f.turn >= 10*f.order.length) settle(s,team,"10ラウンドで退路を確保し帰還");
      return;
    }
    t.fight = null;
    t.wins++; t.cargo.ore += 2;
    const defeated = f.enemies.map(e => foes[e.kind].name).join("と");
    for (const u of t.unit.filter(u => u.state === "ok")) record(person(s,u.id),s.week,tripRooms(t)[t.node].name + "で" + defeated + "を討伐。");
    log(t,"勝利。鉱石2個を回収。");
    if (f.enemies.some(e => e.kind === "warden")) {
      findRelic(s,team,"tusk",foes.warden.name);
      recordFeat(s,"boss",dungeons[t.dungeon].name+"の"+foes.warden.name+"を討伐");
      checkGuildPromotion(s);
    }
  }
  const relics = {
    tide:{name:"蒼潮の羅針盤",mark:"🧭",slot:"charm",effects:{hp:8,spd:3}},
    tusk:{name:"晶角の双月刃",mark:"🌙",slot:"weapon",effects:{atk:9,def:2}}
  };
  function findRelic(s,team,id,source) {
    if (s.equipment.some(item => item.relic === id)) return;
    const relic = relics[id];
    s.equipment.push({...relic,effects:{...relic.effects},quality:5,relic:id,owner:partyNumber(s,team),wearer:null});
    log(team.trip,source+"から一点物「"+relic.name+"」を入手。",{relic:id});
  }
  function battle(s,team) {
    while (team.trip.fight && !team.trip.pending) battleTurn(s,team);
  }
  // Ancient passages use transfer seals, blade floors and cursed altars.
  const trapAt = (dungeon,id) => {
    if (dungeon === "moss") return;
    const [floor,room] = id.split("-");
    if (dungeon === "archive" && room === "gallery" && Number(floor)%3 === 1) return "transfer";
    if (room === "gallery") return Number(floor)%2 ? "curse" : "leg";
    if (room === "cache" && Number(floor)%2 === 0) return "arm";
  };
  const canDetectTrap = (s,p) => s.town.landmark === "observatory" || !!jobs[p.job].detect;
  const luckyWeek = week => week % 4 < 2;
  function surveyDungeon(s,id) {
    if (s.town.landmark !== "academy") return [];
    const rooms = dungeons[id].rooms;
    const branch = Object.values(rooms).find(n => n.next.length > 1);
    return branch.next.slice(0,2).map(key => {
      const n = rooms[key];
      return n.name+"（"+({herb:"薬草",grove:"採集",fight:"戦闘"}[n.event] || "通路")+"）";
    });
  }
  function enterTrap(s,team,kind) {
    const t = team.trip, active = t.unit.filter(u => u.state === "ok");
    const scout = active.find(u => canDetectTrap(s,person(s,u.id)));
    if (scout) {
      log(t,person(s,scout.id).name+"が罠を感知。全員が安全に通過。");
      return;
    }
    const risk = .12*dungeons[t.dungeon].level + (luckyWeek(s.week) ? 0 : .15);
    for (const u of active) {
      if (Math.random() >= risk) continue;
      const p = person(s,u.id);
      if (kind === "transfer") {
        t.rescue = {id:u.id,elapsed:0};
        u.state = "missing";
        log(t,p.name+"が転送罠で行方不明。救助隊が捜索を開始。");
        return;
      }
      if (!Object.hasOwn(p.debuffs,kind)) {
        p.debuffs[kind] = 0;
        const message = p.name+"が罠で"+debuffs[kind].name+"を負った。";
        record(p,s.week,message);
        log(t,message);
        u.mp = Math.min(u.mp,maxMP(p));
      }
    }
  }
  function rescueStep(s,team) {
    const t = team.trip, search = t.rescue;
    const u = t.unit.find(unit => unit.id === search.id);
    search.elapsed++;
    const knights = s.town.landmark === "castle";
    if (!knights && search.elapsed < 3) {
      log(t,"救助隊が捜索中（"+search.elapsed+"/3手）。");
      return;
    }
    const message = (knights ? "城の騎士団" : "救助隊")+"が"+person(s,u.id).name+"を発見。";
    log(t,message);
    u.state = "ok";
    if (search.elapsed >= 3) {
      u.state = "severe";
      injure(s,t,u,"遭難による負傷",3);
    }
    delete t.rescue;
    settle(s,team,message+"全員で帰還");
  }
  const emergencyParty = s => parties(s).find(team => team.trip?.pending?.type === "crisis");
  function step(s, team = s) {
    check(!emergencyParty(s), "緊急通信に返信してください。");
    check(team.phase === "explore" && !team.trip.pending, "通信に返信してください。");
    const t = team.trip;
    check(!s.clock.paused && !t.paused, "一時停止中です。");
    if (t.rescue) return rescueStep(s,team);
    if (t.fight) return battleTurn(s,team);
    delete t.effects;
    t.node = nextRoom(t);
    t.path.push(t.node);
    t.steps++;
    for (const u of t.unit) recordDepth(person(s,u.id), t, s.week);
    const n = tripRooms(t)[t.node];
    const trap = trapAt(t.dungeon,t.node);
    if (trap) enterTrap(s,team,trap);
    if (t.rescue) return;
    switch (n.event) {
      case "herb": {
        const hunter = t.unit.some(u => jobs[person(s, u.id).job].forage);
        t.cargo.herb += hunter ? 3 : 2;
        log(t, "薬草を2個採集。" + (hunter ? "狩人がもう1個発見。" : "")); break;
      }
      case "grove": t.cargo.herb += 2; t.cargo.ore++; log(t, "採集路で薬草2個・露出した鉱石1個を採集。"); break;
      case "treasure": {
        const omen = s.town.landmark === "observatory" && luckyWeek(s.week);
        t.cargo.ore += omen ? 4 : 3;
        log(t,n.name + "の宝箱から鉱石3個を回収。" + (omen ? "吉兆の星図をたどり、さらに1個発見。" : ""));
        if (n.depth >= 3) findRelic(s,team,"tide",n.name+"の宝箱");
        break;
      }
      case "fight": startFight(s, team); break;
      case "exit": settle(s, team, "予定の経路を終えて帰還"); break;
    }
    if (n.next.length > 1) fork(s, team);
  }
  function choices(s, team = s) {
    const t = team.trip, c = t?.pending;
    if (!c) return [];
    if (c.type === "fork") return [...tripRooms(t)[t.node].next, "return", "delegate"];
    const injured = t.unit.find(u => u.id === c.target)?.injury;
    return [...(t.meds > 0 && !injured ? ["med"] : []), ...(t.unit.some(u => u.state === "ok") ? ["carry"] : []), "return", "delegate"];
  }
  function reply(s, choice, team = s) {
    check(team.phase === "explore" && choices(s, team).includes(choice), "この指示は選べません。");
    const leader = person(s, team.trip.leader);
    const reason = choice === "delegate" ? "独断：" + leader.name + "に任せた（" + traits[leader.trait] + "）" : "マスターの指示";
    const decision = choice === "delegate" ? leaderChoice(s, team, false) : choice;
    resolveCall(s, team, decision, reason, { answer:choice });
  }
  function expireCalls(s) {
    for (const team of parties(s)) {
      if (team.phase === "explore" && team.trip.pending?.expiresWeek <= s.week) {
        const t = team.trip, leader = person(s, t.leader);
        const reason = "返事がなかったので、" + leader.name + "が自分で判断（" + traits[leader.trait] + "・" + policies[t.policy] + "）";
        const choice = leaderChoice(s, team, true);
        resolveCall(s, team, choice, reason, { answer:choice, decision:reason });
      }
    }
  }
  function leaderChoice(s, team, expired) {
    const t = team.trip, leader = person(s, t.leader);
    if (t.pending.type === "fork") {
      if (t.dungeon === "moss" && t.policy === "gather") return leader.trait === "bold" ? "pass" : "grove";
      return preferredRoute(t, leader);
    }
    if (expired) {
      const useMedicine = leader.trait === "kind" || t.policy === "bold" || (leader.trait === "bold" && t.policy === "gather");
      if (choices(s,team).includes("med") && useMedicine) return "med";
      if (t.policy === "safe") return "return";
    }
    return leader.trait === "bold" && choices(s, team).includes("carry") ? "carry" : "return";
  }
  function resolveCall(s, team, choice, reason, outcome) {
    const t = team.trip, c = t.pending;
    const entry = t.log.findLast(e => e.letter && !e.letter.answer);
    if (entry) Object.assign(entry.letter, outcome, { answeredWeek:s.week });
    t.pending = null;
    if (choice === "return") return settle(s, team, reason + "で安全帰還");
    if (c.type === "fork") return chooseRoute(s, team, choice, reason);
    const u = t.unit.find(u => u.id === c.target), p = person(s, u.id);
    const helpers = t.unit.filter(ally => ally.state === "ok" && ally !== u);
    const rescuer = helpers.find(ally => ally.id === t.leader) || helpers[0];
    if (rescuer) {
      bondTime(s,rescuer.id,u.id,8);
      log(t,person(s,rescuer.id).name+"が"+p.name+"の救出に駆けつけた。");
    }
    if (choice === "med") {
      u.hp = Math.min(useMedicine(t), outfittedStat(s, p, "hp")); u.state = "ok"; log(t, reason + "で薬を使用。" + p.name + "はHP" + u.hp + "で復帰。");
      record(p, s.week, "回復薬で救出され、戦列に復帰。");
    } else {
      log(t, reason + "で" + p.name + "を担いで続行。" + (u.injury ? "帰還後は骨折の療養が必要。" : "次の戦闘で重傷になる。"));
      record(p, s.week, "仲間に救出され、担架で探索を続行。");
    }
    if (!t.paced && !s.clock.paused) battle(s, team);
  }
  function returnHome(s, team = s) {
    check(team.phase === "explore" && !team.trip.pending, "帰還指示を出せない状態です。");
    settle(s, team, "マスターの指示で早期帰還");
  }
  function leaveRoster(s,p,kind,message = kind === "lost" ? p.name + "は消失した。ギルドの信用が下がった。" :
      p.name + "は冒険者を引退し、町で暮らすことにした。") {
    p.departure = {kind,week:s.week,message};
    if (kind === "lost") p.departure.penalty = s.town.landmark === "memorial" ? 5 : lossPenalty;
    if (kind === "retired") p.retiredWeek = s.week;
    record(p,s.week,message);
    s.roster = s.roster.filter(member => member !== p);
    s.alumni.push(p);
    for (const team of parties(s)) {
      team.party = team.party.filter(id => id !== p.id);
      if (team.leader === p.id) team.leader = team.party[0] || null;
    }
    if (s.wielder === p.id) s.wielder = null;
    for (const item of s.equipment) if (item.wearer === p.id) item.wearer = null;
    for (const member of s.roster) member.gambits = member.gambits.filter(r => r.target !== p.id && r.subject !== p.id);
    return message;
  }
  function retire(s,id) {
    const p = trainingMember(s,id);
    leaveRoster(s,p,"retired");
  }
  function settle(s, team, reason) {
    check(team.phase === "explore", "精算済みです。");
    check(!team.trip.rescue,"行方不明者の救出を待ってください。");
    const t = team.trip, q = quests[t.quest], a = t.quote;
    const success = s.week <= t.deadline && t.cargo[q.item] >= q.count;
    const delivered = success ? q.count : 0, surplus = { ...t.cargo };
    surplus[q.item] -= delivered;
    for (const key of Object.keys(items)) {
      team.bag.materials[key] += surplus[key];
      s.stock[key] += surplus[key];
    }
    const reward = success ? a.reward : 0, share = success ? a.share : 0;
    const tributeRate = a.tributeRate ?? s.tributeRate;
    const tribute = Math.floor(reward * tributeRate / 100), partyReward = reward-tribute;
    const refund = Math.min(a.medicine, t.meds * 30);
    if (t.packed) {
      const putBack = (key,unit) => addSupply(unit.owner === "party" ? team.bag : s,key,unit.quality,1);
      for (const unit of t.packed.medicine) putBack("medicine",unit);
      if (t.spark) putBack("spark",t.packed.spark);
    } else {
      s.supplies.medicine += t.meds - refund / 30;
      if (t.spark) s.supplies.spark++;
    }
    const medicine = a.medicine - refund, net = reward - share - a.food - medicine - a.wages;
    // The party pays for food first. Refund unspent medicine to its original payer.
    const partyRefund = Math.max(0,(t.partyPaid || 0)-a.food-medicine);
    team.wallet += partyReward - share + partyRefund;
    s.gold += reward - share - a.wages + refund;
    const xp = 2 + 2 * t.wins + (success ? 4 : 0) + facilityTotals(s.town).experience;
    for (const u of t.unit) {
      const p = person(s, u.id);
      if (u.state === "lost") { log(t,leaveRoster(s,p,"lost")); continue; }
      const encouraged = t.unit.some(ally => ally !== u && ally.state === "ok" && affinity(s,ally.id,u.id) >= 40);
      const moraleBefore = p.morale;
      p.morale = boundedScore(moraleBefore + Number(encouraged) + (success ? 6 : -4) - (u.state === "ok" ? 0 : 4));
      u.moraleChange = p.morale - moraleBefore;
      p.missingHP = Math.max(0,outfittedStat(s,p,"hp") - u.hp);
      p.spentMP = maxMP(p) - u.mp;
      const hundredths = Math.round(xp*growthRate(p)*100) + p.xpRemainder;
      u.xp = Math.floor(hundredths/100);
      p.xpRemainder = hundredths%100;
      p.xp += u.xp;
      if (u.state !== "ok") record(p, s.week, "救護を受けてギルドに帰還。");
      record(p, s.week, "「" + q.name + "」" + (success ? "達成。" : "未達で帰還。"));
      while (p.xp >= 20 * p.level ** 2) {
        p.xp -= 20 * p.level ** 2; p.level++;
        record(p, s.week, "Lv." + p.level + "に成長。能力ポイント＋2。");
      }
      p.readyWeek = Math.max(p.readyWeek,s.week + (u.state === "severe" && !u.injury ? 2 : 1));
      if (p.awaitingLastReturn) {
        u.endOfLife = true;
        endLifespan(s,p);
        log(t,p.departure.message);
      }
    }
    const wounded = t.unit.filter(u => u.state !== "ok").length;
    const severe = t.unit.filter(u => u.state === "severe" || u.injury).length;
    const newPenalty = t.unit.filter(u => u.state === "lost").reduce((n,u) => n+knownPerson(s,u.id).departure.penalty,0);
    s.outcomes = [...s.outcomes, Number(success)].slice(-20);
    const before = [...s.metrics];
    const successRate = Math.round(100 * s.outcomes.reduce((a,b) => a+b, 0) / s.outcomes.length);
    const credit = successRate + (s.raids?.credit || 0) - s.alumni.reduce((n,p) => n + (p.departure.kind === "lost" ? p.departure.penalty ?? lossPenalty : 0),0);
    s.metrics = [before[0] + 2*t.wins + (success ? (t.quest === "order" ? 6 : 3) : 0),
      newPenalty ? Math.min(before[1]-newPenalty,credit) : credit, before[2] - 3*severe,
      before[3] + (success ? 2 : 0) - 2*wounded].map(n => Math.max(0, Math.min(100, n)));
    log(t, reason + "。" + (success ? items[q.item].name + delivered + "個を自動納品。" : "未達のため納品なし。"));
    s.history.unshift({ ...tripResult(t.dungeon, t.path), partyNumber: partyNumber(s, team), week: s.week, quest: t.quest, leader: t.leader, success, delivered, surplus, xp, reason, before,
      after: [...s.metrics], wins: t.wins, severe, wounded, unit: t.unit.map(u => ({ ...u })), log: [...t.log],
      actual: { reward, tributeRate, tribute, partyReward, share, wages: a.wages, food: a.food, medicine, net,
        partyCosts:(t.partyPaid || 0)-partyRefund }, quote: a,
      sold: 0, donated: 0, returnedGold: guildGold(s), returnedWallet:team.wallet });
    t.pending = null; t.fight = null; team.phase = "report";
    if (s.history[0].cleared) recordFeat(s,"clear",dungeons[t.dungeon].name+"を踏破");
    checkGuildPromotion(s);
  }
  function sell(s, key, owner = s.bag.materials[key] ? s : null) {
    check(owner?.phase !== "explore" && Object.hasOwn(items,key), "売れる余剰品がありません。");
    useMaterial(s,key,owner,1);
    const price = salePrice(s,key);
    s.gold += price;
    if (owner) owner.wallet += price;
    if (owner?.phase === "report") reportFor(s,owner).sold += price;
  }
  function donate(s, owner = s.bag.materials.ore ? s : null) {
    check(owner?.phase !== "explore" && !s.research, "研究用の余剰鉱石が必要です。");
    workshop(s,"hall");
    useMaterial(s,"ore",owner,1);
    s.research = s.week; train(s.town.workshops.hall, 1);
    if (owner?.phase === "report") reportFor(s,owner).donated++;
  }
  function buy(s, team = s, owner = null) {
    prep(team); check(s.research && !s.weapon, "研究完了と80Gが必要です。");
    check(!owner || (owner === team && owner.phase === "prep"),"購入する隊を確認してください。");
    const shop = workshop(s,"hall");
    spend(s,owner,80);
    s.weapon = true; s.weaponOwner = partyNumber(s,owner);
    s.weaponQuality = shop.level + shop.skills.length + craftBonus(shop) + craftSupport(s);
    train(shop,2);
    s.wielder = (!awayMember(s,team.leader) && team.leader) || (!owner && s.roster.find(p => available(s, p) && !awayMember(s,p.id))?.id) || null;
    if (s.wielder) clearOrderedWeapon(s, s.wielder);
  }
  const bladeMultiplier = (quality = 1) => (12+quality)/10;
  function clearOrderedWeapon(s, id) {
    for (const item of s.equipment) if (item.slot === "weapon" && item.wearer === id) item.wearer = null;
  }
  const awayMember = (s, id) => parties(s).some(team => team.phase === "explore" && team.party.includes(id));
  function equip(s, id, team = s) {
    prep(team);
    const owner = parties(s)[s.weaponOwner-1];
    check(s.weapon && (!id || person(s,id)) && !awayMember(s,id) && !awayMember(s,s.wielder) &&
      (!owner || (owner.phase !== "explore" && (!id || owner.party.includes(id)))), "装備先を確認してください。");
    if (id) clearOrderedWeapon(s,id);
    s.wielder = id || null;
  }
  function setPriority(team,priority) {
    check(Object.hasOwn(priorities,priority),"依頼の優先条件を選んでください。");
    team.priority = priority;
  }
  function morningNotice(s,team,message) {
    team.decisionWeek = s.week;
    s.morningMail.unshift({week:s.week,partyNumber:partyNumber(s,team),message});
  }
  function holdDeparture(s,team = s) {
    prep(team);
    check(team.decisionWeek !== s.week,"今週の判断は済んでいます。");
    morningNotice(s,team,"マスターの指示で今週の自動出発を見送りました。");
  }
  function takeLeave(s,team = s,reason = "マスターの指示で今週は休暇を取ります。") {
    prep(team);
    check(team.party.length && team.leaveWeek !== s.week,"休暇を取る隊を選んでください。");
    team.leaveWeek = s.week;
    for (const id of team.party) person(s,id).leaveWeek = s.week;
    morningNotice(s,team,reason);
  }
  function morningPlans(s) {
    if (s.clock.dispatchedWeek === s.week || s.town.repairs.hall) return [];
    const reserved = new Set(parties(s).filter(t => t.phase !== "prep").map(t => t.trip.quest));
    const plans = [];
    let gold = guildGold(s), total = s.gold, rations = s.supplies.ration, medicine = s.supplies.medicine;
    for (const team of parties(s)) {
      if (team.phase !== "prep" || team.decisionWeek === s.week || !team.party.length) continue;
      const members = team.party.map(id => person(s,id)), leader = person(s,team.leader);
      if (!leader) continue;
      const cautious = leader.trait !== "bold", priority = team.priority;
      const tired = members.some(p => !available(s,p) || currentHP(s,p) < outfittedStat(s,p,"hp") * (cautious ? .65 : .45) ||
        currentMP(p) < maxMP(p) * (cautious ? .35 : .2));
      if (tired) {
        plans.push({team,leave:true,message:leader.name + "より「今週は仲間の療養と休息を優先します。」"});
        continue;
      }
      const destinations = Object.keys(dungeons).filter(id => dungeonOpen(s,id) && partyQualifies(s,team.party,dungeonRank(id)));
      const dungeon = priority === "depth" ? destinations.at(-1) : destinations.includes(team.dungeon) ? team.dungeon : "moss";
      const ore = materialAvailable(s,"ore"), herb = materialAvailable(s,"herb");
      const shortItem = ore < herb ? "ore" : herb < ore ? "herb" : null;
      const score = id => {
        const q = quests[id], risky = q.risk !== "低";
        let weight = 0;
        if (priority === "reward") weight = q.reward;
        if (priority === "safe") weight = risky ? 0 : 1;
        if (priority === "depth") weight = Number(risky);
        if (q.item === priority || (priority === "shortage" && q.item === shortItem)) weight = 1;
        const suitsLeader = cautious ? !risky : risky;
        return weight * 1000 + (suitsLeader ? 10 : 0) + q.reward / 100;
      };
      const quest = postedQuests(s).filter(id => !reserved.has(id) && partyQualifies(s,team.party,quests[id].rank)).sort((a,b) => score(b)-score(a))[0];
      const foodNeeded = Math.max(0,members.length-team.bag.supplies.ration);
      const medsNeeded = Math.max(0,team.meds-team.bag.supplies.medicine);
      const cost = 10*Math.max(0,foodNeeded-rations) + 30*Math.max(0,medsNeeded-medicine);
      if (!quest || cost > Math.min(total,team.wallet+Math.max(0,gold))) {
        plans.push({team,message:leader.name + "より「" + (!quest ? "空いている依頼がありません。" : "補給資金が足りません。") + "町で待機します。」"});
        continue;
      }
      reserved.add(quest);
      gold -= Math.max(0,cost-team.wallet);
      total -= cost;
      rations = Math.max(0,rations-foodNeeded);
      medicine = Math.max(0,medicine-medsNeeded);
      plans.push({team,quest,dungeon,message:leader.name + "より「今週は" + dungeons[dungeon].name + "へ。『" + quests[quest].name + "』を引き受けます。」"});
    }
    return plans;
  }
  function dispatchMorning(s) {
    let changed = false;
    for (const plan of morningPlans(s)) {
      const {team,message} = plan;
      if (plan.leave) takeLeave(s,team,message);
      else {
        if (plan.quest) {
          setQuest(s,plan.quest,team);
          depart(s,team,{...team,dungeon:plan.dungeon},true);
          team.trip.morningPriority = team.priority;
          log(team.trip,message);
        }
        morningNotice(s,team,message);
      }
      changed = true;
    }
    s.clock.dispatchedWeek = s.week;
    return changed;
  }
  // Each stop is on a painted road. The optional site borders that stretch of road.
  const raidRoads = {
    west: [[151,425],[207,418,"west"],[270,397,"clover"],[309,389,"dawn"],[391,369,"square"],[440,365,"linden"],[457,406],[508,433],[551,427],[553,387,"hall"]],
    east: [[1260,405],[1220,363,"east"],[1158,331],[1071,301],[987,272],[881,265],[805,276,"wind"],[699,302,"brook"],[659,318],[644,358],[612,385],[553,387,"hall"]],
    riverside: [[1024,614],[961,580,"sunny"],[950,560],[891,532,"mill"],[808,515],[782,512],[720,501],[647,478],[620,465],[579,447],[551,427],[553,387,"hall"]],
    north: [[245,136],[306,165],[354,180,"orchard"],[404,198],[365,220,"birch"],[314,245],[284,281],[259,318,"dawn"],[254,359],[270,397,"west"],[353,379],[440,365,"linden"],[457,406],[508,433],[553,387,"hall"]],
    south: [[632,674],[646,607],[646,573,"south"],[645,549],[646,516],[647,478],[620,465],[579,447],[551,427],[553,387,"hall"]]
  };
  // Each stop costs one raid beat. The outer roads join the old town lanes.
  const approaches = {
    west: [[-355,294],[-305,308],[-255,331],[-205,344,"westPass"],[-159,343],[-134,367],[-121,398],[-89,417],[-44,421,"westBend"],[20,410],[83,412]],
    east: [[1715,247],[1671,256],[1635,281],[1598,302],[1542,311,"eastRidge"],[1493,315],[1467,337],[1460,365],[1425,378,"eastTurn"],[1364,377],[1311,388]],
    north: [[952,-132],[971,-107],[965,-84],[933,-64,"upperBridge"],[875,-62],[820,-62],[760,-62],[703,-58],[642,-39],[576,-30],[514,-31],[452,-29,"northSaddle"],[401,-12],[380,16],[346,42],[294,58],[257,79],[235,106]],
    riverside: [[1260,844],[1278,815],[1267,787],[1229,774,"reedBank"],[1171,786],[1115,782],[1074,759],[1051,731],[1013,719,"riverTurn"],[960,718],[929,697],[937,668],[980,644]],
    south: [[461,918],[432,895],[438,873],[455,850,"southRise"],[449,824],[471,804],[526,796],[583,794],[635,784,"southFork"],[684,776],[710,751],[707,723],[681,700]]
  };
  const plaza = [635,470,"hall"];
  const westPlaza = [[554,436],[596,452],plaza];
  const territoryRoads = {
    west:[...approaches.west,...raidRoads.west.slice(0,8),...westPlaza],
    east:[...approaches.east,...raidRoads.east.slice(0,10),[646,398],[646,433],plaza],
    north:[...approaches.north,...raidRoads.north.slice(0,3),[378,182],[394,189],...raidRoads.north.slice(3,14),...westPlaza],
    riverside:[...approaches.riverside,...raidRoads.riverside.slice(0,7),[680,488],plaza],
    south:[...approaches.south,...raidRoads.south.slice(0,5),plaza]
  };
  const raidRoute = raid => (raid.outer ? territoryRoads : raidRoads)[raid.road];
  const roadNames = {west:"西街道", east:"東街道", north:"北の丘道", riverside:"川沿いの道", south:"南門"};
  const raidBeat = 2500;
  function restoreRaids(s) {
    s.raids ??= {nextWeek:Math.max(4,s.week+1), peak:0, warning:null, active:null, reports:[]};
    s.town.repairs ??= {};
  }
  function forecastIfDue(s) {
    const observed = s.town.landmark === "observatory";
    if (s.raids.active || s.raids.warning || s.week + Number(observed) < s.raids.nextWeek) return;
    raidForecast(s,observed);
  }
  function raidForecast(s,observed) {
    const craft = Object.values(s.town.workshops).reduce((n,shop) => n + shop.level-1,0);
    const growth = s.metrics[0] + s.ranks.renown + Object.keys(s.town.plots).length*2 + craft +
      s.roster.reduce((n,p) => n + p.level,0);
    const tier = s.raids.peak = Math.max(s.raids.peak,Math.floor(growth/8));
    const surprise = s.raids.reports.length > 0 && Math.random() < .08;
    const roads = Object.keys(raidRoads);
    const plan = {outer:!!s.town.outerTerritory, road:roads[Math.floor(Math.random()*roads.length)], tier, surprise,
      count:surprise ? 2+Math.floor(tier/2) : 3+tier, boss:s.raids.reports.length>0 && Math.random()<.12,
      due:surprise ? 0 : Math.round(weekMillis*3/7)};
    if (observed) {
      plan.dueWeek = Math.max(s.week,s.raids.nextWeek);
      plan.observed = true;
    }
    if (surprise && !observed) beginRaid(s,plan);
    else s.raids.warning = plan;
  }
  function beginRaid(s,plan) {
    const enemies = Array.from({length:plan.count}, (_,i) => {
      const boss = plan.boss && i === plan.count-1;
      const hp = (boss ? 24 : 10) + plan.tier*2;
      return {hp,maxHP:hp,boss,step:-i};
    });
    s.raids.warning = null;
    s.raids.active = {...plan,knights:s.town.landmark === "castle",enemies,elapsed:0,hits:[],damaged:[],injured:[],gold:0,food:0,discontent:0};
  }
  function raidDefenders(s) {
    const home = s.roster.filter(p => !awayMember(s,p.id));
    return home.concat(visitorList(s).filter(p => !p.mission)).filter(p => !p.injury && currentHP(s,p)>0);
  }
  function raidPost(road,index) {
    return Math.max(1, road.length-3-index%4);
  }
  function repairQuote(s,id) {
    check(Object.hasOwn(s.town.repairs,id),"修理する建物を選んでください。");
    const hands = Object.entries(s.town.workshops).reduce((total,[site,shop]) =>
      total + (site==="hall" && s.town.smithReadyWeek>s.week ? 0 : shop.level-1),0);
    const severity = id === "hall" ? 2 : 1;
    return {local:hands>0,cost:Math.ceil(36*severity/(1+hands*.6)),
      weeks:Math.max(1,3+severity-hands), chance:Math.min(1,.65+.12*hands)};
  }
  function startRepair(s,id) {
    check(Object.hasOwn(s.town.repairs,id) && !s.town.repairs[id].remaining,"修理待ちの建物を選んでください。");
    const quote = repairQuote(s,id);
    check(guildGold(s)>=quote.cost,"修理資金が足りません。");
    s.gold -= quote.cost;
    Object.assign(s.town.repairs[id],{remaining:quote.weeks,chance:quote.chance,delayed:false});
  }
  function progressRepairs(s) {
    for (const [id,job] of Object.entries(s.town.repairs)) {
      if (!job.remaining || --job.remaining>0) continue;
      if (!job.delayed && Math.random()>=job.chance) {
        job.remaining = 1;
        job.delayed = true;
      } else delete s.town.repairs[id];
    }
  }
  function raidDamage(s,r,id) {
    if (!id || (id!=="hall" && !s.town.plots[id]) || r.damaged.includes(id)) return;
    r.damaged.push(id);
    const job = s.town.repairs[id] ??= {remaining:0};
    if (job.remaining) job.remaining++;
    const severity = id==="hall" ? 3 : 1;
    const gold = Math.min(Math.max(0,guildGold(s)),severity*(8+r.tier));
    const food = Math.min(s.town.food,severity*(2+r.tier));
    const discontent = Math.min(s.metrics[3],severity*2);
    s.gold -= gold; s.town.food -= food; s.metrics[3] -= discontent;
    r.gold += gold; r.food += food; r.discontent += discontent;
    if (id==="hall" || Math.random()<.25) {
      const victim = s.roster.find(p => !awayMember(s,p.id) && !p.injury && currentHP(s,p)>0);
      if (victim) {
        victim.missingHP += Math.min(currentHP(s,victim),severity*3);
        victim.readyWeek = Math.max(victim.readyWeek,s.week+2);
        victim.injury = {kind:"襲撃による負傷",readyWeek:victim.readyWeek};
        record(victim,s.week,"町の防衛で負傷。第"+victim.readyWeek+"週まで療養。");
        r.injured.push(victim.name);
      } else if (!r.injured.includes(artisanName(s.town.workshops.hall))) {
        s.town.smithReadyWeek = s.week+2;
        r.injured.push(artisanName(s.town.workshops.hall));
      }
    }
  }
  function finishRaid(s,r) {
    const fallen = r.enemies.filter(e => e.hp===0);
    const ore = fallen.length, herb = fallen.filter(e => e.boss).length;
    s.stock.ore += ore; s.stock.herb += herb;
    const repelled = fallen.length === r.count;
    const credit = repelled ? Math.min(100-s.metrics[1],2+r.tier) : 0;
    s.metrics[1] += credit;
    s.raids.credit = (s.raids.credit || 0) + credit;
    if (herb) s.milestones.unshift({week:s.week,message:roadNames[r.road]+"で襲撃のヌシを討伐。町の防衛の偉業として記す。"});
    const {road,surprise,count,damaged,injured,gold,food,discontent} = r;
    s.raids.reports.unshift({week:s.week,road,surprise,count,damaged,injured,gold,food,discontent,ore,herb,credit,repelled,knights:!!r.knights});
    recordRaidFeats(s,s.raids.reports[0]);
    checkGuildPromotion(s);
    s.raids.active = null;
    s.raids.nextWeek = s.week + 3 + Math.floor(Math.random()*3);
  }
  function raidRound(s,r) {
    const road = raidRoute(r), last = road.length-1;
    r.hits = [];
    const attack = (source,power,at,radius) => {
      const target = r.enemies.find(e => e.hp>0 && e.step>=0 && e.step<last && Math.abs(at-e.step)<=radius);
      if (!target) return;
      target.hp = Math.max(0,target.hp-power);
      r.hits.push({source,target:r.enemies.indexOf(target)});
    };
    for (const [id,kind] of Object.entries(s.town.plots)) {
      const power = buildings[kind].defense;
      if (!power || s.town.repairs[id]) continue;
      const post = road.findIndex(stop => stop[2]===id);
      // Only the town-center defenses can cover the plaza from another street.
      if (post<0 && outerPlots.some(p=>p.id===id)) continue;
      attack(id,power,post<0 ? last-2 : post,kind==="wall" ? 1 : 3);
    }
    if (r.knights) attack("knights",16+r.tier,Math.floor(last/2),Math.ceil(last/2));
    if (s.town.ward) attack("hall",s.town.ward,last-1,3);
    raidDefenders(s).forEach((p,i) =>
      attack(p.id,Math.max(1,Math.ceil(outfittedStat(s,p,"atk")/2)),raidPost(road,i),2));
    for (const enemy of r.enemies) {
      if (enemy.hp<=0 || enemy.step===last) continue;
      enemy.step++;
      if (enemy.step>=0) raidDamage(s,r,road[enemy.step][2]);
    }
    if (r.enemies.every(e => !e.hp || e.step===last)) finishRaid(s,r);
  }
  function advanceRaid(s,from,to) {
    let changed = false;
    const warning = s.raids.warning;
    if (warning && s.week >= (warning.dueWeek ?? s.week) && to>=warning.due) {
      beginRaid(s,warning);
      from = Math.max(from,warning.due);
      changed = true;
    }
    const raid = s.raids.active;
    if (raid) {
      raid.elapsed += to-from;
      while (raid.elapsed>=raidBeat && s.raids.active) {
        raid.elapsed -= raidBeat;
        raidRound(s,raid);
        changed = true;
      }
    }
    return changed;
  }
  function raidRecall(s,team) {
    check(s.raids.active && parties(s).includes(team) && team.phase==="explore","襲撃中に遠征隊を呼び戻せます。");
    settle(s,team,"町の防衛のため緊急帰還");
  }
  function nextWeek(s, work = false) {
    check(!anyAway(s) || (!work && parties(s).some(team => team.trip?.pending)), "全隊の帰還を待ってください。");
    if (work) { check(!weekStarted(s), "今週はすでに遠征しました。"); s.gold += 30; }
    else check(weekStarted(s) || parties(s).some(t => t.leaveWeek === s.week), "帰還後または休暇中に週の締めができます。");
    advanceRaid(s,s.clock.elapsed,weekMillis);
    s.clock.elapsed = 0;
    startWeek(s);
  }
  // Elapsed time uses standard-speed milliseconds at every playback speed.
  const weekMillis = 240000;
  const weekSpeeds = [0.5, 1, 2];
  function advanceTime(s,millis) {
    if (s.clock.paused || !Number.isFinite(millis) || millis <= 0) return false;
    millis *= s.clock.speed;
    let changed = false;
    while (millis > 0) {
      const from = s.clock.elapsed;
      const boundary = [departureDelay,weekMillis/2,weekMillis].find(time => time>from);
      const step = Math.min(millis,boundary-from);
      s.clock.elapsed += step;
      millis -= step;
      changed = advanceRaid(s,from,s.clock.elapsed) || changed;
      if (s.clock.elapsed >= departureDelay && s.clock.dispatchedWeek !== s.week && !emergencyParty(s))
        changed = dispatchMorning(s) || changed;
      if (s.clock.elapsed >= weekMillis / 2 && startGuestMissions(s)) changed = true;
      if (s.clock.elapsed === weekMillis) { s.clock.elapsed = 0; startWeek(s); changed = true; }
    }
    return changed;
  }
  function startWeek(s) {
    const yields = facilityTotals(s.town);
    s.town.food += yields.food;
    s.stock.ore += yields.ore;
    s.gold += yields.income;
    s.metrics[0] = Math.min(100, s.metrics[0] + yields.strength);
    const residents = s.roster.filter(p => !awayMember(s,p.id));
    if (yields.morale) {
      const patrons = [...residents,...s.alumni.filter(p => p.departure.kind === "retired")];
      eachPair(patrons.map(p => p.id),(a,b) => bondTime(s,a,b,2));
    }
    for (const team of parties(s).filter(t => t.leaveWeek === s.week))
      eachPair(team.party,(a,b) => bondTime(s,a,b,7));
    const familyLeave = new Set();
    for (const {partners:[a,b]} of s.marriages) {
      if (!homeAdult(s,a) || !homeAdult(s,b)) continue;
      if (![a,b].some(id => knownPerson(s,id).leaveWeek === s.week)) continue;
      familyLeave.add(a);
      familyLeave.add(b);
    }
    const retiredOnLeave = s.alumni.filter(p => p.departure.kind === "retired" && familyLeave.has(p.id));
    if (s.town.landmark === "memorial")
      for (const p of s.roster) p.morale = boundedScore(p.morale+6);
    for (const p of [...residents,...retiredOnLeave]) {
      if (s.town.landmark === "baths" && p.injury && p.readyWeek > s.week+1) {
        p.readyWeek--;
        p.injury.readyWeek = p.readyWeek;
      }
      p.morale = boundedScore(p.morale + (p.departure ? 0 : yields.morale) + (familyLeave.has(p.id) ? 2 : 0));
      const rate = ((p.leaveWeek === s.week || familyLeave.has(p.id) ? 55 : 20) + yields.recovery) / 100;
      p.missingHP = Math.max(0,p.missingHP - Math.ceil(outfittedStat(s,p,"hp") * rate));
      p.spentMP = Math.max(0,p.spentMP - Math.ceil(maxMP(p) * rate));
      if (p.injury && p.readyWeek <= s.week+1) {
        record(p,s.week+1,p.injury.kind + "が治り、出撃できるようになった。");
        p.injury = null;
      }
    }
    if (residents.length) {
      const mood = residents.reduce((sum,p) => sum + moraleBand(p),0);
      s.metrics[3] = boundedScore(s.metrics[3] + Math.sign(mood) + yields.satisfaction);
    }
    settleGuestMissions(s);
    s.week++;
    advanceAges(s);
    growFamilies(s);
    s.unlocked = s.history.length > 0;
    checkGuildPromotion(s);
    progressRepairs(s);
    forecastIfDue(s);
    welcomeVisitors(s);
    for (const team of parties(s)) {
      if (team.phase === "explore") continue;
      team.phase = "prep"; team.trip = null;
      team.party = team.party.filter(id => person(s,id));
      if (!team.party.includes(team.leader)) team.leader = team.party[0] || null;
    }
    if (!s.party.length && parties(s).length === 1) {
      s.party = s.roster.filter(p => available(s, p)).slice(0, 3).map(p => p.id);
      s.leader = s.party[0] || null;
    }
    expireCalls(s);
  }
  return { landmarks, landmarkPrice, buildLandmark, deathThreshold, debuffs, prosthesisBonus, treatDebuff, cureCost, limbCost, craftSupport, salePrice, canDetectTrap, luckyWeek, surveyDungeon, affinity, giftCost, canGift, giveGift, canMarry, marry, spouseOf, childStage, learnableSkills, yearLengths, setYearLength, calendarDate, species, entryTraining, weeksPerYear, ageYears, growthRate, abilityPower, spellDefense, inheritSpecies, welcomeChild, enlistChild, craftBonus, artisanName, guildStanding, seniorRank, guildGold, balance, bladeMultiplier, materialAvailable, expeditionFunds, supplyPower, outerPlots, territoryPlots, raidRoads, approaches, territoryRoads, raidRoute, roadNames, raidBeat, raidDefenders, raidPost, raidRecall, repairQuote, startRepair, rankName, rankLabel, partyQualifies, dungeonRank, examFocuses, examLines, examStatus, takeExam, fame, uniqueGuests, visitorList, scoutStatus, scout, offers, collectMarket,
    priorities, departureDelay, deathLimit, lossPenalty, knownPerson, currentHP, currentMP, maxMP, setPriority, morningPlans, holdDeparture, takeLeave, retire,
    gambitLimit, conditions, actions, actionList, targets, subjects, foes, setGambits, preset, conditionLabel, advanceTime, weekMillis, weekSpeeds, startingJobs, abilities, skillLimit, promotionLevel, resetCost, statGains, freePoints, spentPoints, allocate, resetAllocation, learnAbility, promote, deepest,
    dungeons, dungeonOpen, tripRooms, nextRoom, shopTypes, shopRanks, effectNames, materialStock, skillStatus, learnSkill, resetSkills, recipeRequirement, deliverMaterial,
    orderQuote, placeOrder, wearOrder, outfittedStat, emergencyParty, maxParties, parties, partyNumber, anyAway, weekStarted, unlockCost, unlockParty, restore, reportFor, postedQuests, claimed, awayMember, plots, buildings, townPrice, build, townTotals, facilityTotals, facilityEffects, facilityEffectText, moraleMultiplier, jobs, traits, policies, items, quests, nodes, enemy, tones, initial, person, stat, recruit, hireCost,
    payroll, available, damage, speak, chatterLine, chatterRates, formalName, familiarName, nameLimits, setCharacterNames, setQuest, configure, hire, register, estimate, depart, step, choices, reply,
    returnHome, sell, donate, buy, equip, nextWeek, emblemShapes, emblemSymbols, emblemFrames, validEmblemImage, setProfile,
    nextDay:nextWeek, dayStarted:weekStarted, dayMillis:weekMillis };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Guild;
