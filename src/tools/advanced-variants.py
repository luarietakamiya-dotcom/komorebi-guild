"""Generate the second and third guild wardrobe releases from watercolor masters."""
from importlib import import_module

import numpy as np
from PIL import Image

base = import_module("character-variants")
stack = base.stack
GAME = base.GAME

# Order matches the nine panels on each master. Each design names its coat,
# sleeves, mantle, trim and the solids that distinguish its silhouette.
SHEETS = [
    [
        ("fencer", "navy iron navy gold", "rapier feather"),
        ("knight", "navy iron blue iron", "plate shield sword"),
        ("cleric", "linen teal linen teal", "sun_staff"),
        ("druid", "forest hide moss leaf", "crook antlers"),
        ("beastmaster", "leather hide fur straw", "falcon"),
        ("ranger", "forest sage forest hide", "bow feather"),
        ("berserker", "red skin fur hide", "axe"),
        ("assassin", "pants navy boots iron", "daggers cowl"),
        ("wizard", "blue navy navy gold", "book"),
    ],
    [
        ("monk", "ochre skin orange leather", "wraps beads"),
        ("minstrel", "teal linen forest straw", "lyre cap"),
        ("alchemist", "ochre teal teal hide", "flasks goggles"),
        ("paladin", "linen iron linen gold", "plate tower_shield spear"),
        ("darkKnight", "pants iron navy ink", "plate greatsword"),
        ("executioner", "pants leather red iron", "scythe mask"),
        ("saint", "linen linen linen gold", "cross_staff halo"),
        ("samurai", "navy iron blue hide", "lamellar katana"),
        ("ninja", "navy pants navy iron", "star mask"),
    ],
    [
        ("archmage", "blue navy blue gold", "orb"),
        ("sage", "teal linen linen teal", "book wand"),
        ("summoner", "teal blue teal gold", "lantern"),
        ("fistSaint", "linen red linen copper", "iron_fists beads"),
        ("bowSaint", "forest sage forest gold", "longbow"),
        ("diva", "teal linen linen gold", "harp"),
        ("hero", "blue iron blue gold", "plate sun_shield sword"),
        ("demon_lord", "red pants ink copper", "plate horns mace"),
        ("bladeSaint", "linen navy linen navy", "odachi"),
    ],
    [
        ("dragonKnight", "teal iron teal iron", "plate wings lance"),
        ("greatSage", "navy blue blue gold", "astrolabe"),
        ("spirit_lord", "leaf forest sage gold", "antlers spirit_staff"),
        ("divineBow", "sage linen linen gold", "wingbow wings"),
        ("conqueror", "red iron fur gold", "gold_fists crown"),
        ("savior", "linen blue linen blue", "bell"),
        ("magatsu", "red pants ink copper", "lamellar katana fan crest"),
        ("agito", "pants teal ink teal", "hooks fang_mask"),
    ],
]


def blade(v, kind):
    widths = {"rapier":.84, "sword":1.45, "greatsword":2.45, "katana":1.25, "odachi":1.65}
    # Silver blades rise from the grip beside the figure. Curved blades sweep outward.
    tip = {"rapier":25, "sword":23, "greatsword":29, "katana":24, "odachi":30}[kind]
    v.twig((-6,3,7), (-7,4,12), 1, 1.1, "leather")
    v.twig((-9,4,12), (-5,4,13), 1, .85, "gold")
    width = widths[kind]
    v.twig((-7,4,13), (-9,4,tip-6), width, width, "iron")
    x = -12 if kind in ("katana","odachi") else -10
    v.twig((-9,4,tip-6), (x,4,tip), width, .65, "iron")
    if kind == "rapier":
        v.oval((-6,4,11), (2.5,1.7,2.2), "gold", v.x > -6)


