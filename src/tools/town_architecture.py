"""Bake illustrated town architecture in the same object space as the terrain stacks."""
from functools import lru_cache
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageOps
from scipy.ndimage import gaussian_filter

GAME = Path(__file__).resolve().parents[1]
TRADES = ('forge', 'shop_armor', 'inn', 'tavern', 'shop_alchemy', 'shop_magic')


@lru_cache(None)
def painting(name):
    if name == 'shop':
        source=Image.open(GAME/'assets/scenery_shop.webp')
        return source.crop(source.getbbox()).resize((300,300),Image.Resampling.LANCZOS)
    if name == 'guild':
        return Image.open(GAME/'art/town-hall.webp').convert('RGBA')
    index = TRADES.index(name)
    source = Image.open(GAME/'art/town-trades.webp')
    x, y = index % 3 * 512, index // 3 * 512
    return source.crop((x, y, x+512, y+512)).resize((300, 300), Image.Resampling.LANCZOS)


def patch(source, corners, size=(144, 112)):
    # Corners follow the illustrated wall from upper left, clockwise.
    quad = sum((corners[i] for i in (0, 3, 2, 1)), ())
    return source.transform(size, Image.Transform.QUAD, quad, Image.Resampling.BICUBIC)


@lru_cache(None)
def pigment(kind, color):
    """Tile lips, broken mortar and paper grain painted once in surface coordinates."""
    base = np.array(tuple(bytes.fromhex(color)))
    rng = np.random.default_rng(int(color, 16))
    size = (168, 96)
    im = Image.new('RGB', size, tuple(base))
    pen = ImageDraw.Draw(im)

    def wash(value):
        return tuple(np.clip(base*value, 0, 255).astype(int))

    if kind in ('roof', 'stone', 'wood'):
        bw, bh = {'roof': (18, 13), 'stone': (31, 17), 'wood': (20, 96)}[kind]
        for row, y in enumerate(range(-2, size[1], bh)):
            for x in range(-bw + row % 2*bw//2, size[0], bw):
                v = rng.uniform(.85, 1.15)
                pen.rectangle((x, y, x+bw, y+bh), fill=wash(v))
                if kind == 'roof':
                    pen.line([(x+1,y+2),(x+2,y+bh-3),(x+bw//2,y+bh),(x+bw-1,y+bh-2)],
                             fill=wash(v*.63), width=2)
                    pen.line([(x+4,y+4),(x+5,y+bh-4),(x+bw//2,y+bh-2)], fill=wash(v*1.18))
                else:
                    pen.line([(x+1,y),(x,y+bh-1),(x+bw,y+bh-1)], fill=wash(v*.72), width=2)
                    pen.line([(x+2,y+1),(x+bw-3,y+1)], fill=wash(v*1.13), width=2)
    noise = rng.normal(0, 1, (size[1], size[0]))
    tint = noise*.027 + gaussian_filter(noise, 2)*.32 + gaussian_filter(noise, 6)*.63
    return Image.fromarray(np.uint8(np.clip(np.array(im)*(1+tint[:,:,None]), 0, 255))).convert('RGBA')


UV = ((0,0), (1,0), (1,1), (0,1))
TRI = ((0,1), (.5,0), (1,1))


class Model:
    def __init__(self):
        self.faces = []

    def face(self, points, texture, uv=UV, tint=1):
        self.faces.append((np.asarray(points, float), np.asarray(texture), np.asarray(uv), tint))

    def block(self, x, y, z, w, d, h, front, side=None, back=None, top=None):
        side = front if side is None else side
        back = side if back is None else back
        edge = [(x-w/2,y+d/2), (x+w/2,y+d/2), (x+w/2,y-d/2), (x-w/2,y-d/2)]
        for i, (tex, shade) in enumerate(zip((front,side,back,side), (1,.92,.85,.95))):
            a,b = edge[i],edge[(i+1)%4]
            self.face([(*a,z+h), (*b,z+h), (*b,z), (*a,z)], tex, tint=shade)
        self.face([(*p,z+h) for p in edge], top if top is not None else side)

    def roof(self, x,y,z,w,d,h,tiles, end, rear=None, across=False):
        # Local ridge runs away from the facade. Rotate the entire roof for a broadside shop.
        def at(u,v,height):
            return (x+v,y-u,z+height) if across else (x+u,y+v,z+height)
        for sign in (-1, 1):
            # A broken bevel along the eave catches the light below the tile course.
            edge=sign*w/2
            middle=edge*.66
            for u1,u2,z1,z2,v1,v2 in [(0,middle,h,h*.29,0,.66),(middle,edge,h*.29,0,.66,1)]:
                self.face([at(u1,-d/2,z1),at(u1,d/2,z1),at(u2,d/2,z2),at(u2,-d/2,z2)],
                          tiles, ((0,v1),(1,v1),(1,v2),(0,v2)), tint=.88 if sign<0 else 1)
            self.face([at(edge,-d/2,0),at(edge,d/2,0),at(edge,d/2,-1.4),at(edge,-d/2,-1.4)],
                      pigment('wood','876547'))
            self.face([at(0,-d/2-.8,h+1),at(0,d/2+.8,h+1),at(sign*1.6,d/2+.8,h-.6),
                       at(sign*1.6,-d/2-.8,h-.6)], tiles, ((0,0),(1,0),(1,.17),(0,.17)), tint=1.13)
            self.face([at(-w/2,sign*d/2,0),at(0,sign*d/2,h),at(w/2,sign*d/2,0)],
                      end if sign==1 or rear is None else rear, TRI)

    def drum(self,x,y,z,r,top,h,texture,n=12, cap=None):
        angles=np.arange(n+1)*math.tau/n
        ring=np.column_stack((np.cos(angles), np.sin(angles)))
        for i,(a,b) in enumerate(zip(ring,ring[1:])):
            def point(p,radius,height):
                return (x+p[0]*radius,y+p[1]*radius,height)
            shade=.87+.14*(a[1]*.8-a[0]*.55)
            u0 = (i*3 % n) / n
            u1 = u0 + 3/n
            self.face([point(a,top,z+h), point(b,top,z+h), point(b,r,z), point(a,r,z)],
                      texture, ((u0,0),(u1,0),(u1,1),(u0,1)), shade)
            if cap is not None:
                self.face([(x,y,z+h),point(a,top,z+h),point(b,top,z+h)],cap,
                          ((.5,.5),tuple(.5+a*.5),tuple(.5+b*.5)))

    def render(self, step):
        # Orthographic z-buffer for eaves, signs, tower and steps intersecting the main volume.
        density=3
        width,height=138*density,153*density
        canvas=np.zeros((height,width,4),np.uint8)
        depth=np.full((height,width), -np.inf)
        a=step*math.tau/16-math.pi/4
        c,s=math.cos(a),math.sin(a)
        for verts,tex,uv,tint in self.faces:
            x,y,z=verts.T
            forward=-s*x+c*y
            screen=np.array([(69+c*x+s*y)*density, (116+.52*forward-z)*density]).T
            distance=forward+.52*z
            for j in range(1,len(verts)-1):
                idx=[0,j,j+1]
                p,q,r=screen[idx]
                ab,ac=q-p,r-p
                det=ab[0]*ac[1]-ac[0]*ab[1]
                if abs(det)<1e-5: continue
                l,t=np.maximum(0,np.floor(np.min(screen[idx],axis=0)).astype(int))
                right,bottom=np.minimum((width,height),np.ceil(np.max(screen[idx],axis=0)).astype(int))
                yy,xx=np.ogrid[t:bottom,l:right]
                dx,dy=xx+.5-p[0],yy+.5-p[1]
                v=(dx*ac[1]-dy*ac[0])/det
                w=(dy*ab[0]-dx*ab[1])/det
                u=1-v-w
                dist=u*distance[0]+v*distance[j]+w*distance[j+1]
                buf=depth[t:bottom,l:right]
                iy,ix=np.where((u>=-1e-6)&(v>=-1e-6)&(w>=-1e-6)&(dist>=buf-1e-6))
                if not len(iy): continue
                coords=(u[iy,ix,None]*uv[0]+v[iy,ix,None]*uv[j]+w[iy,ix,None]*uv[j+1])
                tx,ty=np.rint(coords*(tex.shape[1]-1,tex.shape[0]-1)).astype(int).T
                px=tex[ty.clip(0,tex.shape[0]-1),tx.clip(0,tex.shape[1]-1)].copy()
                solid=px[:,3]>72
                iy,ix,px=iy[solid],ix[solid],px[solid]
                px[:,:3]=np.minimum(255,px[:,:3]*tint)
                canvas[t+iy,l+ix]=px
                buf[iy,ix]=dist[iy,ix]
        return Image.fromarray(canvas).resize((276,306), Image.Resampling.LANCZOS)


# Rectify the illustrated street fronts and window bays onto individual model faces.
# Coordinate pairs are measured on the 300px reference cell, clockwise from top left.
FRONTS = {
    'shop': ((27,139),(170,188),(170,279),(27,234)),
    'forge': ((23,166),(230,167),(230,275),(23,276)),
    'shop_armor': ((23,151),(192,158),(192,287),(23,270)),
    'inn': ((22,118),(212,124),(212,286),(23,272)),
    'tavern': ((49,143),(212,152),(212,267),(48,259)),
    'shop_alchemy': ((26,132),(226,137),(226,276),(26,264)),
    'shop_magic': ((47,152),(205,157),(205,279),(47,267)),
}
SIDES = {
    'shop': ((181,179),(263,122),(263,204),(181,271)),
    'forge': ((234,167),(273,163),(273,253),(234,273)),
    'shop_armor': ((195,161),(263,134),(263,245),(195,283)),
    'inn': ((215,125),(275,100),(275,254),(215,284)),
    'tavern': ((213,155),(267,132),(267,233),(213,264)),
    'shop_alchemy': ((229,140),(272,122),(272,250),(229,271)),
    'shop_magic': ((208,159),(269,133),(269,245),(208,276)),
}
COLORS = dict(forge='706c81',shop_armor='477b73',shop='879264',inn='5e6490',tavern='a45253',
              shop_alchemy='82915e',shop_magic='846199')
WOOD = '97724e'
STONE = 'cdb997'


def barrel(m,x,y,z,r,h):
    staves=pigment('wood','aa7446')
    dark=pigment('plain','655b50')
    m.drum(x,y,z,r*.84,r,h*.23,staves)
    m.drum(x,y,z+h*.23,r,r,h*.50,staves)
    m.drum(x,y,z+h*.73,r,r*.84,h*.27,staves,cap=pigment('wood','b18b5f'))
    for level in (.20,.72):
        m.drum(x,y,z+h*level,r+.22,r+.22,1,dark)


@lru_cache(None)
def timber_gable():
    im=pigment('plain','e3c897').resize((160,96))
    pen=ImageDraw.Draw(im)
    for a,b in [((2,94),(80,2)),((80,2),(158,94)),((80,3),(80,96)),
                ((5,87),(156,87)),((40,52),(40,95)),((120,52),(120,95))]:
        pen.line((a,b),fill='#765235',width=6)
        pen.line((a,(b[0]+1,b[1])),fill='#ab8556',width=2)
    pen.ellipse((66,47,94,76), fill='#835d3f',outline='#b18c5e',width=3)
    pen.ellipse((71,52,89,71), fill='#ffd892')
    pen.line((80,51,80,72),fill='#896544',width=3)
    pen.line((70,61,90,61),fill='#896544',width=2)
    return im


def trade_model(name):
    m=Model()
    art=painting(name)
    front,side=patch(art,FRONTS[name]),patch(art,SIDES[name])
    w,d,h=(54,42,39) if name=='inn' else (49,38,28)
    masonry=pigment('stone',STONE)
    wood=pigment('wood',WOOD)
    m.block(0,0,0,w+2,d+2,3,masonry)
    m.block(0,0,3,w,d,h-3,front,side)
    tiles=pigment('roof',COLORS[name])
    gable_box={'shop':(20,79,176,180),'shop_armor':(17,42,196,159),'shop_alchemy':(19,65,234,134),
               'shop_magic':(36,65,225,155)}
    narrow=name in gable_box
    gable=art.crop(gable_box[name]) if narrow else timber_gable()
    m.roof(0,0,h,w+5 if narrow else d+6,d+5 if narrow else w+6,
           23 if narrow else 17,tiles,gable,timber_gable(),across=not narrow)
    for i in range(2):
        m.block(0,d/2+1+i*2,1-i,16-i*1.7,4,2-i*.5,masonry)

    if name=='forge':
        m.block(14,4,h-2,10,11,30,pigment('stone','ac7152'))
        m.block(14,4,h+27,12,13,4,pigment('stone','bb8566'),top=pigment('plain','514944'))
        smoke=art.crop((159,1,241,57))
        m.face([(11,4,h+45),(29,4,h+45),(29,4,h+30),(11,4,h+30)],smoke)
        m.block(-11,d/2+4,0,6,5,4,wood)
        m.block(-11,d/2+4,4,11,5,3,pigment('plain','746e6b'))
    elif name=='inn':
        for x in (-13,13):
            dormer=art.crop((54,73,90,110))
            m.block(x,9,h+5,10,9,7,dormer,wood)
            m.roof(x,9,h+12,14,12,8,tiles,wood)
        m.block(20,-10,h+4,6,7,18,masonry)
        m.block(20,-10,h+21,8,8,2,wood)
        # The crescent sign hangs perpendicular to the street wall.
        sign=art.crop((90,158,127,215))
        m.block(-19,d/2+5,25,1.3,12,2,wood)
        m.block(-19,d/2+9,13,1.4,8,12,wood,sign)
    elif name=='tavern':
        for x,y in [(-20,d/2+3),(-12,d/2+5),(w/2+2,9)]:
            barrel(m,x,y,0,4,9)
        # Horizontal roof cask: the two circular heads and the stave shell share a pivot.
        head=art.crop((86,18,165,104))
        radius=7.5
        for i in range(16):
            a,b=np.array([i,i+1])*math.tau/16
            def point(angle,y):
                return (radius*math.cos(angle),y,h+20+radius*math.sin(angle))
            m.face([point(a,-6),point(b,-6),point(b,8),point(a,8)],wood)
            for y in (-6,8):
                uv=lambda t:(.5+.5*math.cos(t),.5-.5*math.sin(t))
                m.face([(0,y,h+20),point(a,y),point(b,y)],head,((.5,.5),uv(a),uv(b)))
    elif name in ('shop','shop_armor'):
        # Shield and armour occupy the gable and the stall below its striped awning.
        awning=(patch(art,((34,124),(169,174),(155,195),(20,148)))
                if name=='shop' else art.crop((24,176,119,197)))
        m.face([(-w/2,d/2,21),(1,d/2,21),(1,d/2+7,17),(-w/2,d/2+7,17)],awning)
        for x in (-w/2,0):
            m.block(x,d/2+6,0,1.4,1.4,18,wood)
    elif name=='shop_alchemy':
        glass=pigment('plain','62b8a4')
        m.drum(0,12,h+19,2,5,4,glass)
        m.drum(0,12,h+23,5,1.8,6,glass)
        m.drum(0,12,h+29,1.8,1.8,3,pigment('plain','dcae5c'))
    elif name=='shop_magic':
        for x,y,r,hue in [(-4,13,3,'78d4c9'),(3,15,3,'4baea8'),(0,12,4,'77e2d8')]:
            m.drum(x,y,h+20,1,r,5,pigment('plain',hue),6)
            m.drum(x,y,h+25,r,.2,7 if x else 11,pigment('plain',hue),6)
    door=painting('inn').crop((86,215,132,271))
    m.block(-8,-d/2-.5,2,10,1.5,15,wood,wood,door)
    m.roof(-8,-d/2-1,17,14,7,3.5,tiles,timber_gable())
    for x in (-15,-1):
        m.block(x,-d/2-3,0,1.3,1.5,16,wood)
    for x,y,reach in [(-w/2+4,-d/2,6),(w/2,6,6),(-w/2,d/2-2,5)]:
        garden(m,x,y,reach)
    return m


@lru_cache(None)
def garden_brush():
    rng=np.random.default_rng(475)
    im=Image.new('RGBA',(64,44))
    d=ImageDraw.Draw(im)
    for i in range(170):
        x=rng.uniform(3,60)
        y=35-20*math.sin(x*math.pi/64)+rng.uniform(-9,8)
        shade=rng.choice(['#626d40','#79834a','#a4a65b','#97a252','#bac474'])
        d.line((x+1,41,x,y),fill='#899054',width=1)
        d.ellipse((x-2,y-2,x+2,y+1), fill=shade)
        if i%7==0:
            d.ellipse((x-2,y-2,x+2,y+1),fill='#f4cf9c' if i%3 else '#e8a4a5')
    return im


def garden(m,x,y,r):
    brush=garden_brush()
    for dx,dy in [(r,r*.25),(-r*.34,r)]:
        m.face([(x-dx,y-dy,r*1.4),(x+dx,y+dy,r*1.4),(x+dx,y+dy,0),(x-dx,y-dy,0)],brush)


def guild_model():
    m=Model()
    art=painting('guild')
    stone=pigment('stone','d6c4a2')
    pale=pigment('plain','ead8b4')
    gold=pigment('plain','d49e42')
    tiles=pigment('roof','c9764d')
    side=patch(art,((285,283),(331,254),(331,345),(285,375)))
    portal=patch(art,((117,198),(238,238),(238,396),(117,359)))
    wing=patch(art,((58,217),(114,237),(114,352),(58,332)))
    gable=art.crop((114,135,237,242))
    m.block(0,0,0,79,49,4,stone)
    for x in (-27,26):
        m.block(x,0,4,22,46,28,wing,side)
        m.roof(x,0,32,26,51,16,tiles,stone)
    m.block(-2,-1,4,36,54,44,portal,side)
    m.roof(-2,-1,48,40,58,23,tiles,gable,stone)
    # Stone entrance screen rises proud of the nave roof. Its heraldic panel
    # and the tracery above the doors are taken from the painted hall itself.
    m.block(-2,27,4,38,4,44,portal,stone)
    m.roof(-2,27,48,39,5,22,stone,gable,stone)
    for x,top in [(-21,51),(-13,60),(-2,71),(9,60),(17,51)]:
        m.block(x,28,top-6,2.4,3,7,pale)
        m.drum(x,28,top+1,2.1,.5,4,stone,6)
        m.drum(x,28,top+5,1,.2,2,gold,6)
    for i in range(4):
        m.block(-2,36-i*2.3,i*1.3,28-i,5,1.5,stone,top=pale)

    tower=patch(art,((325,177),(360,185),(360,307),(325,292)))
    for x,y,r,eaves in [(24,-12,10,62),(-29,-14,7,42)]:
        m.drum(x,y,3,r,r,eaves-3,tower)
        for level in (7,30,eaves-4):
            m.drum(x,y,level,r+.8,r+1,2,stone)
        m.drum(x,y,eaves-2,r+1,r+2,3,pale)
        m.drum(x,y,eaves,r+4,3,16,tiles)
        m.drum(x,y,eaves+16,3,.8,7,tiles)
        m.drum(x,y,eaves+22,1.5,.8,3,gold)
    # Keep this pole exactly on the runtime pivot of the player's own standard.
    m.drum(24,-12,84,.85,.78,13,gold,8)
    m.drum(24,-12,96,1.7,.5,2.4,gold,8)
    for x,y in [(-34,23),(26,24),(-34,-22),(34,-17),(14,-29)]:
        garden(m,x,y,7)
    return m


def specialty_stamps():
    # Keep the same logical ground contact and width as the painted general store.
    for name in ('shop_armor','shop_alchemy','shop_magic'):
        art=painting(name)
        bounds=art.getchannel('A').point(lambda a: 255 if a>32 else 0).getbbox()
        art=art.crop(bounds)
        art=art.resize((164,round(164*art.height/art.width)),Image.Resampling.LANCZOS)
        stamp=Image.new('RGBA',(276,306))
        stamp.paste(art,((stamp.width-art.width)//2,270-art.height))
        path=GAME/'assets'/f'scenery_{name}.webp'
        stamp.save(path,quality=94,method=5)
        print(path,flush=True)


def grove_frames(name):
    """Place painted leaf clusters on a branching crown that turns in world space."""
    cypress = name == 'cypress'
    blossom = name == 'blossom'
    rng = np.random.default_rng({'tree': 465, 'blossom': 744, 'cypress': 237}[name])
    bark = (108, 82, 53, 255)
    clusters, branches = [], [((0,0,0),(-1,0,29),2.9)]
    if cypress:
        for i in range(80):
            z = 10+i*.52
            radius = 6.9*math.sin(((z-7)/49)**.64*math.pi)
            a = i*2.4
            clusters.append((radius*math.cos(a),radius*math.sin(a),z, max(1.6,radius*.68), 1.7))
    else:
        for i in range(17):
            a = i*2.4
            radius = 15*math.sqrt((i+.5)/17)
            x,y = radius*math.cos(a),radius*math.sin(a)
            z = 42-radius*.72+rng.uniform(-3,3)
            elbow=(x*.48-1,y*.48,z*.71)
            branches.extend([((-.4,0,9+i%6),elbow,1.8),(elbow,(x,y,z),1.05)])
            for _ in range(5):
                clusters.append((x+rng.uniform(-4,4),y+rng.uniform(-4,4),
                                 z+rng.uniform(-2,3),rng.uniform(3.7,6.4),.8))

    source=Image.open(GAME/'assets'/('scenery_cypress.webp' if cypress else 'scenery_tree.webp'))
    source=source.crop(source.getbbox()).resize((160,180),Image.Resampling.LANCZOS)
    if blossom:
        pink=ImageOps.colorize(ImageOps.grayscale(source), '#7e5d61', '#ffefdc', mid='#daa5ac')
        pink.putalpha(source.getchannel('A'))
        source=pink
    # Lift individual sprays from the original painting. An irregular translucent
    # edge lets the lit leaves overlap the shaded ones without an oval cut line.
    brushes=[]
    for i in range(6):
        if cypress:
            brush=source.crop((48+i%3*5,3+i%2*6,106+i%3*5,94+i%2*6))
        else:
            x,y=[(8,33),(45,6),(87,20),(83,48),(29,36),(43,48)][i]
            brush=source.crop((x,y,x+54,y+46))
        w,h=brush.size
        yy,xx=np.mgrid[0:h,0:w]
        u,v=(xx+.5-w/2)/(w/2),(yy+.5-h/2)/(h/2)
        theta=np.arctan2(v,u)
        edge=.92+.055*np.sin(theta*9+i*2)+.045*np.cos(theta*14-i)
        mask=np.uint8(np.clip((edge-np.hypot(u,v))*5+rng.uniform(-.22,.22,(h,w)),0,1)*255)
        brush.putalpha(ImageChops.multiply(brush.getchannel('A'),Image.fromarray(mask)))
        brushes.append(brush)
    sprays=[]
    for i,(x,y,z,r,stretch) in enumerate(clusters):
        brush=brushes[i%len(brushes)]
        shade=.90+.12*np.clip((z-28)/12-x/22,-1,1)
        rgb=np.array(brush)
        rgb[:,:,:3]=np.minimum(255,rgb[:,:,:3]*shade)
        size=max(5,round(r*8))
        sprays.append((x,y,z,Image.fromarray(rgb).resize((size,round(size*stretch)),Image.Resampling.LANCZOS)))
    roots=[(math.cos(i*2.4)*r,math.sin(i*2.4)*r) for i,r in enumerate((6,4,5,7,4))]
    grass=[(rng.uniform(-6,6),rng.uniform(-4,4),rng.uniform(.8,2.8)) for _ in range(36)]

    for step in range(16):
        a=step*math.tau/16-math.pi/4
        c,s=math.cos(a),math.sin(a)
        def point(x,y,z):
            return ((69+c*x+s*y)*3,(116+.52*(-s*x+c*y)-z)*3)
        frame=Image.new('RGBA',(138*3,153*3))
        pen=ImageDraw.Draw(frame)
        for i,(x,y,h) in enumerate(grass):
            u,v=point(x,y,0)
            pen.line((u,v,u+1,v-h*3),fill=('#929159','#afb471','#b8a56d')[i%3],width=2)
        def limb(start,end,r1,r2):
            u,v=point(*start)
            x,y=point(*end)
            length=max(1,math.hypot(x-u,y-v))
            dx,dy=(v-y)/length,(x-u)/length
            def edge(r,px,py):
                return (px+r*dx*3,py+r*dy*3)
            pen.polygon((edge(-r1,u,v),edge(r1,u,v),edge(r2,x,y),edge(-r2,x,y)),fill=bark)
            pen.line((edge(r1*.42,u,v),edge(r2*.42,x,y)),fill='#b5996a',width=max(1,round(r1)))
        for x,y in roots:
            limb((-.4,0,5),(x,y,.4),1.9,.24)
        for start,end,r in branches:
            limb(start,end,r,r*.55)
        for x,y,z,brush in sorted(sprays,key=lambda row:-s*row[0]+c*row[1]+.52*row[2]):
            u,v=point(x,y,z)
            frame.alpha_composite(brush,(round(u-brush.width/2),round(v-brush.height/2)))
        yield frame.resize((276,306),Image.Resampling.LANCZOS)


def village_model(name):
    """Project the painted masonry courses and carpentry around each structure."""
    m=Model()
    art=Image.open(GAME/'assets'/f'scenery_{name}.webp')
    bounds=art.getchannel('A').point(lambda v: 255 if v>40 else 0).getbbox()
    art=art.crop(bounds).resize((240,220),Image.Resampling.LANCZOS)
    stone=pigment('stone','c6b695')
    wood=pigment('wood','ab8159')
    dark=pigment('wood','805f42')
    gold=pigment('plain','d8ad60')
    if name=='well':
        water=pigment('plain','534f43')
        curb=patch(art,((58,159),(130,170),(131,194),(57,181)))
        m.drum(0,0,0,13,13,10,curb,12,stone)
        m.drum(0,0,10,14,14,2,stone,12,stone)
        m.drum(0,0,12,10.5,10.5,.1,water,12,water)
        for x in (-13,13):
            m.block(x,0,0,3,4,28,wood)
        m.block(0,0,19,30,2,2,dark)
        m.block(16,0,16,2,2,5,wood)
        m.block(17,0,16,5,2,1.7,dark)
        m.block(2,0,10,.8,.8,10,wood)
        barrel(m,2,0,9,3.4,5)
        m.roof(0,0,27,27,37,10,pigment('roof','c57f50'),wood,across=True)
        garden(m,-11,7,5)
    elif name=='watch':
        m.block(0,0,0,34,34,2,stone)
        for x in (-13,13):
            for y in (-13,13):
                m.block(x,y,1,3,3,46,wood)
        for level in (21,33):
            m.block(0,0,level,34,34,3,dark)
        flag=art.crop((146,103,163,148))
        for sign in (-1,1):
            for z in (38,43):
                m.block(0,sign*14,z,31,1.8,2,wood)
                m.block(sign*14,0,z,1.8,31,2,wood)
            m.block(sign*14,3,15,1,7,14,dark,flag)
        for x in (-4,4):
            m.block(x,17,0,1.5,2,33,wood)
        for z in range(3,33,4):
            m.block(0,17,z,9,2,1.2,wood)
        # A hipped roof with a gold finial, matching the square look-out deck.
        tiles=pigment('roof','bb734e')
        ring=[(-21,21),(21,21),(21,-21),(-21,-21)]
        for i,(x,y) in enumerate(ring):
            nx,ny=ring[(i+1)%4]
            m.face([(x,y,46),(0,0,64),(nx,ny,46)],tiles,TRI,tint=1-.06*(i%3))
        m.drum(0,0,63,2,.6,4,gold,8)
        garden(m,-12,-13,4)
    else:
        magic=name=='magic'
        masonry=art.crop((63,116,96,150)) if magic else art.crop((133,115,190,158))
        m.drum(0,0,0,18,17,5,stone)
        m.drum(0,0,5,16,13,32,masonry)
        m.drum(0,0,35,14,17,6,stone)
        m.drum(0,0,41,17,17,5,masonry,cap=stone)
        door=art.crop((68,171,105,207) if magic else (65,165,103,200))
        m.block(0,15,1,9,2,13,door,stone)
        if magic:
            roof=pigment('roof','9575a1')
            m.drum(0,0,46,19,8,14,roof)
            m.drum(0,0,60,8,2,12,roof)
            m.drum(0,0,72,3,2,3,gold,8)
            gem=pigment('plain','70c6ce')
            m.drum(0,0,75,1.2,4.2,5,gem,6)
            m.drum(0,0,80,4.2,.2,8,gem,6)
            for x,y in [(-11,6),(9,-7)]:
                m.drum(x,y,39,4,4,8,masonry)
                m.drum(x,y,47,5,.4,9,roof)
        else:
            for i in range(12):
                a=i*math.tau/12
                m.block(15*math.cos(a),15*math.sin(a),45,4.4,4.4,5,stone)
            m.drum(0,0,45,1,1,18,wood,8)
            flag=art.crop((128,3,166,20))
            m.face([(0,0,63),(12,-1,63),(12,-1,57),(0,0,56)],flag)
        for x,y in [(10,10),(-11,9),(10,-11)]:
            garden(m,x,y,6)
    return m
