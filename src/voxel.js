// Town plots, expedition trails and sprite feet share an isometric ground plane.
const GuildVoxel = (() => {
  "use strict";
  const width = 900, height = 300;
  const views = {
    dungeon: { width, height, groundY: 154 },
    town: { width: 1393, height: 784, groundY: 478 }
  };
  const half = 16, rise = 8, vertical = 18;
  // Across and depth follow the panorama's horizontal and vertical ground axes.
  const projectGround = (across, depth, z = 0, view = views.dungeon) =>
    [view.width/2 + across*half, view.groundY + depth*rise - z*vertical];
  const unprojectGround = (px, py, view) =>
    [(px - view.width/2)/half, (py - view.groundY)/rise];
  const directions = 16;
  // The survey is already foreshortened by 1/2. Undo that before rotating in XY.
  function townCamera(direction) {
    const step = ((direction % directions) + directions) % directions;
    const angle = step * 2*Math.PI/directions, scale = .60;
    const c = Math.cos(angle)*scale, s = Math.sin(angle)*scale;
    const ox = 690, oy = 390, cx = views.town.width/2, cy = 391;
    function project(x,y,z=0) {
      return [cx+c*(x-ox)+s*2*(y-oy), cy-s*(x-ox)/2+c*(y-oy)-z*scale];
    }
    function inverse(x,y) {
      return [ox+(c*(x-cx)-2*s*(y-cy))/(scale*scale),
        oy+(s*(x-cx)/2+c*(y-cy))/(scale*scale)];
    }
    return {step,angle,scale,project,inverse,
      depth:(x,y)=>(project(x,y)[1]-views.town.groundY)/rise,
      matrix:[c,-s/2,2*s,c,...project(0,0)]};
  }
  function groundTile(px, py, view) {
    const [u,v] = unprojectGround(px,py,view);
    return [Math.floor((v+u)/2), Math.floor((v-u)/2)];
  }
  // Images and projected static objects are shared across visits and plot rebuilds.
  const stampLayout = {pivot:69, ground:116, width:138, height:153};
  const images = new Map(), stamps = new Map();
  function image(src,cache=images) {
    if (!cache.has(src)) cache.set(src, new Promise((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => { cache.delete(src); reject(new Error("景観画像を読み込めませんでした。")); };
      picture.src = src;
    }));
    return cache.get(src);
  }

  function stamp(id, url) {
    const src = url("scenery_" + id);
    if (!stamps.has(src)) stamps.set(src, image(src).then(sheet => {
      const rows = GuildSceneryMasks[id].split(".").map(row =>
        (row.match(/../g) || []).map(hex => parseInt(hex,16)));
      // Paintings already include the projection. Horizontal slice atlases
      // still need to be stacked into the same double-resolution frame.
      const painted = sheet.naturalWidth === stampLayout.width * 2 &&
        sheet.naturalHeight === stampLayout.height * 2;
      return { canvas: painted ? sheet : GuildStacks.sceneryStamp(sheet,stampLayout), rows };
    }).catch(error => { stamps.delete(src); throw error; }));
    return stamps.get(src);
  }

  // Each view is baked from the same horizontal terrain sections and camera matrix.
  const terrainImages = new Map();
  function terrainImage(step,url) {
    const key = url("town_terrain_"+String(step).padStart(2,"0"));
    const ready = image(key,terrainImages);
    terrainImages.delete(key);
    terrainImages.set(key,ready);
    if (terrainImages.size>3) terrainImages.delete(terrainImages.keys().next().value);
    return ready;
  }

  async function turnStamp(id,url,step) {
    const canvas = await image(url("turn_"+id));
    const rows = GuildTownMasks[id][step].split(".").map(row =>
      (row.match(/../g) || []).map(hex=>parseInt(hex,16)));
    const {width,height} = stampLayout;
    return {canvas,rows,crop:[step%4*width,Math.floor(step/4)*height,width,height]};
  }

  function prop(id, across, depth, scale, radius, view = views.dungeon) {
    const [x, y] = projectGround(across, depth, 0, view);
    return { id, depth, x, y, scale, radius };
  }

  function drawHallFlag(ctx, flag, camera, x, y, scale) {
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(scale,scale);
    if (camera) {
      // Same object-space mast and projection as tools/town-stamps.py.
      const a = camera.angle - Math.PI/4;
      ctx.translate(24*Math.cos(a)-12*Math.sin(a), .52*(-24*Math.sin(a)-12*Math.cos(a))-96);
      ctx.transform(Math.cos(camera.angle),-.52*Math.sin(camera.angle),0,1,0,0);
      ctx.drawImage(flag,0,0,30,16);
    } else {
      // The painted tower carries its standard on the gold pole at the right eave.
      ctx.drawImage(flag,31.8,-82.6,24,14);
    }
    ctx.restore();
  }

  function scene(kind, props, camera) {
    const view = views[kind];
    const base = document.createElement("canvas");
    base.width = view.width;
    base.height = view.height;
    const ink = base.getContext("2d");
    props.sort((a,b) => a.depth-b.depth);
    const art = new Map();
    let preparing;
    function draw(ctx, actors, groundOverlay, guildFlag) {
      ctx.drawImage(base, 0, 0);
      if (groundOverlay) groundOverlay(ctx);
      actors.sort((a,b) => a.depth-b.depth);
      let i = 0;
      for (const {id, depth, x, y, scale, magnification = 1} of props) {
        while (i < actors.length && actors[i].depth < depth) actors[i++].paint(ctx);
        const object = art.get(id);
        if (!object) continue;
        const size = scale*magnification;
        ctx.drawImage(object.canvas, ...(object.crop || []), x-stampLayout.pivot*size, y-stampLayout.ground*size,
          stampLayout.width*size, stampLayout.height*size);
        if (id === "guild" && guildFlag?.complete && guildFlag.naturalWidth)
          drawHallFlag(ctx,guildFlag,camera,x,y,size);
      }
      while (i < actors.length) actors[i++].paint(ctx);
    }

    draw.prepare = url => {
      if (preparing) return preparing;
      const ids = [...new Set(props.map(p => p.id))];
      preparing = Promise.all([camera ? terrainImage(camera.step,url) : image(url("ground_"+kind)),
        ...ids.map(id => camera || !Object.hasOwn(GuildSceneryMasks,id) ? turnStamp(id,url,camera?.step ?? 0) : stamp(id,url))]).then(([ground,...objects]) => {
        ink.drawImage(ground, 0, 0, view.width, view.height);
        for (const {x,y,radius} of props) {
          // Three translucent ellipses soften the contact edge on grass and paving.
          for (const spread of [1,.75,.46]) {
            ink.fillStyle = "rgba(61,51,40,.09)";
            ink.beginPath();
            ink.ellipse(x+radius*.18,y+2,radius*spread,radius*.38*spread,-.09,0,Math.PI*2);
            ink.fill();
          }
        }
        ids.forEach((id,i) => art.set(id,objects[i]));
      }).catch(error => { preparing = null; throw error; });
      return preparing;
    };

    draw.pickProp = (px,py) => {
      for (let i=props.length-1; i>=0; i--) {
        const item=props[i], object=art.get(item.id);
        if (!object) continue;
        const x=Math.floor(((px-item.x)/item.scale+stampLayout.pivot)/2);
        const y=Math.floor(((py-item.y)/item.scale+stampLayout.ground)/2);
        const edges=object.rows[y];
        if (edges?.some((lo,j) => j%2 === 0 && x>=lo && x<edges[j+1])) return item;
      }
    };
    return draw;
  }

  return { width, height, views, stampLayout, townCamera, directions, projectGround, unprojectGround, groundTile, scene, prop };
})();

