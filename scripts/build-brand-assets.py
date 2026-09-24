"""Build the Empreende iCEV web assets from the official logo SVGs.

Sources live in design/brand/ (Illustrator exports "Ativo 1..6"):
  ativo-1  full logo, white type + gradient symbol (for dark backgrounds)
  ativo-3  full logo, navy type + gradient symbol (primary)
  ativo-6  full logo, flat navy + magenta
The logo is split into parts by position (symbol on top, EMPR≡NDE row,
iCEV / divider / tagline row) and recomposed into the lockups the app needs.
PNG icons are rendered with a local headless Edge/Chrome.

Run from the repo root:  python scripts/build-brand-assets.py
"""
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET

SRC = 'design/brand'
OUT = 'public/brand'
ICONS = 'public/icons'

NAVY = '#182A50'
MAGENTA = '#C0176B'
PINK = '#ED1E79'

SVG_NS = 'http://www.w3.org/2000/svg'
XLINK_NS = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', SVG_NS)
ET.register_namespace('xlink', XLINK_NS)


# ---------------------------------------------------------------- geometry

def _cubic_extrema(p0, p1, p2, p3):
    """Parameter values in (0,1) where a 1-D cubic Bezier has a local extremum."""
    a = -p0 + 3 * p1 - 3 * p2 + p3
    b = 2 * (p0 - 2 * p1 + p2)
    c = p1 - p0
    ts = []
    if abs(a) < 1e-12:
        if abs(b) > 1e-12:
            ts.append(-c / b)
    else:
        disc = b * b - 4 * a * c
        if disc >= 0:
            root = math.sqrt(disc)
            ts += [(-b + root) / (2 * a), (-b - root) / (2 * a)]
    return [t for t in ts if 0 < t < 1]


def _cubic_point(p0, p1, p2, p3, t):
    mt = 1 - t
    return mt ** 3 * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t ** 3 * p3


def path_bbox(d):
    tokens = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?', d)
    xs, ys = [], []
    i = 0
    cmd = None
    x = y = sx = sy = 0.0
    last_ctrl = None

    def num():
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    def add(px, py):
        xs.append(px)
        ys.append(py)

    while i < len(tokens):
        if re.match(r'[A-Za-z]', tokens[i]):
            cmd = tokens[i]
            i += 1
            if cmd in 'Zz':
                x, y = sx, sy
                last_ctrl = None
                continue
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'M':
            nx, ny = num(), num()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            sx, sy = x, y
            add(x, y)
            cmd = 'l' if rel else 'L'
            last_ctrl = None
        elif c == 'L':
            nx, ny = num(), num()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            add(x, y)
            last_ctrl = None
        elif c == 'H':
            nx = num()
            x = x + nx if rel else nx
            add(x, y)
            last_ctrl = None
        elif c == 'V':
            ny = num()
            y = y + ny if rel else ny
            add(x, y)
            last_ctrl = None
        elif c in 'CS':
            if c == 'C':
                x1, y1 = num(), num()
                if rel:
                    x1, y1 = x + x1, y + y1
            else:
                x1, y1 = (2 * x - last_ctrl[0], 2 * y - last_ctrl[1]) if last_ctrl else (x, y)
            x2, y2, ex, ey = num(), num(), num(), num()
            if rel:
                x2, y2, ex, ey = x + x2, y + y2, x + ex, y + ey
            for t in _cubic_extrema(x, x1, x2, ex):
                add(_cubic_point(x, x1, x2, ex, t), _cubic_point(y, y1, y2, ey, t))
            for t in _cubic_extrema(y, y1, y2, ey):
                add(_cubic_point(x, x1, x2, ex, t), _cubic_point(y, y1, y2, ey, t))
            add(ex, ey)
            last_ctrl = (x2, y2)
            x, y = ex, ey
        elif c in 'QT':
            if c == 'Q':
                qx, qy = num(), num()
                if rel:
                    qx, qy = x + qx, y + qy
            else:
                qx, qy = (2 * x - last_ctrl[0], 2 * y - last_ctrl[1]) if last_ctrl else (x, y)
            ex, ey = num(), num()
            if rel:
                ex, ey = x + ex, y + ey
            add(qx, qy)  # control point hull: slightly conservative, fine for cropping
            add(ex, ey)
            last_ctrl = (qx, qy)
            x, y = ex, ey
        elif c == 'A':
            rx, ry = num(), num()
            num(); num(); num()
            ex, ey = num(), num()
            if rel:
                ex, ey = x + ex, y + ey
            add(ex - rx, ey - ry)
            add(ex + rx, ey + ry)
            x, y = ex, ey
            last_ctrl = None
        else:
            i += 1
    return min(xs), min(ys), max(xs), max(ys)


