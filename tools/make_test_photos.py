#!/usr/bin/env python3
"""Draws the test photos for the photo-first demo path (tools/photo_test.py sends them to the AI).

Nothing is downloaded: each picture is painted here with Pillow (textures from noise, soft shadows, a blur
like a phone camera), as close to a real photo as drawing allows:

    deck_board_cracked.jpg   weathered pressure-treated deck boards, one split along its length, rusty nails
    pipe_joint_leak.jpg      a copper pipe joint under a sink, green corrosion, drops falling, a wet patch
    drywall_hole.jpg         a fist-size hole in a painted drywall wall, torn paper edge, outlet for scale
    toilet_flapper.jpg       inside a toilet tank: a warped red flapper that does not seal, the fill valve, chain
    chipped_paint.jpg        a painted wall with chipped and flaking paint, old coat and plaster showing

    python3 tools/make_test_photos.py [output folder]      (default: tools/photos; needs Pillow)
"""
import math
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

W, H = 1280, 960
random.seed(7)


def noise(size, sigma, blur=0, stretch=None):
    """Grey noise (0-255 around 128); stretch=(sx, sy) makes grain (wood) by scaling a small noise image."""
    if stretch:
        small = Image.effect_noise((max(2, size[0] // stretch[0]), max(2, size[1] // stretch[1])), sigma)
        img = small.resize(size, Image.BICUBIC)
    else:
        img = Image.effect_noise(size, sigma)
    return img.filter(ImageFilter.GaussianBlur(blur)) if blur else img


def tint(grey, dark, light):
    """Maps a grey image onto a colour ramp from dark to light."""
    lut = []
    for c in range(3):
        lut += [int(dark[c] + (light[c] - dark[c]) * v / 255) for v in range(256)]
    return grey.convert('L').convert('RGB').point(lut)


def vignette(img, strength=0.45):
    mask = Image.new('L', img.size, 0)
    d = ImageDraw.Draw(mask)
    for i in range(40):
        a = int(255 * (1 - i / 40))
        d.ellipse([-img.width * 0.25 + i * img.width / 80, -img.height * 0.25 + i * img.height / 80,
                   img.width * 1.25 - i * img.width / 80, img.height * 1.25 - i * img.height / 80], fill=255 - a)
    mask = mask.filter(ImageFilter.GaussianBlur(60))
    dark = Image.new('RGB', img.size, (0, 0, 0))
    return Image.composite(img, Image.blend(img, dark, strength), mask)


def camera(img):
    """A phone camera's look: slight blur, sensor noise, vignette, a little warm light."""
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    grain = noise(img.size, 18).convert('RGB')
    img = ImageChops.add(img, grain, scale=1.0, offset=-128)
    img = vignette(img)
    r, g, b = img.split()
    return Image.merge('RGB', (r.point(lambda v: min(255, int(v * 1.04))), g, b.point(lambda v: int(v * 0.95))))


def shadow_line(d, xy, width, alpha_img):
    ImageDraw.Draw(alpha_img).line(xy, fill=255, width=width)


def deck_board():
    img = Image.new('RGB', (W, H))
    board_h, gap = 150, 14
    y = -40
    n = 0
    cracked = 3
    while y < H:
        grain = noise((W, board_h), 90, stretch=(60, 2))
        base = tint(grain, (92, 70, 48), (168, 140, 105)) if n != cracked else tint(grain, (85, 66, 46), (160, 132, 98))
        # weathering: grey patches
        weather = tint(noise((W, board_h), 60, blur=18), (120, 116, 108), (175, 168, 155))
        base = Image.blend(base, weather, 0.35)
        img.paste(base, (0, y))
        d = ImageDraw.Draw(img)
        # the gap between boards (dark, with dirt)
        d.rectangle([0, y + board_h, W, y + board_h + gap], fill=(28, 22, 18))
        # board ends / butt joint
        jx = 380 + (n * 330) % 700
        d.line([(jx, y), (jx, y + board_h)], fill=(40, 32, 25), width=5)
        # nails along two joist lines, rusty
        for x in (230, 230 + 610):
            for dy in (32, board_h - 32):
                cx, cy = x + random.randint(-4, 4), y + dy
                d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(92, 52, 30))
                d.ellipse([cx - 6, cy - 6, cx + 5, cy + 5], fill=(140, 74, 38))
                for _ in range(10):      # rust streaks
                    rx, ry = cx + random.randint(-14, 14), cy + random.randint(-4, 26)
                    d.ellipse([rx - 3, ry - 2, rx + 3, ry + 2], fill=(120, 66, 36))
        if n == cracked:
            # a long split along the board, wider in the middle, with splinters and a broken-off corner
            pts = []
            x = 120
            yy = y + board_h * 0.45
            while x < 1150:
                pts.append((x, yy))
                x += random.randint(18, 40)
                yy += random.randint(-6, 6)
                yy = max(y + 40, min(y + board_h - 40, yy))
            for i in range(len(pts) - 1):
                w = int(2 + 14 * math.sin(math.pi * i / len(pts)))
                d.line([pts[i], pts[i + 1]], fill=(20, 15, 12), width=w)
                d.line([(pts[i][0], pts[i][1] - w / 2 - 1), (pts[i + 1][0], pts[i + 1][1] - w / 2 - 1)], fill=(196, 170, 130), width=2)
            for i in range(4, len(pts) - 4, 5):     # splinters
                px, py = pts[i]
                d.line([(px, py), (px + random.randint(20, 50), py + random.choice((-1, 1)) * random.randint(8, 22))],
                       fill=(186, 158, 118), width=3)
            # rot: a dark soft patch near the split
            rot = Image.new('L', (W, H), 0)
            ImageDraw.Draw(rot).ellipse([700, y + 20, 980, y + board_h - 10], fill=150)
            rot = rot.filter(ImageFilter.GaussianBlur(25))
            img = Image.composite(Image.new('RGB', (W, H), (52, 40, 30)), img, rot)
        y += board_h + gap
        n += 1
    # a shadow of the person taking the photo
    sh = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh).ellipse([-300, 620, 520, 1300], fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(70))
    img = Image.composite(Image.new('RGB', (W, H), (30, 26, 24)), img, sh)
    return camera(img)


def pipe_leak():
    img = tint(noise((W, H), 40, blur=3), (200, 196, 186), (228, 224, 214))      # painted cabinet back wall
    d = ImageDraw.Draw(img)
    # cabinet floor at the bottom, darker, with a wet stain
    floor = tint(noise((W, 260), 60, stretch=(40, 3)), (110, 86, 62), (150, 122, 92))
    img.paste(floor, (0, H - 260))
    wet = Image.new('L', (W, H), 0)
    ImageDraw.Draw(wet).ellipse([520, H - 170, 980, H - 60], fill=170)
    wet = wet.filter(ImageFilter.GaussianBlur(22))
    img = Image.composite(Image.new('RGB', (W, H), (70, 54, 40)), img, wet)
    d = ImageDraw.Draw(img)
    # the shadow of the pipes on the wall
    sh = Image.new('L', (W, H), 0)
    sd = ImageDraw.Draw(sh)
    sd.rectangle([0, 372, 760, 432], fill=120)
    sd.rectangle([760, 0, 820, 690], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    img = Image.composite(Image.new('RGB', (W, H), (120, 116, 108)), img, sh)
    d = ImageDraw.Draw(img)

    def copper(box, vertical):
        x0, y0, x1, y1 = box
        steps = (x1 - x0) if vertical else (y1 - y0)
        for i in range(steps):
            t = i / max(1, steps - 1)
            shade = 0.55 + 0.45 * math.sin(math.pi * t) ** 0.6
            c = (int(196 * shade), int(112 * shade), int(64 * shade))
            if vertical:
                d.line([(x0 + i, y0), (x0 + i, y1)], fill=c)
            else:
                d.line([(x0, y0 + i), (x1, y0 + i)], fill=c)

    copper((0, 330, 760, 390), False)            # horizontal pipe
    copper((740, 380, 800, 960), True)           # down pipe
    copper((700, 312, 830, 410), True)           # the elbow / coupling (wider)
    d.rectangle([700, 312, 830, 410], outline=(90, 50, 28), width=3)
    # solder joint, verdigris (green-blue corrosion) and mineral crust around the joint
    for _ in range(260):
        x, y = random.gauss(765, 45), random.gauss(400, 22)
        r = random.randint(2, 7)
        d.ellipse([x - r, y - r, x + r, y + r], fill=random.choice([(78, 150, 128), (96, 170, 150), (60, 128, 110), (190, 196, 180)]))
    # water: a film running down the pipe, drops hanging and falling
    film = Image.new('L', (W, H), 0)
    ImageDraw.Draw(film).rectangle([748, 410, 772, 900], fill=90)
    film = film.filter(ImageFilter.GaussianBlur(4))
    img = Image.composite(Image.new('RGB', (W, H), (215, 225, 230)), img, film)
    d = ImageDraw.Draw(img)
    for x, y, s in ((760, 418, 13), (735, 470, 9), (790, 520, 8), (762, 640, 12), (770, 760, 10), (758, 880, 11)):
        d.ellipse([x - s, y - s, x + s, y + s], fill=(170, 195, 210))
        d.polygon([(x - s * 0.7, y - s * 0.6), (x, y - s * 2.2), (x + s * 0.7, y - s * 0.6)], fill=(170, 195, 210))
        d.ellipse([x - s * 0.5, y - s * 0.6, x - s * 0.1, y - s * 0.2], fill=(250, 252, 255))    # highlight
    # a shut-off valve handle on the left for context
    d.rounded_rectangle([140, 300, 220, 420], 10, fill=(150, 150, 150), outline=(80, 80, 80), width=3)
    d.ellipse([125, 230, 235, 300], fill=(190, 40, 35), outline=(110, 20, 20), width=3)
    return camera(img)


def drywall_hole():
    img = tint(noise((W, H), 30, blur=1.2), (214, 208, 196), (238, 234, 224))    # eggshell paint, orange-peel texture
    d = ImageDraw.Draw(img)
    # baseboard and floor
    d.rectangle([0, H - 150, W, H - 60], fill=(245, 243, 238))
    d.line([(0, H - 150), (W, H - 150)], fill=(180, 176, 168), width=3)
    img.paste(tint(noise((W, 60), 70, stretch=(80, 2)), (120, 84, 52), (170, 126, 84)), (0, H - 60))
    d = ImageDraw.Draw(img)
    # an outlet for scale
    d.rounded_rectangle([980, 600, 1060, 730], 8, fill=(246, 244, 240), outline=(170, 166, 158), width=3)
    for oy in (628, 688):
        d.rounded_rectangle([1006, oy, 1014, oy + 22], 2, fill=(60, 60, 60))
        d.rounded_rectangle([1028, oy, 1036, oy + 22], 2, fill=(60, 60, 60))
    # the hole: an irregular dark shape (inside of the wall: stud cavity, insulation glimpse), torn paper rim
    cx, cy = 520, 430
    pts = []
    for i in range(36):
        a = 2 * math.pi * i / 36
        r = 92 + random.randint(-18, 22) + 18 * math.sin(3 * a)
        pts.append((cx + r * math.cos(a) * 1.1, cy + r * math.sin(a)))
    rim = [(cx + (x - cx) * 1.22, cy + (y - cy) * 1.22) for x, y in pts]
    d.polygon(rim, fill=(226, 214, 186))                                   # torn paper, brownish
    d.polygon(pts, fill=(52, 44, 38))
    inner = [(cx + (x - cx) * 0.6 + 15, cy + (y - cy) * 0.6 + 20) for x, y in pts]
    d.polygon(inner, fill=(28, 24, 22))
    d.polygon([(cx - 40, cy + 30), (cx + 10, cy + 10), (cx + 50, cy + 60), (cx - 20, cy + 75)], fill=(214, 170, 120))   # insulation
    for x, y in rim[::3]:                                                # gypsum crumbs and paper flaps
        d.line([(x, y), (x + random.randint(-14, 14), y + random.randint(-14, 14))], fill=(250, 248, 240), width=4)
    # cracks running out from the hole, and the doorknob mark below
    for a in (0.3, 2.2, 4.0, 5.3):
        x, y = cx + 130 * math.cos(a), cy + 120 * math.sin(a)
        for _ in range(6):
            nx, ny = x + 22 * math.cos(a) + random.randint(-8, 8), y + 22 * math.sin(a) + random.randint(-8, 8)
            d.line([(x, y), (nx, ny)], fill=(150, 142, 128), width=2)
            x, y = nx, ny
    sh = Image.new('L', (W, H), 0)                                       # shadow inside the top edge
    ImageDraw.Draw(sh).polygon([(x, y + 14) for x, y in pts[18:]] + pts[:1], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    img = Image.composite(Image.new('RGB', (W, H), (20, 18, 16)), img, sh)
    return camera(img)


def toilet_flapper():
    img = tint(noise((W, H), 25, blur=2), (226, 228, 230), (246, 247, 248))      # white porcelain tank inside
    d = ImageDraw.Draw(img)
    # tank walls in perspective, darker inside, mineral stains
    d.polygon([(0, 0), (160, 120), (160, 840), (0, H)], fill=(196, 200, 204))
    d.polygon([(W, 0), (1120, 120), (1120, 840), (W, H)], fill=(190, 194, 198))
    d.rectangle([160, 840, 1120, H], fill=(205, 208, 212))
    # water: blue-green, with a line and ripples
    water = Image.new('RGB', (W, H), (150, 190, 196))
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rectangle([0, 330, W, H], fill=120)
    img = Image.composite(water, img, m)
    d = ImageDraw.Draw(img)
    d.line([(0, 330), (W, 330)], fill=(120, 160, 170), width=4)
    for y in range(350, 900, 60):
        d.arc([200, y, 1080, y + 30], 200, 340, fill=(180, 214, 220), width=2)
    for _ in range(70):                                                    # rust and mineral spots
        x, y = random.randint(170, 1110), random.randint(500, 900)
        d.ellipse([x - 4, y - 3, x + 4, y + 3], fill=(176, 140, 96))
    # overflow tube + flush valve seat (centre bottom)
    d.rectangle([590, 260, 640, 760], fill=(60, 62, 66))
    d.ellipse([500, 760, 760, 830], fill=(40, 42, 46))                    # the seat
    # the flapper: red rubber, warped, lifted on one side (a gap: water leaks past it)
    d.chord([480, 700, 780, 860], 180, 360, fill=(170, 34, 30))
    d.polygon([(480, 780), (780, 760), (790, 790), (490, 812)], fill=(140, 24, 22))
    d.polygon([(680, 770), (790, 745), (795, 768), (690, 792)], fill=(30, 30, 34))    # the gap
    d.line([(500, 790), (760, 772)], fill=(205, 70, 60), width=3)        # worn edge highlight
    # the chain up to the flush lever (too long, curled)
    x, y = 640, 720
    for i in range(30):
        nx, ny = 640 + 30 * math.sin(i / 3), 720 - i * 16
        d.ellipse([nx - 6, ny - 4, nx + 6, ny + 4], outline=(150, 150, 152), width=2)
    d.rectangle([300, 120, 900, 150], fill=(150, 150, 152))              # the lever arm
    # the fill valve (left): grey column, float cup
    d.rectangle([240, 140, 300, 830], fill=(110, 112, 116))
    d.rectangle([220, 420, 320, 520], fill=(90, 92, 96))
    d.rectangle([236, 110, 304, 150], fill=(70, 72, 76))
    d.line([(300, 200), (560, 230)], fill=(30, 30, 30), width=6)          # refill tube into the overflow
    return camera(img)


def chipped_paint():
    base = tint(noise((W, H), 25, blur=1.5), (78, 112, 128), (104, 140, 156))    # blue-grey paint
    under = tint(noise((W, H), 40, blur=1), (200, 196, 182), (232, 228, 214))   # the old cream coat
    plaster = tint(noise((W, H), 60, blur=1), (170, 160, 146), (204, 196, 182))
    m1 = Image.new('L', (W, H), 0)
    m2 = Image.new('L', (W, H), 0)
    d1, d2 = ImageDraw.Draw(m1), ImageDraw.Draw(m2)
    for _ in range(28):                                                   # chipped patches (irregular)
        cx, cy = random.randint(120, 1160), random.randint(120, 860)
        r = random.randint(18, 70)
        pts = [(cx + (r + random.randint(-r // 2, r // 2)) * math.cos(a), cy + (r + random.randint(-r // 2, r // 2)) * math.sin(a) * 0.7)
               for a in [2 * math.pi * i / 14 for i in range(14)]]
        d1.polygon(pts, fill=255)
        if random.random() < 0.5:
            d2.polygon([(cx + (x - cx) * 0.5, cy + (y - cy) * 0.5) for x, y in pts], fill=255)
    img = Image.composite(under, base, m1)
    img = Image.composite(plaster, img, m2)
    # raised edges of the flaking paint: a light rim and a shadow on the lower side
    edge = m1.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
    img = Image.composite(Image.new('RGB', (W, H), (140, 170, 184)), img, edge)
    shadow = ImageChops.offset(edge, 3, 4).filter(ImageFilter.GaussianBlur(2))
    img = Image.composite(Image.new('RGB', (W, H), (40, 50, 56)), img, shadow.point(lambda v: v // 2))
    d = ImageDraw.Draw(img)
    for _ in range(25):                                                   # loose flakes curling off
        x, y = random.randint(100, 1180), random.randint(100, 880)
        d.polygon([(x, y), (x + random.randint(8, 22), y - random.randint(4, 12)), (x + random.randint(10, 26), y + random.randint(2, 10))],
                  fill=(112, 146, 160), outline=(60, 80, 90))
    # window trim on the right for context
    d.rectangle([1150, 0, W, H], fill=(236, 234, 228))
    d.line([(1150, 0), (1150, H)], fill=(170, 166, 158), width=4)
    return camera(img)


PHOTOS = {
    'deck_board_cracked.jpg': deck_board,
    'pipe_joint_leak.jpg': pipe_leak,
    'drywall_hole.jpg': drywall_hole,
    'toilet_flapper.jpg': toilet_flapper,
    'chipped_paint.jpg': chipped_paint,
}

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photos')
    os.makedirs(out, exist_ok=True)
    for name, draw in PHOTOS.items():
        draw().resize((1024, 768), Image.LANCZOS).save(os.path.join(out, name), quality=82)   # a phone upload size
        print('wrote', os.path.join(out, name))