// Generated scenery alpha runs (2px cells).
const GuildSceneryMasks = {
  guild: "................3133.31333437.1c1e20223138.1c1e2022313c.1c22313c.1b233134373b.1a253133.15171a272a2d3034.14171a2d3034.1417192e2f35.1235.1236.1238.1238.0e101139.0e39.0d38.0d38.0c38.0c38.0d39.0c3a.0b3b.0b3a.0a3a.0a39.0b39.0b39.0b3a.0b3b.083b.093c.083d.083d.093e.0a3e.093d.093d.083d.093c.0a3b.093b.0a38.0c38.0c38.0e38.0f37.1035.1235.1434.1633.172e.1a2a2c2d.21222728",
  forge: ".......................30313233.2f35.2e33.2a33.2a33.2632.2532.2331.212e.202d.1e2d.1c2e.1a2e.182f.172f.1630.1531.1432.1233.1133.1032.1131.1332.1233.1234.1134.1034.1134.1135.1236.1036.0f36.0f37.0f37.0f36.1135.1235.1234.1432.1631.1732.18212331.192021232728.1c1d",
  inn: ".............................1f21.1e23.1e282b2d.1c2f.1b2f.1a2f.192f.1830.1731.1633.1534.1435.1335.1234.1233.1333.1333.1134.0f35.0f35.0f34.0f34.0f34.0f36.1236.1236.1236.1236.1135.1134.1033.1232.1330.142f.152d.182c.1f28.23242526",
  tavern: "............................2123.21252a2e.2027292f.1f2f.1e2f.1d2f.171a1c30.1731.1631.1532.1533.1534.1535.1335.1235.1034.0f33.0f35.1035.1135.1135.1035.1035.1035.1135.1136.1036.0f36.0f36.1034.1033.1032.1231.132f.1415162e.172d.1b2b.1f222329",
  shop: "...........................1f23.1e25.1c282a2e.1b2f.1a2f.192f.182f.1730.1631.1531.1432.1333.1234.1135.1035.1034.1133.1235.1135.1035.0f34.0f36.0f37.0f37.0e37.0e37.0f36.0f37.0f36.0f35.0e34.0f33.0f32.1031.1231.1330.172f.172d.192c.1f29.2226",
  school: ".........................................2a2c.2a2c.20232a2e.1c1e20252b30.1b272b30.18272b30.17282930.1530.1430.1430.1430.132f.1232.1232.1232.1233.1234.1234.1333.1233.1132.1232.1232.1431.1530.142e.172d.182d.1b2c.1f252728",
  bow: "..................................2223.2226.1f29.1c29.1c29.1a2a.1a2a.1a2b.192b.192b.192b.1a2a.1a2a.192a.1929.1a2a.192c.192c.182c.182d.172e.172f.172e.172e.172d.182c.192c.1b2a.1d29.1f202224",
  watch: "..................................2024.1f25.1e27.1c28.1b2a.1a2b.192a.1a29.1b29.1a2a.1a2a.1a2a.1929.1a29.1b29.1b29.1a29.1a2c.192e.182f.182e.172e.172e.182d.182c.1a2a.1a29.1b28.1d27.2224",
  magic: "................................2022.1f22.1f23.1f23.1f23.1c1d1e24.1b25.1a26.1a28.1a29.1929.1829.1828.1828.1828.1929.192a.192b.182b.182c.192d.182e.172e.162f.162f.172e.162d.162c.172b.182a.1929.1d25",
  wall: "......................................2a2b.282c.272e.272e.272e.242e.232e.232d.222d.1f2d.1e2f.1d2f.1d30.1b1c1d30.192f.182e.172e.172d.172c.162b.1729.1727.1726.1625.1623.1623.1521.161f.191d",
  farm: "............................................21252627.1f28.1d28.1c2a.192d.1415172e.1232.1232.1234.1036.0e38.0d39.0c39.0c37.0e36.0e35.0e35.1031.1430.1430.172e.1a2e.1b2d.1c2b.2025",
  lamp: "........................................2022.1f22.1e24.1e24.1e23.1f23.1f23.1f22.2022.2022.2022.2022.2022.2022.2022.1f23.1e24.1d27.1e28.1f232426",
  bench: "................................................2426.2226.2127.1f28.1e29.1c29.1c29.1c29.1c2a.1c2a.1c28.1b26.1b24.1b23.1d23.2022",
  well: ".......................................1e22.1d24.1c27.1c27.1b29.1a2a.192c.192c.1b2a.1c28.1c28.1c28.1c29.1c2a.1b28292b.1b2c.1a2a.192b.192c.192c.192c.1a2b.1a1b1c2b.1e29",
  fence: "..............................................2829.272a.272b.262a.242a.232a.2125262b.1c1d1f24252a.1b22232b.1b21222b.1b1f2024262b.1a1e1f232528.1b212327.1b202125.1b23.1a22.1a21.1b1f",
  flowers: "....................................................2225.2126.1f27.1e28.1c28.1c28.1c29.1c29.1c28.1f27.2025",
  cypress: "...................................2223.2124.2124.2024.2025.1f25.1f25.1e25.1e26.1e26.1e26.1e27.1e26.1e26.1d26.1d26.1e26.1e26.1e25.1e25.1f29.1e28.1d28.1d27.1f25",
  tree: ".........................2228.1d1f212a.1c2e.1a2e.1a30.1b2f.1531.1431.12131434.1236.1036.1136.1037.1138.1238.0f37.0e38.0f38.0d38.0d38.0e37.0e323335.0d35.0d36.0d282937.0f1a1b37.0f191c37.0f181c1e1f36.13161f282c34.1b272c34.1b2c3132.192e.1832.1632.1633.1533.1631.1830.1b2b.1c29.1f21",
  pillar: "..........................................2427.2228.2128.1f28.1e28.1e27.1d28.1d27.1e27.1d27.1d26.1c26.1b29.1b2a.1b2a.1b2b.1a2a.1c29.1c28.1d25",
  crystal: ".............................................2427.2227.2028.1f28.1d27.1c27.1c2a.1c2a.1b29.1a2a.1a2b.1a2b.1b2a.1b2a.1c28.1d27.1e25",
  chest: "................................................1f22.1d23.1d25.1c26.1b28.1b29.1b29.1b2a.1a2a.1b2b.1b2b.1d2a.2028.2127.2325",
  spring: "............................................2326.2127.1e28.1d29.1b2a.1a2b.1a2c.192c.192c.192c.182c.192d.182d.182d.192d.192c.1a2b.1b2b.1c29.1e27",
  arch: "....................................1d1e.1b20.1921.1721.1623.1625.1628.152a.162b.172c.162c.171e202e.171e212f.171e222f.1720232f.1521232e.1521232f.1521232e.1522232d.152d.162e.172f.1a1c2030.2130.2130.2130.212f.2425262d",
  ruin: "............................................2829.2526272a.232b.222b.222b.212a.1f2b.1d2c.1d2d.1b2d.1a2d.192d.192d.182c.182b.192a.1827.1924.1a1f",
  fern: ".................................................2023.21242528.1d28.1c27.1d29.1b2a.1b29.1c2a.1b2a.1b29.1b1c1d29.1d28.1f28.2123",
  rubble: "..................................................2224.1f26.1d27.1d29.1c29.1c29.1b2a.1b2a.1b2a.1b2a.1c29.1f28.2223",
  torch: "...........................................2325.2125.2024.1f24.1f24.1f23.1f23.2023.2022.2022.2022.2022.2022.1f232527.1e27.1f25.1f24",
};
