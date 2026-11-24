"""Encode sprite silhouettes without reading pixels from a file:// canvas."""
from pathlib import Path

import numpy as np
from PIL import Image

GAME = Path(__file__).resolve().parents[1]
FRAME = (276, 306)
MARKER = '// Generated scenery alpha runs (2px cells).'


def alpha_runs(stamp):
    # Each cell covers 4x4 source pixels at 2x rendering density.
    alpha = Image.new('L', (FRAME[0], 308))
    alpha.paste(stamp.getchannel('A'))
    alpha = alpha.reduce(4)
    rows = []
    for row in np.asarray(alpha) > 48:
        edges = np.flatnonzero(np.diff(row.astype(int), prepend=0, append=0))
        rows.append(''.join(f'{v:02x}' for v in edges))
    return '.'.join(rows).rstrip('.')


def write_masks(masks):
    path = GAME / 'voxel.js'
    before, marker, _ = path.read_text().partition(MARKER)
    if not marker:
        raise ValueError(f'Missing mask table in {path}')
    entries = ''.join(f'  {key}: "{rows}",\n' for key, rows in masks.items())
    path.write_text(before + marker + '\nconst GuildSceneryMasks = {\n' + entries + '};\n')
