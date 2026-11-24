"""Bake the town's turntable sheets and angle-specific hit masks from horizontal sections."""
import argparse
import importlib.util
import math
from pathlib import Path
import json

import numpy as np
from PIL import Image

source = Path(__file__).with_name('scenery-sheets.py')
spec = importlib.util.spec_from_file_location('sections', source)
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)
GAME = models.GAME


def canopy(s, blossom):
    rng = s.rng
    s.rod((0, 0, 0), (-1, 1, 32), 3, 'bark', 1.8)
    for i in range(11):
        angle = i * 2.4
        r = 14 * math.sqrt(i / 11)
        x, y = r * math.cos(angle), r * math.sin(angle)
        z = 39 - r * .5 + rng.uniform(-2, 2)
        s.rod((0, 0, 12 + i % 4), (x, y, z), 1.6, 'bark', .7)
        for j in range(15):
            dx, dy = rng.uniform(-7, 7, 2)
            material = ('petal', 'cream', 'green') if blossom else ('moss', 'leaf', 'green')
            s.oval(x + dx, y + dy, z + rng.uniform(-4, 4), 5, 4, 4, material[j % 3])
            if blossom:
                s.oval(x+dx-1,y+dy,z+4,2.7,2.3,2,'cream' if j%3 else 'petal')


LANDMARKS = ['castle', 'cathedral', 'academy', 'observatory', 'manufactory',
             'memorial', 'baths', 'exchange']


def guild_hall(s):
    # A civic hall facing the plaza: a long assembly room, projecting entrance
    # gable and a stair tower carrying the guild standard above the roofline.
    s.box(0, 0, 0, 78, 48, 5, 'shale')
    s.box(0, 0, 4, 74, 44, 35, 'plaster')
    for z in (6, 23, 38):
        s.box(0, 0, z, 76, 46, 2, 'stone')
    for side in (-1, 1):
        for x in (-34, -16, 16, 34):
            s.box(x, side*22, 5, 3, 4, 34, 'stone')
        for x in (-25, 25):
            for z in (9, 25):
                s.box(x, side*23, z, 8, 2, 12, 'oak')
                s.box(x, side*24, z+2, 5, 2, 8, 'glass')
                s.box(x, side*25, z+5, 6, 1, 1, 'oak')
    s.roof(0, 0, 40, 83, 52, 25, 'tile')
    for side in (-1, 1):
        for y in (-11, 11):
            s.box(side*37, y, 12, 3, 9, 17, 'stone')
            s.oval(side*38, y, 28, 2, 4, 4, 'stone')
            s.box(side*39, y, 14, 1, 6, 14, 'glass')
            s.oval(side*39, y, 28, 1, 3, 3, 'glass')
            s.box(side*40, y, 14, 1, 1, 16, 'oak')
            s.box(side*40, y, 22, 1, 7, 2, 'oak')
        s.oval(side*38, 0, 48, 2, 5, 5, 'stone')
        s.oval(side*39, 0, 48, 2, 3, 3, 'glass')

    # Broad steps and a recessed pair of doors inside a stone arch.
    for i in range(4):
        s.box(0, 32-i*2, i*2, 33-i*2, 14, 2, 'stone')
    s.box(0, 22, 8, 30, 17, 35, 'plaster')
    s.roof(0, 19, 43, 31, 36, 20, 'wine', cross=True)
    for y, radius, material in [(31, 11, 'stone'), (32, 8, 'timber'), (33, 6, 'oak')]:
        s.box(0, y, 8, 2*radius, 2, 14, material)
        s.oval(0, y, 22, radius, 2, radius, material)
    s.box(0, 34, 8, 1, 2, 20, 'timber')
    for x in (-14, 14):
        s.box(x, 31, 5, 5, 6, 39, 'stone')
        for z in (9, 32, 42):
            s.box(x, 31, z, 7, 7, 2, 'cream')
        s.box(x, 35, 15, 5, 1, 16, 'teal')
        s.box(x, 36, 27, 6, 1, 2, 'gold')
    s.oval(0, 32, 39, 6, 2, 6, 'gold')
    s.oval(0, 34, 39, 4, 1, 4, 'teal')

    for x, y, eaves in [(-30, 9, 39), (24, -12, 62)]:
        s.drum(x, y, 0, 11, eaves, 'stone', sides=8)
        for dx, dy in [(0, 10), (10, 0), (0, -10), (-10, 0)]:
            s.box(x+dx, y+dy, eaves-13, 4, 4, 8, 'timber')
            s.box(x+dx, y+dy, eaves-10, 5, 5, 4, 'glass')
        s.drum(x, y, eaves-3, 13, 4, 'oak', sides=8)
        s.drum(x, y, eaves, 15, 22, 'tile', 1, 8)
        s.oval(x, y, eaves+22, 2, 2, 2, 'gold')
    # The renderer attaches the player's flag just below this finial.
    s.rod((24, -12, 84), (24, -12, 96), 1.2, 'oak')
    s.oval(24, -12, 97, 2, 2, 2, 'gold')


