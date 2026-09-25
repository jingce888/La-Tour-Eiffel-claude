#!/usr/bin/env python3
"""
Builds data/paris.bin — the compact map of the real Paris surroundings that is
embedded into the game.

Input : raw Overpass API JSON extracts (see tools/osm_fetch.py) in a work dir.
Output: data/paris.bin (deflate-raw compressed) + a small stats report.

Coordinates are projected (local equirectangular around the tower centre) and
rotated into the tower frame: +z = bearing 134.2° (towards the Champ de Mars /
École Militaire), +x = bearing 44.2°.  Units in the file: 0.5 m.

Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
"""
import json, math, glob, os, sys, struct, zlib, hashlib, collections

WORK = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data', 'paris.bin')

LAT0, LON0 = 48.8582607, 2.2944985           # tower centre (from the OSM footprint)
MLAT = 111132.0
MLON = 111320.0 * math.cos(math.radians(LAT0))
PHI = math.radians(-45.8)                     # rotate east/south frame into the tower frame
CP, SP = math.cos(PHI), math.sin(PHI)
Q = 2.0                                       # quantisation: 0.5 m

R_DETAIL = 2600.0      # real building footprints within this radius
R_TALL = 12000.0       # tall landmarks (>= 40 m) beyond it


def proj(lat, lon):
    x = (lon - LON0) * MLON
    z = (LAT0 - lat) * MLAT
    return (x * CP + z * SP, -x * SP + z * CP)


def load(pattern):
    seen, out = set(), []
    for f in sorted(glob.glob(os.path.join(WORK, pattern))):
        for e in json.load(open(f))['elements']:
            k = (e['type'], e['id'])
            if k in seen:
                continue
            seen.add(k)
            out.append(e)
    return out


# ------------------------------------------------------------------ geometry utils
def ring_area(r):
    a = 0.0
    for i in range(len(r)):
        x0, z0 = r[i]
        x1, z1 = r[(i + 1) % len(r)]
        a += x0 * z1 - x1 * z0
    return a * 0.5


def centroid(r):
    sx = sum(p[0] for p in r) / len(r)
    sz = sum(p[1] for p in r) / len(r)
    return sx, sz


