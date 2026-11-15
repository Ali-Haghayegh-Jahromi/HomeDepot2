"""The made-up Home Depot store: the single source for the map, the shelf
poses in the database and the robot's stops. Plain Python, no dependencies.

Map frame: x to the right (east), y to the back of the store (north), metres,
(0, 0) at the front-left corner, as seen from above with the entrance at the
bottom.

    y=40 +------------------------------------------------------------+
         |  back wall: receiving                                      |
    y=37 |  ----------------- back cross aisle -------------------    |
    y=34 |  R  a  R  a  R  ...                                   R    |
         |  R  i  R  i  R        bays 9-16 (back half)           R    |
    y=23 |  R  s  R  s  R                                        R    |
         |  ----------------- centre cross aisle ----------------     |
    y=21 |  R  l  R  l  R                                        R    |
         |  R  e  R  e  R        bays 1-8 (front half)           R    |
    y=10 |  R  1  R  2  R  ...                             12    R    |
         |  ----------------- front main aisle ------------------     |
    y=6  |    [returns]   [reg][reg][reg][reg][reg][reg]   [pro desk] |
    y=0  +--entrance--K-----------------------------------------------+
                      K = kiosk, with the robot's dock (HOME) beside it

Assumptions (ours, for the concept):
- 12 aisles, numbered 1-12 from left to right, each 3.0 m wide, between
  1.5 m deep double-sided racks.
- 16 bays per aisle, each 2.75 m long. Odd bays are on the left (west) rack,
  even bays on the right (east) rack, like house numbers; bays 1-2 are nearest
  the front, 15-16 nearest the back.
- The database's "shelf" column is the bay number.
"""
import math

RESOLUTION = 0.05            # m per map cell
WIDTH, DEPTH = 60.0, 40.0    # store size (x, y)
WALL = 0.2

N_AISLES = 12
N_BAYS = 16                  # per aisle: 8 on each side
AISLE_WIDTH = 3.0
RACK_DEPTH = 1.5
RACK_X0 = 2.25               # left edge of the first rack
PITCH = AISLE_WIDTH + RACK_DEPTH
BAY_LENGTH = 2.75
FRONT_Y0, FRONT_Y1 = 10.0, 21.0   # front half of the racks (bays 1-8)
BACK_Y0, BACK_Y1 = 23.0, 34.0     # back half (bays 9-16)
STOP_OFFSET = 0.55           # the robot stops this far from the aisle centre, towards the bay
LIGHT_HEIGHT = 1.4           # shelf-tag light height (m)

DEPARTMENTS = {
    1: 'Lumber & Decking',
    2: 'Building Materials',
    3: 'Fasteners',
    4: 'Hand Tools',
    5: 'Power Tools',
    6: 'Door & Cabinet Hardware',
    7: 'Electrical',
    8: 'Lighting',
    9: 'Plumbing',
    10: 'Kitchen & Bath',
    11: 'Paint',
    12: 'Paint Supplies, Adhesives & Safety',
}

# The kiosk stands just inside the entrance. The robot's dock is right beside
# it: the robot leaves from the dock and comes back to it after every visit.
KIOSK = (8.0, 2.2)
DOCK = (9.45, 2.2)                                 # centre of the dock pad
HOME = {'x': DOCK[0], 'y': DOCK[1], 'yaw': math.pi / 2}   # on the dock, facing into the store
ROBOT_RADIUS = 0.3

# Things in the front of the store, as boxes (x0, y0, x1, y1, label)
FRONT_OBSTACLES = [
    (7.6, 1.8, 8.4, 2.6, 'kiosk'),
    (13.0, 1.5, 19.0, 4.0, 'returns / service desk'),
    *[(22.0 + 3.5 * i, 2.0, 23.2 + 3.5 * i, 5.0, f'register {i + 1}') for i in range(6)],
    (47.0, 1.5, 56.0, 4.0, 'pro desk'),
]
ENTRANCE = (3.0, 7.0)        # gap in the front wall (x0, x1); shown on the map, closed for the robot


# RViz draws a space between words very wide ("Deck   board"), so labels are laid out one text marker
# per word. These are rough glyph widths of its font, in units of the text height (measured on the
# top view: "Deck" at 1.3 m is about 2.6 m wide, "ROBOT" at 0.8 m about 2.5 m).
_NARROW = set("fijlrtI1.,'!:;| ")
_WIDE = set('mwMW')


def rviz_text_width(word, h):
    """About how wide RViz draws one word (no spaces) at text height h, in metres."""
    em = sum(0.28 if c in _NARROW else 0.85 if c in _WIDE else 0.69 if c.isupper() else 0.55 if c.isdigit() else 0.50
             for c in word)
    return em * h * 0.9


def rviz_words(text, x, y, h, space=0.3):
    """Each word of text with its centre x, laid out side by side around x: [(word, cx, y)]."""
    words = text.split()
    widths = [rviz_text_width(w, h) for w in words]
    total = sum(widths) + space * h * (len(words) - 1)
    out, left = [], x - total / 2
    for w, ww in zip(words, widths):
        out.append((w, left + ww / 2, y))
        left += ww + space * h
    return out


def rack_boxes():
    """Every rack as (x0, y0, x1, y1): 13 rows, each in a front and a back half."""
    boxes = []
    for k in range(N_AISLES + 1):
        x0 = RACK_X0 + PITCH * k
        for y0, y1 in ((FRONT_Y0, FRONT_Y1), (BACK_Y0, BACK_Y1)):
            boxes.append((x0, y0, x0 + RACK_DEPTH, y1))
    return boxes


def aisle_x(aisle):
    """x of the aisle's centre line."""
    return RACK_X0 + RACK_DEPTH + AISLE_WIDTH / 2 + PITCH * (aisle - 1)


def bay(aisle, shelf):
    """Where the robot stops for a bay, and where that bay's shelf-tag light is.

    Returns x, y, yaw (robot stop, facing the shelf) and light_x, light_y, light_z.
    """
    assert 1 <= aisle <= N_AISLES and 1 <= shelf <= N_BAYS, (aisle, shelf)
    position = (shelf - 1) // 2               # 0-7 along the aisle, front to back
    west = shelf % 2 == 1
    y_start = FRONT_Y0 if position < 4 else BACK_Y0
    y = y_start + BAY_LENGTH * (position % 4 + 0.5)
    cx = aisle_x(aisle)
    side = -1.0 if west else 1.0
    return {
        'x': round(cx + side * STOP_OFFSET, 3), 'y': round(y, 3),
        'yaw': round(math.pi if west else 0.0, 4),
        'light_x': round(cx + side * AISLE_WIDTH / 2, 3), 'light_y': round(y, 3),
        'light_z': LIGHT_HEIGHT,
    }


def all_bays():
    return [(a, s, bay(a, s)) for a in range(1, N_AISLES + 1) for s in range(1, N_BAYS + 1)]
