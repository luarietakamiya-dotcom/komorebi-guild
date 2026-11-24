"""Paint horizontal cross sections in plan coordinates. Inputs are lot and road geometry."""
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, gaussian_filter
from scipy.interpolate import PchipInterpolator

GAME = Path(__file__).resolve().parents[1]
# One plan texel spans 2 reference pixels east and 2 reference pixels south.
LEFT, TOP = -440, -192
W, H = 1130, 590
Y, X = np.mgrid[0:H, 0:W]*2
X += LEFT
Y += TOP
rng = np.random.default_rng(2411)


def noise(radius):
    n = gaussian_filter(rng.normal(size=(H, W)), radius)
    return n / n.std()


def coords(points):
    return [(round((x-LEFT)/2), round((y-TOP)/2)) for x, y in points]


def layout():
    script = """
    const fs=require('fs'), vm=require('vm'), c=vm.createContext({Guild:require('./engine.js'),
      document:{createElement:()=>({getContext:()=>({})})}});
    for(const file of ['voxel.js','voxel-maps.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
    const raw=vm.runInContext(`({lots:[...GuildVoxelMaps.clearings.values()].map(l=>l.edge),
      outposts:Guild.outerPlots.map(p=>GuildVoxelMaps.territoryClearings.get(p.id).edge),
      cameras:Array.from({length:GuildVoxel.directions},(_,i)=>GuildVoxel.townCamera(i)),
      view:GuildVoxel.views.town,roads:Object.values(GuildVoxelMaps.get('town').routes).map(r=>r.points.map(p=>
        GuildVoxel.projectGround(...p,0,GuildVoxel.views.town))), raids:[...Object.values(Guild.raidRoads),...Object.values(Guild.territoryRoads)]})`,c);
    process.stdout.write(JSON.stringify(raw));
    """
    return json.loads(subprocess.check_output(['node', '-e', script], cwd=GAME))


