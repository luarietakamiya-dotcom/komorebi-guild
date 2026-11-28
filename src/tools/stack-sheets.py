"""Author the horizontal sprite sheets, or cut their cells into game assets.

Coordinates are in voxels: +x right, +y towards the viewer, +z up.
Each solid contributes its material to the occupied voxels of each XY plane.
"""
import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image

GAME = Path(__file__).resolve().parents[1]
SIZE = 32
COLUMNS = 8
LAYERS = dict(shusai=32, yuria=32, riina=32, yukina=32, jobava=32, tanaka=32, shiina=32, goto=32, meniya=32,
              mina=32, shion=32, gald=32, toto=32, popo=32, boar=24,
              goblin=22, orc=30, bandit=32, shell=18, moth=24, crystal=28, warden=32, ram=32)
MONSTER_SHEETS = {"goblin", "orc", "bandit", "shell", "moth", "crystal", "warden", "ram"}

# Shadow, midtone and sunlit swatches sampled visually from the guild portraits.
SWATCHES = {
    "skin": ("bc7960", "f2bd8b", "ffe0ab"), "blush": ("c87f70", "eb9d87", "ffd0a0"),
    "leather": ("482d31", "865334", "bc8350"), "hide": ("5e4540", "ab7950", "dcac6b"),
    "boots": ("382b36", "634237", "956448"), "pants": ("35323c", "544650", "85705e"),
    "linen": ("9d8274", "e4cfab", "fff0c9"), "gold": ("91603b", "dcac59", "ffe09a"),
    "copper": ("873f37", "c76143", "f3935c"), "red": ("713b3c", "aa4a39", "da6942"),
    "teal": ("24474c", "3e7974", "79aaa0"), "sage": ("566045", "879051", "b4b375"),
    "forest": ("37483c", "5c714b", "939356"), "straw": ("82704d", "c5b77d", "f1d59b"),
    "navy": ("23344b", "40557d", "7385a4"), "blue": ("273d65", "475f95", "708dba"),
    "iron": ("475267", "8194a3", "d6d7c0"), "apron": ("54372f", "88573a", "b68353"),
    "orange": ("95452f", "d97537", "f4ad4d"), "ochre": ("986137", "c98839", "f3b352"),
    "plum": ("694962", "9b7397", "c59bc0"), "lilac": ("795a80", "ba90b6", "e1bbd5"),
    "ink": ("302a32", "49333a", "62463c"), "iris": ("473340", "714842", "a16b4b"),
    "fur": ("5b3c34", "956642", "c59862"), "moss": ("44513a", "728449", "abb65b"),
    "leaf": ("425637", "83a14e", "bcca70"), "snout": ("9b6154", "d89578", "f4b794"),
}


def palette(colors):
    dark, mid, light = [np.array(list(bytes.fromhex(c))) for c in colors]
    return np.uint8([dark, dark * .46 + mid * .54, mid, mid * .45 + light * .55, light])


PALETTES = {name: palette(colors) for name, colors in SWATCHES.items()}


