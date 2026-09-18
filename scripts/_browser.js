/**
 * _browser.js —— 定位 playwright-core 与 chromium（供 smoke_test.js / make_media.js 共用）
 *
 * 环境变量（可选）：
 *   PLAYWRIGHT_NODE_PATH   playwright-core 所在目录
 *   PLAYWRIGHT_BROWSERS_PATH  浏览器安装根目录（playwright 官方变量名）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function findPlaywright() {
  const cands = [];
  if (process.env.PLAYWRIGHT_NODE_PATH) {
    cands.push(path.join(process.env.PLAYWRIGHT_NODE_PATH, 'playwright-core'));
  }
  cands.push('playwright-core', 'playwright');
  // 常见托管位置
  for (const base of [
    path.join(os.homedir(), '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules'),
    path.join(os.homedir(), '.cache', 'ms-playwright-node')
  ]) {
    cands.push(path.join(base, 'playwright-core'));
  }
  for (const c of cands) {
    try { return require(c); } catch (e) { /* 继续尝试 */ }
  }
  throw new Error('未找到 playwright-core。请 npm i playwright-core，或用 PLAYWRIGHT_NODE_PATH 指定其所在目录');
}

function browserRoots() {
  const roots = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) roots.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  const home = os.homedir();
  for (const rel of [
    ['AppData', 'Local', 'ms-playwright'],
    ['.cache', 'ms-playwright'],
    ['Library', 'Caches', 'ms-playwright']
  ]) {
    roots.push(path.join(home, ...rel));
  }
  return roots;
}

function findChromium() {
  let best = null;
  for (const root of browserRoots()) {
    if (!fs.existsSync(root)) continue;
    let dirs = [];
    try { dirs = fs.readdirSync(root); } catch (e) { continue; }
    for (const d of dirs) {
      const m = d.match(/^chromium(?:_headless_shell)?-(\d+)$/);
      if (!m) continue;
      const ver = parseInt(m[1], 10);
      const shell = path.join(root, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      const win = path.join(root, d, 'chrome-win', 'chrome.exe');
      const mac = path.join(root, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
      const lin = path.join(root, d, 'chrome-linux', 'chrome');
      const exe = [shell, win, mac, lin].find(p => fs.existsSync(p));
      if (exe && (!best || ver > best.ver)) best = { exe, ver };
    }
  }
  return best && best.exe;
}

const GPU_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

module.exports = { findPlaywright, findChromium, browserRoots, GPU_ARGS };