def bake_views(atlas, plan):
    """Composite the actual strata once per camera, including their exposed thickness."""
    w,h = plan['view']['width'],plan['view']['height']
    yy,xx = np.mgrid[:h,:w]
    r = np.clip((np.hypot(xx-w/2,yy-h*.54)-100)/(w*.57-100),0,1)
    paper = np.empty((h,w,3),dtype='uint8')
    for channel,colors in enumerate(zip((230,228,206),(245,240,222),(250,245,232))):
        paper[:,:,channel] = np.interp(r,[0,.83,1],colors)
    layers = [atlas.crop((i%4*W,i//4*H,(i%4+1)*W,(i//4+1)*H)) for i in range(23)]
    for camera in plan['cameras']:
        canvas = Image.fromarray(paper).convert('RGBA')
        a,b,c,d,ox,oy = camera['matrix']
        ox += a*LEFT+c*TOP
        oy += b*LEFT+d*TOP
        # Transform plan texels (two survey pixels per texel) into the camera.
        inv = np.linalg.inv([[2*a,2*c],[2*b,2*d]])
        for i,layer in enumerate(layers):
            z = -40+i*4
            top = oy-z*camera['scale']
            offset = inv @ [-ox,-top]
            values = (inv[0,0],inv[0,1],offset[0],inv[1,0],inv[1,1],offset[1])
            plane = layer.transform((w,h), Image.Transform.AFFINE, values, Image.Resampling.BILINEAR)
            box = plane.getbbox()
            if box:
                crop = plane.crop(box)
                for thickness in (3,2,1,0):
                    canvas.alpha_composite(crop,(box[0],box[1]+round(thickness*camera['scale'])))
        out = GAME/'assets'/f'town_terrain_{camera["step"]:02}.webp'
        canvas.convert('RGB').save(out,quality=89,method=4)
        print(out,flush=True)


def main():
    plan = layout()
    lots = Image.new('L', (W, H))
    outposts = Image.new('L', (W,H))
    for edge in plan['outposts']:
        ImageDraw.Draw(outposts).polygon(coords(edge),fill=255)
    outpost = np.asarray(outposts)>0
    lots.paste(outposts)
    for edge in plan['lots']:
        ImageDraw.Draw(lots).polygon(coords(edge), fill=255)
    lot = np.asarray(lots) > 0
    road_lines = plan['roads']
    road_lines += [
        [(161,425),(160,380),(165,327),(178,301),(210,258),(246,216),(295,184),(354,180)],
        [(404,198),(455,203),(501,204),(529,210),(546,230),(568,259),(592,282),(620,298),(657,308)],
        [(272,315),(230,316),(180,316)], [(361,225),(385,238),(431,257)],
        [(418,364),(374,340),(366,316),(374,293),(402,273),(437,257),(491,241),(543,230)],
        [(391,566),(373,575),(342,567),(302,548),(259,520),(214,480),(181,440),(175,424)],
        [(379,575),(432,597),(489,618),(557,633),(610,640),(646,647),(667,643)],
        [(658,320),(651,346),(655,374),(669,398),(712,407),(756,425),(786,453),(783,479),(782,512)],
        [(782,512),(748,531),(701,552),(678,571),(667,606),(666,642)],
        [(970,579),(1010,567),(1043,553),(1058,530),(1051,506),(1031,486),(996,466),(951,451),(913,447),(873,449),(828,456),(787,462)],
        [(1241,383),(1254,408),(1250,440),(1233,463),(1210,480)],
        [(332,164),(361,145),(410,130),(464,114),(501,127),(527,146),(510,175),(501,204)]
    ]
    roads = Image.new('L', (W, H))
    for road in road_lines:
        points = np.array(road)
        # Round the road junctions without shifting their endpoints.
        curve = np.stack((.75*points[:-1]+.25*points[1:],
                          .25*points[:-1]+.75*points[1:]),axis=1)
        smooth = np.vstack((points[0],curve.reshape(-1,2),points[-1]))
        ImageDraw.Draw(roads).line(coords(smooth), fill=255, width=1)
    # Keep each invasion segment under the feet of its interpolated units.
    for road in plan['raids']:
        ImageDraw.Draw(roads).line(coords([p[:2] for p in road]), fill=255, width=1)
    road_d = distance_transform_edt(np.asarray(roads) == 0, sampling=(2, 1))
    plaza_r = np.hypot(X-635, (Y-470)*2)
    fleck, wash, bloom = noise(.65), noise(7), noise(19)
    rim = np.hypot((X-690)/1080, (Y-390)/550) + np.clip(.009*bloom + .004*wash,-.014,.014)
    island = rim < 1
    river_x = PchipInterpolator([-192,-115,-62,0,55,124,175,235,280,330,395,465,550,660,784,988],
        [875,850,820,764,775,675,715,806,875,910,1028,1128,1258,1330,1392,1490])(Y)
    river_d = abs(X-river_x) - (43+6*np.sin(Y/54)+2*wash)
    # Keep the surveyed grass parcels intact on both sides of the stream.
    near_lot = distance_transform_edt(~lot, sampling=(2, 1))
    river_d = np.maximum(river_d, 13-near_lot)
    water = river_d < 0
    bank = np.clip((river_d+3)/22, 0, 1)
    bridge_y = 267 - (X-865)*.064
    upper_bridge = (X>=742) & (X<=896) & (abs(Y+62)<8)
    bridge = ((abs(Y-bridge_y)<8) & (X>775) & (X<970)) | upper_bridge
    bridge_y = np.where(upper_bridge,-62,bridge_y)
    hill = np.zeros((H,W))
    for x,y,a,b,h in [(405,103,143,66,35),(1010,150,151,85,48),(263,486,102,59,20),
                       (411,623,126,70,29),(986,637,114,63,37),(1158,243,124,74,29),
                       (147,327,74,91,22),(580,85,84,59,34),
                       (-209,281,152,51,44),(-184,395,101,40,40),(1495,243,140,72,48),
                       (1545,365,101,44,45),(405,-67,145,70,46),(321,29,76,60,38),
                       (517,872,118,62,42),(770,744,130,80,38),(967,769,113,57,38)]:
        hill += h*np.maximum(0,1-((X-x)/a)**2-((Y-y)/b)**2)**1.35
    hill = np.minimum(hill,.4*np.minimum(near_lot,road_d))
    hill *= np.clip((near_lot-2)/28,0,1)*np.clip((road_d-14)/26,0,1)*bank
    height = np.rint((hill - 16*(1-bank))/4).astype(int)*4
    height[lot] = 0
    height = np.clip(height, -16, 48)
    # Natural washes, pigment granulation, grass tufts and individual wildflowers.
    tone = .99 + .026*wash + .035*bloom + .014*fleck
    meadow = np.array([179,192,123])*tone[:,:,None]
    meadow += np.clip(bloom,-2,2)[:,:,None]*[4,1,-4]
    meadow += np.clip(wash+bloom,-2,2)[:,:,None]*[5,1,-6]
    # Grazing light over the hills, with taller grass at parcel boundaries.
    dy,dx = np.gradient(hill)
    meadow += np.clip(-dx*.45-dy*.28,-1,1)[:,:,None]*[20,16,12]
    margin = distance_transform_edt(lot, sampling=(2,1))
    hedge = lot & (margin<4.0+1.5*wash)
    meadow[hedge] *= .93
    # Mown grass and stone boundary markers distinguish the roadside lots.
    meadow[outpost] = .55*meadow[outpost] + .45*np.array([207,203,143])
    meadow[hedge & outpost] *= .86
    meadow += (height/48)[:,:,None]*[15,8,1]
    stone = np.array([205,183,146])*(1+.03*wash+.035*fleck)[:,:,None]
    color = meadow.copy()
    path = (road_d<6+.7*wash) & ~lot
    color[path] = stone[path]
    color[(road_d>5)&path] *= .91
    plaza = (plaza_r < 130) & ~lot
    polar = np.arctan2((Y-470)*2,X-635)
    ring = np.floor(plaza_r/12)
    joint = (plaza_r%12<1.7) | (((polar/math.tau*(6+ring*5) + ring*.39)%1)<.055)
    color[plaza] = stone[plaza] * np.where(joint[plaza],.86,1.04)[:,None]
    # A small compass rose inlaid at the meeting of the streets.
    rose = plaza_r < 8 + 15*(.5+.5*np.cos(polar*8))**2
    color[rose] = [166,148,114]
    water_tone = .98 + .038*wash + .030*fleck + .06*np.cos(Y/21 + X/37)
    stream = np.array([92,156,167])*water_tone[:,:,None]
    stream += np.clip(1+river_d/32,0,1)[:,:,None]*[46,33,17]
    color[water] = stream[water]
    shore = (river_d>=0)&(river_d<13)&~lot
    color[shore] = (np.array([168,169,133])*tone[:,:,None])[shore]
    paint = Image.fromarray(np.uint8(np.clip(color,0,255)))
    ink = ImageDraw.Draw(paint)
    for _ in range(20500):
        x,y = rng.integers([0,0],[W,H])
        if not island[y,x]: continue
        if water[y,x]:
            if rng.random()<.31:
                ink.arc((x-3,y-1,x+rng.integers(3,10),y+2), 10,155,fill=(158,204,200))
        elif not path[y,x] and not plaza[y,x]:
            col = [(158,175,111),(205,203,133),(218,210,151),(151,170,105)][rng.integers(4)]
            ink.point((x,y),fill=col)
            if bloom[y,x]>.8 and rng.random()<.6:
                ink.ellipse((x-1,y-1,x+1,y+1),fill=(219,204,145))
                ink.point((x,y-1),fill=(237,224,182))
    # Loose stones and reeds mark the waterline. Small dots pool into drifts of flowers.
    for _ in range(34000):
        x,y = rng.integers([2,2],[W-2,H-2])
        if not island[y,x]: continue
        if -4<river_d[y,x]<7 and not bridge[y,x]:
            w = int(rng.integers(1,4))
            ink.ellipse((x-w,y-1,x+w,y+1),fill=(147,153,132))
            ink.line((x-w,y-1,x,y-1),fill=(209,201,167))
        elif hedge[y,x] and bloom[y,x]+wash[y,x]>-.3:
            for dx,dy in rng.integers(-3,4,(6,2)):
                ink.point((x+int(dx),y+int(dy)),fill=(231,215,168) if dx%2 else (156,172,103))
    fields = np.zeros((H,W),dtype=bool)
    # Hedged strips of cropland at the margins, beyond the buildable parcels.
    for cx,cy,rx,ry in [(530,130,50,20),(1063,226,79,22),(428,624,65,14),(1164,299,42,14)]:
        for y in range((cy-ry-TOP)//2,(cy+ry-TOP)//2+1):
            for x in range((cx-rx-LEFT)//2,(cx+rx-LEFT)//2+1):
                u,v=X[y,x]-cx,Y[y,x]-cy
                if abs(u+.60*v)>rx or abs(v-.14*u)>ry or lot[y,x] or path[y,x] or water[y,x]: continue
                fields[y,x] = True
                furrow = (u*.72+v*.95+1.4*math.sin(v/12))%8
                base = (152,137,91) if furrow<1.6 else (185,170,105) if furrow<3 else (189,181,122)
                if 3<=furrow<5 and (x+y)%3: base=(207,194,133)
                ink.point((x,y), fill=tuple(int(k*tone[y,x]) for k in base))
    for edge in plan['outposts']:
        for x,y in coords(edge)[::2]:
            ink.ellipse((x-2,y-1,x+2,y+2),fill=(131,125,97))
            ink.line((x-1,y-1,x+1,y-1),fill=(228,216,178))
    color = np.array(paint)
    # Each tier is a true plan section. Omit the buried core beyond its possible
    # parallax at the next level; keep enough material to close the cutaway edge.
    atlas = Image.new('RGBA',(4*W,6*H))
    for i,z in enumerate(range(-40,49,4)):
        footprint = island & (rim < 1-max(0,-z-4)*.0009+.002*np.sin(z/8))
        solid = footprint & (height >= z)
        deck = bridge & (z in (-4,0))
        # Stone piers leave daylight below the wooden deck.
        pier = bridge & (((X-785)%48)<9) & (z<0) & (z>=-16)
        top = solid & (height == z)
        side_tone = .99 + .047*wash + .038*fleck + .06*np.sin((X+Y)/68+z/9)
        rock = [147,137,103] if z < -16 else [172,157,117]
        rgb = np.uint8(np.clip(np.array(rock)*side_tone[:,:,None],0,255))
        if z in (-32,-20,-8): rgb = np.uint8(rgb*.92)
        rgb[top] = color[top]
        rgb[pier] = [143,134,110]
        rgb[deck] = [145,113,78] if z==-4 else [193,161,112]
        if z==0:
            seams = deck & (((X-775)%10<2)|(abs(Y-bridge_y)>5.8))
            rgb[seams] = [143,119,86]
        hidden = distance_transform_edt(footprint & (height>z)) > 7
        visible = (solid & ~hidden) | deck | pier
        rgba = np.dstack((rgb,visible.astype('uint8')*255))
        rgba[~visible]=0
        atlas.paste(Image.fromarray(rgba),(i%4*W,i//4*H))
    path_out = GAME/'art'/'town_sections.webp'
    atlas.save(path_out,lossless=True,method=4)
    print(path_out,flush=True)
    bake_views(atlas,plan)
    # Trees stay clear of the roads, parcels, paving and bridge in every view.
    trees=[]
    field_clearance = distance_transform_edt(~fields,sampling=(2,1))
    for _ in range(6600):
        x,y = rng.integers([20,20],[W-20,H-20])
        peripheral = .42<rim[y,x]<.96
        riverside = .23<rim[y,x]<.9 and 16<river_d[y,x]<60
        if not (peripheral or riverside): continue
        if field_clearance[y,x]<8 or near_lot[y,x]<11 or road_d[y,x]<17 or river_d[y,x]<16: continue
        px,py = int(X[y,x]),int(Y[y,x])
        if any(math.hypot(px-a,2*(py-b))<27 for _,a,b,_,_ in trees): continue
        kind=rng.choice(['tree','cypress','blossom'],p=[.54,.34,.12])
        trees.append([kind,px,py,int(height[y,x]),round(rng.uniform(.64,1.23),2)])
        if len(trees)==245: break
    marker = '// Generated by tools/town-terrain.py'
    maps = GAME/'voxel-maps.js'
    maps.write_text(maps.read_text().split(marker)[0].rstrip()+'\n\n'+marker+
                    '\nconst GuildTownGroves = '+json.dumps(trees,separators=(',', ':'))+';\n')


if __name__ == '__main__':
    main()