def dp(points, tol):
    """Douglas–Peucker for an open polyline."""
    if len(points) < 3:
        return points[:]
    stack = [(0, len(points) - 1)]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    while stack:
        a, b = stack.pop()
        ax, az = points[a]
        bx, bz = points[b]
        dx, dz = bx - ax, bz - az
        L = math.hypot(dx, dz) or 1e-9
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, pz = points[i]
            d = abs((px - ax) * dz - (pz - az) * dx) / L
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(r, tol):
    if len(r) > 1 and r[0] == r[-1]:
        r = r[:-1]
    if len(r) < 4:
        return r
    # split at the farthest point pair so DP works on two open chains
    i0 = 0
    far = max(range(len(r)), key=lambda i: (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2)
    c1 = dp(r[i0:far + 1], tol)
    c2 = dp(r[far:] + [r[0]], tol)
    out = c1[:-1] + c2[:-1]
    # drop consecutive near-duplicates
    res = []
    for p in out:
        if not res or math.hypot(p[0] - res[-1][0], p[1] - res[-1][1]) > 0.3:
            res.append(p)
    return res


def assemble_rings(ways):
    """Join way segments (lists of points) into closed rings."""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        cur = segs.pop()
        changed = True
        while changed and cur[0] != cur[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(cur) >= 4 and cur[0] == cur[-1]:
            rings.append(cur)
    return rings


def element_polygons(e):
    """Returns [(outer_ring, [holes])] in lat/lon tuples."""
    if e['type'] == 'way':
        g = e.get('geometry') or []
        pts = [(p['lat'], p['lon']) for p in g if p]
        if len(pts) >= 4 and pts[0] == pts[-1]:
            return [(pts, [])]
        return []
    outers, inners = [], []
    for m in e.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry'):
            continue
        pts = [(p['lat'], p['lon']) for p in m['geometry'] if p]
        (inners if m.get('role') == 'inner' else outers).append(pts)
    orings = assemble_rings(outers)
    irings = assemble_rings(inners)
    res = []
    for o in orings:
        holes = []
        for h in irings:
            if point_in_ring(h[0], o):
                holes.append(h)
        res.append((o, holes))
    return res


def point_in_ring(p, ring):
    x, y = p
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def to_local(ring):
    return [proj(lat, lon) for lat, lon in ring]


def parse_len(v):
    if v is None:
        return None
    try:
        s = str(v).lower().replace(',', '.').replace('m', '').strip().split(';')[0].split()[0]
        return float(s)
    except Exception:
        return None


def h32(s):
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)


# ------------------------------------------------------------------ binary writer
class W:
    def __init__(self):
        self.b = bytearray()

    def u8(self, v): self.b.append(max(0, min(255, int(v))))

    def u16(self, v): self.b += struct.pack('<H', max(0, min(65535, int(v))))

    def u32(self, v): self.b += struct.pack('<I', int(v))

    def var(self, v):
        v = int(v)
        while v >= 0x80:
            self.b.append((v & 0x7F) | 0x80)
            v >>= 7
        self.b.append(v)

    def svar(self, v):
        v = int(round(v))
        self.var((v << 1) ^ (v >> 63) if v < 0 else v << 1)

    def ring(self, pts, state):
        """Delta-encoded ring. state = [lastX, lastZ] carried across rings for compression."""
        self.var(len(pts))
        lx, lz = state
        for x, z in pts:
            qx, qz = int(round(x * Q)), int(round(z * Q))
            self.svar(qx - lx)
            self.svar(qz - lz)
            lx, lz = qx, qz
        state[0], state[1] = lx, lz


# ------------------------------------------------------------------ buildings
STYLE = {'haussmann': 0, 'modern': 1, 'monument': 2, 'plain': 3, 'glass': 4, 'church': 5}
MONUMENT = {'church', 'cathedral', 'chapel', 'basilica'}
CIVIC = {'government', 'public', 'civic', 'museum', 'university', 'school', 'college', 'hospital',
         'palace', 'train_station', 'townhall', 'military', 'embassy', 'library', 'theatre'}
PLAIN = {'industrial', 'warehouse', 'shed', 'garage', 'garages', 'service', 'hut', 'kiosk',
         'container', 'construction', 'greenhouse', 'parking', 'transformer_tower', 'toilets'}


def building_record(e, poly, local_outer, local_holes):
    t = e.get('tags', {})
    b = t.get('building', 'yes')
    if b in ('roof', 'houseboat', 'no', 'ruins', 'bridge', 'boat'):
        return None
    if t.get('name') == 'Tour Eiffel' or t.get('wikidata') == 'Q243':
        return None
    area = abs(ring_area(local_outer))
    if area < 12:
        return None
    h = parse_len(t.get('height'))
    lv = parse_len(t.get('building:levels'))
    rlv = parse_len(t.get('roof:levels'))
    seed = h32(str(e['id']))
    if h is None and lv is not None:
        h = lv * 3.15 + (rlv * 2.6 if rlv is not None else 0.0) + 1.2
    style = 'haussmann'
    if b in MONUMENT or t.get('amenity') == 'place_of_worship':
        style = 'church'
    elif b in CIVIC or t.get('historic') in ('building', 'palace', 'monument'):
        style = 'monument'
    elif b in PLAIN:
        style = 'plain'
    elif b in ('office', 'commercial') and (h or 0) > 38:
        style = 'glass'
    if h is None:
        if style == 'plain':
            h = 4.0 + (seed % 5)
        elif style == 'church':
            h = 22.0
        elif area < 60:
            h = 6.0 + (seed % 6)
        else:
            h = 17.5 + (seed % 70) / 10.0
    h = max(2.5, min(h, 330.0))
    if (h > 60 and style == 'haussmann') or (h > 45 and b in ('office', 'commercial', 'yes', 'apartments', 'hotel')
                                               and (lv or 0) > 12):
        style = 'glass' if b in ('office', 'commercial', 'hotel') or h > 90 else 'modern'
    minh = parse_len(t.get('min_height')) or 0.0
    # mansard roofs: typical Parisian residential blocks of 5+ levels
    roof = 0
    rs = t.get('roof:shape')
    if style == 'haussmann' and h >= 14 and area > 90:
        roof = 1 if rs in (None, 'mansard', 'gambrel', 'double_saltbox', 'hipped') else 0
    if rs == 'flat':
        roof = 0
    return dict(h=h, minh=minh, style=STYLE[style], roof=roof, seed=seed & 255,
                outer=local_outer, holes=local_holes, area=area)


def process_buildings(elements, r_limit, tall_only=False):
    recs = []
    for e in elements:
        for outer, holes in element_polygons(e):
            lo = to_local(outer)
            cx, cz = centroid(lo)
            r = math.hypot(cx, cz)
            if r > r_limit:
                continue
            if tall_only and r <= R_DETAIL:
                continue
            lh = [to_local(h) for h in holes]
            rec = building_record(e, outer, lo, lh)
            if rec is None:
                continue
            if tall_only and rec['h'] < 40:
                continue
            tol = 0.3 if r < 900 else (0.65 if r < 1600 else 1.4)
            if tall_only:
                tol = 1.0
            rec['tol'] = tol
            rec['outer'] = simplify_ring(rec['outer'], tol)
            if len(rec['outer']) < 3:
                continue
            if ring_area(rec['outer']) > 0:        # enforce CW (negative) outer in x/z
                rec['outer'] = rec['outer'][::-1]
            hs = []
            min_hole = 25 if r < 900 else (50 if r < 1600 else 90)
            for h in rec['holes']:
                hh = simplify_ring(h, tol)
                if len(hh) >= 3 and abs(ring_area(hh)) > min_hole:
                    if ring_area(hh) < 0:
                        hh = hh[::-1]
                    hs.append(hh)
            rec['holes'] = hs
            rec['r'] = r
            recs.append(rec)
    recs = merge_blocks(recs)
    # spatial order (256 m rows) → better delta compression and chunking
    def key(rc):
        cx, cz = centroid(rc['outer'])
        return (int((cz + 20000) // 256), int((cx + 20000) // 256), cx)
    recs.sort(key=key)
    return recs


def merge_blocks(recs):
    """Unions touching buildings that share style/roof/height class into city blocks
    (shared party walls are invisible anyway) — roughly halves the vertex count."""
    from shapely.geometry import Polygon
    from shapely.strtree import STRtree
    from shapely.ops import unary_union
    polys, keep = [], []
    for rc in recs:
        try:
            pg = Polygon(rc['outer'], rc['holes']).buffer(0)
        except Exception:
            pg = None
        polys.append(pg)
    groups = collections.defaultdict(list)
    for i, rc in enumerate(recs):
        if polys[i] is None or polys[i].is_empty:
            continue
        if rc['style'] not in (0, 1, 3) or rc['h'] > 45 or rc['minh'] > 0:
            keep.append(rc)
            continue
        hcls = int(round(rc['h'] / 2.4))
        groups[(rc['style'], rc['roof'], hcls)].append(i)
    out = list(keep)
    for key, idxs in groups.items():
        geoms = [polys[i].buffer(0.35, join_style=2) for i in idxs]
        tree = STRtree(geoms)
        parent = list(range(len(idxs)))
        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a
        for a, g in enumerate(geoms):
            for b in tree.query(g):
                b = int(b)
                if b <= a:
                    continue
                if g.intersects(geoms[b]):
                    ra, rb = find(a), find(b)
                    if ra != rb:
                        parent[rb] = ra
        comps = collections.defaultdict(list)
        for a in range(len(idxs)):
            comps[find(a)].append(a)
        for members in comps.values():
            base = recs[idxs[members[0]]]
            if len(members) == 1:
                out.append(base)
                continue
            u = unary_union([geoms[m] for m in members]).buffer(-0.35, join_style=2)
            hs = [recs[idxs[m]]['h'] for m in members]
            areas = [recs[idxs[m]]['area'] for m in members]
            hmean = sum(h * a for h, a in zip(hs, areas)) / sum(areas)
            tol = max(recs[idxs[m]].get('tol', 0.6) for m in members)
            parts = [u] if u.geom_type == 'Polygon' else list(getattr(u, 'geoms', []))
            for pg in parts:
                if pg.is_empty or pg.area < 12:
                    continue
                pg = pg.simplify(tol, preserve_topology=True)
                if pg.is_empty or pg.geom_type != 'Polygon':
                    continue
                outer = list(pg.exterior.coords)[:-1]
                if ring_area(outer) > 0:
                    outer = outer[::-1]
                holes = []
                cx, cz = pg.centroid.x, pg.centroid.y
                rr = math.hypot(cx, cz)
                min_hole = 25 if rr < 900 else (50 if rr < 1600 else 90)
                for it in pg.interiors:
                    h = list(it.coords)[:-1]
                    if len(h) >= 3 and abs(ring_area(h)) > min_hole:
                        if ring_area(h) < 0:
                            h = h[::-1]
                        holes.append(h)
                if len(outer) < 3:
                    continue
                rc = dict(base)
                rc.update(outer=outer, holes=holes, h=hmean, area=pg.area)
                out.append(rc)
    return out


def write_buildings(w, recs):
    w.u32(len(recs))
    st = [0, 0]
    for rc in recs:
        hq = int(round(rc['h'] * 4))           # 0.25 m (height)
        w.u16(hq)
        w.u8(int(round(rc['minh'] * 2)))
        w.u8(rc['style'] | (rc['roof'] << 4))
        w.u8(rc['seed'])
        w.var(len(rc['holes']))
        w.ring(rc['outer'], st)
        for h in rc['holes']:
            w.ring(h, st)


# ------------------------------------------------------------------ areas (water / green / plazas)
GREEN_CLASS = {'grass': 1, 'park': 2, 'garden': 2, 'forest': 3, 'wood': 3, 'scrub': 3, 'cemetery': 4,
               'pitch': 5, 'recreation_ground': 1, 'meadow': 1, 'village_green': 1, 'golf_course': 1,
               'grassland': 1}


def process_areas(elements, classify, r_limit, tol_fn, min_area):
    recs = []
    for e in elements:
        cls = classify(e)
        if cls is None:
            continue
        for outer, holes in element_polygons(e):
            lo = to_local(outer)
            cx, cz = centroid(lo)
            if min(abs(cx), abs(cz)) > r_limit and math.hypot(cx, cz) > r_limit * 1.2:
                continue
            area = abs(ring_area(lo))
            r = math.hypot(cx, cz)
            if area < min_area(r):
                continue
            tol = tol_fn(r)
            o = simplify_ring(lo, tol)
            if len(o) < 3:
                continue
            if ring_area(o) > 0:
                o = o[::-1]
            hs = []
            for h in holes:
                hh = simplify_ring(to_local(h), tol)
                if len(hh) >= 3 and abs(ring_area(hh)) > min_area(r) * 0.5:
                    if ring_area(hh) < 0:
                        hh = hh[::-1]
                    hs.append(hh)
            recs.append(dict(cls=cls, outer=o, holes=hs, area=area))
    recs.sort(key=lambda r: -r['area'])
    return recs


def write_areas(w, recs):
    w.u32(len(recs))
    st = [0, 0]
    for rc in recs:
        w.u8(rc['cls'])
        w.var(len(rc['holes']))
        w.ring(rc['outer'], st)
        for h in rc['holes']:
            w.ring(h, st)


# ------------------------------------------------------------------ lines (roads / rail)
ROAD_CLASS = {'motorway': 1, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4, 'residential': 5,
              'unclassified': 5, 'living_street': 5, 'service': 6, 'pedestrian': 7, 'footway': 8, 'path': 8,
              'cycleway': 8, 'steps': 8, 'motorway_link': 1, 'trunk_link': 1, 'primary_link': 2,
              'secondary_link': 3, 'tertiary_link': 4}
ROAD_WIDTH = {1: 18, 2: 20, 3: 15, 4: 12, 5: 9, 6: 5, 7: 8, 8: 3.2}


def process_lines(elements, classify, r_limit, tol_fn):
    recs = []
    for e in elements:
        if e['type'] != 'way':
            continue
        c = classify(e)
        if c is None:
            continue
        cls, width, flags = c
        g = e.get('geometry') or []
        pts = [proj(p['lat'], p['lon']) for p in g if p]
        if len(pts) < 2:
            continue
        # clip to box (keep segments with any vertex inside)
        inside = [max(abs(x), abs(z)) <= r_limit for x, z in pts]
        if not any(inside):
            continue
        mx = sum(p[0] for p in pts) / len(pts)
        mz = sum(p[1] for p in pts) / len(pts)
        pts = dp(pts, tol_fn(math.hypot(mx, mz)))
        recs.append(dict(cls=cls, width=width, flags=flags, pts=pts))
    recs.sort(key=lambda r: (r['cls'], int((r['pts'][0][1] + 20000) // 256), r['pts'][0][0]))
    return recs


def merge_lines(recs, tol=None):
    """Joins polylines of identical class/width/flags that share end points."""
    from shapely.geometry import LineString, MultiLineString
    from shapely.ops import linemerge
    groups = collections.defaultdict(list)
    for r in recs:
        groups[(r['cls'], round(r['width'], 1), r['flags'])].append(r['pts'])
    out = []
    for (cls, width, flags), lines in groups.items():
        # snap endpoints to 0.5 m so linemerge can join them
        snapped = [[(round(x * 2) / 2, round(z * 2) / 2) for x, z in l] for l in lines]
        merged = linemerge(MultiLineString([LineString(l) for l in snapped if len(set(l)) >= 2]))
        geoms = [merged] if merged.geom_type == 'LineString' else list(merged.geoms)
        for g in geoms:
            pts = list(g.coords)
            if tol:
                pts = dp(pts, tol)
            if len(pts) >= 2:
                out.append(dict(cls=cls, width=width, flags=flags, pts=pts))
    out.sort(key=lambda r: (r['cls'], int((r['pts'][0][1] + 20000) // 256), r['pts'][0][0]))
    return out


def write_lines(w, recs):
    w.u32(len(recs))
    st = [0, 0]
    for rc in recs:
        w.u8(rc['cls'])
        w.u8(int(round(rc['width'] * 4)))
        w.u8(rc['flags'])
        w.ring(rc['pts'], st)


# ------------------------------------------------------------------ trees
def process_trees(elements, r_limit):
    pts = []
    for e in elements:
        if e['type'] == 'node':
            x, z = proj(e['lat'], e['lon'])
            if max(abs(x), abs(z)) <= r_limit:
                pts.append((x, z))
        elif e['type'] == 'way' and e.get('geometry'):
            line = [proj(p['lat'], p['lon']) for p in e['geometry'] if p]
            for i in range(len(line) - 1):
                (x0, z0), (x1, z1) = line[i], line[i + 1]
                L = math.hypot(x1 - x0, z1 - z0)
                n = max(1, int(L / 7.5))
                for k in range(n):
                    t = k / n
                    x, z = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
                    if max(abs(x), abs(z)) <= r_limit:
                        pts.append((x, z))
    # thin duplicates on a 1.5 m grid
    seen, out = set(), []
    for x, z in pts:
        k = (int(x // 1.5), int(z // 1.5))
        if k in seen:
            continue
        seen.add(k)
        out.append((x, z))
    out.sort(key=lambda p: (int((p[1] + 20000) // 128), p[0]))
    return out


def write_points(w, pts):
    w.u32(len(pts))
    lx = lz = 0
    for x, z in pts:
        qx, qz = int(round(x)), int(round(z))   # 1 m
        w.svar(qx - lx)
        w.svar(qz - lz)
        lx, lz = qx, qz


# ------------------------------------------------------------------ main
def main():
    stats = collections.OrderedDict()
    sections = []

    blds = load('bld_*.json')
    recs = process_buildings(blds, R_DETAIL)
    w = W(); write_buildings(w, recs); sections.append((1, w.b))
    stats['buildings'] = (len(recs), sum(len(r['outer']) for r in recs), len(w.b))

    tall = load('tall.json')
    trecs = process_buildings(tall, R_TALL, tall_only=True)
    w = W(); write_buildings(w, trecs); sections.append((2, w.b))
    stats['tall'] = (len(trecs), sum(len(r['outer']) for r in trecs), len(w.b))

    def water_cls(e):
        t = e.get('tags', {})
        if t.get('water') == 'river' or t.get('waterway') == 'riverbank' or t.get('name') == 'La Seine':
            return 1
        if t.get('natural') == 'water':
            if t.get('water') in ('fountain',):
                return 3
            return 2
        return None
    water = process_areas(load('water.json'), water_cls, 14000,
                          lambda r: 0.6 if r < 2500 else 2.5, lambda r: 40 if r < 2500 else 1500)
    w = W(); write_areas(w, water); sections.append((3, w.b))
    stats['water'] = (len(water), sum(len(r['outer']) for r in water), len(w.b))

    def green_cls(e):
        t = e.get('tags', {})
        for k in ('leisure', 'landuse', 'natural'):
            v = t.get(k)
            if v in GREEN_CLASS:
                return GREEN_CLASS[v]
        return None
    green = process_areas(load('green.json'), green_cls, 9000,
                          lambda r: 0.5 if r < 1500 else (1.8 if r < 3500 else 5.0),
                          lambda r: 25 if r < 1500 else (1200 if r < 3500 else 12000))
    w = W(); write_areas(w, green); sections.append((4, w.b))
    stats['green'] = (len(green), sum(len(r['outer']) for r in green), len(w.b))

    def road_cls(e):
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in ROAD_CLASS:
            return None
        if t.get('tunnel') in ('yes', 'building_passage') or t.get('covered') == 'yes':
            return None
        if t.get('indoor') == 'yes' or t.get('level', '0').startswith('-'):
            return None
        cls = ROAD_CLASS[hw]
        wdt = parse_len(t.get('width')) or ROAD_WIDTH[cls]
        lanes = parse_len(t.get('lanes'))
        if lanes and cls <= 5 and not t.get('width'):
            wdt = max(wdt * 0.6, lanes * 3.3 + 3)
        flags = (1 if t.get('bridge') in ('yes', 'viaduct') else 0) | (2 if t.get('area') == 'yes' else 0)
        return cls, min(wdt, 60), flags
    def road_cls_near(e):
        c = road_cls(e)
        if c is None:
            return None
        g = e.get('geometry') or []
        if not g:
            return None
        x, z = proj(g[len(g) // 2]['lat'], g[len(g) // 2]['lon'])
        r = math.hypot(x, z)
        t = e.get('tags', {})
        cls = c[0]
        if cls == 8 and (r > 1300 or t.get('footway') in ('sidewalk', 'crossing') or t.get('highway') == 'steps'):
            return None
        if cls == 6 and r > 700:
            return None
        if cls == 7 and r > 2200:
            return None
        if t.get('footway') == 'sidewalk' or t.get('sidewalk') == 'yes' and cls == 8:
            return None
        return c
    roads = merge_lines(process_lines(load('roads.json'), road_cls_near, 3300, lambda r: 0.5 if r < 1500 else 1.2))
    w = W(); write_lines(w, roads); sections.append((5, w.b))
    stats['roads'] = (len(roads), sum(len(r['pts']) for r in roads), len(w.b))

    def road_far_cls(e):
        c = road_cls(e)
        if c is None or c[0] > 2:
            return None
        return c
    roads_far_all = merge_lines(process_lines(load('roads_far.json'), road_far_cls, 12000, lambda r: 6.0), tol=6.0)
    roads_far = [r for r in roads_far_all if max(max(abs(x), abs(z)) for x, z in r['pts']) > 3300]
    w = W(); write_lines(w, roads_far); sections.append((6, w.b))
    stats['roads_far'] = (len(roads_far), sum(len(r['pts']) for r in roads_far), len(w.b))

    def rail_cls(e):
        t = e.get('tags', {})
        rw = t.get('railway')
        if rw not in ('rail', 'subway', 'light_rail'):
            return None
        if t.get('service') in ('siding', 'yard', 'spur', 'crossover'):
            return None
        if t.get('tunnel') in ('yes',) or t.get('covered') == 'yes':
            return None
        flags = 1 if t.get('bridge') in ('yes', 'viaduct') else 0
        return (1 if rw == 'rail' else 2), 4.5, flags
    rail = merge_lines(process_lines(load('rail.json'), rail_cls, 6000, lambda r: 1.0 if r < 3000 else 3.0), tol=2.0)
    w = W(); write_lines(w, rail); sections.append((7, w.b))
    stats['rail'] = (len(rail), sum(len(r['pts']) for r in rail), len(w.b))

    trees = process_trees(load('trees.json'), 2200)
    w = W(); write_points(w, trees); sections.append((8, w.b))
    stats['trees'] = (len(trees), len(trees), len(w.b))

    def bridge_cls(e):
        return 1
    bridges = process_areas(load('bridges.json'), bridge_cls, 8000, lambda r: 0.5, lambda r: 150)
    w = W(); write_areas(w, bridges); sections.append((9, w.b))
    stats['bridges'] = (len(bridges), sum(len(r['outer']) for r in bridges), len(w.b))

    # ---- pack
    body = bytearray(b'EIF2')
    body += struct.pack('<I', len(sections))
    for sid, data in sections:
        body += struct.pack('<II', sid, len(data))
        body += data
    comp = zlib.compressobj(9, zlib.DEFLATED, -15, 9)
    packed = comp.compress(bytes(body)) + comp.flush()
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    open(OUT, 'wb').write(packed)
    for k, (n, pts, size) in stats.items():
        print(f'{k:10s} {n:7d} items {pts:8d} pts {size / 1024:8.1f} KB raw')
    print(f'total raw {len(body) / 1024:.1f} KB  → deflated {len(packed) / 1024:.1f} KB  (base64 ≈ {len(packed) * 4 / 3 / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
