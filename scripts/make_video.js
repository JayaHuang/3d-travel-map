/**
 * make_video.js —— 生成分章节演示视频的序列帧（逐帧摆机位，避开软渲染低帧率）
 *
 * 用法: node make_video.js <成品html> <输出目录>
 * 输出: <输出目录>/vframes/v000.png ...（12fps 编码后约 16 秒）
 *
 * 分镜：全景 → 主题筛选 → 景点详情(云冈) → 环绕 → 详情(应县木塔) → 详情(平遥)
 *       → 经典线路 → 夜景 → 收尾
 * 场景与地区耦合的点击目标通过 SCENE 里的选择器配置，换地区改这里即可。
 */
const path = require('path');
const fs = require('fs');
const { findPlaywright, findChromium, GPU_ARGS } = require('./_browser.js');

const HTML = process.argv[2];
const OUT = process.argv[3] || path.resolve(__dirname, 'media');
if (!HTML) { console.error('usage: node make_video.js <html> <outdir>'); process.exit(1); }

const FPS = 12;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 分镜配置：spot/route/chip 用文本定位，换地区只改这里 */
const SCENE = {
  chipAll: '#chips .chip:has-text("全部")',
  chipFilter: '#chips .chip:has-text("古建")',
  routeChip: '#routes .rchip:has-text("古建")',
  spot1: '#list .item:has-text("云冈")',
  spot2: '#list .item:has-text("应县木塔")',
  spot3: '#list .item:has-text("平遥")',
  centerId: 'pingyao'   // 兜底：镜头目标点
};