def shield(v, kind, coat, trim):
    height = {"shield":16, "tower_shield":20, "sun_shield":18}[kind]
    sx = v.x - 6.5
    sy = v.y - 5.1 - .23*sx
    width = np.interp(v.z, [3,7,height-3,height], [1,4,4.6,3])
    solid = (abs(sx) <= width) & (abs(sy) < 1.5) & (v.z >= 3) & (v.z <= height)
    light = -.16*sx + .24*sy
    v.paint(solid, trim, light)
    field = solid & (abs(sx) < width-1) & (v.z > 4) & (v.z < height-1) & (sy >= 0)
    v.paint(field, coat, light)
    emblem = (abs(sx)<1) | ((v.z==height-5) & (abs(sx)<2.8))
    if kind == "sun_shield":
        emblem |= abs(abs(sx) - abs(v.z-11)) < 1
    v.paint(field & emblem, "gold", .68)


def polearm(v, kind):
    x = -9
    v.twig((x,3,1), (x,3,24), 1.1, 1.05, "hide")
    if kind in ("spear", "lance"):
        v.twig((x,3,21), (x-1,3,30), 2.4 if kind == "lance" else 1.65, .72, "iron")
        v.twig((x-2,3,21), (x+2,3,21), .95, .95, "gold")
    elif kind == "axe":
        for s in (-1,1):
            v.oval((x+s*3.5,3,21), (2.6,1.5,4.2), "iron")
        v.twig((x-4,3,21),(x+4,3,21),1.4,1.4,"iron")
    elif kind == "scythe":
        v.twig((x,3,23), (-4,3,26), 1.8, 1.6, "iron")
        v.twig((-4,3,26), (3,3,27), 1.6, 1.15, "iron")
        v.twig((3,3,27), (8,3,25), 1.15, .66, "iron")
    elif kind == "mace":
        v.oval((x,3,24),(2.9,2.5,3),"iron")
        for s in (-1,1):
            v.twig((x+s*1.7,3,24),(x+s*3.6,3,26.8),1.15,.62,"linen")
    elif kind == "crook":
        v.twig((x,3,23),(x+2,3,27),1.35,1.15,"hide")
        v.twig((x+2,3,27),(x+4,3,24),1.15,.8,"hide")
        v.oval((x-1,3,24),(1.65,1.3,2.4),"leaf",tilt=.7)
    elif kind == "cross_staff":
        v.twig((x-3,3,24),(x+3,3,24),1.15,1.15,"gold")
        v.twig((x,3,21),(x,3,28),1.2,.98,"gold")
    else:
        v.oval((x,3,25),(2.65,2.2,3),"gold")
        v.oval((x,4.4,25),(1.85,1.1,2.1),"teal" if kind=="spirit_staff" else "ochre")


def bow(v, kind):
    tall = kind != "bow"
    low, high = (2,28) if tall else (5,22)
    mid = (high+low)/2
    wood = "gold" if kind == "wingbow" else "hide"
    points = [(8,3,low),(11,3,low+4),(12,3,mid),(11,3,high-4),(8,3,high)]
    for a,b in zip(points,points[1:]):
        v.twig(a,b,1.15,1,wood)
    v.twig(points[0],points[-1],.78,.78,"straw")
    v.twig((-2,-4,7),(-6,-5,18),1.9,2.1,"leather")
    for dx in (-1.4,1.4):
        v.twig((-6+dx,-5,17),(-7+dx,-5,23),.9,.8,"straw")
    if kind == "wingbow":
        for z in (7,19,22):
            v.twig((10,3,z),(13,3,z+4),1.2,.7,"linen")


def harp(v, kind):
    h = 22 if kind=="harp" else 17
    v.oval((2,6,8),(4.8,2.2,2.7),"ochre")
    v.twig((-2,6,9),(-3,6,h),1.25,1,"gold")
    v.twig((5,6,9),(8,6,h+1),1.35,1.15,"gold")
    v.twig((-3,6,h),(8,6,h+1),1.3,1.3,"gold")
    for x in (0,2,4):
        v.twig((x,6,9),(x,6,h),.8,.8,"straw")


