const GuildVoxelMaps = (() => {
  "use strict";
  const { prop, scene } = GuildVoxel;
  const worlds = new Map();
  const townView = GuildVoxel.views.town;
  const hallSite = [553,387];
  const hillPlot = {id:"hill",name:"見晴らしの丘"};
  // The painted survey and the rotating terrain depict the summit at different coordinates.
  const hillSite = camera => camera ? [1010,150,44] : [1130,112,0];
  const hillPoint = camera => camera ? camera.project(...hillSite(camera)) : hillSite(null).slice(0,2);
  function hillEdge(camera) {
    const [x,y,z] = hillSite(camera);
    return [[-57,0],[-28,-21],[29,-21],[57,0],[28,21],[-29,21]].map(([dx,dy]) =>
      camera ? camera.project(x+dx,y+dy,z) : [x+dx,y+dy]);
  }
  // Pixel coordinates in ref-land-empty.png. The edge follows the grass side
  // of each road or bank. radius is the half-width of a farm that fits inside.
  const parcels = {
    orchard: {center:[430,165], radius:49, edge:[
      [349,175],[355,153],[384,141],[427,132],[467,120],[497,133],[519,145],
      [518,153],[505,165],[497,180],[496,195],[450,197],[415,194],[397,185],[375,178]]},
    birch: {center:[243,285], radius:31, edge:[
      [183,307],[201,278],[222,251],[249,225],[282,206],[313,191],[338,185],
      [364,185],[392,193],[398,198],[385,207],[354,222],[323,236],[301,253],
      [284,273],[272,294],[259,307],[239,311],[188,311]]},
    dawn: {center:[324,348], radius:53, edge:[
      [264,379],[260,360],[261,334],[269,313],[283,296],[299,266],[311,253],
      [339,236],[358,230],[378,240],[414,253],[424,260],[399,271],[379,284],
      [365,301],[360,315],[362,328],[372,344],[392,358],[378,364],[293,385],[275,390]]},
    wind: {center:[650,258], radius:67, edge:[
      [542,214],[563,208],[589,207],[625,210],[664,216],[694,220],[725,230],
      [759,245],[789,260],[797,266],[752,278],[716,288],[680,293],[652,295],
      [622,288],[600,276],[584,260],[565,237]]},
    west: {center:[209,362], radius:33, edge:[
      [177,320],[229,321],[247,320],[249,330],[245,351],[248,374],[258,390],
      [245,398],[215,408],[186,414],[177,400],[169,378],[169,351],[171,333]]},
    east: {center:[1136,372], radius:67, edge:[
      [992,289],[1008,282],[1032,292],[1065,305],[1116,323],[1160,338],
      [1196,355],[1224,375],[1241,398],[1245,420],[1241,440],[1229,456],
      [1204,473],[1175,459],[1139,436],[1102,411],[1067,391],[1026,367],
      [986,345],[962,332],[950,323],[957,308],[975,302]]},
    brook: {center:[758,385], radius:69, edge:[
      [670,387],[663,371],[663,352],[670,334],[687,319],[716,310],[746,303],
      [771,316],[803,336],[838,356],[870,374],[901,394],[932,417],[960,434],
      [977,453],[942,446],[916,442],[883,443],[840,449],[806,453],[791,451],
      [777,437],[760,426],[737,416],[707,405],[684,400]]},
    square: {center:[405,416], radius:42, edge:[
      [294,399],[339,386],[386,375],[410,371],[428,375],[432,393],[444,411],
      [463,425],[495,438],[502,445],[495,458],[462,459],[423,459],[393,454],
      [366,442],[339,423],[313,407]]},
    linden: {center:[504,281], radius:48, edge:[
      [377,303],[388,287],[413,275],[440,263],[483,250],[525,240],[540,238],
      [557,255],[574,276],[591,290],[568,297],[533,304],[495,314],[471,324],
      [450,339],[435,353],[414,356],[397,348],[382,335],[374,320]]},
    mill: {center:[919,498], radius:68, edge:[
      [801,466],[835,461],[875,455],[914,454],[946,458],[983,469],[1010,478],
      [1030,492],[1044,509],[1049,529],[1042,541],[1024,551],[999,558],[973,560],
      [950,548],[927,537],[898,528],[858,517],[819,510],[794,506],[798,491]]},
    clover: {center:[385,505], radius:70, edge:[
      [200,431],[215,420],[245,411],[272,404],[294,411],[327,430],[353,451],
      [377,464],[400,471],[435,472],[494,470],[495,485],[500,503],[474,513],
      [442,525],[414,538],[385,555],[366,561],[346,558],[308,540],[276,518],
      [244,494],[222,473],[208,453]]},
    south: {center:[523,568], radius:75, edge:[
      [402,574],[415,558],[442,541],[480,526],[510,518],[529,525],[552,536],
      [584,546],[606,555],[619,569],[625,590],[624,609],[617,622],[600,625],
      [560,621],[515,612],[470,600],[428,585]]},
    sunny: {center:[804,578], radius:89, edge:[
      [675,607],[674,582],[682,566],[694,556],[722,547],[749,537],[777,522],
      [800,520],[842,528],[881,539],[916,551],[939,565],[949,577],[943,586],
      [921,599],[891,611],[855,621],[815,628],[772,632],[721,631],[690,624]]}
  };
  for (const {id,center,radius} of Guild.outerPlots) {
    const [x,y] = center, r = radius;
    // A clipped meadow slightly beyond the diamond occupied by a full farm.
    const edge = [[-1,-.22],[-.48,-.56],[.50,-.56],[1,-.22],[1,.22],
      [.48,.56],[-.50,.56],[-1,.22]].map(([u,v])=>[x+r*u,y+r*v]);
    parcels[id] = {center,radius,edge};
  }
  const toGround = ([x,y]) => GuildVoxel.unprojectGround(x,y,townView);
  const plotCenter = plot => toGround(parcels[plot.id].center);
  function farmTile(plot,col,row) {
    const {center:[x,y],radius} = parcels[plot.id];
    const step = radius/plot.size;
    return [x+(col-row)*step, y+(col+row+1-plot.size)*step/2];
  }
  const clearings = new Map(Guild.plots.map(plot => [plot.id,{plot,edge:parcels[plot.id].edge}]));

  const territoryClearings = new Map([...clearings,...Guild.outerPlots.map(plot =>
    [plot.id,{plot,edge:parcels[plot.id].edge}])]);

  function insideClearing(px,py,edge) {
    let inside = false;
    for (let i=0, j=edge.length-1; i<edge.length; j=i++) {
      const [x,y] = edge[i], [a,b] = edge[j];
      if ((y>py) !== (b>py) && px < x+(py-y)*(a-x)/(b-y)) inside = !inside;
    }
    return inside;
  }

  // Feet follow the centerline of the painted paving, including the bridge deck.
  // Some walks end just inside a meadow until a facility occupies that parcel.
  const patrols = {
    mina: {seconds:22, road:[[651,632],[646,607],[646,573],[645,549],[646,516],
      [647,478],[647,440],[646,410],[646,384],[644,358],[649,334],[659,318],[677,305]]},
    gald: {seconds:24, road:[[667,310],[699,302],[734,294],[769,284],[805,276],
      [842,269],[881,265],[920,265],[955,267],[987,272],[1012,274],[1033,287],
      [1071,301],[1115,317],[1158,331],[1196,348],[1220,363],[1241,383]]},
    popo: {seconds:22, road:[[647,477],[622,491],[592,506],[563,517],[531,515],
      [513,511],[483,520],[449,532],[417,547],[391,566],[382,575]],
      visit:{plot:"clover",point:[366,548]}},
    shion: {seconds:21, road:[[178,423],[207,418],[246,405],[270,397],[258,381],
      [254,359],[254,336],[259,318],[273,301],[284,281],[295,262],[314,245],
      [338,231],[365,220],[390,208],[404,198]]},
    toto: {seconds:19, road:[[476,465],[435,466],[401,463],[375,455],[352,443],
      [333,429],[309,414],[278,398],[309,389],[353,379],[391,369],[418,364],
      [440,365],[445,386],[457,406],[478,421],[508,433],[529,434]]},
    custom: {seconds:22, road:[[666,642],[701,644],[748,645],[797,643],[847,636],
      [894,623],[929,609],[952,595],[961,580],[950,560],[928,546],[891,532],
      [850,521],[808,515],[782,512]]}
  };
  function townRoutes(built) {
    const routes = {};
    for (const [id,{road,visit,seconds}] of Object.entries(patrols)) {
      const path = visit && !built[visit.plot] ? [...road,visit.point] : road;
      const points = path.map(toGround);
      const distances = [0];
      for (let i=1;i<points.length;i++) {
        const [u,v] = points[i], [a,b] = points[i-1];
        distances.push(distances[i-1] + Math.hypot(u-a,v-b));
      }
      routes[id] = {points,distances,seconds};
    }
    return routes;
  }

  const places = {
    entry: [-26,2], gate: [-21,2], meadow: [-13,4], fork: [-3,3],
    grove: [7,-2], pass: [6,7.5], vein: [14,7], home: [22,2]
  };
  const routes = {};
  for (const [branch, rooms] of Object.entries({
    grove: ["entry","gate","meadow","fork","grove","home"],
    pass: ["entry","gate","meadow","fork","pass","vein","home"]
  })) routes[branch] = rooms.map(room => places[room]);

  // Sample the same polylines for the tiled paths and the party's feet.
  function trailDepth(across, branch) {
    const path = routes[branch] || routes.grove;
    for (let i = 1; i < path.length; i++) {
      const [bx,by] = path[i], [ax,ay] = path[i-1];
      if (across <= bx) return ay + (by-ay)*Math.max(0,(across-ax)/(bx-ax));
    }
    return path[path.length-1][1];
  }

  // The dimensions are conservative ground footprints in slice pixels, including porches.
  const footprints = {
    guild:70, forge:60, inn:60, tavern:60, shop:64, school:50, bow:37,
    watch:39, magic:39, wall:64, farm:64, cypress:22, tree:39, lamp:12, well:34,
    fence:35, flowers:24, bench:35, pillar:24, arch:54, ruin:38, rubble:28,
    spring:41, crystal:28, chest:28, fern:24, torch:12
  };
  function scenery(id,u,v,scale,view) {
    const item = prop(id,u,v,scale,footprints[id]*scale*.61,view);
    // Illustration sizes are independent of parcel radii and the original tap silhouettes.
    if (id === "guild") item.magnification = 1.55;
    if (id === "inn") item.magnification = 1.22;
    return item;
  }

  function dungeon() {
    const props=[], put=(id,u,v,scale=1)=>props.push(scenery(id,u,v,scale));
    for (const u of [-24,-22,-14,-12,-3,9,11,16]) put("ruin",u,-6.8,.88);
    for (const u of [-23,-13,-1,13]) put("pillar",u,-5,1.1);
    for (const u of [-19,-4,11,20]) put("ruin",u,11.6,.72);
    put("arch",22,2.5,1.48);
    for (const [u,v] of [[-24,7],[-10,9],[2,-4],[8,11],[17,-4],[24,8]]) put("rubble",u,v,.9);
    for (const [u,v] of [[-17,-1],[-13,1],[-11,-2],[-9,8],[3,9],[7,-5],[17,3],[22,9]]) put("fern",u,v,.93);
    for (const [u,v] of [[-22,-2],[-15,8],[-6,-3],[6,-4.5],[14,3],[17,9]]) put("crystal",u,v,1);
    put("spring",-12,-1.7,1.4); put("chest",15,-.6,1.1);
    for (const [u,v] of [[-20,-1],[-2,8],[10,-5],[21,-2]]) put("torch",u,v,.66);
    return scene("dungeon",props);
  }

  function highlight(ctx,plot,camera) {
    const hill = plot.id === hillPlot.id;
    const clearing = hill ? {edge:hillEdge(camera)} : (camera ? territoryClearings : clearings).get(plot.id);
    if (!clearing) return;
    const {edge} = clearing;
    ctx.save();
    if (camera && !hill) ctx.transform(...camera.matrix);
    ctx.beginPath();
    ctx.moveTo(...edge[0]);
    for (let i=1; i<edge.length; i++) ctx.lineTo(...edge[i]);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,244,190,.16)";
    ctx.fill();
    ctx.strokeStyle = "#f9edc3";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "#786848";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  const townCache = new Map();
  function town(built,camera,landmark) {
    // The hall has its own site on the northwest rim of the plaza.
    const hall = scenery("guild",...toGround(hallSite),1.36,townView);
    const props = [hall];
    if (landmark) {
      const [x,y,z] = hillSite(camera);
      props.push({...prop(landmark,...toGround([x,y]),1.3,44,townView),z,plot:hillPlot});
    }
    // Street furniture sits on the paving, clear of the crossing and its approaches.
    for (const [id,x,y,scale] of [
      ["lamp",530,464,.69], ["bench",552,473,.73],
      ["well",725,488,.78], ["bench",713,445,.65], ["lamp",738,454,.66]
    ]) props.push(scenery(id,...toGround([x,y]),scale,townView));
    const visible = camera ? territoryClearings : clearings;
    for (const {plot} of visible.values()) {
      const kind = built[plot.id];
      if (!kind) continue;
      const {radius,center} = parcels[plot.id];
      if (kind === "farm") {
        // Each bed is one owned tile and produces one daily ration.
        const scale = 2*radius/(plot.size*Math.SQRT2*footprints.farm);
        for (let col=0;col<plot.size;col++) for (let row=0;row<plot.size;row++) {
          const point = toGround(farmTile(plot,col,row));
          props.push({...scenery(kind,...point,scale,townView),plot});
        }
      } else {
        const scale = Math.min(plot.road ? .98 : .48+center[1]/740, 2*radius/(Math.SQRT2*footprints[kind]));
        props.push({...scenery(kind,...plotCenter(plot),scale,townView),plot});
      }
    }
    if (camera) {
      const [hillX,hillY] = hillSite(camera);
      for (const [id,x,y,z,scale] of GuildTownGroves) {
        if (landmark && Math.hypot(x-hillX,(y-hillY)*2)<80) continue;
        props.push({...scenery(id,...toGround([x,y]),scale,townView),z});
      }
      for (const item of props) {
        item.depth = camera.depth(item.x,item.y);
        [item.x,item.y] = camera.project(item.x,item.y,item.z);
        item.scale *= camera.scale;
        item.radius *= camera.scale;
      }
    }
    const draw = scene("town",props,camera);
    draw.routes = townRoutes(built);
    draw.targetAtPixel = (px,py) => {
      const hit = draw.pickProp(px,py);
      if (hit === hall) return hall;
      if (hit?.plot) return hit.plot;
      if (insideClearing(px,py,hillEdge(camera))) return hillPlot;
      if (camera) [px,py] = camera.inverse(px,py);
      for (const {plot,edge} of visible.values())
        if (insideClearing(px,py,edge)) return plot;
    };
    draw.plotAtPixel = (px,py) => {
      const target = draw.targetAtPixel(px,py);
      return target === hall ? undefined : target;
    };
    return draw;
  }

  function get(kind, built = {}, camera, landmark) {
    if (kind === "town") {
      const key = [camera?.step ?? "paint", landmark || "", ...(camera ? Guild.territoryPlots : Guild.plots).map(p=>built[p.id] || "")].join("|");
      const draw = townCache.get(key) || town(built,camera,landmark);
      townCache.delete(key);
      townCache.set(key,draw);
      if (townCache.size>3) townCache.delete(townCache.keys().next().value);
      return draw;
    }
    if (!worlds.has(kind)) worlds.set(kind,dungeon());
    return worlds.get(kind);
  }
  return { get, hillPlot, hillPoint, hallSite, plotCenter, farmTile, clearings, territoryClearings, highlight, places, trailDepth };
})();