(async () => {
  const vdir = path.join(OUT, 'vframes');
  fs.mkdirSync(vdir, { recursive: true });

  const { chromium } = findPlaywright();
  const exe = findChromium();
  if (!exe) throw new Error('未找到 chromium，可设置 PLAYWRIGHT_BROWSERS_PATH');
  console.log('chromium:', exe);
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: GPU_ARGS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('file:///' + path.resolve(HTML).split(path.sep).join('/'), { waitUntil: 'load' });
  await page.waitForTimeout(7000);

  await page.evaluate(() => {
    const S = window.__SX;
    window.__setCam = (az, el, d, t) => {
      S.controls.target.set(t[0], t[1], t[2]);
      S.camera.position.set(t[0] + Math.sin(az) * Math.cos(el) * d, t[1] + Math.sin(el) * d,
                            t[2] + Math.cos(az) * Math.cos(el) * d);
      S.controls.update();
    };
    window.__cur = () => {
      const S = window.__SX, t = S.controls.target, p = S.camera.position;
      const dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return { az: Math.atan2(dx, dz), el: Math.asin(dy / d), dist: d, tgt: [t.x, t.y, t.z] };
    };
    window.__markerPos = id => {
      for (const m of S.markers) if (m.sp.id === id) {
        const p = m.g.position; return [p.x, p.y, p.z];
      }
      return null;
    };
  });

  const setCam = (az, el, d, t) => page.evaluate(a => window.__setCam(a[0], a[1], a[2], a[3]), [az, el, d, t]);
  const HOME = await page.evaluate(() => window.__cur());
  let n = 0;
  const shot = async () => {
    await sleep(750);
    await page.screenshot({ path: path.join(vdir, 'v' + String(n).padStart(3, '0') + '.png') });
    n++;
  };
  /* 从当前机位平滑过渡到目标机位，逐帧截图 */
  const tween = async (frames, toAz, toEl, toD, toT, easeK) => {
    const from = await page.evaluate(() => window.__cur());
    for (let i = 1; i <= frames; i++) {
      const k = i / frames, e = easeK ? k * k * (3 - 2 * k) : k;
      await setCam(from.az + (toAz - from.az) * e, from.el + (toEl - from.el) * e,
                   from.dist + (toD - from.dist) * e,
                   from.tgt.map((v, j) => v + (toT[j] - v) * e));
      await shot();
    }
  };
  const click = async sel => {
    try { await page.click(sel, { timeout: 4000 }); return true; }
    catch (e) { console.log('  (跳过点击:', sel, ')'); return false; }
  };

  /* S1 全景环绕 20f */
  for (let i = 0; i < 20; i++) {
    const k = i / 19;
    await setCam(HOME.az - 0.18 + 0.34 * k, HOME.el - 0.04 + 0.02 * Math.sin(k * Math.PI), HOME.dist, HOME.tgt);
    await shot();
  }
  console.log('S1 done', n);

  /* S2 主题筛选 24f：点“古建”，镜头向筛选结果推近 */
  await click(SCENE.chipFilter);
  await sleep(600);
  {
    const from = await page.evaluate(() => window.__cur());
    const tgt = HOME.tgt.map((v, j) => v + ([10, 0, -14][j] - v) * 0.55);
    for (let i = 0; i < 24; i++) {
      const k = i / 23, e = k * k * (3 - 2 * k);
      await setCam(from.az + 0.10 * e, from.el, from.dist + (46 - from.dist) * e, tgt);
      await shot();
    }
  }
  console.log('S2 done', n);

  /* S3 景点详情 26f：点云冈 → 卡片弹出 → 镜头推到跟前 */
  await click(SCENE.spot1);
  await sleep(3000);                                   // 等内置飞行动画结束
  {
    const P = await page.evaluate(() => window.__markerPos('yungang')) ||
              await page.evaluate(() => window.__cur().tgt);
    await tween(26, (await page.evaluate(() => window.__cur())).az + 0.34, 0.72, 19, P);
  }
  console.log('S3 done', n);

  /* S4 环绕 14f */
  {
    const c = await page.evaluate(() => window.__cur());
    for (let i = 0; i < 14; i++) {
      const k = i / 13;
      await setCam(c.az + 0.42 * k, c.el - 0.05 * k, c.dist + 2 * k, c.tgt);
      await shot();
    }
  }
  console.log('S4 done', n);

  /* S5 详情 22f：应县木塔 */
  await click(SCENE.spot2);
  await sleep(3000);
  {
    const P = await page.evaluate(() => window.__markerPos('yingxian')) ||
              await page.evaluate(() => window.__cur().tgt);
    await tween(22, (await page.evaluate(() => window.__cur())).az - 0.30, 0.70, 18, P);
  }
  console.log('S5 done', n);

  /* S6 详情 22f：恢复全部筛选 → 平遥古城 */
  await click(SCENE.chipAll);
  await sleep(500);
  await click(SCENE.spot3);
  await sleep(3000);
  {
    const P = await page.evaluate(() => window.__markerPos('pingyao')) ||
              await page.evaluate(() => window.__cur().tgt);
    await tween(22, (await page.evaluate(() => window.__cur())).az + 0.28, 0.74, 20, P);
  }
  console.log('S6 done', n);

  /* S7 经典线路 26f：关卡片 → 选线路 → 拉回全景看线路 */
  await page.click('#cx').catch(() => {});
  await sleep(400);
  await click(SCENE.routeChip);
  await sleep(2500);
  await page.click('#bTour').catch(() => {});
  await sleep(400);
  await tween(26, HOME.az + 0.10, HOME.el, HOME.dist + 3, HOME.tgt, true);
  console.log('S7 done', n);

  /* S8 夜景 28f */
  await page.click('#bNight').catch(() => {});
  await sleep(2500);
  {
    const from = await page.evaluate(() => window.__cur());
    for (let i = 0; i < 28; i++) {
      const k = i / 27;
      await setCam(from.az - 0.22 + 0.36 * k, from.el - 0.02 + 0.02 * Math.sin(k * Math.PI),
                   from.dist - 5 * Math.sin(k * Math.PI), from.tgt);
      await shot();
    }
  }
  console.log('S8 done', n);

  /* S9 收尾 8f：回到日景全景定格 */
  await page.click('#bNight').catch(() => {});
  await sleep(2000);
  await tween(8, HOME.az + 0.04, HOME.el, HOME.dist, HOME.tgt, true);
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, '05-video-end.png') });
  console.log('S9 done, total', n, 'frames =', (n / FPS).toFixed(1) + 's @' + FPS + 'fps');

  fs.writeFileSync(path.join(OUT, 'vframes', 'count.txt'), String(n));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