def landmark(s, name):
    # All models share the ground pivot used by the painted survey and turntable.
    s.box(0, 0, 0, 67, 49, 4, 'stone')
    if name == 'observatory':
        s.drum(0, 0, 4, 26, 30, 'stone', sides=12)
        s.drum(0, 0, 32, 28, 4, 'gold')
        s.oval(0, 0, 36, 26, 26, 23, 'teal')
        s.rod((-4, 0, 49), (22, 0, 67), 4, 'oak', 6)
        s.oval(22, 0, 67, 5, 5, 5, 'crystal')
    elif name == 'memorial':
        for level in range(3):
            s.box(0, 0, 4+level*3, 58-level*5, 40-level*4, 3, 'plaster')
        for x in (-19, 0, 19):
            for y in (-12, 12):
                s.drum(x, y, 13, 3, 23, 'stone', sides=8)
        s.roof(0, 0, 36, 57, 37, 14, 'slate')
        s.drum(0, 0, 49, 6, 15, 'gold', 0, 4)
    elif name == 'baths':
        models.house(s, 'inn')
        for x, y in [(18, 23), (-21, 17)]:
            s.oval(x, y, 6, 22, 13, 6, 'shale')
            s.oval(x, y, 8, 19, 11, 3, 'water')
            for dx in (-5, 4):
                s.rod((x+dx, y, 12), (x+dx-3, y, 23), 1.5, 'cream', .7)
    elif name == 'manufactory':
        models.house(s, 'forge')
        for x in (-22, -7, 8):
            s.drum(x, -18, 20, 5, 38, 'tile', 4)
            s.drum(x, -18, 58, 6, 4, 'shale')
    elif name == 'exchange':
        models.house(s, 'shop')
        for x in (-26, 23):
            for y in (10, 28):
                s.box(x, y, 4, 13, 12, 9, 'oak')
                s.box(x, y, 11, 14, 13, 2, 'gold')
        models.flag(s, 15, 0, 42, 'teal')
    elif name == 'academy':
        models.house(s, 'guild')
        s.drum(22, 12, 4, 13, 40, 'plaster', sides=8)
        s.drum(22, 12, 44, 15, 24, 'violet', 1, 8)
        for x in (-16, -5, 6):
            models.window(s, x, 21, 11)
    else:
        church = name == 'cathedral'
        material = 'plaster' if church else 'stone'
        s.box(0, 0, 4, 53, 36, 34, material)
        s.roof(0, 0, 38, 59, 42, 26 if church else 17, 'violet' if church else 'slate')
        for x in (-25, 25):
            for y in ((15,) if church else (-17, 17)):
                s.drum(x, y, 4, 9, 45, material, sides=8)
                s.drum(x, y, 49, 11, 31 if church else 17, 'violet' if church else 'slate', 1, 8)
        s.box(0, 19, 4, 13, 3, 18, 'oak')
        s.oval(0, 20, 25, 6, 2, 6, 'glass')
        if church:
            s.box(0, 0, 63, 3, 3, 14, 'gold')
            s.box(0, 0, 70, 11, 3, 2, 'gold')
        else:
            models.flag(s, 0, 0, 55, 'wine')