// Generated by tools/town-terrain.py
const GuildTownGroves = [["tree",328,-110,12,0.84],["tree",912,856,0,1.12],["tree",-48,372,0,0.9],["cypress",1226,258,16,1.13],["tree",38,16,0,1.18],["blossom",86,638,0,1.15],["cypress",1430,324,0,1.21],["tree",982,794,24,0.8],["tree",1034,4,0,1.21],["tree",1506,512,0,0.88],["blossom",-266,578,0,0.65],["tree",968,70,0,0.71],["tree",1024,106,32,1.22],["tree",1192,642,0,1.12],["tree",1268,678,0,1.04],["cypress",1734,406,0,0.79],["tree",1158,68,0,0.88],["tree",-150,468,0,1.11],["blossom",528,710,0,0.76],["cypress",1522,208,20,0.85],["cypress",946,740,4,0.71],["tree",870,732,12,0.9],["cypress",822,834,0,1.15],["tree",1232,24,0,0.72],["blossom",1338,54,0,1.05],["tree",1552,414,0,0.9],["tree",328,758,0,1.12],["cypress",220,554,0,0.69],["tree",1060,146,40,1.2],["tree",152,598,0,1.0],["blossom",-62,660,0,0.7],["cypress",1076,162,36,0.93],["tree",-208,598,0,0.69],["tree",18,612,0,1.03],["tree",1042,836,0,1.05],["tree",480,690,0,0.87],["tree",96,-14,0,0.66],["tree",596,-70,0,1.06],["tree",590,58,20,1.08],["cypress",-36,716,0,1.18],["tree",646,32,0,0.87],["cypress",1086,684,0,0.96],["tree",1628,548,0,1.2],["cypress",1166,228,28,0.67],["tree",1042,792,8,0.97],["tree",1202,700,0,0.83],["tree",-100,706,0,1.17],["tree",1246,126,0,0.75],["tree",426,754,0,0.89],["tree",-232,166,0,0.8],["tree",722,690,4,1.0],["tree",422,-118,16,0.93],["cypress",1276,500,0,0.94],["blossom",1264,142,0,0.86],["cypress",1524,396,12,1.11],["tree",36,672,0,1.1],["tree",570,-100,0,0.75],["blossom",804,192,0,1.16],["tree",106,736,0,0.67],["tree",348,684,0,0.84],["tree",494,778,0,0.67],["blossom",1290,478,0,0.69],["tree",774,898,0,0.84],["tree",934,40,0,0.79],["tree",1450,522,0,1.21],["cypress",838,168,0,0.68],["blossom",144,-8,0,1.2],["tree",220,628,0,0.92],["tree",700,838,0,0.97],["tree",1106,66,0,0.88],["cypress",720,880,0,0.78],["tree",1528,368,12,1.16],["tree",892,650,4,0.79],["tree",-42,620,0,0.67],["cypress",458,662,12,0.87],["tree",1358,294,0,1.13],["tree",574,168,0,1.14],["tree",1126,138,12,0.72],["tree",-128,694,0,1.11],["tree",1650,414,0,1.18],["cypress",936,784,28,1.08],["tree",1442,444,0,1.16],["tree",1268,98,0,0.85],["tree",740,662,0,0.7],["tree",66,338,0,1.14],["cypress",120,382,0,0.83],["tree",-2,390,0,0.95],["cypress",1540,508,0,1.05],["blossom",882,102,0,1.0],["blossom",820,136,0,0.71],["tree",210,826,0,1.08],["blossom",10,318,0,1.03],["cypress",1440,38,0,0.85],["tree",966,618,0,0.82],["tree",172,750,0,0.7],["tree",-232,606,0,0.66],["tree",686,-28,0,0.77],["blossom",1260,482,0,0.88],["tree",1146,512,0,0.71],["tree",578,30,4,0.84],["cypress",1586,616,0,0.72],["tree",-28,596,0,0.66],["cypress",1084,506,0,0.83],["tree",1436,618,0,1.07],["blossom",186,230,0,1.11],["tree",1330,184,0,1.09],["cypress",1338,532,0,0.87],["tree",342,8,0,0.99],["tree",176,796,0,1.17],["tree",1132,804,0,0.87],["cypress",1146,4,0,0.84],["blossom",544,890,4,0.74],["tree",534,84,16,1.2],["cypress",678,22,0,0.86],["blossom",552,-88,0,1.2],["tree",24,198,0,0.84],["blossom",1548,596,0,0.93],["cypress",-168,666,0,1.02],["cypress",1144,630,0,1.16],["tree",1152,854,0,1.12],["tree",182,-50,0,1.2],["cypress",1286,214,0,1.15],["tree",-266,466,0,1.08],["tree",-96,160,0,0.84],["tree",-258,520,0,0.92],["tree",162,178,0,0.71],["tree",1110,746,0,0.77],["cypress",62,300,0,0.84],["blossom",170,628,0,0.78],["cypress",368,122,0,0.79],["tree",1444,58,0,0.85],["blossom",1310,240,0,1.06],["cypress",72,660,0,0.99],["tree",834,890,0,1.2],["tree",-26,30,0,0.75],["tree",350,614,16,0.66],["tree",74,266,0,1.03],["tree",1156,116,0,1.12],["tree",1528,484,0,1.01],["tree",834,104,0,0.94],["tree",422,676,8,0.93],["cypress",564,746,0,0.75],["blossom",202,34,0,0.99],["cypress",794,842,0,1.16],["tree",1010,-4,0,0.73],["blossom",1004,804,16,0.94],["blossom",80,700,0,1.02],["cypress",138,644,0,0.88],["tree",288,580,0,1.16],["blossom",1620,510,0,0.95],["tree",366,-26,4,0.74],["blossom",1680,494,0,1.1],["cypress",1298,764,0,0.97],["tree",-274,384,4,0.77],["tree",1012,56,0,0.92],["cypress",12,106,0,0.95],["tree",1584,648,0,1.15],["cypress",-56,68,0,0.97],["blossom",1042,894,0,0.7],["tree",570,902,12,0.91],["tree",1612,356,20,1.21],["tree",100,494,0,0.98],["tree",808,718,20,1.02],["tree",26,136,0,1.11],["tree",1200,-22,0,0.67],["tree",1222,54,0,0.96],["tree",14,362,0,0.71],["cypress",1550,378,20,0.76],["cypress",404,818,0,0.93],["tree",1496,632,0,0.82],["cypress",1416,288,8,1.08],["tree",794,760,16,0.69],["tree",900,890,0,0.84],["cypress",742,852,0,1.04],["tree",1702,278,0,1.21],["cypress",1094,48,0,0.96],["tree",1056,856,0,0.85],["cypress",1374,578,0,0.93],["cypress",1270,16,0,0.82],["cypress",156,810,0,0.94],["cypress",2,176,0,1.0],["cypress",1662,462,0,0.91],["tree",-214,252,16,1.04],["tree",176,44,0,1.18],["cypress",1482,582,0,1.06],["blossom",-46,186,0,0.75],["tree",1302,332,0,0.74],["tree",378,-50,12,0.77],["tree",1434,200,16,1.18],["tree",1228,96,0,1.12],["tree",388,76,16,0.94],["cypress",546,650,0,1.03],["tree",-34,394,0,0.69],["tree",1220,132,0,1.13],["cypress",272,-96,0,1.01],["tree",1640,448,0,0.76],["cypress",758,706,8,1.18],["tree",814,782,20,1.1],["cypress",98,-36,0,0.72],["tree",482,76,16,0.72],["tree",718,-34,0,0.87],["cypress",1112,642,0,0.82],["tree",874,162,4,0.68],["cypress",244,598,0,0.73],["tree",82,610,0,0.74],["blossom",850,60,0,1.07],["tree",1086,580,0,0.74],["tree",1384,626,0,1.07],["cypress",1604,180,0,1.19],["blossom",776,-80,0,0.75],["tree",-152,106,0,0.69],["blossom",56,792,0,1.04],["tree",482,-110,12,0.7],["tree",164,-18,0,0.74],["tree",1408,512,0,0.98],["tree",1304,18,0,0.74],["tree",-88,70,0,0.95],["cypress",-64,252,0,1.03],["cypress",316,786,0,0.86],["tree",-58,312,0,1.13],["tree",912,756,16,0.75],["tree",882,176,4,0.77],["tree",1270,764,0,0.73],["tree",1336,402,0,0.91],["tree",1552,140,0,0.95],["tree",1100,-16,0,1.23],["cypress",960,134,40,0.83],["tree",820,696,16,1.06],["cypress",214,590,0,0.68],["cypress",44,370,0,0.69],["tree",1274,734,0,0.82],["tree",30,156,0,0.65],["tree",554,704,0,0.76],["cypress",1286,418,0,1.14],["cypress",308,672,0,1.18],["tree",614,20,0,0.67],["cypress",-194,494,0,1.1],["tree",40,42,0,1.23],["tree",-202,564,0,1.05],["blossom",184,820,0,1.2],["tree",416,-56,8,1.14],["cypress",-46,648,0,1.22],["cypress",484,760,0,0.73],["tree",1342,86,0,0.94],["tree",1332,492,0,1.02]];
