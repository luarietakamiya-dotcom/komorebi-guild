"""Build the first nine jobs from the portrait masters and horizontal voxel solids."""
from importlib import import_module
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

stack = import_module("stack-sheets")
GAME = Path(__file__).resolve().parents[1]
# Row-major order in the two watercolor master sheets.
COSTUMES = {
    "sword": ("linen", "leather"), "warrior": ("red", "iron"),
    "thief": ("leather", "forest"), "healer": ("sage", "linen"),
    "mage": ("navy", "navy"), "fighter": ("red", "skin"),
    "hunter": ("forest", "hide"), "bard": ("ochre", "linen"),
    "apothecary": ("linen", "teal"),
}
HAIR = {
    "gold": ("79512f", "d9aa58", "ffe8a2"),
    "silver": ("5b6473", "b6c2c6", "f8f5e8"),
    "black": ("201e29", "3c3742", "72646b"),
    "brown": ("4b302e", "865539", "c28b58"),
}


def equipment(v, job):
    if job == "sword":
        stack.cape(v, "teal", "teal")
        v.twig((5,-4,5), (-7,-4,20), 1.45, 1.5, "leather")
        v.twig((-9,-4,18), (-5,-4,22), .95, .95, "gold")
        v.twig((-7,-4,20), (-10,-4,24), 1, .95, "boots")
        v.oval((5,0,14), (3.1,3.5,2.7), "hide")
    elif job == "warrior":
        for s in (-1,1):
            v.oval((s*5,0,15), (3.5,3.7,2.8), "iron")
            v.oval((s*4,-1,16), (3.7,3.7,1.8), "straw")
        v.twig((7,2,6), (8,2,25), .95, 1, "leather")
        v.oval((10,2,22), (3,1.4,4), "iron", v.x > 8)
        v.oval((7,2,22), (2,1.5,2), "gold")
    elif job == "thief":
        stack.cape(v, "forest", "leather")
        v.twig((-4,3,16), (4,4,8), .94, .9, "hide")
        v.twig((7,2,8), (7,4,12), 1, 1, "boots")
        v.twig((5,4,12), (9,4,12), .78, .78, "gold")
        v.twig((7,4,13), (10,4,17), 1.55, .64, "iron")
    elif job in ("healer","mage"):
        healer = job == "healer"
        stack.cape(v, "linen" if healer else "blue", "gold", True)
        x = -9 if healer else 9
        v.twig((x,3,1), (x,3,24), 1.1, 1.1, "hide" if healer else "gold")
        if healer:
            v.twig((x,3,22), (x-2,3,25), 1.15, .75, "hide")
            v.oval((x+1,3,25), (1.8,1.2,2.3), "leaf")
            stack.flower(v,x-1,3,26)
        else:
            v.oval((x,3,25), (2.35,2.1,3.2), "teal")
            v.oval((x,3,23), (2.3,2,1.1), "gold")
    elif job == "fighter":
        v.twig((-3,3,16), (4,4,9), 1.3, 1, "ochre")
        for s in (-1,1):
            v.twig((s*7,1,11), (s*6.4,4.8,14), 1.9, 2, "linen")
            v.oval((s*6.4,5,14.6), (2.25,2.2,2.5), "linen")
            v.oval((s*6.4,5,13), (2.1,2.1,.8), "hide")
    elif job == "hunter":
        stack.cape(v, "forest", "sage")
        for a,b in [((8,2,4),(11,2,9)), ((11,2,9),(11,2,17)), ((11,2,17),(8,2,22))]:
            v.twig(a,b,.95,.9,"hide")
        v.twig((8,2,4),(8,2,22),.74,.74,"straw")
        v.twig((1,-4,7),(-5,-6,18),1.8,2,"leather")
        for dx in (-1,1):
            v.twig((-5+dx,-6,17),(-7+dx,-6,23),.85,.75,"gold")
    elif job == "bard":
        stack.cape(v, "ochre", "gold")
        v.oval((-2,5,9), (4.7,2.2,4.3), "hide", tilt=1.2)
        v.oval((-2,7,10), (1.3,.7,1.25), "boots")
        v.twig((0,5.8,11),(8,5.8,19),1.1,1,"leather")
        v.twig((7,5.8,18),(9,5.8,20),1.4,1.4,"gold")
    elif job == "apothecary":
        v.coat(5,14,(6,4.5),(4,4.1),"teal",v.y > 1)
        for s in (-1,1):
            v.twig((s*3,2,16),(s*2,4,12),.96,.88,"hide")
        for x,z in [(-4,8),(0,8),(6.6,12)]:
            v.oval((x,4,z),(1.7,1.5,2.25),"teal" if x else "ochre")
            v.oval((x,4,z+2),(1,.95,1),"gold")


