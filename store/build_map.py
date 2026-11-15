#!/usr/bin/env python3
"""Draws the store from layout.py as a Nav2 map (map/store.pgm + store.yaml)
and a labelled picture for people (map/store_preview.png, needs Pillow).

Run:  python3 store/build_map.py      (from the homedepot folder)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import layout as L  # noqa: E402

OUT = os.path.join(HERE, 'map')
FREE, WALL = 254, 0
W, H = round(L.WIDTH / L.RESOLUTION), round(L.DEPTH / L.RESOLUTION)


def boxes():
    t = L.WALL
    outer = [(0, 0, L.WIDTH, t), (0, L.DEPTH - t, L.WIDTH, L.DEPTH), (0, 0, t, L.DEPTH), (L.WIDTH - t, 0, L.WIDTH, L.DEPTH)]
    return outer + L.rack_boxes() + [b[:4] for b in L.FRONT_OBSTACLES]


def main():
    os.makedirs(OUT, exist_ok=True)
    grid = bytearray([FREE]) * (W * H)            # row 0 = top of the image = back of the store
    for x0, y0, x1, y1 in boxes():
        c0, c1 = round(x0 / L.RESOLUTION), round(x1 / L.RESOLUTION)
        r0, r1 = H - round(y1 / L.RESOLUTION), H - round(y0 / L.RESOLUTION)
        for r in range(max(r0, 0), min(r1, H)):
            grid[r * W + c0:r * W + c1] = bytes([WALL]) * (c1 - c0)
    with open(os.path.join(OUT, 'store.pgm'), 'wb') as f:
        f.write(f'P5\n{W} {H}\n255\n'.encode() + bytes(grid))
    with open(os.path.join(OUT, 'store.yaml'), 'w') as f:
        f.write(f'image: store.pgm\nmode: trinary\nresolution: {L.RESOLUTION}\norigin: [0.0, 0.0, 0.0]\n'
                'negate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.25\n')
    print(f'wrote map/store.pgm ({W} x {H} cells, {L.WIDTH:.0f} x {L.DEPTH:.0f} m)')

    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print('Pillow not installed: no preview picture')
        return
    s = 24                                        # pixels per metre
    im = Image.new('RGB', (round(L.WIDTH * s), round(L.DEPTH * s)), 'white')
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
        small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
    except OSError:
        font = small = ImageFont.load_default()

    def px(x, y):
        return x * s, (L.DEPTH - y) * s

    def rect(x0, y0, x1, y1, **kw):
        (a, b), (c, e) = px(x0, y1), px(x1, y0)
        d.rectangle([a, b, c, e], **kw)

    for x0, y0, x1, y1 in L.rack_boxes():
        rect(x0, y0, x1, y1, fill='#f96302')      # orange racking
    for x0, y0, x1, y1, label in L.FRONT_OBSTACLES:
        rect(x0, y0, x1, y1, fill='#777777')
        d.text(px(x0, y0 - 0.1), label, fill='black', font=small)
    rect(0, 0, L.WIDTH, L.DEPTH, outline='black', width=5)
    d.line([px(L.ENTRANCE[0], 0), px(L.ENTRANCE[1], 0)], fill='white', width=7)
    d.text(px(L.ENTRANCE[0] + 0.3, 1.0), 'ENTRANCE', fill='black', font=small)
    for a in range(1, L.N_AISLES + 1):
        x = L.aisle_x(a)
        d.text(px(x - 0.35, 36.6), f'{a}', fill='black', font=font)
        words = L.DEPARTMENTS[a].replace(' & ', ' &\n').replace(', ', ',\n')
        d.multiline_text(px(x - 1.45, 35.8), words, fill='#333333', font=small)
    for a, sh, p in L.all_bays():
        d.text(px(p['light_x'] + (-0.75 if sh % 2 else 0.1), p['light_y'] + 0.3), f'{sh}', fill='white', font=small)
        cx, cy = px(p['x'], p['y'])
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill='#2a7de1')
    hx, hy = px(L.HOME['x'], L.HOME['y'])
    d.ellipse([hx - 9, hy - 9, hx + 9, hy + 9], fill='#1a9c3c')
    d.text((hx - 20, hy - 30), 'ROBOT DOCK', fill='#1a9c3c', font=font)
    d.text(px(22, 8.6), 'front main aisle', fill='#999999', font=small)
    d.text(px(22, 22.4), 'centre cross aisle', fill='#999999', font=small)
    d.text(px(22, 38.4), 'back cross aisle          (aisle numbers; white numbers = bays; blue dots = robot stops)',
           fill='#999999', font=small)
    im.save(os.path.join(OUT, 'store_preview.png'))
    print('wrote map/store_preview.png')


if __name__ == '__main__':
    main()
