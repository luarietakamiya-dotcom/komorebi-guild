const GuildScenery = (() => {
  "use strict";
  const mix = (a, b, t) => a + (b - a) * t;
  const limit = n => Math.min(1, Math.max(0, n));

  // The map's across/depth axes are equally scaled before projection.
  const heading = (across, depth) => Math.atan2(across, depth);

  function actor(id, sprite, url, across, depth, size, angle, pose, view, camera) {
    let [x,y] = GuildVoxel.projectGround(across, depth, 0, view);
    if (camera) {
      depth = camera.depth(x,y);
      [x,y] = camera.project(x,y);
      angle += camera.angle;
      size *= camera.scale;
    }
    return { id, x, headY:y - 34*size*(pose.squat || 1) - (pose.bob || 0),
      depth, paint: ctx => GuildStacks.draw(ctx,sprite,url,x,y,size,angle,pose) };
  }

  function town(people, url, time, reduced, routes, camera) {
    return people.map(({ id, sprite, scale = 1 }, i) => {
      const {points, distances, seconds} = routes[id] || routes[sprite] || routes.custom;
      const cycle = (time / seconds + i * .32) % 2;
      const leg = cycle % 1;
      const travel = limit(leg / .78);
      const progress = cycle >= 1 ? 1 - travel : travel;
      const position = progress * distances[distances.length-1];
      const end = distances.findIndex((distance,i) => i > 0 && distance >= position);
      const from = points[end-1], to = points[end];
      const along = (position-distances[end-1]) / (distances[end]-distances[end-1]);
      const stride = !reduced && leg < .78 ? Math.sin(time * 7 + i) : 0;
      const direction = cycle >= 1 ? -1 : 1;
      const towards = heading(direction * (to[0] - from[0]), direction * (to[1] - from[1]));
      const rest = limit((leg - .78) / .22);
      const angle = towards - Math.sign(Math.sin(towards)) * Math.PI * rest * rest * (3 - 2 * rest);
      const depth = mix(from[1], to[1], along);
      const view = GuildVoxel.views.town;
      const size = scale * (camera ? .84 : .22 + GuildVoxel.projectGround(0,depth,0,view)[1]/1500);
      return actor(id, sprite, url, mix(from[0], to[0], along), depth, size, angle,
        { bob: Math.abs(stride)*size, tilt: stride*.048 }, view,camera);
    });
  }

  function townBattle(url,r,defenders,fraction,reduced,camera) {
    const road = Guild.raidRoute(r), view = GuildVoxel.views.town;
    const actors = [], posts = new Map(), targets = new Map();
    const project = (x,y) => camera ? camera.project(x,y) : [x,y];
    const fighter = (sprite,x,y,size,angle,pose) => {
      const [u,v] = GuildVoxel.unprojectGround(x,y,view);
      actors.push(actor(undefined,sprite,url,u,v,size,angle,pose,view,camera));
    };
    for (const [i,p] of defenders.entries()) {
      const [px,py] = road[Guild.raidPost(road,i)];
      const x = px+12+(Math.floor(i/4)%3)*10, y = py+8;
      posts.set(p.id,[x,y]);
      const swing = !reduced && r.hits.some(hit => hit.source===p.id) ? Math.sin(Math.PI*fraction) : 0;
      fighter(Guild.jobs[p.job].face,x-swing*6,y,.62,-1.4,{tilt:-swing*.12});
    }
    if (r.knights) {
      const [x,y] = road[Math.floor((road.length-1)/2)];
      posts.set("knights",[x,y]);
      for (const dx of [-9,9]) fighter("gald",x+dx,y+5,.76,-1.4,{tilt:0});
    }
    for (const [i,e] of r.enemies.entries()) {
      if (e.step<0 || e.step===road.length-1) continue;
      if (!camera && r.outer && e.step<Guild.approaches[r.road].length) continue;
      if (!e.hp && (fraction>.6 || !r.hits.some(hit => hit.target===i))) continue;
      const [ax,ay] = road[e.step], [bx,by] = road[e.step+1];
      const travel = e.hp ? fraction : 0;
      const x = mix(ax,bx,travel), y = mix(ay,by,travel)+i%3*4;
      const [sx,sy] = project(x,y);
      targets.set(i,[sx,sy]);
      const size = e.boss ? .96 : .56;
      const bob = reduced ? 0 : Math.abs(Math.sin(Math.PI*fraction*4))*2;
      fighter("boar",x,y,size,heading((bx-ax)/16,(by-ay)/8),{bob,tilt:e.hp ? 0 : -.8});
      actors.push({depth:Infinity,paint(ctx) {
        ctx.fillStyle = "#392c2a"; ctx.fillRect(sx-13,sy+4,26,4);
        ctx.fillStyle = "#da7957"; ctx.fillRect(sx-12,sy+5,24*e.hp/e.maxHP,2);
        if (e.boss) battleText(ctx,"ヌシ",sx,sy-40,"#ffe0a1");
      }});
    }
    for (const hit of r.hits) {
      let source = posts.get(hit.source);
      if (!source) {
        const plot = Guild.territoryPlots.find(p => p.id===hit.source);
        if (plot?.road && !camera) continue;
        if (plot) source = GuildVoxel.projectGround(...GuildVoxelMaps.plotCenter(plot),0,view);
        else if (hit.source==="hall") source = GuildVoxelMaps.hallSite;
      }
      const target = targets.get(hit.target);
      if (!source || !target || fraction>.6) continue;
      const [x,y] = target, [sx,sy] = project(...source);
      actors.push({depth:Infinity,paint(ctx) {
        ctx.save(); ctx.strokeStyle = "#ffe8af"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sx,sy-20);
        ctx.lineTo(x,y-10); ctx.stroke(); ctx.restore();
      }});
    }
    return actors;
  }

  function battleScene(t,people,url,start,depth,fraction,reduced) {
    const f = t.fight, effects = t.effects || [];
    const impact = effects.at(-1), wave = reduced ? 0 : Math.sin(Math.PI*fraction);
    const positions = new Map(), actors = [];
    for (const [i,p] of people.entries()) {
      const u = start-i*2.4, unit = t.unit.find(a => a.id === p.id);
      positions.set(p.id,{sprite:p.sprite,u,v:depth(u)+i*.35,hp:unit.hp,max:p.maxHP,carried:unit.state !== "ok"});
    }
    // Keep the defeated target on screen during the final blow.
    const enemies = f?.enemies || [{id:impact?.target,kind:impact?.targetKind || (impact?.target === "caster" ? "crystal" : "boar"),hp:0}];
    for (const [i,e] of enemies.entries()) {
      if (!e.hp && e.id !== impact?.target) continue;
      const slot = f ? i : Number(e.id === "caster");
      const u = start+3.1+slot*2.5;
      positions.set(e.id,{sprite:Guild.foes[e.kind].sprite || "boar",u,v:depth(start)+.7+slot*.55,hp:e.hp,max:Guild.foes[e.kind].hp,
        enemy:true,crystal:e.kind === "crystal",casting:e.casting});
    }
    const target = positions.get(impact?.target);
    const ward = positions.get(impact?.protectedId);
    if (target && ward) {
      target.u = mix(target.u,ward.u+1.2,wave);
      target.v = mix(target.v,ward.v+.4,wave);
    }
    for (const [id,p] of positions) {
      const attacking = id === impact?.actor && ["attack","skill"].includes(impact.kind);
      const struck = p === target && ["attack","skill"].includes(impact.kind);
      const u = p.u + (attacking && target ? (target.u-p.u)*wave*.70 : 0) + (struck ? wave*(p.enemy ? .3 : -.3) : 0);
      const v = attacking && target ? mix(p.v,target.v,wave*.7) : p.v;
      const [x,y] = GuildVoxel.projectGround(u,v);
      const pose = {bob:attacking ? wave*4 : 0,tilt:p.carried ? -.87 : struck ? wave*.16 : 0};
      actors.push({id,x,headY:y-42-pose.bob,depth:v,paint(ctx) {
        ctx.save();
        if (p.crystal) ctx.filter = "hue-rotate(100deg)";
        GuildStacks.draw(ctx,p.sprite,url,x,y,1.2,p.enemy ? -Math.PI/2 : Math.PI/2,pose);
        ctx.restore();
        ctx.fillStyle = "#3b342f";
        ctx.fillRect(x-14,y+4,28,4);
        ctx.fillStyle = p.enemy ? "#bf5d49" : "#528660";
        ctx.fillRect(x-13,y+5,26*limit(p.hp/p.max),2);
        if (p.casting) battleText(ctx,"詠唱",x,y-45,"#d6c3ff");
      }});
    }
    for (const effect of effects) {
      const pos = positions.get(effect.target), source = positions.get(effect.actor);
      if (!pos || !source) continue;
      const [x,y] = GuildVoxel.projectGround(pos.u,pos.v);
      const [sx,sy] = GuildVoxel.projectGround(source.u,source.v);
      actors.push({depth:Infinity,paint(ctx) {
        const support = ["heal","support","cover"].includes(effect.kind);
        const color = support ? "#b9ffca" : effect.kind === "attack" ? "#ffe1a8" : "#dfc6ff";
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (support || effect.kind === "cast") ctx.arc(x,y-17,10+wave*9,0,2*Math.PI);
        else if (effect.kind === "skill") {
          ctx.moveTo(sx,sy-20); ctx.quadraticCurveTo((sx+x)/2,Math.min(sy,y)-45,x,y-22);
        } else {
          ctx.moveTo(x-9,y-15-wave*4); ctx.lineTo(x+11,y-35-wave*4);
        }
        ctx.stroke();
        const label = effect.kind === "heal" ? "+"+effect.amount : effect.kind === "cast" ? "詠唱" :
          effect.kind === "cover" ? "かばう" : effect.kind === "support" ? "支援" : "−"+effect.amount;
        battleText(ctx,label,x,y-45-wave*12,color);
        if (effect.protectedId) battleText(ctx,"かばった",x,y-65-wave*12,"#b9ffca");
        ctx.restore();
      }});
    }
    return {actors,cameraX:GuildVoxel.projectGround(start,depth(start))[0]};
  }
  function battleText(ctx,text,x,y,color) {
    ctx.save();
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.strokeStyle = "#39352e";
    ctx.lineWidth = 3;
    ctx.strokeText(text,x,y);
    ctx.fillStyle = color;
    ctx.fillText(text,x,y);
    ctx.restore();
  }

  function dungeon(t, people, url, fraction, reduced) {
    const { places, trailDepth } = GuildVoxelMaps;
    const rooms = Guild.tripRooms(t), here = rooms[t.node], next = Guild.nextRoom(t);
    const forest = !t.dungeon || t.dungeon === "moss";
    const there = rooms[next] || here;
    const acrossAt = n => places.gate[0] + (places.home[0] - places.gate[0]) * (n.x - 9) / 83;
    const start = forest ? places[t.node][0] : acrossAt(here);
    const end = forest ? (places[next] || places[t.node])[0] : here.sheet === there.sheet ? acrossAt(there) : places.home[0];
    const dwell = t.node === "gate" ? 0 : .34;
    const progress = limit((fraction - dwell) / (1 - dwell));
    const across = mix(start, end, progress);
    const branch = t.route === "vein" ? "pass" : t.route;
    const depth = forest ? u => trailDepth(u,branch) : u => mix(
      trailDepth(u,here.y > 50 ? "pass" : "grove"), trailDepth(u,there.y > 50 ? "pass" : "grove"), progress);
    if (t.fight || (t.effects?.length && fraction < dwell)) {
      return battleScene(t,people,url,start,depth,t.fight ? fraction : fraction / dwell,reduced);
    }
    const gathering = ["herb","grove","treasure"].includes(here.event);
    const atRoom = fraction < dwell;
    const swing = reduced || !atRoom ? 0 : Math.sin(Math.PI * fraction / dwell);
    const actors = [];
    for (const [i,unit] of people.entries()) {
      const carried = (t.unit?.find(u => u.id === unit.id) || unit).state !== "ok";
      const beat = !reduced && !carried && progress > 0 ? Math.sin(progress * 5 * Math.PI + i) : 0;
      const dip = gathering && atRoom && !carried ? swing : 0;
      const u = across-i*2.1;
      actors.push(actor(unit.id,unit.sprite,url,u,depth(u),1.2,heading(.1,depth(u+.05)-depth(u-.05)),
        { bob: Math.abs(beat)*2, squat: 1-dip*.19,
          tilt: carried ? -.87 : beat*.045+dip*.16 }));
    }
    return { actors, cameraX: GuildVoxel.projectGround(across, depth(across))[0] };
  }

  const tripConversations = new WeakMap();
  function expeditionCue(t, people, progress) {
    const room = Guild.tripRooms(t)[t.node];
    if (t.fight) {
      if (t.fight.turn === 0) return {scene:"fight"};
      const hit = t.effects?.find(e => ["attack","skill"].includes(e.kind) && t.unit.some(u=>u.id===e.target));
      const unit = hit && t.unit.find(u => u.id === hit.target);
      if (unit?.state === "ok" && unit.hp <= people.find(p=>p.id===unit.id).maxHP * .35)
        return {scene:"hurt",id:unit.id};
      return;
    }
    if (t.node === "gate") return {scene:"start",id:t.leader};
    if (Guild.nextRoom(t) === "home" && progress >= .4) return {scene:"home"};
    const scene = {fight:"victory",treasure:"treasure",herb:"gather",grove:"gather"}[room.event];
    if (scene || room.next.length > 1) return {scene:scene || "fork"};
  }

  const pickOne = values => values[Math.floor(Math.random()*values.length)];
  function townCue(actors, people, previous) {
    const candidates = actors.filter(a => a.id !== previous);
    const speaker = pickOne(candidates.length ? candidates : actors);
    if (!speaker) return;
    if (speaker.id === "toto") return {id:speaker.id,scene:"shop"};
    const neighbor = actors.find(a => a !== speaker && Math.hypot(a.x-speaker.x,a.headY-speaker.headY) < 60);
    if (neighbor) {
      const friend = people.find(p=>p.id===neighbor.id);
      const person = people.find(p=>p.id===speaker.id);
      const adventurers = [friend,person].every(p => p.voice.job && !p.voice.departure && !p.growing);
      return {id:speaker.id,scene:adventurers ? pickOne(["greet","chat"]) : "greet",friend:friend.name};
    }
    return {id:speaker.id,scene:"town"};
  }

  function sceneConversation(canvas, viewport, people, trip, rateFor) {
    const bubble = viewport.querySelector(".scene-bubble");
    const kind = canvas.dataset.scene, width = GuildVoxel.views[kind].width;
    // A full UI render remounts the dungeon canvas even within the same step.
    const timing = tripConversations.get(trip) || {last:-Infinity};
    if (trip) tripConversations.set(trip,timing);
    let speaker, expires, beat, firstTownFrame;
    function hide() { bubble.hidden = true; speaker = undefined; }
    return (now, actors, progress) => {
      const rate = Guild.chatterRates[rateFor(kind)];
      if (!rate?.[kind] || !actors.length) {
        if (speaker) hide();
        firstTownFrame = undefined;
        return;
      }
      const scale = canvas.clientWidth / width;
      const left = viewport.scrollLeft, right = left + viewport.clientWidth;
      if (!trip) firstTownFrame ??= now;
      if (speaker && (now >= expires || trip && !trip.unit.some(u=>u.id===speaker && u.state==="ok"))) hide();
      if (!speaker && now-timing.last >= rate[kind]) {
        let cue;
        if (trip) {
          const stage = trip.node + "/" + (trip.fight?.turn ?? "walk") + "/" + (progress >= .4);
          if (stage === beat) return;
          beat = stage;
          cue = expeditionCue(trip,people,progress);
          if (!cue) return;
          const key = trip.steps + "/" + cue.scene;
          if (key === timing.key) return;
          const active = trip.unit.filter(u => u.state === "ok");
          if (!active.some(u=>u.id===cue.id)) cue.id = pickOne(active)?.id;
          timing.key = key;
        } else if (now-firstTownFrame >= rate.town/3) {
          cue = townCue(actors.filter(a=>a.x*scale >= left && a.x*scale <= right),people,timing.previous);
        }
        const person = cue && people.find(p=>p.id===cue.id);
        if (person) {
          speaker = person.id;
          timing.previous = speaker;
          timing.last = now;
          expires = now + 2450;
          bubble.firstElementChild.textContent = person.name;
          bubble.lastElementChild.textContent = Guild.chatterLine(person.voice,cue.scene,cue.friend);
          bubble.hidden = false;
        }
      }
      if (!speaker) return;
      const anchor = actors.find(a=>a.id===speaker);
      if (!anchor || anchor.x*scale < left || anchor.x*scale > right) { hide(); return; }
      const x = anchor.x*scale, w = bubble.offsetWidth;
      const edge = Math.max(left+3,Math.min(x-w/2,right-w-3));
      bubble.style.left = edge+"px";
      bubble.style.top = (anchor.headY*scale-7)+"px";
      bubble.style.setProperty("--tail",Math.max(5,Math.min(w-5,x-edge))+"px");
    };
  }

  function mount(canvas, { people, trip, url, fraction, time, raidScene, built, landmark, emblem, selectPlot, activePlot, openHall, camera, turn, chatterRate }) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};
    const viewport = canvas.closest(".panorama-scroll");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const kind = canvas.dataset.scene;
    const { width, height } = GuildVoxel.views[kind];
    let draw = GuildVoxelMaps.get(kind,built,camera,landmark);
    let displayed;
    const isTown = kind === "town";
    const guildFlag = isTown && emblem ? guildStandard(emblem) : null;
    const converse = chatterRate && sceneConversation(canvas,viewport,people,trip,chatterRate);
    if (isTown) viewport.scrollLeft = (canvas.clientWidth - viewport.clientWidth) / 2;
    let hovered, hoverMarker;
    function targetUnderPointer(event) {
      if (url && displayed !== draw) return;
      const rect = canvas.getBoundingClientRect();
      return draw.targetAtPixel((event.clientX-rect.left)*width/rect.width, (event.clientY-rect.top)*height/rect.height);
    }
    let drag, suppressClick = false;
    function pick(event) {
      if (suppressClick) { suppressClick = false; return; }
      const target = targetUnderPointer(event);
      if (target?.id === "guild") openHall?.();
      else if (target) selectPlot(target.id);
    }
    function setHover(target) {
      if (target === hovered) return;
      hoverMarker?.removeAttribute("data-hover");
      hovered = target;
      canvas.style.cursor = target ? "pointer" : "";
      const markerId = target?.id === "guild" ? "hall" : target?.id;
      hoverMarker = target && viewport.querySelector(`.plot-marker[data-id="${markerId}"]`);
      hoverMarker?.setAttribute("data-hover","");
    }
    function beginDrag(event) {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick = false;
      if (!camera || !turn || event.pointerType === "touch") return;
      drag = {id:event.pointerId,x:event.clientX,steps:0};
      canvas.setPointerCapture(event.pointerId);
    }
    function move(event) {
      if (drag && drag.id === event.pointerId) {
        const distance = event.clientX-drag.x;
        if (Math.abs(distance)>7) suppressClick = true;
        const steps = Math.trunc(distance/38);
        if (steps !== drag.steps) {
          turn(steps-drag.steps);
          drag.steps = steps;
        }
        if (suppressClick) return;
      }
      if (event.pointerType !== "touch") setHover(targetUnderPointer(event));
    }
    function endDrag(event) {
      if (drag?.id === event.pointerId) drag = null;
    }
    function leave() { setHover(undefined); }
    function highlight(ctx) {
      const plot = activePlot?.() || hovered;
      if (plot && plot.id !== "guild") GuildVoxelMaps.highlight(ctx,plot,camera);
    }
    if (isTown && selectPlot) {
      if (turn) {
        canvas.addEventListener("pointerdown",beginDrag);
        canvas.addEventListener("lostpointercapture",endDrag);
      }
      canvas.addEventListener("click",pick);
      canvas.addEventListener("pointermove",move);
      canvas.addEventListener("pointerleave",leave);
    }
    let frame, active = true;
    function paint(now) {
      const scale = Math.min(window.devicePixelRatio || 1, 2) * canvas.clientWidth / width;
      const pixels = Math.max(1, Math.round(width * scale));
      if (canvas.width !== pixels || canvas.height !== Math.round(height * scale)) {
        canvas.width = pixels;
        canvas.height = Math.max(1, Math.round(height * scale));
      }
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if (isTown) {
        const battle = raidScene?.();
        const actors = battle ? townBattle(url,battle.raid,battle.defenders,battle.fraction,reduced.matches,camera) :
          town(people,url,time ? time() : now/1000,reduced.matches,draw.routes,camera);
        draw(ctx,actors,highlight,guildFlag);
        converse?.(now,battle ? [] : actors);
        displayed = draw;
      } else {
        const progress = fraction();
        const { actors, cameraX } = dungeon(trip, people, url, progress, reduced.matches);
        draw(ctx, actors);
        viewport.scrollLeft = cameraX / width * canvas.clientWidth - viewport.clientWidth * .57;
        converse?.(now,actors,progress);
      }
      frame = requestAnimationFrame(paint);
    }
    function prepare(scene) {
      if (!url) return;
      scene.prepare(url).then(() => {
        if (active && scene === draw) {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(paint);
        }
      }).catch(error => {
        if (!active || scene !== draw) return;
        const warning = document.createElement("p");
        warning.className = "warning";
        warning.setAttribute("role","alert");
        warning.textContent = error.message;
        viewport.prepend(warning);
      });
    }
    prepare(draw);
    function stop() {
      active = false;
      cancelAnimationFrame(frame);
      if (isTown && selectPlot) {
        if (turn) {
          canvas.removeEventListener("pointerdown",beginDrag);
          canvas.removeEventListener("lostpointercapture",endDrag);
        }
        canvas.removeEventListener("click",pick);
        canvas.removeEventListener("pointermove",move);
        canvas.removeEventListener("pointerleave",leave);
        leave();
      }
    }
    stop.setCamera = next => {
      cancelAnimationFrame(frame);
      leave();
      viewport.querySelector(".warning")?.remove();
      camera = next;
      draw = GuildVoxelMaps.get(kind,built,camera,landmark);
      prepare(draw);
    };
    return stop;
  }
  return { mount };
})();
