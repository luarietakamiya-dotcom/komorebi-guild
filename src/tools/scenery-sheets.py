"""Author 96px horizontal sections; bake the game stamp and four proof views from each sheet."""
import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter
from scenery_masks import FRAME, alpha_runs, write_masks

GAME = Path(__file__).resolve().parents[1]
CELL = 96
Z, Y, X = np.ogrid[:112, -48:48, -48:48]
MATERIALS = dict(timber="815435", oak="b7864e", bark="80613e", plaster="efdbac",
                 stone="b6aa8c", shale="83887e", tile="c77148", slate="617f82",
                 wine="995446", teal="48877e", violet="827496", ink="493e36",
                 gold="e6b961", glass="ffe6a1", iron="687274", green="73904e",
                 moss="99a661", leaf="92a44f", petal="d997ac", cream="fff0ba",
                 water="6ab4a6", crystal="79d6cf", soil="856244", carrot="efaa50")
NAMES = list(MATERIALS)
IDS = {name: i + 1 for i, name in enumerate(NAMES)}
TOWN = ['tree','guild','forge','inn','tavern','shop','school','bow','watch','magic',
        'wall','lamp','bench','well','farm','fence','flowers','cypress']
DUNGEON = ['pillar','crystal','chest','spring','arch','ruin','fern','rubble','torch']


class Sculpture:
    def __init__(self, seed):
        self.mat = np.zeros((112, CELL, CELL), np.uint8)
        self.rng = np.random.default_rng(seed)

    def fill(self, mask, material):
        np.copyto(self.mat, IDS[material], where=mask)

    def box(self, x, y, z, w, d, h, material):
        self.fill((abs(X-x) <= w/2) & (abs(Y-y) <= d/2) & (Z >= z) & (Z < z+h), material)

    def oval(self, x, y, z, a, b, c, material):
        self.fill(((X-x)/a)**2 + ((Y-y)/b)**2 + ((Z-z)/c)**2 <= 1, material)

    def rod(self, start, end, radius, material, tip=None):
        x,y,z = start
        dx,dy,dz = np.subtract(end,start)
        t = np.clip(((X-x)*dx + (Y-y)*dy + (Z-z)*dz)/(dx*dx+dy*dy+dz*dz), 0, 1)
        r = radius if tip is None else radius + (tip-radius)*t
        self.fill((X-x-dx*t)**2+(Y-y-dy*t)**2+(Z-z-dz*t)**2 <= r*r, material)

    def drum(self, x, y, z, r, height, material, top=None, sides=48):
        a = np.arctan2(Y-y, X-x)
        radial = np.hypot(X-x,Y-y)*np.cos((a+math.pi/sides)%(2*math.pi/sides)-math.pi/sides)
        radius = r if top is None else r+(top-r)*(Z-z)/height
        self.fill((radial <= radius) & (Z >= z) & (Z < z+height), material)

    def roof(self, x, y, z, w, d, h, material, cross=False):
        # Curved eaves, scalloped tile courses, a ridge cap and exposed gable timbers.
        run, span = (Y-y,X-x) if cross else (X-x,Y-y)
        slope = 1-abs(span)/(d/2)
        top = z + h*np.maximum(0,slope)**1.26
        self.fill((abs(run)<w/2-3)&(abs(span)<d/2-3)&(Z>=z-2)&(Z<top), 'plaster')
        shell = (abs(run)<w/2)&(slope>=0)&(Z<=top+1)&(Z>=top-2)
        self.fill(shell, material)
        self.fill(shell & (abs(run)>w/2-2), 'oak')
        self.fill((abs(run)<w/2+1)&(abs(span)<1.7)&(abs(Z-z-h)<1.8), 'gold' if material=='violet' else 'tile')


def flag(s,x,y,z,cloth):
    s.rod((x,y,z),(x,y,z+15),1.35,'oak')
    s.oval(x,y,z+16,1.5,1.5,1.7,'gold')
    wave = y+1.7*np.sin((X-x)*.55)
    s.fill((X>x)&(X<x+13)&(abs(Y-wave)<1.1)&(Z<z+15)&(Z>z+7+(X-x)*.26),cloth)


