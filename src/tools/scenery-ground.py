"""Register the watercolor paintings to the town parcels and the two expedition trails."""
import argparse
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image

ASSETS = Path(__file__).resolve().parents[1]/'assets'
ART = ASSETS.parents[1] / 'art'
rng = np.random.default_rng(7291)


def noise(shape, scale):
    im = Image.fromarray(rng.normal(128,40,(shape[0]//scale+2,shape[1]//scale+2)).clip(0,255).astype('uint8'))
    return (np.asarray(im.resize(shape[::-1],Image.Resampling.BICUBIC)).astype(float)-128)/40


def blend(a,b,alpha):
    return a+(b-a)*np.clip(alpha,0,1)[...,None]


def cobbles(shape):
    y,x=np.indices(shape)
    sy,sx=np.mgrid[-12:shape[0]+18:6,-20:shape[1]+26:13]
    sx=sx+(sy//6%2)*6+rng.normal(0,2.5,sx.shape)
    sy=sy+rng.normal(0,1.3,sy.shape)
    pts=np.stack((sx,sy*1.8),axis=-1).reshape(-1,2)
    distance,idx=cKDTree(pts).query(np.stack((x,y*1.8),axis=-1),k=2)
    groove=distance[:,:,1]-distance[:,:,0]
    flecks=noise(shape,3)*2+noise(shape,1)*2+noise(shape,43)*6
    stones=rng.normal(0,8,len(pts))[idx[:,:,0]]
    tone=stones+flecks-26*np.exp(-groove*1.45)+7*np.exp(-((groove-2)/1.4)**2)
    return np.array([211,188,151])+tone[...,None]


def town():
    reference = ART / 'media-generation-komorebi-land-watercolor-0-0fa7da69-c7ff-46ef-81b0-06dece62894a.webp'
    # The two paintings share the same framing, including the bridge and plaza.
    # Use both original reference dimensions so feet, taps and the art agree.
    with Image.open(ART / 'ref-land-empty.png') as layout, Image.open(reference) as painting:
        ground = painting.resize(layout.size, Image.Resampling.LANCZOS)
        ground.save(ASSETS / 'ground_town.webp', quality=95, method=6)


def dungeon():
    w,h=900,300
    with Image.open(ART / 'watercolor' / 'grotto.webp') as painting:
        base=np.asarray(painting.resize((w,h),Image.Resampling.LANCZOS)).astype(float)
    y,x=np.indices((h,w))
    across=(x-w/2)/16
    routes=[[(-26,2),(-21,2),(-13,4),(-3,3),(7,-2),(22,2)],
            [(-26,2),(-21,2),(-13,4),(-3,3),(6,7.5),(14,7),(22,2)]]
    dist=np.minimum.reduce([abs(y-154-8*np.interp(across,*zip(*line))) for line in routes])
    # Let the underlying painted marks show through the pale stone wash.
    blooms = noise(y.shape, 12)
    edge = 16 - dist + 3 * blooms + noise(y.shape, 3)
    path = np.clip(edge / 8, 0, 1) * np.clip((27 - abs(across)) / 2, 0, 1)
    paper = base.mean(axis=2) - 168
    stones = cobbles(y.shape) + (paper * .5 + blooms * 3)[..., None]
    ground = blend(base, stones, path * .82)
    im = Image.fromarray(ground.clip(0,255).astype('uint8'))
    im.save(ASSETS/'ground_dungeon.webp',quality=92,method=6)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--town-only',action='store_true',help='regenerate the town meadow only')
    options = parser.parse_args()
    town()
    if not options.town_only:
        dungeon()
