# -*- coding: utf-8 -*-
"""
fetch_admin_geo.py —— 抓取行政区边界并简化为前端可用的 geo.js

用法:
    python fetch_admin_geo.py 140000                 # 山西省（省级，输出省级轮廓 + 11 地市）
    python fetch_admin_geo.py 330100                 # 杭州市（市级，输出市界 + 下辖区县）
    python fetch_admin_geo.py 140000 --out D:/proj/src/data/geo.js
    python fetch_admin_geo.py 140000 --prov-tol 0.012 --dist-tol 0.008

数据源: 阿里云 DataV.GeoAtlas (https://geo.datav.aliyun.com/areas_v3/bound/{adcode}.json)
输出:   window.RG_GEO = { province: [[lng,lat],...], cities: [{n,c,r}] };

注意: 部分环境下 curl 会因 SSL 校验失败(exit 35)，本脚本用 urllib + 关闭证书校验的方式抓取。
"""
import argparse
import json
import math
import os
import ssl
import sys
import urllib.request

API = 'https://geo.datav.aliyun.com/areas_v3/bound/{}.json'


def get_json(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return json.loads(urllib.request.urlopen(req, timeout=60, context=ctx).read().decode('utf-8'))


def rdp(pts, eps):
    """Douglas-Peucker 抽稀"""
    if len(pts) < 3:
        return pts
    stack = [(0, len(pts) - 1)]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        x1, y1 = pts[i]
        x2, y2 = pts[j]
        dx, dy = x2 - x1, y2 - y1
        den = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            x0, y0 = pts[k]
            d = math.hypot(x0 - x1, y0 - y1) if den == 0 else abs(dy * (x0 - x1) - dx * (y0 - y1)) / den
            if d > best:
                best, bi = d, k
        if best > eps:
            keep[bi] = True
            stack.append((i, bi))
            stack.append((bi, j))
    return [p for p, k in zip(pts, keep) if k]


def ring_area(r):
    s = 0.0
    for i in range(len(r)):
        x1, y1 = r[i]
        x2, y2 = r[(i + 1) % len(r)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def simplify_ring(r, eps, min_pts=8):
    r = rdp(r, eps)
    if len(r) < min_pts:
        r = rdp(r, eps * 0.3)
    return r


def rings_of(geom):
    t = geom['type']
    polys = geom['coordinates'] if t == 'MultiPolygon' else [geom['coordinates']]
    out = []
    for poly in polys:
        for ring in poly:
            out.append(ring)
    return out


def build_geo(adcode, prov_tol=0.012, dist_tol=0.008, min_area=0.0009, verbose=True):
    """抓取 adcode 的行政区边界并简化，返回 {'province': ring, 'cities': [{n,c,r}]}"""
    outline = get_json(API.format(adcode))
    try:
        sub = get_json(API.format(adcode + '_full'))
    except Exception:
        sub = {'features': []}

    best = None
    for f in outline['features']:
        for ring in rings_of(f['geometry']):
            r = [[round(x, 4), round(y, 4)] for x, y in ring]
            if best is None or ring_area(r) > ring_area(best):
                best = r
    province = simplify_ring(best, prov_tol)
    if verbose:
        print('outline pts %d -> %d' % (len(best), len(province)))

    cities = []
    feats = sub['features'] if len(sub['features']) > 1 else []
    for f in feats:
        p = f.get('properties', {})
        rings = []
        for ring in rings_of(f['geometry']):
            r = [[round(x, 4), round(y, 4)] for x, y in ring]
            if ring_area(r) < min_area:
                continue
            r = simplify_ring(r, dist_tol)
            if len(r) < 4:
                continue
            rings.append(r)
        if not rings:
            continue
        rings.sort(key=ring_area, reverse=True)
        c = p.get('center') or p.get('centroid') or rings[0][0]
        cities.append({
            'n': p.get('name', '').replace('市', '').replace('县', '').replace('区', ''),
            'c': [round(c[0], 4), round(c[1], 4)],
            'r': rings[:3],
        })
        if verbose:
            print('  %-8s rings=%d pts=%d' % (cities[-1]['n'], len(cities[-1]['r']),
                                              sum(len(x) for x in cities[-1]['r'])))
    return {'province': province, 'cities': cities}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('adcode', help='行政区代码，如 140000 山西 / 330100 杭州')
    ap.add_argument('--out', default=None, help='输出路径，默认 ./data/geo.js')
    ap.add_argument('--prov-tol', type=float, default=0.012, help='主体轮廓抽稀容差(度)')
    ap.add_argument('--dist-tol', type=float, default=0.008, help='下级行政区抽稀容差(度)')
    ap.add_argument('--min-area', type=float, default=0.0009, help='丢弃过小的碎块(平方度)')
    args = ap.parse_args()

    out_path = args.out or os.path.join('data', 'geo.js')
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)

    data = build_geo(args.adcode, args.prov_tol, args.dist_tol, args.min_area)
    with open(out_path, 'w', encoding='utf-8') as fp:
        fp.write('window.RG_GEO=')
        json.dump(data, fp, ensure_ascii=False, separators=(',', ':'))
        fp.write(';')
    print('written %s (%.1f KB), %d subdivisions' % (out_path, os.path.getsize(out_path) / 1024.0, len(data['cities'])))


if __name__ == '__main__':
    main()