def window(s,x,y,z,side=False):
    def pane(at,level,w,h,mat):
        if side: s.box(x+at,y,level,2,w,h,mat)
        else: s.box(x,y+at,level,w,2,h,mat)
    pane(0,z,8,12,'timber'); pane(1,z+1,6,9,'glass')
    pane(2,z+5,7,1,'oak'); pane(2,z+1,1,9,'oak'); pane(2,z-1,10,2,'stone')


def house(s, kind):
    guild = kind == 'guild'
    w,d = (60,43) if guild else (48,36)
    h = 34 if guild else 27
    roof = dict(guild='tile',forge='slate',inn='tile',tavern='wine',shop='teal')[kind]
    s.box(0,0,0,w+4,d+4,5,'stone'); s.box(0,0,4,w,d,h-4,'plaster')
    for x in (-w/2, 0, w/2):
        for y in (-d/2,d/2): s.box(x,y,4,2,3,h-3,'timber')
    for level in (6,h-8,h-1):
        s.box(0,0,level,w+2,d+2,2,'oak')
    for side in (-1,1):
        for x in (-w*.29,w*.29):
            window(s,x,side*d/2,10)
        window(s,w/2,side*d*.25,10,True)
        s.rod((side*w/2,d/2, h-2),(side*(w/2-8),d/2,h-9),1.3,'timber')
    s.roof(0,0,h,w+10,d+11,19 if guild else 16,roof)
    # Arched front door, brass furniture, porch steps and a projecting gable.
    front = d/2
    for offset,material,r in [(0,'stone',7),(1,'timber',5)]:
        s.box(0,front+offset,3,r*2,2,12,material)
        s.oval(0,front+offset,15,r,2,r,material)
    s.oval(3,front+3,10,1.3,1,1.3,'gold')
    for i in range(3): s.box(0,front+3+i*2,0,17-i,5,4-i,'stone')
    s.roof(0,front-1,h-3,18,24,11,roof,True)
    for side in (-1,1):
        # Exposed timbers on both triangular gable ends.
        end = side*(w/2+3)
        for a in (-1,1):
            s.rod((end,0,h+15),(end,a*(d/2-3),h+1),1.4,'oak')
        s.rod((end,0,h),(end,0,h+15),1.2,'timber')
        s.oval(end+side,0,h+6,1.4,3.7,3.7,'timber')
        s.oval(end+2*side,0,h+6,.9,2.5,2.5,'glass')
    if guild:
        s.drum(-17,-9,h,9,25,'plaster',sides=8)
        s.drum(-17,-9,h+24,12,16,'slate',1,8)
        flag(s,-17,-9,h+40,'teal')
        # The guild crest is inlaid in the gable above a twin-pillared entrance.
        for x in (-10,10):
            s.box(x,front+7,0,5,5,4,'stone')
            s.box(x,front+7,4,3,3,h-7,'timber')
            s.rod((x,front+8,h-5),(x*.52,front+8,h),1.3,'oak')
        s.oval(0,front+8,h+2,4,1.6,4,'gold')
        s.oval(0,front+9,h+2,2.4,1.4,2.4,'teal')
        s.box(0,front+8,24,8,1,6,'teal')
        s.oval(0,front+9,27,1.8,1,2.4,'gold')
    elif kind == 'forge':
        s.box(-15,-7,20,9,10,39,'shale'); s.box(-15,-7,57,12,13,4,'stone')
        s.box(-15,-7,60,7,8,1,'ink')
        for x in (-20,20): s.box(x,front+12,0,3,3,21,'timber')
        s.fill((abs(X)<23)&(Y>=front)&(Y<front+15)&(abs(Z-24+(Y-front)*.34)<1.4),'slate')
        s.drum(-13,front+6,0,9,13,'shale')
        s.oval(-13,front+13,6,6,3,5,'ink')
        s.oval(-13,front+15,5,4,2,3,'carrot');s.oval(-13,front+16,4,2,2,2,'glass')
        s.box(19,front+5,0,7,7,6,'timber'); s.box(19,front+5,6,13,6,3,'iron')
    elif kind == 'shop':
        for i in range(7):
            mat = 'cream' if i%2 else 'teal'
            s.rod((-12+i*4,front,23),(-12+i*4,front+12,17),2.7,mat)
        for x in (-13,13): s.box(x,front+12,0,2,2,18,'oak')
        s.box(0,front+10,3,27,6,5,'oak')
        for i in range(9): s.oval(i*3-12,front+10,9,2,2,2,'carrot' if i<5 else 'leaf')
    else:
        s.box(18,front+3,21,2,10,2,'timber')
        s.box(18,front+7,13,7,2,7,'teal' if kind=='inn' else 'gold')
        s.oval(18,front+9,16,2,1,2,'cream')
        if kind=='tavern':
            for x in (-19,-10):
                s.oval(x,front+5,5,5,5,7,'oak')
                for z in (2,8): s.drum(x,front+5,z,5,1,'iron')
        else:
            s.roof(-12,8,h+6,16,17,10,'tile',True)
            s.box(-12,15,h+4,5,2,5,'timber')
            s.box(-12,16,h+5,3,1,3,'glass')
            for x in (11,20):
                s.rod((x,front+5,19),(x,front+5,14),.8,'oak')
                s.oval(x,front+5,13,2.5,2.5,3.5,'gold')
    for x in (-w/2+3,w/2-3):
        s.box(x,front+2,3,7,4,3,'oak')
        for j in range(5):
            s.oval(x+s.rng.uniform(-4,4),front+2+s.rng.uniform(-2,2),7,2,2,2,'petal' if j%2 else 'green')


