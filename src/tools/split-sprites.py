"""Split the two-row imagegen sheet into transparent, foot-aligned pixel sprites."""
from itertools import groupby
from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[1]
NAMES = ("mina", "shion", "gald", "toto", "popo", "boar")


def occupied_runs(projection):
    for occupied, group in groupby(enumerate(projection), key=lambda p: bool(p[1])):
        if occupied:
            run = list(group)
            yield run[0][0], run[-1][0] + 1


def split(sheet):
    alpha = sheet.getchannel("A")
    rows = list(occupied_runs(alpha.getprojection()[1]))
    if len(rows) != 2:
        raise ValueError("Expected two isolated rows of sprites")
    for (top, bottom), facing in zip(rows, ("front", "side")):
        row = sheet.crop((0, top, sheet.width, bottom))
        spans = list(occupied_runs(row.getchannel("A").getprojection()[0]))
        if len(spans) != len(NAMES):
            raise ValueError("Expected six isolated characters in each row")
        for name, (left, right) in zip(NAMES, spans):
            if name == "boar" and facing == "front":
                continue
            cell = row.crop((left, 0, right, row.height))
            sprite = cell.crop(cell.getbbox())
            sprite.save(GAME / "assets" / f"px_{name}_{facing}.webp", lossless=True)


if __name__ == "__main__":
    with Image.open(GAME / "art" / "sprite-sheet.png") as source:
        split(source.convert("RGBA"))
