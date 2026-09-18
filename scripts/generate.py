# -*- coding: utf-8 -*-
"""
generate.py —— 一键生成：给一个行政区代码，产出可打开的 3D 旅行导览地图骨架

    python generate.py --adcode 330100 --name 杭州
    python generate.py --adcode 140000 --name 山西 --out ./dist
    python generate.py --adcode 140000 --name 山西 --spots ./my_spots.js

流程：
  1. 调用 fetch_admin_geo.py 抓取并简化行政区边界（阿里云 DataV）
  2. 从模板搭出项目目录（index.html / app.js / three.js）
  3. 按边界自动推算 bbox / center / scale，生成 region.js
  4. 生成 spots.js 占位文件（真正的内容由 AI 调研或手工填写）
  5. 调用 build_standalone.py 打包成单个自包含 HTML

依赖：Python 3.8+（无需第三方库）
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
ASSETS = os.path.join(SKILL, 'assets')


def bbox_of(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def in_ring(lng, lat, ring):
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def interior_point(ring, candidates):
    """找一个确定在区域内的点：先试面积质心，不行就用下级行政区中心，最后退回 bbox 中心"""
    s = cx = cy = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        f = x1 * y2 - x2 * y1
        s += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(s) > 1e-9:
        cx /= (3 * s)
        cy /= (3 * s)
        if in_ring(cx, cy, ring):
            return [round(cx, 4), round(cy, 4)]
    for p in candidates:
        if in_ring(p[0], p[1], ring):
            return p
    x0, y0, x1, y1 = bbox_of(ring)
    return [round((x0 + x1) / 2, 4), round((y0 + y1) / 2, 4)]


def region_js(name, bbox, center, scale, vert, cities):
    palette = ['#ff8a5c', '#ffb14d', '#ffd166', '#6ee7b7', '#4dd4ac', '#5fb8ff',
               '#a78bfa', '#f472b6', '#fb7185', '#38bdf8', '#c4b5fd', '#94a3b8']
    colors = ',\n'.join("  '%s': '%s'" % (c, palette[i % len(palette)]) for i, c in enumerate(cities))
    order = json.dumps(cities, ensure_ascii=False)
    return """/* %s —— 区域配置（由 generate.py 自动生成，按需调整） */

/* 下级行政区配色 */
window.RG_CITIES = {
%s
};

window.RG_CONFIG = {
  bbox: %s,          // [最小经度, 最小纬度, 最大经度, 最大纬度]
  center: %s,                // 区域内部参考点（河流界外点会被拉回这里）
  scale: %s,                     // 每纬度对应的世界单位（自动按 60/纬度跨度 推算）
  vert: %s,                      // 高程夸张：山地 2~3、平原 1.5~2
  title: '%s · 3D 旅行导览',
  subtitle: 'INTERACTIVE TRAVEL MAP',
  disclaimer: '门票为参考价，淡旺季/节假日会浮动，以景区官方公告为准',
  statLine: function (spots) { return '共 <b>' + spots.length + '</b> 处景点'; },
  cityOrder: %s,
  extraFilters: [],
  legend: [
    { type: 'dot', color: '#e9b950', glow: true, text: '必打卡' },
    { type: 'dot', color: '#9fb4c9', text: '推荐' },
    { type: 'dot', color: '#5a6478', text: '小众' },
    { type: 'bar', color: 'linear-gradient(90deg,#22301c,#6f7a3a,#7a7268)', text: '海拔' },
    { type: 'bar', color: '#4fb8e8', text: '水系' },
    { type: 'bar', color: '#5fd3f3', text: '推荐线路' }
  ]
};

/* 山脉：每条 3~6 个中心点，r 取 0.15~0.19（度），h 为相对高度 */
window.RG_RANGES = [];

/* 盆地：{n, p:[lng,lat], r, d}，d 取负值表示下凹 */
window.RG_BASINS = [];

/* 水系：{ '河名': [[lng,lat], ...] } */
window.RG_RIVERS = {};

/* 经典线路：{ n: '名称', ids: [...] }，ids 对应 spots.js 里的 id */
window.RG_ROUTES = [];
""" % (name, colors, json.dumps(bbox), json.dumps(center), scale, vert, name, order)


def spots_js(name, center):
    return """/* %s 景点数据 —— 字段说明见 assets/data/spots.example.js
 * 每条：{ id, n, city, lng, lat, cat, icon, star, tag, ticket, time, season, see, tips }
 * icon: temple / pagoda / cave / mount / fall / courtyard / town / gate / water / museum
 * star: 3=必打卡 2=推荐 1=小众
 */
