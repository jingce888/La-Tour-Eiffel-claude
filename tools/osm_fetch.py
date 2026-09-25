#!/usr/bin/env python3
"""
Downloads the raw OpenStreetMap extracts that tools/osm_build.py turns into
data/paris.bin.  Usage:

    python3 tools/osm_fetch.py <workdir> [layer ...]

Layers: buildings tall water green roads roads_far trees rail bridges
(default: all).  Files that already exist in <workdir> are skipped, so an
interrupted run can simply be restarted.  Buildings are fetched as 4x4 tiles
because the public Overpass servers time out on the dense centre of Paris.

Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
"""
import json, math, os, sys, time, urllib.parse, urllib.request

LAT0, LON0 = 48.8582607, 2.2944985   # tower centre
ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]


def bbox(half_x, half_y, cx=0.0, cy=0.0):
    """s,w,n,e of a box centred cx m east / cy m north of the tower."""
    mlat = 111132.0
    mlon = 111320.0 * math.cos(math.radians(LAT0))
    s, n = LAT0 + (cy - half_y) / mlat, LAT0 + (cy + half_y) / mlat
    w, e = LON0 + (cx - half_x) / mlon, LON0 + (cx + half_x) / mlon
    return f'{s:.5f},{w:.5f},{n:.5f},{e:.5f}'


def fetch(path, query, retries=6):
    if os.path.exists(path) and os.path.getsize(path) > 100:
        print('skip', path)
        return
    data = urllib.parse.urlencode({'data': query}).encode()
    for i in range(retries):
        ep = ENDPOINTS[i % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=data, headers={'User-Agent': 'eiffel-tower-3d/2.0 (map extract)'})
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read()
            json.loads(body)  # reject HTML error pages
            with open(path, 'wb') as f:
                f.write(body)
            print('ok', path, len(body))
            return
        except Exception as e:  # noqa: BLE001 — network errors of every kind are retried
            print('retry', path, i, str(e)[:120])
            time.sleep(10 + i * 10)
    raise SystemExit(f'failed: {path}')


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    work = sys.argv[1]
    layers = sys.argv[2:] or ['buildings', 'tall', 'water', 'green', 'roads', 'roads_far', 'trees', 'rail', 'bridges']
    os.makedirs(work, exist_ok=True)
    out = lambda name: os.path.join(work, name)
    for layer in layers:
        if layer == 'buildings':
            R, k = 3200.0, 0
            for cx in (-3 * R / 4, -R / 4, R / 4, 3 * R / 4):
                for cy in (-3 * R / 4, -R / 4, R / 4, 3 * R / 4):
                    b = bbox(R / 4, R / 4, cx, cy)
                    fetch(out(f'bld_{k:02d}.json'),
                          f'[out:json][timeout:240];(way["building"]({b});relation["building"]({b}););out geom qt;')
                    k += 1
                    time.sleep(3)
        elif layer == 'tall':
            b = bbox(12000, 12000)
            fetch(out('tall.json'),
                  f'[out:json][timeout:240];(way["building"]["height"~"^([4-9][0-9]|[1-9][0-9][0-9])"]({b});'
                  f'relation["building"]["height"~"^([4-9][0-9]|[1-9][0-9][0-9])"]({b});'
                  f'way["building"]["building:levels"~"^([1-9][0-9])$"]({b}););out geom qt;')
        elif layer == 'water':
            b = bbox(14000, 14000)
            fetch(out('water.json'),
                  f'[out:json][timeout:240];(relation["natural"="water"]({b});way["natural"="water"]({b});'
                  f'relation["waterway"="riverbank"]({b});way["waterway"="riverbank"]({b}););out geom qt;')
        elif layer == 'green':
            b = bbox(9000, 9000)
            fetch(out('green.json'),
                  f'[out:json][timeout:240];(way["leisure"~"park|garden|pitch|golf_course"]({b});'
                  f'relation["leisure"~"park|garden|golf_course"]({b});'
                  f'way["landuse"~"grass|forest|cemetery|recreation_ground|meadow|village_green"]({b});'
                  f'relation["landuse"~"forest|cemetery|grass"]({b});way["natural"~"wood|scrub|grassland"]({b});'
                  f'relation["natural"~"wood"]({b}););out geom qt;')
        elif layer == 'roads':
            b = bbox(3500, 3500)
            fetch(out('roads.json'),
                  f'[out:json][timeout:240];way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|'
                  f'unclassified|pedestrian|living_street|service|footway|path|cycleway|steps"]({b});out geom qt;')
        elif layer == 'roads_far':
            b = bbox(12000, 12000)
            fetch(out('roads_far.json'),
                  f'[out:json][timeout:240];way["highway"~"^(motorway|trunk|primary|secondary)$"]({b});out geom qt;')
        elif layer == 'trees':
            b = bbox(3000, 3000)
            fetch(out('trees.json'),
                  f'[out:json][timeout:240];(node["natural"="tree"]({b});way["natural"="tree_row"]({b}););out geom qt;')
        elif layer == 'rail':
            b = bbox(8000, 8000)
            fetch(out('rail.json'),
                  f'[out:json][timeout:240];way["railway"~"rail|subway|light_rail"]["tunnel"!~"yes"]({b});out geom qt;')
        elif layer == 'bridges':
            b = bbox(8000, 8000)
            fetch(out('bridges.json'),
                  f'[out:json][timeout:240];(way["man_made"="bridge"]({b});relation["man_made"="bridge"]({b}););out geom qt;')
        else:
            raise SystemExit(f'unknown layer: {layer}')


if __name__ == '__main__':
    main()