def element_bbox(el):
    tag = el.tag.split('}')[-1]
    if tag == 'path':
        return path_bbox(el.get('d'))
    if tag in ('polygon', 'polyline'):
        nums = [float(v) for v in re.findall(r'-?(?:\d+\.?\d*|\.\d+)', el.get('points'))]
        px, py = nums[0::2], nums[1::2]
        return min(px), min(py), max(px), max(py)
    if tag == 'rect':
        x, y = float(el.get('x', 0)), float(el.get('y', 0))
        return x, y, x + float(el.get('width')), y + float(el.get('height'))
    if tag == 'circle':
        cx, cy, r = float(el.get('cx')), float(el.get('cy')), float(el.get('r'))
        return cx - r, cy - r, cx + r, cy + r
    raise ValueError(f'unsupported element {tag}')


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


# ---------------------------------------------------------------- source parsing

SHAPES = {'path', 'polygon', 'polyline', 'rect', 'circle'}


def load(name):
    tree = ET.parse(os.path.join(SRC, name))
    root = tree.getroot()
    defs = root.find(f'{{{SVG_NS}}}defs')
    shapes = []
    for el in root.iter():
        if el.tag.split('}')[-1] in SHAPES and not _inside_defs(root, el):
            shapes.append((el, element_bbox(el)))
    return defs, shapes


def _inside_defs(root, target):
    defs = root.find(f'{{{SVG_NS}}}defs')
    return defs is not None and any(target is el for el in defs.iter())


def split_parts(shapes):
    parts = {'symbol': [], 'wordmark': [], 'icev': [], 'divider': [], 'tagline': []}
    for el, box in shapes:
        x1, y1, x2, y2 = box
        if y2 < 320:
            parts['symbol'].append((el, box))
        elif y1 >= 320 and y2 <= 450:
            parts['wordmark'].append((el, box))
        elif x2 < 380:
            parts['icev'].append((el, box))
        elif x1 < 420 and x2 - x1 < 20:
            parts['divider'].append((el, box))
        else:
            parts['tagline'].append((el, box))
    return parts


# ---------------------------------------------------------------- output

def serialize(el):
    return ET.tostring(el, encoding='unicode').replace(f' xmlns="{SVG_NS}"', '').replace(f' xmlns:xlink="{XLINK_NS}"', '')


def write_svg(path, view_box, body, defs=None, title='Empreende iCEV'):
    x, y, w, h = view_box
    defs_xml = serialize(defs) if defs is not None else ''
    svg = (
        f'<svg xmlns="{SVG_NS}" xmlns:xlink="{XLINK_NS}" viewBox="{x:.2f} {y:.2f} {w:.2f} {h:.2f}" '
        f'role="img" aria-label="{title}">'
        f'<title>{title}</title>{defs_xml}{body}</svg>\n'
    )
    svg = re.sub(r'>\s+<', '><', svg)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg)
    print(f'wrote {path} ({len(svg)} bytes)')
    return svg