class Volume:
    def __init__(self, count, breadth):
        self.z, self.y, self.x = np.ogrid[:count, -15.5:16.5, -15.5:16.5]
        # Widen the characters in local space, including the boar's shoulders.
        self.x = self.x / breadth
        self.rgba = np.zeros((count, SIZE, SIZE, 4), dtype=np.uint8)

    def paint(self, mask, material, light):
        shades = np.digitize(np.broadcast_to(light, self.z.shape[:1] + (SIZE, SIZE))[mask],
                             [-.58, -.18, .25, .70])
        self.rgba[mask, :3] = PALETTES[material][shades]
        self.rgba[mask, 3] = 255

    def oval(self, center, radii, material, clip=True, tilt=0):
        x, y, z = center
        rx, ry, rz = radii
        nz = (self.z - z) / rz
        nx = (self.x - x - tilt * nz) / rx
        ny = (self.y - y) / ry
        mask = (nx * nx + ny * ny + nz * nz <= 1) & clip
        self.paint(mask, material, -.44 * nx + .23 * ny + .71 * nz)

    def twig(self, start, end, thick, tip, material):
        # A tapered stroke in 3D, e.g. a lock of hair, a bow or a tusk.
        delta = np.subtract(end, start)
        dx, dy, dz = self.x - start[0], self.y - start[1], self.z - start[2]
        t = np.clip((dx * delta[0] + dy * delta[1] + dz * delta[2]) / np.dot(delta, delta), 0, 1)
        rx, ry, rz = dx - t * delta[0], dy - t * delta[1], dz - t * delta[2]
        radius = thick + (tip - thick) * t
        self.paint(rx*rx + ry*ry + rz*rz <= radius*radius, material,
                   (-.44*rx + .23*ry + .71*rz) / radius)

    def coat(self, z0, z1, bottom, top, material, clip=True, y=0):
        t = np.clip((self.z - z0) / (z1 - z0), 0, 1)
        nx = self.x / (bottom[0] + (top[0] - bottom[0]) * t)
        ny = (self.y - y) / (bottom[1] + (top[1] - bottom[1]) * t)
        mask = (nx*nx + ny*ny <= 1) & (self.z >= z0) & (self.z <= z1) & clip
        self.paint(mask, material, -.49*nx + .26*ny + t*.24)

    def sheet(self):
        sheet = Image.new("RGBA", (SIZE*COLUMNS, SIZE*math.ceil(len(self.rgba)/COLUMNS)))
        for z, pixels in enumerate(self.rgba):
            tile = Image.fromarray(pixels)
            if not tile.getbbox():
                raise ValueError(f"Empty layer {z}")
            sheet.paste(tile, ((z % COLUMNS)*SIZE, (z // COLUMNS)*SIZE))
        return sheet


def body(v, clothes, sleeves):
    for s in (-1, 1):
        x = s * 3.3
        v.oval((x, -.5, 5.3), (2.1, 2.3, 5), "pants")
        v.oval((x, .6, 2), (2.55, 3.6, 3.05), "boots")
        v.oval((x, -.3, 3.8), (2.45, 2.6, 1.25), "hide")
        v.twig((s*5, 0, 14), (s*6.5, 1.4, 10.4), 2.5, 1.8, sleeves)
        v.oval((s*6.6, 1.7, 9.3), (1.9, 1.9, 2.1), "skin")
    v.coat(6, 14, (6, 4.15), (4.55, 3.6), clothes)
    v.oval((0, 0, 14), (5.7, 3.9, 3.3), clothes)
    v.coat(9, 10, (5.9, 4.35), (5.8, 4.35), "leather")
    v.oval((.5, 4.1, 10), (1.65, .85, 1.2), "gold")
    v.oval((0, 0, 16.3), (2.65, 2.8, 2.6), "skin")


def cape(v, base, trim, long=False):
    # Open in front. A rolled edge follows both sides down to the hem.
    bottom = 5 if long else 9
    opening = v.y < .6 + abs(v.x)*.43
    v.coat(bottom, 16, (7.5, 5.5), (4.3, 3.9), base, opening, y=-.9)
    v.coat(bottom, bottom+.8, (7.7, 5.8), (7.5, 5.7), trim, opening, y=-.9)
    for s in (-1, 1):
        v.twig((s*3.8, 1.6, 15.8), (s*6, 2.4, bottom), 1, .8, trim)
    v.oval((0, 0, 16), (5.8, 4.5, 1.8), base)
    v.oval((1.6, 4.15, 16), (1.15, 1, 1.1), "gold")


def face(v, hair, fringe, elf=False):
    v.oval((0, .45, 22.9), (7.2, 6, 6.8), "skin")
    for s in (-1, 1):
        v.twig((s*6.1, 1.1, 21.8), (s*(9.3 if elf else 7.3), .7, 23.9 if elf else 22.2),
               1.55, .75, "skin")
    # Pigment on the curved front surface; irises disappear behind the temples on rotation.
    skin = (v.rgba[..., 3] > 0) & (v.y > 2)
    for s in (-1, 1):
        ex = v.x - s*3.15
        v.paint(skin & (abs(ex) < 1.7) & (v.z == 24), "iris", .04)
        eye = skin & (abs(ex) < 1.26) & (v.z >= 21) & (v.z <= 23)
        v.paint(eye, "ink", -.4)
        v.paint(eye & (v.z == 21), "iris", .58)
        v.paint(eye & (v.z == 23) & (ex < 0), "linen", 1)
        v.paint(skin & (abs(v.x-s*4.7) < 1.25) & (v.z == 20), "blush", .28)
    v.paint(skin & (abs(v.x-.4) < 1.3) & (v.z == 19), "snout", -.65)
    v.oval((0, 6.2, 21), (1.25, 1.05, 1), "skin")
    # A continuous hair cap at the back and temples, with a separate brow line.
    edge = 24.9 + .50*v.y - .21*abs(v.x)
    v.oval((0, -.45, 24.6), (7.9, 6.7, 5.9), hair, v.z >= edge)
    for x, y, z, tx, ty, tz, radius in [
        (-4, 3.2, 27.3, -6.2, 3.8, 22.4, 2.45), (-1.9, 4, 27.7, -3.7, 5.3, 24.4, 2.4),
        (1.4, 4.5, 27.7, -.8, 6.2, 24.3, 2.6), (4.3, 3.6, 27.1, 2.5, 5.8, 25, 2.2),
        (5.9, 2.7, 25.2, 6.4, 4.6, 22.3, 1.8)]:
        v.twig((x,y,z), (tx,ty,tz), radius, .75, fringe)


def hood(v, cloth, trim):
    opening = (v.y < 0) | (v.z >= 26.4 + v.y*.27 - abs(v.x)*.19) | (abs(v.x) > 6.4 + v.y*.12)
    v.oval((0, -1.1, 24.7), (8.8, 7.6, 7.15), cloth, opening)
    # Narrow border along the fabric edge above the forehead.
    v.oval((0, -.8, 24.7), (8.95, 7.6, 7.15), trim,
           opening & (v.y > 2) & (v.z < 27.55 + v.y*.27 - abs(v.x)*.19))
    v.twig((0,-4.4,28.6), (1,-8.9,26), 2.85, 1.35, cloth)


def flower(v, x, y, z):
    for dx, dy, dz in [(-1,0,0), (1,0,0), (0,-.7,.6), (0,.7,-.5)]:
        v.oval((x+dx,y+dy,z+dz), (1,1.05,1.05), "linen")
    v.oval((x,y+.35,z+.4), (.95,1,.85), "gold")


def mina(v):
    body(v, "linen", "leather")
    v.twig((-3.8,2.6,15), (3.8,3.4,7), 1.1, .95, "leather")
    # The scabbard crosses the back and the hilt rises over one shoulder.
    v.twig((4.7,-4.5,5), (-6,-4.8,18.5), 1.2, 1.3, "apron")
    v.twig((-7.7,-4.8,17.5), (-4.5,-4.8,20.1), .95, .95, "gold")
    v.twig((-6.3,-4.8,19), (-8.8,-4.8,22), .9, .95, "boots")
    for s in (-1, 1):
        v.oval((s*5.2,0,14.6), (2.7,3.15,2.25), "hide")
    v.twig((-3.2,-2,15.8), (-7,-5,10), 1.85, 1.2, "teal")
    v.oval((0,.4,16.3), (5.8,4.6,2.2), "teal")
    face(v, "red", "copper")
    for s in (-1,1):
        v.twig((s*5.7,-2,25.6), (s*7.2,-2.5,18.5), 2.7, 1.25, "copper")
        v.twig((s*4,-4,24.5), (s*5,-5.7,17.6), 2.55, 1.05, "red")
    v.oval((1,-5.3,23.7), (4.55,3.4,5), "red")
    v.twig((-1,-1,29.4), (2.8,-.6,31), 1.7, .85, "copper")


def shusai(v):
    body(v, "navy", "navy")
    cape(v, "ochre", "gold")
    v.twig((-5, 0, 9), (-9, -4, 3), 1.2, 1, "ink")
    v.twig((-5, 0, 9), (-3.5, 2.4, 12), 1, .8, "hide")
    face(v, "ink", "ink")
    v.oval((0, -3.8, 29), (3.2, 3, 3), "ink")
    v.twig((-2, 1, 29), (-5, 5, 24), .95, .7, "iron")
    v.twig((-2, 5.8, 19.4), (2, 5.8, 19.4), .9, .8, "ink")


def yuria(v):
    body(v, "linen", "iron")
    cape(v, "forest", "gold", True)
    for side in (-1, 1):
        v.oval((side*5.3, 0, 14.4), (2.8, 3.2, 2.4), "linen")
    face(v, "red", "copper")
    for i in range(5):
        v.oval((4.2 + .5*(i%2), -4.4, 24-i*1.8), (2.2, 2, 2), "copper")
    v.oval((0, 0, 26.5), (7.9, 6.3, 1.2), "gold")
    for x in (-3, 0, 3):
        v.twig((x, 5.4, 26), (x, 4.6, 30.6 if x == 0 else 29), 1.2, .7, "gold")
    v.twig((-6, 1, 9), (-9, 2, 2), 1.15, .7, "iron")


def riina(v):
    body(v, "navy", "navy")
    v.coat(9, 11, (6.1, 4.5), (5.8, 4.4), "red")
    v.oval((0, 0, 16), (5.8, 4.4, 2.2), "teal")
    v.twig((-3, -2, 16), (-7, -7, 11), 1.8, 1, "teal")
    face(v, "ink", "ink")
    # A high ribbon-tied ponytail trails behind the scarf.
    v.oval((1, -5.3, 28.8), (2.6, 2.5, 2.8), "red")
    v.twig((1, -7, 29.2), (4.5, -9, 24), 2.8, 2.4, "ink")
    v.twig((4.5, -9, 24), (5.8, -8, 17), 2.4, .9, "ink")
    v.twig((1, -5.8, 29), (-3, -8, 26), 1.2, .7, "red")
    # Ivory prayer slip with a vermilion seal, held in front of her hand.
    slip = (abs(v.x-6.6) < 1.55) & (abs(v.y-3.6) < .9) & (v.z >= 9) & (v.z <= 15)
    v.paint(slip, "linen", .75)
    v.paint(slip & (v.z >= 12) & (v.z <= 13), "red", .2)


def yukina(v):
    body(v, "linen", "linen")
    # Pleated hakama, crossed collar and wide white sleeves.
    v.coat(2, 11, (6.8, 4.6), (4.7, 3.9), "red")
    for side in (-1, 1):
        v.twig((side*1.7, 3.7, 10), (side*3.7, 3.9, 2.2), .85, .75, "copper")
        v.oval((side*6.2, .5, 12), (2.9, 3.3, 3.6), "linen")
    v.twig((-2.5, 2.7, 16), (2.6, 3.9, 11.4), .8, .7, "red")
    v.coat(10, 11, (5.6, 4.5), (5.4, 4.4), "copper")
    v.oval((0, -5.3, 18), (5.3, 2.6, 10), "ink")
    face(v, "ink", "ink")
    for side in (-1, 1):
        v.oval((side*2.2, -5.7, 29), (2.8, 1.6, 2.8), "red", tilt=side)
        v.twig((side, -6, 29), (side*5.2, -7, 22), 1.5, 1, "copper")
    # Gohei with two zigzag paper streamers visible beside her hair.
    v.twig((6, 3.1, 7), (10, 2.3, 25), .95, .85, "hide")
    for x, y, z in [(10, 2.3, 25), (9.8, 4.8, 22)]:
        v.twig((x, y, z), (x+1.7, y, z-2), 1, 1, "linen")
        v.twig((x+1.7, y, z-2), (x+.7, y, z-3.4), 1, 1, "linen")
        v.twig((x+.7, y, z-3.4), (x+2.5, y, z-5.5), 1, .75, "linen")


def jobava(v):
    body(v, "gold", "iron")
    cape(v, "red", "gold", True)
    for side in (-1, 1):
        v.oval((side*5.3, 0, 14.5), (3.1, 3.7, 2.8), "gold")
    face(v, "ink", "ink")
    v.oval((0, 3.9, 19.3), (5.9, 2.5, 2.9), "ink", v.z < 19.8 + abs(v.x)*.32)
    v.oval((0, -.4, 26.5), (8.2, 7.1, 1.6), "gold")
    for x, y in [(-5, 4), (0, 5.4), (5, 4), (-4, -5), (4, -5)]:
        v.twig((x, y, 26.5), (x*1.15, y*1.12, 31 if x == 0 else 30), 1.7, .9, "gold")
    v.oval((0, 6, 27.1), (1.4, 1, 1.6), "red")


def tanaka(v):
    body(v, "navy", "navy")
    v.oval((0, 3.3, 13.7), (3.1, 1.4, 3), "linen")
    v.twig((0, 4.1, 15.3), (0, 4.5, 10.5), .9, 1.25, "red")
    # Leather document case with handle and brass clasp.
    v.oval((6.7, 2, 7.8), (2.1, 1.2, 1.8), "hide")
    case = (abs(v.x-6.7) < 3.5) & (abs(v.y-2) < 1.65) & (v.z >= 2) & (v.z <= 7)
    v.paint(case, "leather", .15*v.z-.6)
    v.paint(case & (abs(v.x-6.7) < 1) & (v.z == 6), "gold", .8)
    face(v, "ink", "ink")
    v.twig((-3, -1, 28.8), (2.7, .8, 30.8), 1.9, 1.2, "ink")
    for side in (-1, 1):
        for z in (21, 24):
            v.twig((side*1.1, 6.6, z), (side*5.1, 5.6, z), .68, .72, "iron")
        for x, y in [(1.1, 6.6), (5.1, 5.6)]:
            v.twig((side*x, y, 21), (side*x, y, 24), .72, .72, "iron")
    v.twig((-1.1, 6.6, 23), (1.1, 6.6, 23), .7, .7, "iron")


def shiina(v):
    body(v, "teal", "linen")
    v.coat(5, 11, (7.2, 5.1), (4.5, 3.7), "teal")
    v.coat(5, 6, (7.3, 5.2), (7, 5.1), "linen")
    v.oval((0, 3.8, 14.2), (1.9, 1, 2), "gold")
    face(v, "plum", "lilac")
    for side in (-1, 1):
        v.oval((side*6.5, -3.6, 27.7), (2.2, 2.1, 2.4), "red")
        v.oval((side*8.3, -4.5, 23), (2.8, 2.7, 6.6), "lilac", tilt=-side)
        v.twig((side*7, -3, 28), (side*9.3, -4, 30.5), 1.2, 1.3, "copper")
    v.twig((6.5, 2.5, 8), (8.8, 4.3, 15), .85, 1, "iron")
    v.oval((9, 4.6, 16), (1.75, 1.8, 2), "gold")


def goto(v):
    body(v, "linen", "linen")
    v.coat(4, 13, (6.3, 4.6), (4.6, 4), "forest", v.y > -.8)
    v.oval((0, .3, 16), (4.7, 3.8, 1.6), "red")
    v.twig((2, 3.2, 16), (3.3, 4.2, 12.7), 1.2, .9, "copper")
    face(v, "leather", "leather")
    for side in (-1, 1):
        v.twig((side*.7, 6.3, 20.3), (side*3.3, 5.7, 19.7), .95, .85, "leather")
    v.coat(25, 28, (7.5, 6.4), (7.1, 6.1), "linen")
    for x, y in [(-4, -1), (4, -1), (0, -3.1), (0, 2)]:
        v.oval((x, y, 29), (4.5, 4.2, 2.9), "linen")
    v.twig((6.6, 2.4, 8.3), (9.4, 2.8, 18), .9, .95, "hide")
    v.oval((9.8, 3, 19.5), (2.1, 1.3, 2.7), "ochre")


def meniya(v):
    body(v, "teal", "teal")
    v.coat(4, 11, (7.8, 5.2), (4.8, 3.9), "teal")
    v.coat(4, 5, (7.9, 5.3), (7.4, 5), "gold")
    v.coat(10, 11, (5.9, 4.5), (5.5, 4.3), "gold")
    v.twig((-4, -2.6, 11), (-10, -4.3, 8), 2, 1.5, "teal")
    v.twig((-10, -4.3, 8), (-12, -6, 10), 1.5, .8, "gold")
    face(v, "navy", "navy")
    v.oval((-3.4, -3.8, 28.2), (3.9, 3.2, 3.8), "navy")
    v.twig((-6.5, -4, 30.5), (-1, -2.8, 28.8), .9, 1.1, "gold")
    for side in (-1, 1):
        v.oval((side*7, 1.7, 20.4), (1, 1, 1.6), "gold")
    # A raised forearm holds an open vermilion fan, with ribs meeting at the grip.
    v.twig((6.6, 1.7, 9.3), (8.8, 4, 14.1), 1.8, 1.3, "skin")
    x, z = v.x - 8.8, v.z - 14.1
    fan = (z >= 0) & (abs(x) <= z*.85) & (x*x + z*z <= 7.2**2) & (abs(v.y-4.4) < 1)
    v.paint(fan, "copper", z*.16-.6)
    ribs = (abs(x) < .55) | (abs(abs(x)-z*.7) < .48)
    v.paint(fan & (ribs | (x*x + z*z > 6.3**2)), "gold", .6)


def shion(v):
    body(v, "leather", "forest")
    cape(v, "forest", "sage", True)
    face(v, "straw", "straw", True)
    hood(v, "forest", "sage")
    # Curved bow, taut string, quiver and feathered arrows.
    for a,b in [((9,1,4),(12,2,9)), ((12,2,9),(12,2,16)), ((12,2,16),(9,1,21))]:
        v.twig(a,b,.9,.82,"hide")
    v.twig((9,1,4),(9,1,21),.94,.94,"straw")
    v.twig((2,-5,8),(-3,-6,17),1.75,2.05,"leather")
    for dx,dz in [(-1,0),(1.2,1.2)]:
        v.twig((-3+dx,-6,16),(-5+dx,-7,21+dz),.8,.68,"gold")
        v.twig((-4.5+dx,-7,19+dz),(-5.5+dx,-7.7,21.4+dz),.95,.7,"straw")
    v.twig((-5,2.7,28.3),(-2.3,4.3,30),.8,.75,"gold")


def gald(v):
    body(v, "navy", "iron")
    cape(v, "blue", "gold")
    for s in (-1,1):
        v.oval((s*5.3,0,14.4),(2.9,3.35,2.6),"iron")
    face(v,"navy","blue")
    for a,b,r in [((-4,-2,28),(-6,-2.8,30.5),2.2), ((1,-1,29),(3,-2,31.2),1.85),
                  ((4,-3,27.8),(7,-3.6,29.1),2), ((-5,-2,25),(-8,-2.5,26.2),1.9)]:
        v.twig(a,b,r,.72,"blue")
    # Convex kite shield with a gold rim, boss and fleur on its forward face.
    w = np.interp(v.z, [4,7,12,15,16], [1.2,3.5,4.5,4.5,2.1])
    sx = v.x-6.6
    sy = v.y-4.9-.22*sx
    shield = (abs(sx)<=w) & (abs(sy)<1.45) & (v.z>=4) & (v.z<=16)
    v.paint(shield, "gold", -.16*sx+.35*sy)
    field = shield & (abs(sx)<w-1) & (v.z>5) & (v.z<15) & (sy>=0)
    v.paint(field, "blue", -.16*sx+.16*sy)
    v.paint(field & ((abs(sx)<.85) | ((v.z==12)&(abs(sx)<2.5))), "gold", .7)
    v.twig((-7,-.3,8),(-9.2,1,2.2),1.05,.7,"iron")


def toto(v):
    body(v, "linen", "linen")
    v.coat(6,14,(5.9,4.5),(3.8,4), "apron", v.y > 1)
    for s in (-1,1):
        v.twig((s*2.9,2.7,16),(s*2.1,3.7,12.8),.86,.92,"hide")
        v.oval((s*2.1,3.9,13),(.85,.8,.9),"gold")
        v.twig((s*3,-2.5,15.8),(-s*2.9,-3.6,9.5),.88,.85,"apron")
    face(v,"ochre","ochre")
    v.oval((0,-.6,25.8),(8.25,7.2,5.6),"orange",v.z>=25+.18*v.y)
    v.oval((0,-.6,25.8),(8.4,7.45,5.6),"ochre",
           (v.z >= 25+.18*v.y) & (v.z <= 26+.18*v.y))
    v.twig((5.4,-5,25.3),(9,-6.5,20.7),1.85,.97,"orange")
    v.twig((5.5,-5,25.3),(7.5,-8.6,25),1.4,.83,"orange")
    for x,y,z in [(-4,4.3,29),(2,5.2,29),(-6.4,2.8,27),(6,-3.8,28.6)]:
        v.oval((x,y,z),(.95,1,1),"linen")
    v.twig((-7.1,2.1,8.5),(-9.7,1.7,17.6),1.05,1.05,"hide")
    v.twig((-12,1.6,16.5),(-8.1,1.7,18.3),1.85,1.85,"iron")


def popo(v):
    body(v,"sage","linen")
    cape(v,"linen","gold",True)
    for s in (-1,1):
        v.twig((s*3.9,2.6,15.6),(s*2.5,3.9,11.5),1.85,1.35,"linen")
    v.oval((0,4,14.5),(1.15,.96,1.2),"gold")
    face(v,"plum","lilac")
    for s in (-1,1):
        for z in (20,18,16):
            v.oval((s*(5.5+(z%4)*.28),3.2,z),(1.75,1.8,1.75),"lilac")
        v.oval((s*5.7,3.3,15),(1.45,1.45,.95),"gold")
    hood(v,"linen","gold")
    for dx,dz in [(-1,0),(0,1.7),(1.5,.4),(0,-1.2)]:
        v.oval((6.25+dx,4.8,27+dz),(1.45,1.35,1.45),"leaf")
    v.oval((6.25,5.95,27.1),(.95,.92,.95),"gold")
    v.twig((-5,-2.1,14.9),(3.4,-5.6,8.1),.85,.9,"hide")
    v.oval((3.8,-5,8.3),(2.7,1.65,2.9),"hide")


def boar(v):
    for s in (-1,1):
        for y in (-6.6,5.6):
            v.twig((s*4.1,y,7),(s*4.5,y+.25,1.3),2.2,1.6,"fur")
            v.oval((s*4.5,y+.5,1.1),(1.9,2.05,1.75),"boots")
    v.oval((0,-2,10.4),(7.45,10.4,8.15),"fur")
    v.twig((0,-10,12),(.8,-13.6,14.6),1.15,1,"fur")
    v.oval((1.7,-13.6,14.8),(1.5,1.45,1.5),"boots")
    for s in (-1,1):
        v.twig((s*5.4,4.2,12.4),(s*6.3,6.1,7.8),2,1,"hide")
    v.oval((0,5.4,12.2),(6.7,6.2,6.75),"fur")
    for s in (-1,1):
        v.twig((s*3.8,3.7,16.6),(s*6.8,3.3,20.9),2.3,.72,"fur")
        v.twig((s*4.45,5.15,17.75),(s*6.05,4.25,19.9),1,.72,"snout")
        v.oval((s*4.35,9.6,14.0),(1.3,1.3,1.5),"ink")
        v.oval((s*4.2,10.5,14.6),(.85,.74,.7),"linen")
    v.oval((0,10.3,11.1),(4.6,3.8,3.8),"hide")
    v.oval((0,13.05,11.4),(3.85,2.3,2.6),"snout")
    for s in (-1,1):
        v.oval((s*1.5,14.95,11.55),(.82,.85,1.1),"leather")
        v.twig((s*3.65,10.9,8.9),(s*5.3,12.35,10.4),1.6,1.35,"linen")
        v.twig((s*5.3,12.35,10.4),(s*5.35,12.15,13.7),1.35,.75,"linen")
    v.oval((0,-2.7,16.9),(6.7,8.7,3.05),"moss")
    for x,y,z,dx in [(-4,-5,18,-1),(2,-7,18,1),(4,-2,18,1),(-2,1,19,-1),
                        (0,-2,20,1.5),(-1,-8,18,-1.4),(2,3,18,1)]:
        v.twig((x,y,z),(x+dx,y-1.4,z+2.9),1.6,.85,"leaf")
    for x,y,z in [(-4,-2,19),(2.5,-4.6,19.8),(.5,2,19.6)]:
        flower(v,x,y,z)


def goblin(v):
    body(v, "hide", "moss")
    v.oval((0, 1, 16), (6, 5, 5.8), "leaf")
    for side in (-1, 1):
        v.twig((side*4, 0, 17), (side*10, -1, 20), 2.3, .65, "moss")
        v.oval((side*2.6, 5.2, 17.5), (1.2, 1, 1), "gold")
    v.twig((7, 2, 9), (7, 5, 17), 1.4, .6, "iron")
    v.oval((0, 5.7, 15.5), (2, 1.8, 1.4), "moss")


def orc(v):
    body(v, "leather", "sage")
    v.oval((0, 0, 15), (8.5, 5.3, 7), "forest")
    v.oval((0, 1, 23), (6.8, 5.5, 6.8), "sage")
    v.oval((0, 4.8, 21), (5.4, 3.5, 3.6), "moss")
    for side in (-1, 1):
        v.oval((side*3, 5.5, 24), (1.2, 1, 1), "ink")
        v.twig((side*3.5, 7, 20), (side*4.2, 7.9, 24), 1.3, .5, "linen")
    v.oval((-7, 0, 17), (3.7, 5, 4), "iron")
    v.twig((7, 3, 9), (10, 3, 23), 1.5, 3, "hide")


def bandit(v):
    body(v, "navy", "leather")
    face(v, "ink", "ink")
    hood(v, "red", "copper")
    v.oval((0, 4.5, 20.4), (6, 3, 2.5), "navy")
    v.twig((-7, 2, 9), (-8.5, 7, 17), 1.5, .6, "iron")


def shell(v):
    for side in (-1, 1):
        for y in (-5, 5):
            v.oval((side*6, y, 2.8), (3.4, 3.8, 3.3), "teal")
    v.oval((0, 9, 6), (4.5, 5, 4), "sage")
    for side in (-1, 1):
        v.oval((side*3.2, 11.2, 7.4), (1.1, 1.2, 1), "ink")
    v.oval((0, -1, 7), (9.3, 10.8, 8.7), "teal")
    for x, y in [(0, 0), (-4.8, 3), (4.8, 3), (-4.8, -4), (4.8, -4)]:
        v.oval((x, y-1, 12.5 if x else 15), (3.7, 4.2, 2.8), "iron")


def moth(v):
    for side in (-1, 1):
        v.twig((side, 0, 7), (side*4, 3, .3), 1, .8, "ink")
        v.oval((side*6, -1, 14), (5.5, 2.3, 8.3), "lilac", tilt=side*2)
        v.oval((side*7.5, .8, 15.5), (2.5, 1.2, 3.4), "gold")
        v.oval((side*5, -1.2, 8), (4.5, 2.3, 4), "plum")
        v.twig((side, 2, 16), (side*4, 4, 22.8), 1, .9, "gold")
    v.oval((0, 0, 10), (2.6, 2.7, 6.5), "plum")
    v.oval((0, 2, 15), (3.4, 3, 3.3), "linen")
    for side in (-1, 1):
        v.oval((side*2, 4, 15.5), (1.4, 1.3, 1.6), "ink")


def crystal(v):
    boar(v)
    for x, y, height in [(-3, -4, 24), (3, 0, 25), (0, 7, 27)]:
        v.twig((x, y, 17), (x, y+2, height), 3, .8, "blue")


def warden(v):
    for side in (-1, 1):
        for y in (-6, 5):
            v.twig((side*4, y, 12), (side*5, y+1, 1), 2.8, 1.8, "navy")
        v.twig((side*3, 6, 20), (side*10, 4, 25), 2.4, 1.6, "gold")
        v.twig((side*10, 4, 25), (side*8, 3, 31), 1.7, .8, "linen")
    v.oval((0, -2, 12), (7.5, 10, 7.5), "navy")
    v.oval((0, 5, 16), (6.5, 5.5, 7.5), "lilac")
    v.oval((0, 9, 18), (4.5, 4, 4.5), "navy")
    for side in (-1, 1):
        v.oval((side*3.6, 10.5, 19.8), (1.2, 1.3, 1.2), "gold")


def ram(v):
    for side in (-1, 1):
        for y in (-7, 5):
            v.twig((side*5, y, 13), (side*6, y, 1), 3.4, 2.3, "boots")
    v.oval((0, -2, 13), (9.5, 11.5, 9.5), "copper")
    v.oval((0, -3, 18), (8.8, 10, 6), "iron")
    v.oval((0, 7, 16), (7.3, 6.6, 7), "leather")
    for side in (-1, 1):
        v.oval((side*4, 11.3, 17.8), (1.5, 1.2, 1.2), "gold")
        v.twig((side*6, 5, 21), (side*9, 8, 23), 3, 2.6, "ochre")
        v.twig((side*9, 8, 23), (side*8, 12, 19), 2.6, 1.4, "gold")
    v.twig((0, 6, 21), (0, 11, 31), 4, .85, "iron")


AUTHORS = dict(shusai=shusai, yuria=yuria, riina=riina, yukina=yukina, jobava=jobava, tanaka=tanaka,
               goblin=goblin, orc=orc, bandit=bandit, shell=shell, moth=moth, crystal=crystal, warden=warden, ram=ram,
               shiina=shiina, goto=goto, meniya=meniya, mina=mina, shion=shion, gald=gald, toto=toto, popo=popo, boar=boar)


def split(name, path, count=None):
    if count is None:
        count = LAYERS[name]
    out = GAME / "assets" / f"stack_{name}"
    out.mkdir(exist_ok=True)
    with Image.open(path) as sheet:
        if sheet.mode != "RGBA" or sheet.size != (SIZE*COLUMNS, SIZE*math.ceil(count/COLUMNS)):
            raise ValueError(f"Invalid RGBA grid in {path}")
        for z in range(count):
            x, y = z % COLUMNS * SIZE, z // COLUMNS * SIZE
            tile = sheet.crop((x, y, x+SIZE, y+SIZE))
            if not tile.getbbox():
                raise ValueError(f"Empty cell in {name} at z={z}")
            tile.save(out / f"{z:02d}.webp", lossless=True, exact=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split-only", action="store_true", help="use the existing artist sheets")
    args = parser.parse_args()
    for name, count in LAYERS.items():
        path = GAME / "art" / f"stack_{name}.png"
        if not args.split_only:
            volume = Volume(count, breadth=1.32 if name == "boar" else 1.15)
            AUTHORS[name](volume)
            volume.sheet().save(path)
        if name in MONSTER_SHEETS:
            with Image.open(path) as sheet:
                sheet.save(GAME / "assets" / f"monster_{name}.webp", lossless=True, exact=True)
        else:
            split(name, path)
        print(path)