def headgear(v, kind, cloth, trim):
    if kind in ("cowl","cap","feather"):
        if kind == "cowl":
            # Open behind the fringe so the selected hair pigment remains visible.
            v.oval((0,-2,25),(8.5,7,6.8),cloth,(v.y<0) | ((abs(v.x)>6.5) & (v.y<3)))
        else:
            v.oval((0,-1.5,28),(8,6.5,2.6),cloth,tilt=1.3)
            v.oval((0,1,28),(8.8,6.3,1),trim)
            if kind == "feather":
                v.twig((5,0,27),(9,-1,31),1.4,.65,"linen")
    elif kind in ("mask","fang_mask"):
        v.oval((0,4.6,20),(6.2,2.2,2.3),cloth)
        if kind == "fang_mask":
            for s in (-1,1):
                v.twig((s*3,6.4,21),(s*2.5,6.5,19),.9,.66,"linen")
    elif kind == "goggles":
        v.oval((0,-.5,27),(8.05,6.5,1.1),"leather")
        for s in (-1,1):
            v.oval((s*3,4.5,27),(2.4,1.35,2.1),"gold")
            v.oval((s*3,5.4,27),(1.55,.85,1.35),"teal")
    elif kind in ("halo","crown"):
        ring = ((v.x/8.15)**2 + ((v.y+.6)/7)**2)
        v.paint((ring>.68) & (ring<1.08) & (v.z==28),"gold", .6)
        if kind == "crown":
            for x in (-5,0,5):
                v.twig((x,4,27),(x,4,30.7),1.5,.7,"gold")
    else:
        for s in (-1,1):
            v.twig((s*5,-2,26),(s*8,-2,28),2.1,1.5,trim)
            v.twig((s*8,-2,28),(s*9,-2,31),1.5,.7,trim)
            if kind == "antlers":
                v.twig((s*8,-2,28),(s*11,0,29),1,.72,trim)


def outfit(v, kind, coat, trim):
    if kind in ("rapier","sword","greatsword","katana","odachi"):
        blade(v,kind)
    elif kind in ("shield","tower_shield","sun_shield"):
        shield(v,kind,coat,trim)
    elif kind in ("sun_staff","crook","axe","spear","scythe","cross_staff","mace","lance","spirit_staff"):
        polearm(v,kind)
    elif kind in ("bow","longbow","wingbow"):
        bow(v,kind)
    elif kind in ("lyre","harp"):
        harp(v,kind)
    elif kind in ("wraps","iron_fists","gold_fists"):
        material = {"wraps":"linen","iron_fists":"iron","gold_fists":"gold"}[kind]
        for s in (-1,1):
            v.twig((s*6,1,10),(s*7,5,14),2.1,2.5,material)
            v.oval((s*7,5,14),(2.6,2.5,2.7),material)
            v.oval((s*7,4,12),(2.55,2.5,.85),trim)
    elif kind == "beads":
        for x in range(-4,5,2):
            v.oval((x,4.5,13+abs(x)*.55),(1.2,1,1.2),"leather")
    elif kind == "plate":
        for s in (-1,1):
            v.oval((s*5.3,0,15),(3.4,3.5,2.7),"iron")
            v.oval((s*5.3,0,14),(3.5,3.6,1),trim)
    elif kind == "lamellar":
        for z in (7,10,13,15):
            v.coat(z-1,z,(6.2,5),(5.5,4.5),coat)
            v.coat(z,z+.5,(6.2,5.1),(5.5,4.5),trim)
    elif kind in ("daggers","hooks"):
        for s in (-1,1):
            v.twig((s*6,3,8),(s*8,4,12),1.05,1,"leather")
            v.twig((s*8,4,12),(s*11,4,18),1.6,.8,"iron")
            if kind=="hooks":
                v.twig((s*11,4,18),(s*9,4,18),1.1,.7,"iron")
    elif kind == "falcon":
        v.twig((5,1,13),(8,5,16),2,1.8,"leather")
        v.oval((8,4,19),(2.7,2.4,3.7),"fur")
        v.oval((8,5,22),(2.1,1.9,2),"linen")
        v.twig((8,6,22),(8,8,21),1,.7,"ochre")
        v.twig((8,3,18),(10,-1,14),2.1,.9,"hide")
    elif kind == "book":
        for s in (-1,1):
            v.twig((s*5,5,12),(s*.6,7,12),2.65,2.3,"linen")
            v.twig((s*5,5,10),(s*.6,7,10),1,.9,"red")
    elif kind == "flasks":
        for x,z in [(-4.5,8),(1,9),(7,14)]:
            v.oval((x,4,z),(2.2,2,2.5),"teal")
            v.twig((x,4,z+1),(x,4,z+3.3),1.15,1.05,"gold")
    elif kind == "star":
        for x,z in [(11,15),(5,15),(8,12),(8,18)]:
            v.twig((8,4,15),(x,4,z),1.6,.75,"iron")
    elif kind in ("orb","lantern","astrolabe"):
        v.twig((6,3,10),(8,4,13),1.65,1.45,"gold")
        if kind=="astrolabe":
            ring = ((v.x-8)/4.2)**2 + ((v.z-17)/4.2)**2
            v.paint((abs(v.y-4)<1.2) & (ring<1.25) & (ring>.56),"gold",.55)
            v.twig((5,4,14),(11,4,20),.85,.85,"straw")
        else:
            v.oval((8,4,17),(3.1,2.9,3.7),"teal" if kind=="lantern" else "blue")
            v.oval((8,4,14),(3.2,3,1),"gold")
            if kind=="lantern":
                v.oval((8,4,20),(3,2.8,1.25),"gold")
                for dx in (-2,2):
                    v.twig((8+dx,5.5,14),(8+dx,5.5,20),.8,.8,"gold")
    elif kind == "wand":
        v.twig((-6,3,9),(-10,4,19),1,.8,"hide")
        v.oval((-10,4,19),(1.5,1.25,1.6),"teal")
    elif kind == "wings":
        for s in (-1,1):
            for i in range(3):
                v.twig((s*4,-4,13+i),(s*(11-i),-6,15+3*i),2.1,.82,trim)
    elif kind == "bell":
        v.twig((6,4,14),(6,4,19),1.05,.98,"gold")
        v.oval((6,4,12),(2.8,2.7,3.6),"ochre")
        v.oval((6,4,10),(3.6,3.4,1),"gold")
        v.oval((6,4,8.8),(1.15,1.1,1.3),"iron")
    elif kind == "fan":
        for dx in range(-3,4):
            v.twig((7,4,10),(7+dx,4,17-abs(dx)*.45),.8,1.05,"red")
        v.twig((7,4,8),(7,4,12),1,1,"gold")
    else:
        raise ValueError(f"Unknown equipment: {kind}")