window.RG_SPOTS = [
  // 示例（请替换为真实内容）：
  // { id: 'demo', n: '示例景点', city: '', lng: %s, lat: %s, cat: '古建', icon: 'temple', star: 2,
  //   tag: [], ticket: '以现场为准', time: '1小时', season: '四季',
  //   see: '一句话说清它凭什么值得来：写具体名称/编号/数据，少写形容词。',
  //   tips: ['预约或限流提醒', '最佳观看时机与机位', '顺路串联建议'] }
];
""" % (name, center[0], center[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--adcode', required=True, help='行政区代码，如 140000 山西 / 330100 杭州')
    ap.add_argument('--name', required=True, help='区域名称（用于目录名与标题）')
    ap.add_argument('--out', default='.', help='输出根目录，默认当前目录')
    ap.add_argument('--spots', default=None, help='已写好的 spots.js，直接拷贝使用')
    ap.add_argument('--prov-tol', type=float, default=0.012)
    ap.add_argument('--dist-tol', type=float, default=0.008)
    ap.add_argument('--vert', type=float, default=2.2, help='高程夸张，山地 2~3、平原 1.5~2')
    ap.add_argument('--no-build', action='store_true', help='只搭骨架不打包')
    args = ap.parse_args()

    proj = os.path.abspath(os.path.join(args.out, args.name + '3d'))
    src = os.path.join(proj, 'src')
    os.makedirs(os.path.join(src, 'data'), exist_ok=True)
    os.makedirs(os.path.join(src, 'lib'), exist_ok=True)

    # 1) 模板与依赖
    shutil.copy(os.path.join(ASSETS, 'index_template.html'), os.path.join(src, 'index.html'))
    shutil.copy(os.path.join(ASSETS, 'app_template.js'), os.path.join(src, 'app.js'))
    for f in ('three.min.js', 'OrbitControls.js'):
        shutil.copy(os.path.join(ASSETS, 'lib', f), os.path.join(src, 'lib', f))
    print('[1/5] 模板已就位 ->', src)

    # 2) 边界数据
    geo_path = os.path.join(src, 'data', 'geo.js')
    r = subprocess.run([sys.executable, os.path.join(HERE, 'fetch_admin_geo.py'),
                        args.adcode, '--out', geo_path,
                        '--prov-tol', str(args.prov_tol), '--dist-tol', str(args.dist_tol)])
    if r.returncode != 0:
        print('! 边界抓取失败，已保留空数据占位')
    data = {}
    try:
        raw = open(geo_path, encoding='utf-8').read()
        raw = raw[raw.index('=') + 1:raw.rindex(';')]
        data = json.loads(raw)
    except Exception as e:
        print('! 读取 geo.js 失败:', e)
    province = data.get('province') or [[0, 0], [0, 1], [1, 1]]
    cities = [c['n'] for c in data.get('cities', [])]
    centers = [c['c'] for c in data.get('cities', [])]
    print('[2/5] 边界：轮廓 %d 点，下级行政区 %d 个' % (len(province), len(cities)))

    # 3) 自动推算 bbox / center / scale
    x0, y0, x1, y1 = bbox_of(province)
    pad = max((x1 - x0), (y1 - y0)) * 0.02
    bbox = [round(x0 - pad, 4), round(y0 - pad, 4), round(x1 + pad, 4), round(y1 + pad, 4)]
    center = interior_point(province, centers)
    scale = round(60.0 / max(0.5, (bbox[3] - bbox[1])), 2)
    print('[3/5] 自动推算 bbox=%s center=%s scale=%s' % (bbox, center, scale))
    with open(os.path.join(src, 'data', 'region.js'), 'w', encoding='utf-8') as fp:
        fp.write(region_js(args.name, bbox, center, scale, args.vert, cities))

    # 4) 景点数据
    if args.spots:
        shutil.copy(args.spots, os.path.join(src, 'data', 'spots.js'))
        print('[4/5] 已使用指定的 spots.js')
    else:
        with open(os.path.join(src, 'data', 'spots.js'), 'w', encoding='utf-8') as fp:
            fp.write(spots_js(args.name, center))
        print('[4/5] spots.js 占位已生成（内容待填）')

    # 5) 打包
    if args.no_build:
        print('[5/5] 跳过打包（--no-build）')
        return
    out_html = os.path.join(proj, '%s3D旅行导览地图.html' % args.name)
    r = subprocess.run([sys.executable, os.path.join(HERE, 'build_standalone.py'),
                        '--src', src, '--out', out_html])
    if r.returncode == 0:
        print('[5/5] 打包完成 ->', out_html)
    print('\n下一步：把真实景点内容填进 %s，再重新运行 build_standalone.py 打包。'
          % os.path.join(src, 'data', 'spots.js'))


if __name__ == '__main__':
    main()