def lockup(parts, names, pad=0.0):
    items = [item for name in names for item in parts[name]]
    box = union([b for _, b in items])
    body = ''.join(serialize(el) for el, _ in items)
    x1, y1, x2, y2 = box
    return (x1 - pad, y1 - pad, (x2 - x1) + 2 * pad, (y2 - y1) + 2 * pad), body


def gradient_defs():
    return (
        '<defs><linearGradient id="brand-gradient" x1="0" y1="1" x2="1" y2="0">'
        f'<stop offset="0" stop-color="{NAVY}"/><stop offset=".64" stop-color="{MAGENTA}"/>'
        f'<stop offset="1" stop-color="{PINK}"/></linearGradient></defs>'
    )


def icon_svg(symbol_d, size, maskable):
    """White network symbol on the brand gradient. Maskable keeps the art in the safe zone."""
    x1, y1, x2, y2 = path_bbox(symbol_d)
    sw, sh = x2 - x1, y2 - y1
    # A 2.95:1 shape fits the maskable safe circle (80% diameter) up to ~75% width.
    target_w = size * (0.72 if maskable else 0.84)
    scale = target_w / sw
    tx = (size - sw * scale) / 2 - x1 * scale
    ty = (size - sh * scale) / 2 - y1 * scale
    radius = 0 if maskable else size * 0.22
    return (
        f'<svg xmlns="{SVG_NS}" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
        f'{gradient_defs()}'
        f'<rect width="{size}" height="{size}" rx="{radius:.1f}" fill="url(#brand-gradient)"/>'
        f'<path d="{symbol_d}" fill="#FFFFFF" transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f})"/>'
        '</svg>'
    )


# ---------------------------------------------------------------- rendering

def find_browser():
    # Chrome first: it writes the screenshot before exiting. Edge's launcher returns early.
    candidates = [
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        shutil.which('chromium'), shutil.which('google-chrome'), shutil.which('chrome'),
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


def render_png(svg_markup, out_path, width, height, background='transparent'):
    browser = find_browser()
    if not browser:
        print(f'skip {out_path}: no Edge/Chrome found for rendering')
        return
    html = (
        '<!doctype html><html><head><meta charset="utf-8"><style>'
        f'html,body{{margin:0;padding:0;width:{width}px;height:{height}px;overflow:hidden;background:{background}}}'
        'svg{display:block;width:100%;height:100%}</style></head>'
        f'<body>{svg_markup}</body></html>'
    )
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, 'render.html')
        shot = os.path.join(tmp, 'shot.png')
        with open(page, 'w', encoding='utf-8') as f:
            f.write(html)
        # A separate profile keeps an already-open Edge/Chrome from swallowing the call.
        subprocess.run([
            browser, '--headless=new', '--disable-gpu', '--hide-scrollbars',
            f'--user-data-dir={os.path.join(tmp, "profile")}', '--no-first-run', '--no-default-browser-check',
            '--force-device-scale-factor=1', f'--window-size={width},{height}',
            '--default-background-color=00000000', f'--screenshot={shot}',
            'file:///' + page.replace('\\', '/'),
        ], check=True, capture_output=True, timeout=60)
        for _ in range(60):  # Edge writes the file after its launcher process exits
            if os.path.exists(shot) and os.path.getsize(shot) > 0:
                break
            time.sleep(0.25)
        shutil.copyfile(shot, out_path)
    print(f'rendered {out_path} ({width}x{height})')


# ---------------------------------------------------------------- main

