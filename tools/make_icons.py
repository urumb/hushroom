"""Generates Hushroom's PNG icons with only the Python standard library.
Design: a rounded dusk-purple square with a cream crescent moon and two stars.
Run:  python tools/make_icons.py
"""
import math
import struct
import zlib
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def lerp(a, b, t):
    return a + (b - a) * t


def pixel(u, v, maskable):
    """Return RGBA for normalised coords u,v in 0..1 (supersampled by caller)."""
    # background rounded square (full bleed when maskable)
    r = 0.22
    if not maskable:
        dx = max(abs(u - 0.5) - (0.5 - r), 0)
        dy = max(abs(v - 0.5) - (0.5 - r), 0)
        if dx * dx + dy * dy > r * r:
            return (0, 0, 0, 0)
    t = (u * 0.4 + v * 0.6)
    col = (lerp(0x2d, 0x14, t), lerp(0x23, 0x1a, t), lerp(0x46, 0x3a, t))
    s = 0.78 if maskable else 1.0  # keep art inside the maskable safe zone
    x = (u - 0.5) / s + 0.5
    y = (v - 0.5) / s + 0.5
    cream = (0xf6, 0xdc, 0xb0)
    # crescent = big circle minus offset circle
    in_moon = math.hypot(x - 0.46, y - 0.5) < 0.27 and math.hypot(x - 0.58, y - 0.42) >= 0.22
    star1 = math.hypot(x - 0.70, y - 0.28) < 0.028
    star2 = math.hypot(x - 0.78, y - 0.46) < 0.02
    if in_moon or star1 or star2:
        col = cream
    return (col[0], col[1], col[2], 255)


def render(size, maskable=False):
    ss = 3
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    r, g, b, a = pixel((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size, maskable)
                    acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a
            n = ss * ss
            a = acc[3] / n
            if acc[3] == 0:
                row += bytes([0, 0, 0, 0])
            else:
                row += bytes([int(acc[0] / acc[3]), int(acc[1] / acc[3]), int(acc[2] / acc[3]), int(a)])
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


for name, size, mask in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)]:
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(render(size, mask))
    print('wrote', name)
