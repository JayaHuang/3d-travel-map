# -*- coding: utf-8 -*-
"""
build_standalone.py —— 把 src/ 下的 index.html + js + lib 内联成单个自包含 HTML

用法:
    python build_standalone.py                       # 默认 src/ -> ./地图.html
    python build_standalone.py --src src --out 山西3D旅行导览地图.html

为什么内联: 交付物要能双击打开(file://)。ES module + import 在 file:// 下会被 CORS 拦，
因此统一用经典 <script> 标签，并把 three.js / OrbitControls / 数据文件全部内联进 HTML。
"""
import argparse
import io
import os
import re

DEFAULT_ASSETS = ['lib/three.min.js', 'lib/OrbitControls.js',
                  'data/region.js', 'data/geo.js', 'data/spots.js', 'app.js']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='src', help='源码目录')
    ap.add_argument('--out', default=None, help='输出 HTML 路径（默认 <src的父目录>/index.html）')
    ap.add_argument('--title', default=None, help='可选：覆盖 <title>')
    args = ap.parse_args()

    src = os.path.abspath(args.src)
    html_path = os.path.join(src, 'index.html')
    html = io.open(html_path, encoding='utf-8').read()

    # 1) 内联所有 <script src="..."></script>
    pattern = re.compile(r'<script src="([^"]+)"></script>')
    missing = []
    for rel in pattern.findall(html):
        p = os.path.join(src, rel)
        if not os.path.exists(p):
            missing.append(rel)
            continue
        code = io.open(p, encoding='utf-8').read()
        html = html.replace('<script src="%s"></script>' % rel, '<script>\n%s\n</script>' % code)
    if missing:
        print('WARN missing script files (left as-is):', missing)

    # 2) 内联 <link rel="stylesheet" href="...">（若有）
    for rel in re.findall(r'<link[^>]+href="([^"]+\.css)"[^>]*>', html):
        p = os.path.join(src, rel)
        if os.path.exists(p):
            css = io.open(p, encoding='utf-8').read()
            html = html.replace('<link rel="stylesheet" href="%s">' % rel, '<style>\n%s\n</style>' % css)

    if args.title:
        html = re.sub(r'<title>.*?</title>', '<title>%s</title>' % args.title, html, flags=re.S)

    out = args.out
    if not out:
        parent = os.path.basename(os.path.dirname(src)) or 'output'
        out = os.path.join(os.path.dirname(src), parent + '.html')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with io.open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('OK -> %s  %.1f KB' % (out, os.path.getsize(out) / 1024.0))


if __name__ == '__main__':
    main()