HEADGEAR = {"feather","antlers","cowl","cap","goggles","mask","halo","horns","crown","crest","fang_mask"}


def make_sheet(sex, hair, colors, equipment):
    coat,sleeves,mantle,trim = colors.split()
    v = stack.Volume(32,breadth=1.14 if sex=="male" else 1.04)
    stack.body(v,coat,sleeves)
    stack.cape(v,mantle,trim,coat in ("linen","blue","navy","teal"))
    pieces = equipment.split()
    for piece in pieces:
        if piece not in HEADGEAR:
            outfit(v,piece,coat,trim)
    base.hairstyle(v,sex,hair)
    for piece in pieces:
        if piece in HEADGEAR:
            headgear(v,piece,mantle,"linen" if piece=="horns" else trim)
    return v.sheet()


def main():
    for hair, swatches in base.HAIR.items():
        stack.PALETTES[hair+"_hair"] = stack.palette(swatches)
    for group, designs in enumerate(SHEETS,1):
        for sex in ("male","female"):
            with Image.open(GAME/"art"/f"portraits_advanced_{group}_{sex}.webp") as source:
                for i,(job,colors,equipment) in enumerate(designs):
                    row,col = divmod(i,3)
                    xs = [round(k*source.width/3) for k in range(4)]
                    ys = [round(k*source.height/3) for k in range(4)]
                    # Trim the narrow seams between painted panels before resampling.
                    cell = source.crop((xs[col]+3,ys[row]+3,xs[col+1]-3,ys[row+1]-3))
                    for hair,portrait in base.portrait_variants(cell,job,sex):
                        key = f"{job}_{sex}_{hair}"
                        path = GAME/"art"/f"stack_{key}.png"
                        make_sheet(sex,hair+"_hair",colors,equipment).save(path)
                        stack.split(key,path,32)
                        face = GAME/"assets"/f"portrait_{key}.webp"
                        portrait.save(face,quality=90,method=6)
                        print(f"{key}  32/32  {face.relative_to(GAME)}",flush=True)


if __name__ == "__main__":
    main()
