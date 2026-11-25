"""Bake the sixteen illustrated views of the town's scenery around its ground pivots."""
import argparse
import importlib.util
import math
from pathlib import Path
from town_architecture import TRADES, guild_model, trade_model, grove_frames, specialty_stamps, village_model

import numpy as np
from PIL import Image, ImageFilter

source = Path(__file__).with_name('scenery-sheets.py')
spec = importlib.util.spec_from_file_location('sections', source)
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)
GAME = models.GAME


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


def dress_scenery(s, name):
    if name == 'school':
        for x in (-24,24):
            for y in (-19,18):
                s.drum(x,y,0,2,13,'oak')
            for z in (4,10):
                s.box(x,0,z,2,37,2,'timber')
        models.flag(s,20,-16,17,'green')
    elif name == 'farm':
        for x in (-27,-6,26):
            for y in (-23,-11,1,13,25):
                s.oval(x,y,3,3,3,2,'moss')
                for dx,dy in [(2,1),(-1,-2),(-2,3)]:
                    s.rod((x,y,4),(x+dx,y+dy,8),1.5,'leaf',.5)
    elif name == 'bench':
        for x in (-13,13):
            s.box(x,0,12,2,13,2,'oak')
            s.drum(x,4,8,1.3,5,'timber')
    elif name == 'lamp':
        s.drum(0,0,15,2.2,2,'gold')
        s.drum(0,0,26,2.6,2,'gold')
        s.oval(0,0,34,2.4,2.4,3,'cream')
    elif name in ('castle','cathedral','observatory','memorial','academy'):
        for side in (-1,1):
            for off in (-12,12):
                if name=='memorial':
                    s.drum(off*1.6,side*12,32,4,3,'cream',sides=8)
                else:
                    y=side*(22 if name=='observatory' else 18)
                    s.box(off,y,14,6,3,12,'shale')
                    s.oval(off,y,26,3,2,4,'shale')
                    s.box(off,y+side,16,4,3,10,'glass')
                    s.oval(off,y+side,26,2,2,2,'glass')
                    s.box(off,y+2*side,20,5,2,1,'oak')
    # Low, irregular leaves soften masonry bases. Keep the pavement and cultivated
    # rows clear; these flowers grow on the object and turn with its foundations.
    beds = {'wall':[(-17,7),(17,-7)], 'baths':[(-21,14)], 'memorial':[(21,15)]}
    for x,y in beds.get(name,[]):
        for i in range(16):
            dx,dy=s.rng.uniform(-4,4,2)
            z=s.rng.uniform(2,6)
            s.oval(x+dx,y+dy,z,2.5,2,2.4,'green' if i%3 else 'moss')
            if i%3==0:
                s.oval(x+dx,y+dy,z+2,1.4,1.2,1.2,'petal' if i%2 else 'cream')


def frames(name):
    if name in ('guild','shop') or name in TRADES:
        building = guild_model() if name == 'guild' else trade_model(name)
        for step in range(16):
            yield building.render(step)
        return
    if name in ('well','watch','bow','magic'):
        building = village_model(name)
        for step in range(16):
            yield building.render(step)
        return
    if name in ('tree', 'blossom', 'cypress'):
        yield from grove_frames(name)
        return
    s = models.Sculpture(311 + sum(map(ord, name)))
    if name in LANDMARKS:
        landmark(s, name)
    else:
        models.small(s, name)
    dress_scenery(s, name)
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
        frame = Image.new('RGBA', models.FRAME)
        for z, layer in layers:
            for lift in (0, .5):
                base = 116-z-lift
                transform = (c/2, -sn/1.04, 48-c*69+sn*base/.52,
                             sn/2, c/1.04, 48-sn*69-c*base/.52)
                frame.alpha_composite(layer.transform(frame.size, Image.Transform.AFFINE,
                                                      transform, Image.Resampling.BILINEAR))
        # Darken the inner silhouette like a broken pen line. Keep the highlights on
        # the glass, stone edges and foliage instead of washing every material in beige.
        rgba = np.array(frame)
        alpha = np.asarray(frame.getchannel('A'),dtype=float)
        inside = np.asarray(frame.getchannel('A').filter(ImageFilter.MinFilter(3)),dtype=float)
        rim = ((alpha-inside)/255)[:,:,None]
        rgb = rgba[:,:,:3].astype(float)
        rgba[:,:,:3] = np.clip((rgb-124)*1.16+129-rim*27,0,255).astype(np.uint8)
        yield Image.fromarray(rgba)


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--landmarks-only', action='store_true')
    group.add_argument('--guild-only', action='store_true')
    args = parser.parse_args()
    names = ['guild', 'shop', *TRADES, 'school', 'bow', 'watch', 'wall', 'magic', 'farm',
             'lamp', 'well', 'bench', 'tree', 'blossom', 'cypress', *LANDMARKS]
    if args.guild_only:
        names = ['guild']
    elif args.landmarks_only:
        names = LANDMARKS
    else:
        specialty_stamps()
    # Visual overhangs and new shopfronts keep the historical picking silhouettes
    # in GuildTownMasks. Only their illustrations are regenerated here.
    for name in names:
        # Village furniture and groves render smaller than one logical pixel per
        # texel even when the town is zoomed. Downsample their supersampled art.
        width, height = models.FRAME if name in ('guild','shop',*TRADES) else (138,153)
        atlas = Image.new('RGBA', (4*width, 4*height))
        for i, frame in enumerate(frames(name)):
            if frame.size != (width, height):
                frame = frame.resize((width,height),Image.Resampling.LANCZOS)
            atlas.paste(frame, (i % 4 * width, i // 4 * height))
        path = GAME/'assets'/f'turn_{name}.webp'
        atlas.save(path, quality=90, method=4)
        print(path, flush=True)


if __name__ == '__main__':
    main()
