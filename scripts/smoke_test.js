/**
 * smoke_test.js —— 无头浏览器冒烟测试：截图 + 控制台报错 + 场景统计
 *
 * 用法:
 *   NODE_PATH=<node workspace>/node_modules node smoke_test.js <html文件> [输出目录]
 *   node smoke_test.js D:/proj/山西地图.html ./shots
 *
 * 环境要点:
 *   - 需要 playwright-core 与 chromium；路径由 scripts/_browser.js 自动探测，
 *     也可用 PLAYWRIGHT_NODE_PATH / PLAYWRIGHT_BROWSERS_PATH 指定
 *   - playwright-core 版本号常大于已装浏览器版本，因此必须显式指定 executablePath
 *   - 软渲染(swiftshader) 只有 ~3 FPS：相机飞行动画要等 10s+ 才到位，别误判成 bug
 */
const path = require('path');
const fs = require('fs');
const { findPlaywright, findChromium, GPU_ARGS } = require('./_browser.js');

const HTML = process.argv[2];
const OUTDIR = process.argv[3] || path.dirname(HTML);
if (!HTML) { console.error('usage: node smoke_test.js <html> [outdir]'); process.exit(1); }

(async () => {
  const { chromium } = findPlaywright();
  const exe = findChromium();
  if (!exe) throw new Error('chromium 未找到，检查 ms-playwright 目录');
  console.log('chromium:', exe);

  const browser = await chromium.launch({
    headless: true, executablePath: exe,
    args: GPU_ARGS
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push('[' + m.type() + '] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));

  const file = 'file:///' + path.resolve(HTML).split(path.sep).join('/');
  await page.goto(file, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  // 启动失败自检：遮罩没消失说明脚本抛异常，提前把错误打出来并强制移除遮罩继续跑
  const stuck = await page.evaluate(() => {
    const l = document.getElementById('load');
    if (l && getComputedStyle(l).display !== 'none' && !l.classList.contains('gone')) {
      l.style.display = 'none'; return true;
    }
    return false;
  });
  if (stuck) {
    console.log('!! 启动异常：loading 遮罩未自动消失，多半是脚本报错（见下方 ERRORS）');
    console.log('ERRORS(' + errs.length + ')');
    errs.slice(0, 10).forEach(e => console.log('  ' + e.slice(0, 300)));
  }

  const info = await page.evaluate(() => {
    const c = document.getElementById('scene');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    return {
      canvas: c ? c.width + 'x' + c.height : 'NO CANVAS',
      webgl: !!gl,
      listItems: document.querySelectorAll('#list .item').length,
      chips: document.querySelectorAll('#chips .chip').length,
      routes: document.querySelectorAll('#routes .rchip').length
    };
  });
  console.log('INFO', JSON.stringify(info));

  const stats = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else res(+(n / 3).toFixed(1)); };
    requestAnimationFrame(loop);
  }));
  console.log('FPS(swiftshader 软渲染，真 GPU 通常 60):', stats);

  fs.mkdirSync(OUTDIR, { recursive: true });
  await page.screenshot({ path: path.join(OUTDIR, 'shot1_overview.png') });

  // 选中第一个景点（飞行需要 ~10s，软渲染帧率低）
  const first = await page.$('#list .item');
  if (first) { await first.click(); await page.waitForTimeout(12000); }
  await page.screenshot({ path: path.join(OUTDIR, 'shot2_detail.png') });

  // 夜景 + 第一条线路
  const night = await page.$('#bNight');
  if (night) await night.click();
  const route = await page.$('#routes .rchip:nth-child(1)');
  if (route) await route.click();
  await page.waitForTimeout(14000);
  await page.screenshot({ path: path.join(OUTDIR, 'shot3_night_route.png') });

  console.log('ERRORS(' + errs.length + ')');
  errs.slice(0, 25).forEach(e => console.log('  ' + e.slice(0, 300)));
  console.log('shots ->', OUTDIR);
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