def world_tree(s):
    rng = s.rng
    s.rod((0,0,2),(-2,0,44),8,'bark',4)
    for i in range(11):
        a = i*2.4
        x,y = np.cos(a), np.sin(a)
        s.rod((0,0,12),(x*20,y*18,0),5,'bark',1)
        h = rng.uniform(48,61)
        s.rod((-2,0,24+i%5),(18*x,17*y,h-9),4,'bark',2.5)
        s.rod((18*x,17*y,h-9),(28*x,25*y,h+2),2.5,'oak',1)
    # Overlapping foliage lobes; leaf tips and tiny warm blossoms follow each crown.
    for i in range(58):
        a = i*2.4
        r = 32*np.sqrt((i+.5)/58)
        x,y = r*np.cos(a)*1.10,r*np.sin(a)*.9
        z = 72-.44*r + 4*np.cos(a*3)+rng.uniform(-4,4)
        s.oval(x,y,z,10,9,7,'green' if i%4==0 else 'leaf')
        for j in range(7):
            dx,dy = rng.uniform(-7,7,2)
            s.oval(x+dx,y+dy,z+rng.uniform(2,6),3,2.6,2.4,'moss' if j%3 else 'leaf')
        if i%4==0: s.oval(x-4,y+4,z+5,1.6,1.5,1.4,'cream')

    for x,y,z in [(-26,4,54),(17,19,52),(28,-8,55),(-7,23,53)]:
        for i in range(4):
            s.rod((x+i*1.4,y,z),(x+i*1.4-2,y+1,z-6-i%3),1.3,'green',.6)
        s.rod((x,y,z-5),(x,y,z-14),.75,'oak')
        s.oval(x,y,z-15,2,2,2.8,'gold')
    for x,y in [(-10,4),(7,3),(0,-9)]:
        s.oval(x,y,1,7,5,2,'moss')


def tower(s, kind):
    if kind=='watch':
        for x in (-13,13):
            for y in (-13,13): s.rod((x*1.2,y*1.2,1),(x,y,45),2.5,'timber')
        for y in (-13,13):
            for a in (-1,1): s.rod((a*14,y,7),(-a*13,y,30),1.4,'oak')
        s.box(0,0,32,35,35,4,'oak')
        for x in (-15,15):
            for y in (-15,15): s.box(x,y,34,2,2,14,'timber')
        for z in (38,42): s.box(0,15,z,32,2,1,'oak')
        for z in range(3,33,4): s.box(0,16,z,8,2,1,'oak')
        for x in (-5,5): s.box(x,16,0,2,2,34,'oak')
        s.roof(0,0,47,39,38,16,'tile')
        return
    for z,r,h,top,mat in [(0,18,4,18,'shale'),(4,17,4,14,'stone'),(8,14,32,12,'stone'),
                          (40,13,5,16,'oak'),(44,17,4,17,'stone')]:
        s.drum(0,0,z,r,h,mat,top,12)
    for x,y in [(0,14),(13,0),(-13,0),(0,-13)]:
        s.box(x,y,22,3,3,8,'ink')
    if kind=='magic':
        s.drum(0,0,48,18,26,'violet',2,8)
        s.drum(0,0,73,3,3,'gold')
        s.drum(0,0,76,2,6,'crystal',5,5); s.drum(0,0,82,5,8,'crystal',0,5)
    else:
        for i in range(10):
            a = i*math.tau/10
            s.drum(14*np.cos(a),14*np.sin(a),47,3.5,5,'stone',sides=6)
        flag(s,-4,-3,47,'wine')
        s.box(0,14,26,7,1,12,'wine');s.box(0,15,30,1,1,5,'gold')


