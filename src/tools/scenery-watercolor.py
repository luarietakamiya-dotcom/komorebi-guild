"""Split the three painted source sheets into game stamps and tap silhouettes."""
from PIL import Image

from scenery_masks import FRAME, GAME, alpha_runs, write_masks

ART = GAME.parent / 'art' / 'watercolor'
# Rows do not have identical gutters in the original paintings.
# Each entry gives the ink width and the distance from ground pivot to front edge,
# in logical game pixels. The center of the base rests on the parcel center.
SHEETS = {
    'buildings': ([0, 430, 814, 1254], [
        ('guild', 108, 23), ('forge', 80, 17), ('inn', 79, 17),
        ('tavern', 79, 16), ('shop', 82, 19), ('school', 69, 26),
        ('bow', 48, 11), ('watch', 48, 11), ('magic', 51, 12)]),
    'village': ([0, 416, 831, 1254], [
        ('wall', 54, 18), ('farm', 90.5, 22.6), ('lamp', 21, 4),
        ('bench', 31, 11), ('well', 40, 11), ('fence', 36, 12),
        ('flowers', 28, 10), ('cypress', 24, 4), ('tree', 87, 15)]),
    'dungeon': ([0, 430, 832, 1254], [
        ('pillar', 32, 8), ('crystal', 34, 8), ('chest', 33, 9),
        ('spring', 42, 12), ('arch', 56, 12), ('ruin', 42, 10),
        ('fern', 30, 10), ('rubble', 30, 9), ('torch', 18, 4)]),
}


def export(sheet, box, name, width, front):
    cell = sheet.crop(box)
    bounds = cell.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    sprite = cell.crop(bounds)
    # Farm beds meet at the tips of a 2:1 ground diamond, with leaves above it.
    height = 51 if name == 'farm' else width * sprite.height / sprite.width
    sprite = sprite.resize((round(width * 2), round(height * 2)), Image.Resampling.LANCZOS)
    x = (FRAME[0] - sprite.width) // 2
    y = round(2 * (116 + front)) - sprite.height
    if x < 0 or y < 0 or y + sprite.height > FRAME[1]:
        raise ValueError(f'Sprite outside its ground frame: {name}')
    stamp = Image.new('RGBA', FRAME)
    stamp.paste(sprite, (x, y))
    path = GAME / 'assets' / f'scenery_{name}.webp'
    stamp.save(path, quality=95, method=6)
    return alpha_runs(stamp)


def main():
    masks = {}
    for name, (rows, entries) in SHEETS.items():
        with Image.open(ART / f'{name}.webp') as sheet:
            if sheet.size != (1254, 1254) or sheet.mode != 'RGBA':
                raise ValueError(f'Expected original transparent sheet: {name}')
            for n, (asset, width, front) in enumerate(entries):
                row, col = divmod(n, 3)
                # The hall's eaves and the oak canopy cross the regular grid.
                columns = [0, 436, 836, 1254] if name == 'buildings' else [0, 418, 836, 1254]
                if name == 'village' and row == 2:
                    columns = [0, 418, 780, 1254]
                box = (columns[col], rows[row], columns[col + 1], rows[row + 1])
                masks[asset] = export(sheet, box, asset, width, front)
    write_masks(masks)


if __name__ == '__main__':
    main()
