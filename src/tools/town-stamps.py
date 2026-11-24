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


def frames(name):
    s = models.Sculpture(311 + sum(map(ord, name)))
    if name in LANDMARKS:
        landmark(s, name)
    elif name in ('tree', 'blossom'):
        canopy(s, name == 'blossom')
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
    parser.add_argument('--landmarks-only', action='store_true')
    only = parser.parse_args().landmarks_only
    marker = '// Generated by tools/town-stamps.py'
    path = GAME/'stacks.js'
    code, _, table = path.read_text().partition(marker)
    masks = json.loads(table.split(' = ', 1)[1].strip().rstrip(';')) if only else {}
    names = ['guild', 'forge', 'inn', 'shop', 'tavern', 'school', 'bow', 'watch',
                 'wall', 'magic', 'farm', 'lamp', 'well', 'bench', 'tree', 'blossom', 'cypress']
    for name in (LANDMARKS if only else names + LANDMARKS):
        atlas = Image.new('RGBA', (4*138, 4*153))
        silhouettes = []
        for i, frame in enumerate(frames(name)):
            atlas.paste(frame, (i % 4 * 138, i // 4 * 153))
            silhouettes.append(models.alpha_runs(frame.resize(models.FRAME, Image.Resampling.NEAREST)))
        path = GAME/'assets'/f'turn_{name}.webp'
        atlas.save(path, quality=86, method=4)
        masks[name] = silhouettes
        print(path, flush=True)
    (GAME/'stacks.js').write_text(code.rstrip()+'\n\n'+marker+'\nconst GuildTownMasks = '+json.dumps(masks, separators=(',', ':'))+';\n')


if __name__ == '__main__':
    main()