def small(s, k):
    if k=='cypress':
        s.rod((0,0,0),(0,0,41),3,'bark',1)
        for i in range(59):
            z=s.rng.uniform(9,48)
            rad=(52-z)*.3
            a=i*2.4
            s.oval(rad*.67*np.cos(a),rad*.67*np.sin(a),z,rad*.53+1,rad*.49+1,5,
                   'green' if i%4 else 'moss')
    elif k in ('wall','ruin'):
        length = 46 if k=='wall' else 37
        s.box(0,0,0,length,12,22,'stone' if k=='wall' else 'shale')
        for x in range(-length//2+2,length//2,7):
            h = 5 if k=='wall' else int(s.rng.integers(-4,5))
            s.box(x,0,17,6,13,5+h,'stone')
            if k=='ruin':
                s.oval(x,0,21+h,5.5,8,2.7,'moss')
                s.rod((x,6,22+h),(x-2,7,13+h),1.5,'green')
        if k=='wall':
            for x in (-22,22):
                s.drum(x,0,0,9,27,'shale',sides=8); s.drum(x,0,26,11,4,'stone',sides=8)
    elif k=='school':
        s.box(0,0,0,49,44,2,'soil')
        for x in (-13,12):
            s.rod((x,0,2),(x,0,32),2,'oak')
            for y,r,mat in [(0,10,'oak'),(2,8,'cream'),(3,5,'wine'),(4,2,'gold')]:
                s.oval(x,y,25,r,2,r,mat)
        for x in (-10,-2,6):
            s.rod((x,15,2),(x+3,15,18),1.3,'iron')
            s.box(x+2,15,14,6,2,1,'gold')
        s.box(-2,15,7,28,3,2,'oak')
    elif k in ('bench','fence'):
        for x in (-13,13):
            s.box(x,-4,0,3,3,16,'timber')
            if k=='bench': s.box(x,5,0,3,3,8,'timber')
        if k=='bench':
            for y in (-3,1,5): s.box(0,y,7,34,3,2,'oak')
        for z in (5,12) if k=='fence' else (12,16): s.box(0,-4,z,34,2,3,'oak')
    elif k in ('lamp','torch'):
        s.drum(0,0,0,6,3,'stone',5,8); s.drum(0,0,3,3,3,'iron',2,8)
        s.drum(0,0,5,1.8,24,'timber',1.3,8); s.drum(0,0,28,4,3,'gold',5,4)
        if k=='lamp':
            s.drum(0,0,31,4,8,'glass',5,4)
            for a in range(4):
                x,y=4*np.cos(a*math.pi/2),4*np.sin(a*math.pi/2)
                s.rod((x,y,30),(x*1.25,y*1.25,39),.8,'iron')
            s.drum(0,0,39,7,5,'teal',0,4); s.oval(0,0,45,1,1,2,'gold')
        else:
            s.oval(0,0,33,4,4,6,'carrot'); s.rod((0,1,31),(2,0,40),2.4,'glass',.7)
    elif k=='well':
        s.drum(0,0,0,13,11,'stone',sides=14)
        s.drum(0,0,9,10,4,'water')
        for x in (-13,13): s.box(x,0,0,3,4,28,'timber')
        s.rod((-13,1,16),(13,1,16),2,'oak');s.rod((2,1,11),(2,1,17),1,'gold')
        s.roof(0,0,26,34,25,9,'tile')
    elif k=='farm':
        s.box(0,0,0,63,63,2,'soil')
        for x in (-17,15):
            s.oval(x,0,2,8,30,3,'bark')
            for y in (-19,0,19):
                s.oval(x,y,6,5.5,5.5,4.5,'carrot' if x<0 else 'moss')
                for a in (0,2,4):
                    s.rod((x,y,6),(x+8*np.cos(a),y+7*np.sin(a),14),3,'leaf',1)
    elif k in ('flowers','fern'):
        for i in range(28):
            x,y=s.rng.uniform(-12,12,2); h=s.rng.uniform(5,13)
            s.rod((x*.55,y*.55,0),(x,y,h),1.4,'green',.6)
            s.oval(x,y,h,2.1,1.6,2.5,('cream','petal','gold')[i%3] if k=='flowers' and i%2 else 'leaf')
    elif k=='pillar':
        for z,r,h,top,mat in [(0,12,3,12,'shale'),(3,11,4,8,'stone'),(7,8,30,7,'stone'),
                              (37,8,4,11,'stone'),(41,12,4,12,'shale')]:
            s.drum(0,0,z,r,h,mat,top,10)
        for i in range(6):
            s.oval(7*np.cos(i),7*np.sin(i),45,5,4,2,'moss')
    elif k=='arch':
        # Voussoirs around a real opening through the full depth.
        r=np.hypot(X,Z-18)
        s.fill((abs(Y)<6)&(((abs(X)<26)&(abs(X)>17)&(Z<20)) |
                           ((Z>=18)&(r<26)&(r>17))),'stone')
        for x in (-22,22): s.box(x,0,0,13,15,4,'shale')
        for x in range(-21,22,3):
            top=18+np.sqrt(26**2-x*x)
            s.oval(x,0,top-1,5,7,3,'moss')
            if x%2: s.rod((x,5,top),(x-2,6,top-9),1.1,'green',.6)
        s.box(0,0,36,6,15,9,'stone')
    elif k in ('rubble','spring','crystal'):
        count=14 if k=='spring' else 6
        for i in range(count):
            a=i*math.tau/count
            r=16 if k=='spring' else 9
            x,y=r*np.cos(a),r*.7*np.sin(a)
            s.oval(x,y,2,5,4,3+i%3,'shale')
            if i%3==0: s.oval(x,y,4,4,3,2,'moss')
        if k=='spring':
            s.oval(0,0,2,16,11,2,'water')
            for x,y in [(-6,4),(3,-3),(7,3)]: s.oval(x,y,4,3,1,1,'crystal')
        if k=='crystal':
            for x,y,h,r in [(-7,3,15,4),(3,-3,30,6),(9,5,13,3),(-4,-6,21,4)]:
                s.drum(x,y,3,r,h*.68,'crystal',r*.85,5)
                s.drum(x,y,3+h*.68,r*.85,h*.32,'crystal',0,5)
    elif k=='chest':
        s.box(0,0,0,25,16,11,'timber');s.oval(0,0,11,13,8,7,'oak')
        for x in (-8,8):
            s.box(x,0,0,2,17,11,'gold');s.oval(x,0,11,1.7,8.5,7.5,'gold')
        s.box(0,8,7,5,2,5,'gold');s.box(0,9,8,1,1,2,'ink')


def paint_sections(s):
    """Directional light, ambient occlusion, tile joints and pigments in object space."""
    mat = s.mat[:np.where(s.mat.any(axis=(1,2)))[0][-1]+1]
    occupied = (mat != 0).astype('f')
    smooth = gaussian_filter(occupied, 1.25, mode='constant')
    nz,ny,nx = np.gradient(smooth)
    length = np.maximum(.025,np.sqrt(nx*nx+ny*ny+nz*nz))
    light = (.38*nx-.42*ny-.76*nz)/length
    lightness = .92 + .19*light - .16*gaussian_filter(occupied,3,mode='constant')
    z = Z[:len(mat)]
    grain = s.rng.normal(0,.022,mat.shape)
    grain += .028*np.sin(X*.47+Y*.31+z*.19) + .024*np.cos(X*.18-Y*.3+z*.57)
    # Staggered masonry courses and pantiles carry continuously around corners.
    stone = np.isin(mat,[IDS['stone'],IDS['shale']])
    u = np.where(abs(nx)>abs(ny),Y,X)
    joints = (z%5==0) | ((u+(z//5%2)*4)%9==0)
    grain += stone*np.where(joints,-.15,.035*np.sin((u//9)*2.1+z//5))
    roof = np.isin(mat,[IDS[k] for k in ('tile','slate','wine','teal','violet')])
    grain += roof*np.where((z%4==0)|((u+z//4*3)%7==0),-.17,.055)
    timber = np.isin(mat,[IDS[k] for k in ('timber','oak','bark')])
    grain += timber*.078*np.sin(X*1.7+Y*.9+.5*np.sin(z*.25))
    green = np.isin(mat,[IDS[k] for k in ('green','moss','leaf')])
    grain += green*(.065*np.sin(X*1.9+z*.9)*np.cos(Y*1.2)+.04*np.sin(Y*.6+z*.6))
    rgb = np.array([(0,0,0)]+[tuple(bytes.fromhex(col)) for col in MATERIALS.values()])[mat]
    rgb = np.clip(rgb*(lightness+grain)[...,None],0,255).astype('uint8')
    # Hidden cores need no surface texture. This also compresses the lossless atlas.
    rgb[smooth>.998] = (np.array([list(bytes.fromhex(c)) for c in MATERIALS.values()])[mat[smooth>.998]-1]*.86).astype('uint8')
    rgba = np.concatenate((rgb,(occupied[...,None]*255).astype('uint8')),axis=3)
    sheet = Image.new('RGBA',(8*CELL,math.ceil(len(mat)/8)*CELL))
    for i, pixels in enumerate(rgba):
        sheet.paste(Image.fromarray(pixels),((i%8)*CELL,(i//8)*CELL))
    return sheet


PIVOT, GROUND = 69, 116


def stack(layers, angle):
    # Inverse of the Canvas transform in GuildStacks.projectLayer.
    c,s = math.cos(angle), math.sin(angle)
    out = Image.new('RGBA',(4*PIVOT,2*(GROUND+37)))
    for z, im in enumerate(layers):
        for half in (0,.5):
            base = GROUND-z-half
            inverse = (c/2,-s/1.04,CELL/2-c*PIVOT+s*base/.52,
                       s/2,c/1.04,CELL/2-s*PIVOT-c*base/.52)
            out.alpha_composite(im.transform(out.size,Image.Transform.AFFINE,inverse,
                                             Image.Resampling.NEAREST))
    return out


def bake(name, split_only):
    path = GAME/'assets'/f'scenery_{name}.webp'
    if not split_only:
        s = Sculpture(230 + (TOWN+DUNGEON).index(name))
        if name in ('guild','forge','inn','tavern','shop'): house(s,name)
        elif name=='tree': world_tree(s)
        elif name in ('bow','watch','magic'): tower(s,name)
        else: small(s,name)
        paint_sections(s).save(path, lossless=True, method=4)
    # Re-open the delivered sheet so hand-painted edits feed both game and proof.
    with Image.open(path) as sheet:
        if sheet.size == FRAME:
            return alpha_runs(sheet)
        layers=[]
        for i in range(sheet.height//CELL*8):
            x,y=i%8*CELL,i//8*CELL
            layers.append(sheet.crop((x,y,x+CELL,y+CELL)).convert('RGBA'))
    views=[stack(layers,math.radians(angle)) for angle in (-45,45,135,225)]
    # One common crop and magnification per object makes even lanterns easy to inspect.
    bounds=np.array([im.getbbox() for im in views])
    left,top=bounds[:,:2].min(axis=0)
    right,bottom=bounds[:,2:].max(axis=0)
    zoom=min(4,158/(right-left),139/(bottom-top))
    proof=Image.new('RGB',(4*194,210),'#f4eedf')
    ink=ImageDraw.Draw(proof)
    font=ImageFont.truetype('DejaVuSans.ttf',13)
    for i, (im,label) in enumerate(zip(views,['SE / GAME','SW','NW','NE'])):
        x=i*194
        crop=im.crop((left,top,right,bottom)).resize(
            (round((right-left)*zoom),round((bottom-top)*zoom)),Image.Resampling.LANCZOS)
        ink.line((x+12,171,x+182,171),fill='#c3b7a0')
        proof.paste(crop,(x+(194-crop.width)//2,174-crop.height),crop)
        ink.text((x+14,183),label,font=font,fill='#5d584e')
    ink.text((14,8),name.upper(),font=font,fill='#514d42')
    proof.save(GAME/'test'/'scenery'/f'{name}.webp', lossless=True)
    return alpha_runs(views[0])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--split-only',action='store_true',help='use existing painted WebP sheets')
    opts=parser.parse_args()
    (GAME/'test'/'scenery').mkdir(parents=True,exist_ok=True)
    masks={name:bake(name,opts.split_only) for name in TOWN+DUNGEON}
    write_masks(masks)


if __name__=='__main__':
    main()
