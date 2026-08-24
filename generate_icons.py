"""Erzeugt die App-Icons fuer Wegpunkt: eine geschwungene Route mit drei
Stopp-Punkten, passend zum Signature-Element der App (Route-Ribbon)."""
import math
from PIL import Image, ImageDraw

BG = (15, 23, 32, 255)       # --bg-chrome
ACCENT = (255, 106, 43, 255)  # --accent
WHITE = (246, 244, 239, 255)  # --surface


def rounded_bg(size, radius_ratio):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
    return img, d


def route_glyph(img, d, size, safe_ratio):
    s = size * safe_ratio
    off = (size - s) / 2
    # Drei Punkte einer sanften Route (S-Kurve)
    p0 = (off + s * 0.16, off + s * 0.78)
    p1 = (off + s * 0.5, off + s * 0.22)
    p2 = (off + s * 0.84, off + s * 0.66)

    # Glatte Kurve durch quadratische Bezier-Interpolation (viele kleine Segmente)
    def bezier(t, a, b, c):
        x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t ** 2 * c[0]
        y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t ** 2 * c[1]
        return (x, y)

    ctrl = (off + s * 0.5, off + s * 0.86)
    pts_a = [bezier(i / 30, p0, ctrl, p1) for i in range(31)]
    ctrl2 = (off + s * 0.5, off + s * 0.14)
    pts_b = [bezier(i / 30, p1, ctrl2, p2) for i in range(31)]
    line_w = max(3, int(size * 0.045))
    d.line(pts_a, fill=ACCENT, width=line_w, joint="curve")
    d.line(pts_b, fill=ACCENT, width=line_w, joint="curve")

    def dot(center, r, fill, outline=None, ow=0):
        x, y = center
        bbox = [x - r, y - r, x + r, y + r]
        if outline:
            d.ellipse(bbox, fill=outline)
            r2 = r - ow
            d.ellipse([x - r2, y - r2, x + r2, y + r2], fill=fill)
        else:
            d.ellipse(bbox, fill=fill)

    r_small = s * 0.07
    r_big = s * 0.10
    dot(p0, r_small, ACCENT, outline=BG, ow=max(2, int(size * 0.012)))
    dot(p1, r_small, ACCENT, outline=BG, ow=max(2, int(size * 0.012)))
    dot(p2, r_big, WHITE)
    dot(p2, r_big * 0.42, ACCENT)


def make_icon(path, size, maskable=False):
    radius_ratio = 0.0 if maskable else 0.22
    safe_ratio = 0.62 if maskable else 0.8
    img, d = rounded_bg(size, radius_ratio)
    route_glyph(img, d, size, safe_ratio)
    img.save(path)


if __name__ == "__main__":
    make_icon("icons/icon-192.png", 192, maskable=False)
    make_icon("icons/icon-512.png", 512, maskable=False)
    make_icon("icons/icon-192-maskable.png", 192, maskable=True)
    make_icon("icons/icon-512-maskable.png", 512, maskable=True)
    make_icon("icons/icon-180.png", 180, maskable=False)  # Apple touch icon
    print("Icons erzeugt.")