def make_sheet(job, sex, hair):
    v = stack.Volume(32, breadth=1.14 if sex == "male" else 1.04)
    stack.body(v, *COSTUMES[job])
    equipment(v, job)
    stack.face(v, hair, hair)
    if sex == "female":
        for s in (-1,1):
            v.twig((s*5.6,-2,26), (s*6.8,-2,18.3), 2.65, 1.3, hair)
        v.twig((2,-5,26), (4,-7,16), 3.1, 1.55, hair)
        v.oval((3,-6,24), (2.9,2.4,1), "gold")
        v.twig((-2,-1,29.2), (1.8,-2,31.1), 1.8, .94, hair)
    else:
        v.twig((-3,-2,28), (-5,-2.8,30.8), 2.25, .85, hair)
        v.twig((.5,-1,29), (3,-1.8,31.2), 2.05, .85, hair)
        for s in (-1,1):
            v.twig((s*1.7,5.6,23.8),(s*4.2,4.8,24.7),.77,.75,hair)
    return v.sheet()


def portrait_variants(cell, job, sex):
    rgb = np.asarray(cell.convert("RGB"), dtype=float)
    r,g,b = rgb.transpose(2,0,1)
    # Isolate the violet pigment while preserving thin ink and antialiased edges.
    alpha = np.clip((b-g+2)/13, 0, 1) * np.clip((r-g-2)/14, 0, 1)
    if job == "mage":
        # The mage's midnight-blue cape also contains cool watercolor shadows.
        # Coordinates follow the tips of each hairstyle in a 300px-wide cell.
        outline = ([(47,0),(221,0),(221,106),(132,121),(117,140),(76,128),(47,99)]
                   if sex == "male" else
                   [(48,0),(238,0),(235,100),(212,125),(217,151),(222,171),
                    (205,179),(191,164),(178,148),(146,150),(90,170),(82,200),
                    (80,245),(58,291),(15,291),(0,263),(0,171),(36,113)])
        mask = Image.new("L",cell.size)
        scale = cell.width/300
        ImageDraw.Draw(mask).polygon([(round(x*scale),round(y*scale)) for x,y in outline], fill=1)
        alpha *= np.asarray(mask)
    value = .40*r+.35*g+.25*b
    # The key-colored master has dark linework and a midtone around 113.
    for hair,swatches in HAIR.items():
        colours = np.array([(41,30,34), *[tuple(bytes.fromhex(s)) for s in swatches], (255,249,235)])
        mapped = np.stack([np.interp(value,[21,58,115,201,250],col) for col in colours.T],axis=-1)
        out = rgb + alpha[...,None]*(mapped-rgb)
        yield hair, Image.fromarray(np.uint8(np.clip(out,0,255))).resize((300,300),Image.Resampling.LANCZOS)


def main():
    for hair, swatches in HAIR.items():
        stack.PALETTES[hair+"_hair"] = stack.palette(swatches)
    for sex, columns, ys in [
        ("male",[(407,830),(405,819),(404,835)],[0,408,822,1254]),
        ("female",[(381,835),(411,820),(392,829)],[0,406,820,1254]),
    ]:
        with Image.open(GAME / "art" / f"portraits_{sex}.png") as source:
            for i,job in enumerate(COSTUMES):
                row,col = divmod(i,3)
                xs = [0,*columns[row],source.width]
                cell = source.crop((xs[col],ys[row],xs[col+1],ys[row+1]))
                for hair,portrait in portrait_variants(cell,job,sex):
                    key = f"{job}_{sex}_{hair}"
                    sheet = GAME / "art" / f"stack_{key}.png"
                    make_sheet(job,sex,hair+"_hair").save(sheet)
                    stack.split(key,sheet,32)
                    path = GAME / "assets" / f"portrait_{key}.webp"
                    portrait.save(path,quality=90,method=6)
                    print(f"{key}  32/32  {path.relative_to(GAME)}",flush=True)


if __name__ == "__main__":
    main()