def main():
    os.makedirs(OUT, exist_ok=True)

    defs3, shapes3 = load('ativo-3.svg')   # primary: navy type, gradient symbol and bars
    defs1, shapes1 = load('ativo-1.svg')   # for dark surfaces: white type
    parts3 = split_parts(shapes3)
    parts1 = split_parts(shapes1)
    for name, items in parts3.items():
        print(f'  {name}: {len(items)} shapes, bbox {tuple(round(v) for v in union([b for _, b in items]))}')

    everything = ['symbol', 'wordmark', 'icev', 'divider', 'tagline']
    vb, body = lockup(parts3, everything, pad=4)
    full = write_svg(f'{OUT}/logo.svg', vb, body, defs3)
    vb, body = lockup(parts1, everything, pad=4)
    write_svg(f'{OUT}/logo-on-dark.svg', vb, body, defs1)

    # Name only, stacked like the logo (EMPR≡NDE over iCEV) for app headers.
    vb, body = lockup(parts3, ['wordmark', 'icev'], pad=2)
    write_svg(f'{OUT}/wordmark.svg', vb, body, defs3)
    vb, body = lockup(parts1, ['wordmark', 'icev'], pad=2)
    write_svg(f'{OUT}/wordmark-on-dark.svg', vb, body, defs1)

    vb, body = lockup(parts3, ['symbol'], pad=2)
    write_svg(f'{OUT}/symbol.svg', vb, body, defs3, title='Símbolo Empreende iCEV')

    # All-white version from the navy monochrome logo, for gradient and photo backgrounds.
    defs4, shapes4 = load('ativo-4.svg')
    parts4 = split_parts(shapes4)
    for name, names in (('logo-white', everything), ('wordmark-white', ['wordmark', 'icev'])):
        vb, body = lockup(parts4, names, pad=4 if name == 'logo-white' else 2)
        white_defs = ET.fromstring(serialize(defs4).replace('#182a50', '#ffffff').replace('#182A50', '#ffffff')) if defs4 is not None else None
        write_svg(f'{OUT}/{name}.svg', vb, body, white_defs)

    symbol_d = parts3['symbol'][0][0].get('d')
    favicon = icon_svg(symbol_d, 64, maskable=False)
    for path in (f'{ICONS}/favicon.svg', 'public/favicon.svg'):
        with open(path, 'w', encoding='utf-8') as f:
            f.write(favicon + '\n')
        print(f'wrote {path}')

    render_png(icon_svg(symbol_d, 192, maskable=True), f'{ICONS}/icon-192.png', 192, 192)
    render_png(icon_svg(symbol_d, 512, maskable=True), f'{ICONS}/icon-512.png', 512, 512)
    render_png(icon_svg(symbol_d, 512, maskable=False), f'{ICONS}/favicon.png', 512, 512)

    # E-mail header: most mail clients block SVG, so auth e-mails use a PNG on white.
    email_view_box = re.search(r'viewBox="([^"]+)"', full).group(1)
    email_inner = full[full.index('>') + 1:full.rindex('</svg>')]
    email_logo = (
        f'<svg xmlns="{SVG_NS}" xmlns:xlink="{XLINK_NS}" viewBox="0 0 520 300" width="520" height="300">'
        '<rect width="520" height="300" fill="#FFFFFF"/>'
        f'<svg x="20" y="10" width="480" height="280" viewBox="{email_view_box}">{email_inner}</svg>'
        '</svg>'
    )
    render_png(email_logo, f'{OUT}/logo-email.png', 520, 300, background='#FFFFFF')

    # Social preview (WhatsApp, Instagram, iMessage): the full logo on the page background.
    logo_view_box = re.search(r'viewBox="([^"]+)"', full).group(1)
    logo_inner = full[full.index('>') + 1:full.rindex('</svg>')]
    og_page = (
        f'<svg xmlns="{SVG_NS}" xmlns:xlink="{XLINK_NS}" viewBox="0 0 1200 630" width="1200" height="630">'
        '<rect width="1200" height="630" fill="#F3F4F8"/>'
        f'<svg x="330" y="95" width="540" height="440" viewBox="{logo_view_box}">{logo_inner}</svg>'
        '</svg>'
    )
    render_png(og_page, f'{OUT}/og-image.png', 1200, 630, background='#F3F4F8')


if __name__ == '__main__':
    sys.exit(main())
