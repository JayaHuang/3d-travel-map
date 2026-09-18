/**
 * make_media.js —— 生成 README 用演示素材：静帧截图 + 分镜序列帧（再由 ffmpeg 转 GIF / MP4）
 * 用法: node make_media.js <成品html> <输出目录>   # 输出 01-04 截图 + frames/f*.png 序列帧
 *
 * 关键点：软渲染只有 ~3FPS，不能用实时录屏（会卡成幻灯片）。
 * 做法是"逐帧摆机位"——每一帧显式设置相机位姿再截图，最后按 12fps 编码，得到流畅演示。
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const HTML = process.argv[2];
const OUT = process.argv[3] || path.resolve(__dirname, 'media');
const W = 1440, H = 900;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'G:/AppData-Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('file:///' + path.resolve(HTML).split(path.sep).join('/'), { waitUntil: 'load' });
  await page.waitForTimeout(7000);

  // 在页面里注入摆机位的辅助函数
  await page.evaluate(() => {
    const S = window.__SX;
    window.__setCam = (az, el, d, t) => {
      S.controls.target.set(t[0], t[1], t[2]);
      S.camera.position.set(
        t[0] + Math.sin(az) * Math.cos(el) * d,
        t[1] + Math.sin(el) * d,
        t[2] + Math.cos(az) * Math.cos(el) * d
      );
      S.controls.update();
    };
    window.__markerPos = id => {
      for (const m of S.markers) if (m.sp.id === id) return [m.g.position.x, m.g.position.y, m.g.position.z];
      return [0, 0, 0];
    };
  });

  const HOME = await page.evaluate(() => {
    const S = window.__SX, t = S.controls.target, p = S.camera.position;
    const dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { az: Math.atan2(dx, dz), el: Math.asin(dy / d), dist: d, tgt: [t.x, t.y, t.z] };
  });
  console.log('HOME', JSON.stringify(HOME));

  const setCam = (az, el, d, t) => page.evaluate(
    a => window.__setCam(a[0], a[1], a[2], a[3]), [az, el, d, t]);
  const shot = async (name) => { await sleep(900); await page.screenshot({ path: path.join(OUT, name) }); };

  // ---------- 静帧 1：全景 ----------
  await setCam(HOME.az, HOME.el, HOME.dist, HOME.tgt);
  await shot('01-overview.png');
  console.log('shot 01');

  // ---------- 分镜 A：全景环绕 (12 帧) ----------
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const k = i / 11;
    await setCam(HOME.az - 0.16 + 0.42 * k, HOME.el - 0.05 * Math.sin(k * Math.PI), HOME.dist - 4 * k, HOME.tgt);
    await shot('frames/f' + String(n++).padStart(2, '0') + '.png');
  }
  console.log('phase A done, frames=' + n);

  // ---------- 分镜 B：俯冲到云冈石窟 (12 帧) ----------
  const P = await page.evaluate(() => window.__markerPos('yungang'));
  for (let i = 0; i < 12; i++) {
    const k = i / 11, e = k * k * (3 - 2 * k);            // smoothstep
    const t = HOME.tgt.map((v, j) => v + (P[j] - v) * e);
    await setCam(HOME.az + 0.26 + 0.14 * e, HOME.el + 0.10 * e,
                 HOME.dist + (23 - HOME.dist) * e, t);
    await shot('frames/f' + String(n++).padStart(2, '0') + '.png');
  }
  console.log('phase B done, frames=' + n);

  // ---------- 点击景点 → 弹出详情卡 ----------
  await page.click('#list .item');
  await page.waitForTimeout(13000);                        // 飞行动画（软渲染很慢）
  const SEL = await page.evaluate(() => {
    const S = window.__SX, t = S.controls.target, p = S.camera.position;
    const dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { az: Math.atan2(dx, dz), el: Math.asin(dy / d), dist: d, tgt: [t.x, t.y, t.z] };
  });
  await shot('02-detail.png');
  console.log('shot 02');

  // ---------- 分镜 C：环绕当前景点 (10 帧) ----------
  for (let i = 0; i < 10; i++) {
    const k = i / 9;
    await setCam(SEL.az + 0.40 * k, SEL.el - 0.06 * k, SEL.dist + 3 * k, SEL.tgt);
    await shot('frames/f' + String(n++).padStart(2, '0') + '.png');
  }
  console.log('phase C done, frames=' + n);

  // ---------- 夜景 + 线路 ----------
  await page.click('#bNight');
  await page.click('#routes .rchip:nth-child(1)');
  await page.waitForTimeout(2000);
  for (let i = 0; i < 14; i++) {                            // 拉回全景并环绕
    const k = i / 13, e = k * k * (3 - 2 * k);
    const t = SEL.tgt.map((v, j) => v + (HOME.tgt[j] - v) * e);
    await setCam(SEL.az + 0.40 + 0.30 * e, SEL.el - 0.06 + 0.06 * e,
                 SEL.dist + 3 + (HOME.dist - SEL.dist - 3) * e, t);
    await shot('frames/f' + String(n++).padStart(2, '0') + '.png');
  }
  console.log('phase D done, frames=' + n);

  await shot('03-night-route.png');
  console.log('shot 03');

  // ---------- 静帧 4：回到日景展示筛选面板 ----------
  await page.click('#bNight');
  await page.waitForTimeout(2500);
  await shot('04-day-route.png');
  console.log('shot 04, total frames=' + n);

  fs.writeFileSync(path.join(OUT, 'frames', 'count.txt'), String(n));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