def frames(name, *, hit_model=False):
    s = models.Sculpture(311 + sum(map(ord, name)))
    if name in LANDMARKS:
        landmark(s, name)
    elif name in ('tree', 'blossom'):
        canopy(s, name == 'blossom')
    elif name == 'guild' and not hit_model:
        guild_hall(s)
    elif name in ('guild', 'forge', 'inn', 'tavern', 'shop'):
        models.house(s, name)
    elif name in ('bow', 'watch', 'magic'):
        models.tower(s, name)
    else:
        models.small(s, name)
    sheet = models.paint_sections(s)
    layers = []
    for i in range(sheet.height // 96 * 8):
        x, y = i % 8 * 96, i // 8 * 96
        layer = sheet.crop((x, y, x + 96, y + 96))
        if layer.getbbox():
            layers.append((i, layer))
    for step in range(16):
        angle = math.tau * step / 16 - math.pi / 4
        c, sn = math.cos(angle), math.sin(angle)
        frame = Image.new('RGBA', (138, 153))
        for z, layer in layers:
            base = 116 - z
            transform = (c, -sn/.52, 48-c*69+sn*base/.52,
                         sn, c/.52, 48-sn*69-c*base/.52)
            frame.alpha_composite(layer.transform(frame.size, Image.Transform.AFFINE,
                                                  transform, Image.Resampling.BILINEAR))
        # Warm paper showing through the pigment, with softened color transitions.
        rgba = np.array(frame)
        rgb = rgba[:, :, :3].astype(float)
        pigment = .84*rgb + .16*np.array([251, 239, 201])
        rgba[:, :, :3] = np.where(rgba[:, :, 3:] > 0, pigment, 0).astype('uint8')
        yield Image.fromarray(rgba)


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--landmarks-only', action='store_true')
    group.add_argument('--guild-only', action='store_true')
    args = parser.parse_args()
    marker = '// Generated by tools/town-stamps.py'
    path = GAME/'stacks.js'
    code, _, table = path.read_text().partition(marker)
    masks = json.loads(table.split(' = ', 1)[1].strip().rstrip(';')) if args.landmarks_only or args.guild_only else {}
    names = ['guild', 'forge', 'inn', 'shop', 'tavern', 'school', 'bow', 'watch',
                 'wall', 'magic', 'farm', 'lamp', 'well', 'bench', 'tree', 'blossom', 'cypress']
    names = names + LANDMARKS
    if args.guild_only:
        names = ['guild']
    elif args.landmarks_only:
        names = LANDMARKS
    for name in names:
        atlas = Image.new('RGBA', (4*138, 4*153))
        silhouettes = []
        for i, frame in enumerate(frames(name)):
            atlas.paste(frame, (i % 4 * 138, i // 4 * 153))
            if name != 'guild':
                silhouettes.append(models.alpha_runs(frame.resize(models.FRAME, Image.Resampling.NEAREST)))
        path = GAME/'assets'/f'turn_{name}.webp'
        atlas.save(path, quality=86, method=4)
        # Keep the original 16 picking silhouettes even where the new roof overhangs a plot.
        if name == 'guild':
            silhouettes = [models.alpha_runs(frame.resize(models.FRAME, Image.Resampling.NEAREST))
                           for frame in frames(name, hit_model=True)]
        masks[name] = silhouettes
        print(path, flush=True)
    (GAME/'stacks.js').write_text(code.rstrip()+'\n\n'+marker+'\nconst GuildTownMasks = '+json.dumps(masks, separators=(',', ':'))+';\n')


if __name__ == '__main__':
    main()
