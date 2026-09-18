/* 山西 3D 旅行导览地图 —— 主程序 */
(function () {
'use strict';

var CFG = window.RG_CONFIG;
var GEO = window.RG_GEO, SPOTS = window.RG_SPOTS, CITY_COLOR = window.RG_CITIES;
var RANGES = window.RG_RANGES || [], BASINS = window.RG_BASINS || [], RIVERS = window.RG_RIVERS || {};
var PROV = GEO.province;

/* ================= 坐标与地形 ================= */
var LNG0 = CFG.bbox[0], LAT0 = CFG.bbox[1], LNG1 = CFG.bbox[2], LAT1 = CFG.bbox[3];
var COSL = Math.cos(((LAT0 + LAT1) / 2) * Math.PI / 180);
var S = CFG.scale, VERT = CFG.vert;
var MAP_W = (LNG1 - LNG0) * COSL * S, MAP_H = (LAT1 - LAT0) * S;
var CXL = (LNG0 + LNG1) / 2, CYL = (LAT0 + LAT1) / 2;
var BOTTOM = -3.1;

function X(lng) { return (lng - CXL) * COSL * S; }
function Z(lat) { return -(lat - CYL) * S; }

function rawH(lng, lat) {
  var h = 0.34, i, j, dx, dy, d2, s, R, m, e;
  for (i = 0; i < RANGES.length; i++) {
    var r = RANGES[i]; m = 0; s = r.r * 0.60; R = r.r * 2.0;
    for (j = 0; j < r.pts.length; j++) {
      dx = (lng - r.pts[j][0]) * COSL; dy = lat - r.pts[j][1]; d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      e = Math.exp(-d2 / (2 * s * s)); if (e > m) m = e;
    }
    h += r.h * m;
  }
  for (i = 0; i < BASINS.length; i++) {
    var b = BASINS[i]; s = b.r * 0.62; R = b.r * 1.9;
    dx = (lng - b.p[0]) * COSL; dy = lat - b.p[1]; d2 = dx * dx + dy * dy;
    if (d2 > R * R) continue;
    h += b.d * Math.exp(-d2 / (2 * s * s));
  }
  h += 0.105 * Math.sin(lng * 3.1 + lat * 2.3)
     + 0.070 * Math.sin(lng * 7.3 - lat * 5.1)
     + 0.048 * Math.sin(lng * 13.7 + lat * 11.3)
     + 0.034 * Math.sin(lng * 23.1 - lat * 19.7)
     + 0.022 * Math.sin(lng * 41.3 + lat * 37.9)
     + 0.015 * Math.sin(lng * 67.1 - lat * 59.3);
  return h;
}
function H(lng, lat) { return rawH(lng, lat) * VERT; }

function inRing(lng, lat, ring) {
  var c = false, i, j, xi, yi, xj, yj;
  for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    xi = ring[i][0]; yi = ring[i][1]; xj = ring[j][0]; yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function ensureInside(lng, lat) {
  if (inRing(lng, lat, PROV)) return [lng, lat];
  var cx = CFG.center[0], cy = CFG.center[1], lo = 0, hi = 1, k, m, L, A;
  for (k = 0; k < 20; k++) {
    m = (lo + hi) / 2; L = lng + (cx - lng) * m; A = lat + (cy - lat) * m;
    if (inRing(L, A, PROV)) hi = m; else lo = m;
  }
  m = Math.min(1, hi + 0.014);
  return [lng + (cx - lng) * m, lat + (cy - lat) * m];
}

/* ================= 场景 ================= */
var canvas = document.getElementById('scene');
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b11);
scene.fog = new THREE.Fog(0x080b11, 130, 300);

var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 900);
var HOME_POS = new THREE.Vector3(MAP_W * 0.66, 52, MAP_H * 0.64);
var HOME_TGT = new THREE.Vector3(-1.6, 1.2, 0);
camera.position.copy(HOME_POS);

var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TGT);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 8;
controls.maxDistance = 190;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minPolarAngle = 0.08;
controls.rotateSpeed = 0.62;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.75;

/* 灯光 */
var hemi = new THREE.HemisphereLight(0xbcd4ff, 0x2a2218, 0.36);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xffe2b8, 0.72);
sun.position.set(MAP_W * 1.25, 42, -MAP_H * 0.15);
scene.add(sun);
var fill = new THREE.DirectionalLight(0x6ea8ff, 0.18);
fill.position.set(-MAP_W, 26, MAP_H * 0.5);
scene.add(fill);
var amb = new THREE.AmbientLight(0xffffff, 0.13); scene.add(amb);

/* ================= 地表贴图（省界遮罩 + 地市色块 + 界线） ================= */
function buildMapTexture() {
  var W = 1100, Hh = Math.round(W * (LAT1 - LAT0) / (LNG1 - LNG0));
  var cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  var g = cv.getContext('2d');
  var px = function (l) { return (l - LNG0) / (LNG1 - LNG0) * W; };
  var py = function (l) { return (1 - (l - LAT0) / (LAT1 - LAT0)) * Hh; };
  var path = function (ring) {
    g.beginPath();
    for (var i = 0; i < ring.length; i++) { var x = px(ring[i][0]), y = py(ring[i][1]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.closePath();
  };
  g.clearRect(0, 0, W, Hh);
  path(PROV); g.fillStyle = '#ffffff'; g.fill();
  g.save(); path(PROV); g.clip();
  for (var c = 0; c < GEO.cities.length; c++) {
    var ct = GEO.cities[c], col = CITY_COLOR[ct.n] || '#888';
    g.fillStyle = col; g.globalAlpha = 0.30;
    for (var k = 0; k < ct.r.length; k++) { path(ct.r[k]); g.fill('evenodd'); }
  }
  g.globalAlpha = 1; g.restore();
  g.lineJoin = g.lineCap = 'round';
  for (var c2 = 0; c2 < GEO.cities.length; c2++) {
    var ct2 = GEO.cities[c2];
    g.strokeStyle = (CITY_COLOR[ct2.n] || '#888'); g.globalAlpha = 0.95; g.lineWidth = 2.4;
    for (var k2 = 0; k2 < ct2.r.length; k2++) { path(ct2.r[k2]); g.stroke(); }
  }
  g.globalAlpha = 1;
  path(PROV); g.strokeStyle = 'rgba(12,16,22,.92)'; g.lineWidth = 5; g.stroke();
  path(PROV); g.strokeStyle = 'rgba(233,185,80,.55)'; g.lineWidth = 2; g.stroke();
  var tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/* ================= 地形网格 ================= */
var HMIN = 1e9, HMAX = -1e9;
(function scan() {
  for (var i = 0; i <= 90; i++) for (var j = 0; j <= 130; j++) {
    var lng = LNG0 + (LNG1 - LNG0) * j / 130, lat = LAT0 + (LAT1 - LAT0) * i / 90;
    if (!inRing(lng, lat, PROV)) continue;
    var h = H(lng, lat); if (h < HMIN) HMIN = h; if (h > HMAX) HMAX = h;
  }
  if (HMIN > HMAX) { HMIN = 0; HMAX = 8; }
})();

var STOPS = [
  [0.00, 0x22301c], [0.15, 0x33502a], [0.32, 0x4c6b35], [0.50, 0x6f7a3a],
  [0.64, 0x8a7742], [0.78, 0x7d5f3c], [0.90, 0x635548], [1.00, 0x7a7268]
];
var STOP_COLORS = STOPS.map(function (s) { return new THREE.Color(s[1]); });
function heightColor(t, out) {
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  for (var i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      var a = STOPS[i - 1][0], b = STOPS[i][0], f = (t - a) / (b - a || 1);
      return out.copy(STOP_COLORS[i - 1]).lerp(STOP_COLORS[i], f);
    }
  }
  return out.copy(STOP_COLORS[STOP_COLORS.length - 1]);
}

var terrainMat = new THREE.MeshStandardMaterial({
  map: buildMapTexture(), vertexColors: true, alphaTest: 0.5, flatShading: true,
  roughness: 0.95, metalness: 0.02
});
var SEGX = 280, SEGZ = 420;
var tGeo = new THREE.PlaneGeometry(MAP_W, MAP_H, SEGX, SEGZ);
(function displace() {
  var pos = tGeo.attributes.position, n = pos.count, colors = new Float32Array(n * 3), c = new THREE.Color();
  for (var i = 0; i < n; i++) {
    var lx = pos.getX(i), ly = pos.getY(i);
    var lng = LNG0 + (lx / MAP_W + 0.5) * (LNG1 - LNG0);
    var lat = LAT0 + (ly / MAP_H + 0.5) * (LAT1 - LAT0);
    var h = inRing(lng, lat, PROV) ? H(lng, lat) : 0;
    pos.setZ(i, h);
    heightColor((h - HMIN) / (HMAX - HMIN), c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tGeo.rotateX(-Math.PI / 2);
  tGeo.computeVertexNormals();
})();
var terrain = new THREE.Mesh(tGeo, terrainMat);
scene.add(terrain);

/* 侧壁 + 底板 */
(function skirt() {
  var n = PROV.length, pos = [], idx = [], col = [], cTop = new THREE.Color(0x6e5f45), cBot = new THREE.Color(0x3a2f1f), tmp = new THREE.Color();
  for (var i = 0; i < n; i++) {
    var lng = PROV[i][0], lat = PROV[i][1], x = X(lng), z = Z(lat), h = H(lng, lat);
    pos.push(x, h, z, x, BOTTOM, z);
    tmp.copy(cTop); col.push(tmp.r, tmp.g, tmp.b);
    tmp.copy(cBot); col.push(tmp.r, tmp.g, tmp.b);
  }
  for (var i2 = 0; i2 < n; i2++) {
    var a = i2 * 2, b = i2 * 2 + 1, cc = ((i2 + 1) % n) * 2, d = ((i2 + 1) % n) * 2 + 1;
    idx.push(a, cc, b, b, cc, d);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  var m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(g, m));
})();

(function base() {
  var sh = new THREE.Shape();
  for (var i = 0; i < PROV.length; i++) {
    var x = X(PROV[i][0]), y = -Z(PROV[i][1]);
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  var g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2);
  var m = new THREE.MeshBasicMaterial({ color: 0x0d1118 });
  var mesh = new THREE.Mesh(g, m); mesh.position.y = BOTTOM - 0.02; scene.add(mesh);

  var g2 = g.clone();
  var m2 = new THREE.MeshBasicMaterial({ color: 0xe9b950, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false });
  var halo = new THREE.Mesh(g2, m2);
  halo.position.y = BOTTOM - 0.35; halo.scale.set(1.018, 1, 1.014); scene.add(halo);
})();

/* ================= 水系 ================= */
var animTex = [];
function buildRiver(pts, width, color, opacity, yOff) {
  var v3 = pts.map(function (p) { var q = ensureInside(p[0], p[1]); return new THREE.Vector3(q[0], 0, q[1]); });
  var curve = new THREE.CatmullRomCurve3(v3, false, 'catmullrom', 0.5);
  var N = Math.min(320, Math.max(60, pts.length * 14));
  var P = [];
  for (var i = 0; i <= N; i++) { var p = curve.getPoint(i / N); P.push(ensureInside(p.x, p.z)); }
  var pos = [], idx = [], n = P.length;
  for (var i2 = 0; i2 < n; i2++) {
    var a = P[Math.max(0, i2 - 1)], b = P[Math.min(n - 1, i2 + 1)];
    var dx = (b[0] - a[0]) * COSL * S, dz = -(b[1] - a[1]) * S;
    var len = Math.hypot(dx, dz) || 1;
    var nx = -dz / len * width * 0.5, nz = dx / len * width * 0.5;
    var cur = P[i2], x = X(cur[0]), z = Z(cur[1]);
    var w = width * 0.5 * (0.55 + 0.45 * Math.sin(i2 / n * Math.PI));
    pos.push(x + nx * (w / (width * 0.5)), H(cur[0], cur[1]) + yOff, z + nz * (w / (width * 0.5)));
    pos.push(x - nx * (w / (width * 0.5)), H(cur[0], cur[1]) + yOff, z - nz * (w / (width * 0.5)));
  }
  for (var i3 = 0; i3 < n - 1; i3++) {
    var a2 = i3 * 2, b2 = i3 * 2 + 1, c2 = i3 * 2 + 2, d2 = i3 * 2 + 3;
    idx.push(a2, c2, b2, b2, c2, d2);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  var m = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false });
  var mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}
buildRiver(RIVERS['黄河'], 0.62, 0xd9a441, 0.92, 0.10);
buildRiver(RIVERS['汾河'], 0.34, 0x4fb8e8, 0.85, 0.09);
buildRiver(RIVERS['桑干河'], 0.20, 0x58c8dd, 0.62, 0.08);
buildRiver(RIVERS['漳河'], 0.20, 0x58c8dd, 0.62, 0.08);
buildRiver(RIVERS['沁河'], 0.20, 0x58c8dd, 0.62, 0.08);
buildRiver(RIVERS['涑水河'], 0.18, 0x58c8dd, 0.55, 0.08);

/* ================= 地市名称标注 ================= */
(function cityLabels() {
  for (var i = 0; i < GEO.cities.length; i++) {
    var c = GEO.cities[i];
    var sp = makeTextSprite(c.n, CITY_COLOR[c.n] || '#fff', 0.037, true);
    sp.position.set(X(c.c[0]), H(c.c[0], c.c[1]) + 0.35, Z(c.c[1]));
    sp.material.opacity = 0.62;
    scene.add(sp);
  }
})();

function makeTextSprite(text, color, size, isCity) {
  var fs = 40, padX = 20;
  var meas = document.createElement('canvas').getContext('2d');
  var font = '600 ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  meas.font = font;
  var tw = Math.ceil(meas.measureText(text).width);
  var w = tw + padX * 2, h = fs + 22;
  var cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = h * 2;
  var g = cv.getContext('2d'); g.scale(2, 2);
  g.font = font; g.textBaseline = 'middle';
  if (isCity) {
    g.fillStyle = color; g.globalAlpha = 0.92;
    g.font = '700 ' + (fs + 4) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center';
    g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 8;
    g.fillText(text, w / 2, h / 2);
  } else {
    var r = 10;
    g.beginPath();
    g.moveTo(r, 2); g.arcTo(w - 2, 2, w - 2, h - 2, r); g.arcTo(w - 2, h - 2, 2, h - 2, r);
    g.arcTo(2, h - 2, 2, 2, r); g.arcTo(2, 2, w - 2, 2, r); g.closePath();
    g.fillStyle = 'rgba(8,11,17,.80)'; g.fill();
    g.strokeStyle = color; g.globalAlpha = 0.62; g.lineWidth = 1.6; g.stroke(); g.globalAlpha = 1;
    g.fillStyle = '#eef2f8'; g.textAlign = 'center';
    g.fillText(text, w / 2, h / 2 + 1);
  }
  var tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  var sp = new THREE.Sprite(mat);
  sp.scale.set(size * (w / h), size, 1);
  sp.renderOrder = 20;
  return sp;
}

/* ================= 景点微缩模型 ================= */
var MATS = {};
function mat(key, color, opt) {
  if (!MATS[key]) MATS[key] = new THREE.MeshStandardMaterial(Object.assign({
    color: color, flatShading: true, roughness: 0.82, metalness: 0.06
  }, opt || {}));
  return MATS[key];
}
var GEO_C = {};
function box(w, h, d) { var k = 'b' + w + '_' + h + '_' + d; return GEO_C[k] || (GEO_C[k] = new THREE.BoxGeometry(w, h, d)); }
function cone(r, h, s) { var k = 'c' + r + '_' + h + '_' + s; return GEO_C[k] || (GEO_C[k] = new THREE.ConeGeometry(r, h, s)); }
function cyl(r1, r2, h, s) { var k = 'y' + r1 + '_' + r2 + '_' + h + '_' + s; return GEO_C[k] || (GEO_C[k] = new THREE.CylinderGeometry(r1, r2, h, s)); }
function add(parent, geo, m, x, y, z, rx, ry, rz, sx, sy, sz) {
  var me = new THREE.Mesh(geo, m);
  me.position.set(x || 0, y || 0, z || 0);
  if (rx) me.rotation.x = rx; if (ry) me.rotation.y = ry; if (rz) me.rotation.z = rz;
  if (sx !== undefined) me.scale.set(sx, sy, sz);
  parent.add(me); return me;
}
function roof(g, r, hgt, y, sx, sz) {
  var m = add(g, cone(r, hgt, 4), mat('roof', 0xa8402f), 0, y, 0, 0, Math.PI / 4, 0, sx || 1, 1, sz || 1);
  return m;
}

var BUILDERS = {
  temple: function () {
    var g = new THREE.Group();
    add(g, box(1.5, 0.14, 1.1), mat('stone', 0xd6c9b0), 0, 0.07);
    add(g, box(1.08, 0.42, 0.76), mat('red', 0xa8402f), 0, 0.35);
    add(g, box(0.30, 0.30, 0.05), mat('dark', 0x231c15), 0, 0.30, 0.40);
    roof(g, 0.98, 0.34, 0.73, 1, 0.72);
    add(g, box(0.06, 0.06, 1.5), mat('gold', 0xd9a441, { metalness: .5, roughness: .4 }), 0, 0.90);
    add(g, box(0.20, 0.16, 0.20), mat('stone', 0xd6c9b0), 0, 0.30, -0.58);
    return g;
  },
  pagoda: function () {
    var g = new THREE.Group();
    add(g, cyl(0.46, 0.54, 0.14, 8), mat('stone', 0xd6c9b0), 0, 0.07);
    var y = 0.14;
    for (var i = 0; i < 5; i++) {
      var f = 1 - i * 0.135;
      add(g, box(0.60 * f, 0.24, 0.60 * f), mat('wood', 0x8a5a3a), 0, y + 0.12);
      roof(g, 0.56 * f, 0.15, y + 0.33, 1, 1);
      y += 0.33;
    }
    add(g, cyl(0.035, 0.05, 0.34, 6), mat('gold', 0xd9a441, { metalness: .55, roughness: .35 }), 0, y + 0.14);
    return g;
  },
  cave: function () {
    var g = new THREE.Group();
    add(g, box(1.70, 0.86, 0.55), mat('rock', 0x736a5e), 0, 0.43);
    add(g, box(1.20, 0.34, 0.42), mat('rock', 0x736a5e), 0, 1.00);
    add(g, box(0.55, 0.26, 0.36), mat('rock2', 0x5c544a), -0.62, 0.24, 0.06);
    for (var i = -1; i <= 1; i++) {
      add(g, box(0.26, 0.34, 0.06), mat('dark', 0x1d1811), i * 0.48, 0.42, 0.29);
      add(g, new THREE.SphereGeometry(0.085, 8, 6), mat('gold', 0xd9a441, { metalness: .5, roughness: .35 }), i * 0.48, 0.40, 0.31);
    }
    return g;
  },
  mount: function () {
    var g = new THREE.Group();
    add(g, cone(0.74, 1.18, 6), mat('rock', 0x6f665c), 0, 0.59);
    add(g, cone(0.28, 0.34, 6), mat('snow', 0xeef1f4), 0, 1.03);
    add(g, cone(0.46, 0.74, 6), mat('rock2', 0x5b5349), 0.58, 0.37, 0.14);
    add(g, cone(0.34, 0.54, 6), mat('green', 0x4d7a4a), -0.54, 0.27, -0.10);
    return g;
  },
  fall: function () {
    var g = new THREE.Group();
    add(g, box(0.48, 1.00, 0.26), mat('rock', 0x736a5e), -0.44, 0.50);
    add(g, box(0.48, 1.00, 0.26), mat('rock', 0x736a5e), 0.44, 0.50);
    var cv = document.createElement('canvas'); cv.width = 16; cv.height = 64;
    var c2 = cv.getContext('2d');
    var grd = c2.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(190,235,255,.20)'); grd.addColorStop(.35, 'rgba(230,248,255,.95)');
    grd.addColorStop(.75, 'rgba(255,255,255,.95)'); grd.addColorStop(1, 'rgba(215,240,255,.35)');
    c2.fillStyle = grd; c2.fillRect(0, 0, 16, 64);
    c2.fillStyle = 'rgba(255,255,255,.55)';
    for (var i = 0; i < 8; i++) c2.fillRect(Math.random() * 16, Math.random() * 64, 1.5, 10);
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2);
    animTex.push(tex);
    var wm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    var w = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.92), wm);
    w.position.set(0, 0.52, 0.03); g.add(w);
    var pool = new THREE.Mesh(new THREE.CircleGeometry(0.52, 20), new THREE.MeshBasicMaterial({ color: 0x8fd8f5, transparent: true, opacity: .55, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.04, 0.16); g.add(pool);
    return g;
  },
  courtyard: function () {
    var g = new THREE.Group();
    add(g, box(1.66, 0.40, 0.09), mat('stone', 0xc8bda6), 0, 0.20, 0.58);
    add(g, box(1.66, 0.40, 0.09), mat('stone', 0xc8bda6), 0, 0.20, -0.58);
    add(g, box(0.09, 0.40, 1.16), mat('stone', 0xc8bda6), 0.83, 0.20);
    add(g, box(0.09, 0.40, 1.16), mat('stone', 0xc8bda6), -0.83, 0.20);
    add(g, box(0.34, 0.52, 0.12), mat('red', 0xa8402f), 0, 0.26, 0.60);
    roof(g, 0.32, 0.16, 0.60, 1, 0.6);
    add(g, box(0.52, 0.34, 0.44), mat('red', 0xa8402f), -0.36, 0.27, -0.12);
    roof(g, 0.42, 0.18, 0.55, 1, 0.85);
    add(g, box(0.52, 0.34, 0.44), mat('red', 0xa8402f), 0.36, 0.27, -0.12);
    roof(g, 0.42, 0.18, 0.62, 1, 0.85);
    add(g, box(0.26, 0.74, 0.26), mat('stone', 0xc8bda6), 0, 0.37, -0.44);
    return g;
  },
  town: function () {
    var g = new THREE.Group();
    add(g, box(1.72, 0.34, 0.10), mat('stone', 0xbdb29c), 0, 0.17, 0.62);
    add(g, box(1.72, 0.34, 0.10), mat('stone', 0xbdb29c), 0, 0.17, -0.62);
    add(g, box(0.10, 0.34, 1.30), mat('stone', 0xbdb29c), 0.86, 0.17);
    add(g, box(0.10, 0.34, 1.30), mat('stone', 0xbdb29c), -0.86, 0.17);
    add(g, box(0.40, 0.62, 0.40), mat('stone', 0xc8bda6), 0, 0.31, 0.62);
    roof(g, 0.40, 0.24, 0.78, 1, 1);
    var pts = [[-0.5, -0.28], [0.0, -0.36], [0.5, -0.26], [-0.28, 0.16], [0.30, 0.20]];
    for (var i = 0; i < pts.length; i++) {
      add(g, box(0.32, 0.26, 0.32), mat('wood', 0x8a5a3a), pts[i][0], 0.30, pts[i][1]);
      roof(g, 0.30, 0.16, 0.55, 1, 1);
    }
    return g;
  },
  gate: function () {
    var g = new THREE.Group();
    add(g, box(0.42, 1.00, 0.42), mat('stone', 0xc8bda6), -0.62, 0.50);
    add(g, box(0.42, 1.00, 0.42), mat('stone', 0xc8bda6), 0.62, 0.50);
    roof(g, 0.42, 0.26, 1.13, 1, 1);
    add(g, box(0.42, 0.26, 0.42), mat('stone', 0xc8bda6), -0.62, 1.26);
    add(g, box(0.42, 0.26, 0.42), mat('stone', 0xc8bda6), 0.62, 1.26);
    add(g, box(0.94, 0.62, 0.34), mat('stone', 0xc8bda6), 0, 0.31);
    add(g, box(0.26, 0.36, 0.40), mat('dark', 0x231c15), 0, 0.18, 0.01);
    for (var i = -2; i <= 2; i++) add(g, box(0.13, 0.12, 0.36), mat('stone', 0xc8bda6), i * 0.19, 0.68);
    add(g, box(0.30, 0.30, 0.30), mat('red', 0xa8402f), -1.12, 0.15);
    add(g, box(0.30, 0.30, 0.30), mat('red', 0xa8402f), 1.12, 0.15);
    return g;
  },
  water: function () {
    var g = new THREE.Group();
    var d = new THREE.Mesh(new THREE.CircleGeometry(0.80, 26), new THREE.MeshBasicMaterial({ color: 0x4fb8e8, transparent: true, opacity: .72, depthWrite: false }));
    d.rotation.x = -Math.PI / 2; d.position.y = 0.08; g.add(d);
    for (var i = 0; i < 2; i++) {
      var r = new THREE.Mesh(new THREE.RingGeometry(0.36 + i * 0.20, 0.44 + i * 0.20, 26),
        new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: .34 - i * .12, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.10; g.add(r);
    }
    add(g, box(1.10, 0.10, 0.10), mat('stone', 0xc8bda6), 0, 0.05, -0.62);
    return g;
  },
  museum: function () {
    var g = new THREE.Group();
    add(g, box(1.52, 0.12, 0.98), mat('stone', 0xd6c9b0), 0, 0.06);
    add(g, box(1.16, 0.50, 0.70), mat('stone2', 0xc0b49b), 0, 0.37);
    for (var i = -2; i <= 2; i++) add(g, cyl(0.045, 0.045, 0.48, 6), mat('stone', 0xd6c9b0), i * 0.22, 0.36, 0.38);
    add(g, box(1.34, 0.10, 0.88), mat('stone', 0xd6c9b0), 0, 0.67);
    add(g, cyl(0.34, 0.34, 0.16, 3), mat('stone2', 0xc0b49b), 0, 0.79, 0, 0, Math.PI / 2, 0, 1, 1, 0.55);
    add(g, new THREE.SphereGeometry(0.07, 8, 6), mat('gold', 0xd9a441, { metalness: .55, roughness: .3 }), 0, 0.92);
    return g;
  },
  mountain: null
};
BUILDERS.mountain = BUILDERS.mount;

/* ================= 标注点 ================= */
var relax = (function () {
  var pts = SPOTS.map(function (s) { return { x: X(s.lng), z: Z(s.lat), ox: 0, oz: 0 }; });
  var MIN = 1.62, MAXOFF = 0.92;
  for (var it = 0; it < 220; it++) {
    var moved = false;
    for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
      var dx = (pts[j].x + pts[j].ox) - (pts[i].x + pts[i].ox);
      var dz = (pts[j].z + pts[j].oz) - (pts[i].z + pts[i].oz);
      var d = Math.hypot(dx, dz);
      if (d < 1e-3) { dx = 0.02; dz = 0.014; d = 0.024; }
      if (d < MIN) {
        var push = (MIN - d) * 0.5 / d;
        pts[i].ox -= dx * push * 0.5; pts[i].oz -= dz * push * 0.5;
        pts[j].ox += dx * push * 0.5; pts[j].oz += dz * push * 0.5;
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (var k = 0; k < pts.length; k++) {
    var m = Math.hypot(pts[k].ox, pts[k].oz);
    if (m > MAXOFF) { pts[k].ox *= MAXOFF / m; pts[k].oz *= MAXOFF / m; }
  }
  return pts;
})();

var markers = [];
var hitList = [];
var markerRoot = new THREE.Group(); scene.add(markerRoot);

SPOTS.forEach(function (sp, i) {
  var tx = X(sp.lng), tz = Z(sp.lat), ty = H(sp.lng, sp.lat);
  var px = tx + relax[i].ox, pz = tz + relax[i].oz;
  var py = H(px / (COSL * S) + CXL, CYL - pz / S);
  var col = new THREE.Color(CITY_COLOR[sp.city] || '#e9b950');
  var g = new THREE.Group(); g.position.set(px, py, pz);
  markerRoot.add(g);

  var ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.68, 26),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; g.add(ring);

  var PH = 1.55;
  var pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, PH, 6),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .38, depthWrite: false }));
  pillar.position.y = PH / 2; g.add(pillar);

  var icon = (BUILDERS[sp.icon] || BUILDERS.temple)();
  icon.position.y = PH + 0.02;
  icon.scale.setScalar(sp.star === 3 ? 0.92 : 0.78);
  g.add(icon);

  var beam = null;
  if (sp.star === 3) {
    beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.05, 5.5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: .085, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 2.9; g.add(beam);
  }

  if (Math.hypot(relax[i].ox, relax[i].oz) > 0.03) {
    var lg = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(tx - px, 0.12 - py + ty, tz - pz), new THREE.Vector3(0, 0.09, 0)
    ]);
    g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .45 })));
  }

  var hit = new THREE.Mesh(new THREE.SphereGeometry(1.05, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = PH + 0.30; hit.userData.sp = sp; g.add(hit); hitList.push(hit);

  var label = makeTextSprite(sp.n, '#' + col.getHexString(), sp.star === 3 ? 0.032 : 0.028, false);
  label.position.y = PH + (sp.star === 3 ? 1.55 : 1.35);
  label.material.opacity = 0;
  g.add(label);

  markers.push({ sp: sp, g: g, ring: ring, pillar: pillar, icon: icon, label: label, beam: beam, col: col, phase: i * 0.7, baseScale: icon.scale.x });
});

/* ================= 路线 ================= */
var ROUTES = window.RG_ROUTES || [];
var routeMesh = null;
function drawRoute(ids) {
  if (routeMesh) {
    for (var ri = 0; ri < routeMesh.children.length; ri++) {
      routeMesh.children[ri].geometry.dispose(); routeMesh.children[ri].material.dispose();
    }
    scene.remove(routeMesh); routeMesh = null;
  }
  if (!ids || ids.length < 2) return;
  var pts = [];
  ids.forEach(function (id) {
    var s = SPOTS.filter(function (x) { return x.id === id; })[0];
    if (s) pts.push([s.lng, s.lat]);
  });
  if (pts.length < 2) return;
  var v3 = pts.map(function (p) { return new THREE.Vector3(p[0], 0, p[1]); });
  var curve = new THREE.CatmullRomCurve3(v3, false, 'catmullrom', 0.5);
  var N = pts.length * 18, P = [];
  for (var i = 0; i <= N; i++) { var p = curve.getPoint(i / N); P.push([p.x, p.z]); }

  /* 按指定宽度重建飘带（不要用缩放整条折线的方式做描边，会把线路放大飞出地图） */
  var mk = function (wid, color, op) {
    var pos = [], idx = [], n = P.length;
    for (var i2 = 0; i2 < n; i2++) {
      var a = P[Math.max(0, i2 - 1)], b = P[Math.min(n - 1, i2 + 1)];
      var dx = (b[0] - a[0]) * COSL * S, dz = -(b[1] - a[1]) * S, len = Math.hypot(dx, dz) || 1;
      var nx = -dz / len * wid, nz = dx / len * wid;
      var x = X(P[i2][0]), z = Z(P[i2][1]), y = H(P[i2][0], P[i2][1]);
      pos.push(x + nx, y + 1.05, z + nz, x - nx, y + 1.05, z - nz);
    }
    for (var i3 = 0; i3 < n - 1; i3++) { var a2 = i3 * 2; idx.push(a2, a2 + 2, a2 + 1, a2 + 1, a2 + 2, a2 + 3); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    var mm = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false
    }));
    mm.renderOrder = 5; return mm;
  };
  routeMesh = new THREE.Group();
  routeMesh.add(mk(0.34, 0x05222c, 0.55));
  routeMesh.add(mk(0.16, 0x5fd3f3, 0.95));
  scene.add(routeMesh);
}

/* ================= UI ================= */
var $ = function (id) { return document.getElementById(id); };
var _catSet = {}; SPOTS.forEach(function (s) { _catSet[s.cat] = 1; });
var EXTRA = CFG.extraFilters || [];
var CATS = ['全部'].concat(Object.keys(_catSet)).concat(EXTRA.map(function (f) { return f.label; }));
var CITY_ORDER = CFG.cityOrder || Object.keys(CITY_COLOR);
var state = { cats: ['全部'], q: '', route: null, sel: null, hover: null, tour: false, night: false };
var closed = {};

function hasTag(s, t) { return (s.tag || []).indexOf(t) >= 0; }
function match(s) {
  if (state.route && state.route.ids.indexOf(s.id) < 0) return false;
  var cs = state.cats;
  if (cs.indexOf('全部') < 0) {
    var ok = false;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], ex = null;
      for (var k = 0; k < EXTRA.length; k++) if (EXTRA[k].label === c) ex = EXTRA[k];
      if (ex) { if (ex.test(s)) ok = true; }
      else if (s.cat === c) ok = true;
    }
    if (!ok) return false;
  }
  if (state.q) {
    var q = state.q.toLowerCase();
    if (s.n.toLowerCase().indexOf(q) < 0 && s.city.indexOf(q) < 0 &&
        (s.see || '').toLowerCase().indexOf(q) < 0 &&
        (s.tag || []).join(',').toLowerCase().indexOf(q) < 0) return false;
  }
  return true;
}
function filtered() { return SPOTS.filter(match); }

function buildChips() {
  var el = $('chips'); el.innerHTML = '';
  CATS.forEach(function (c) {
    var d = document.createElement('div');
    d.className = 'chip' + (c === '黑神话取景地' ? ' wk' : '') + (state.cats.indexOf(c) >= 0 ? ' on' : '');
    d.textContent = c;
    d.onclick = function () {
      if (c === '全部') state.cats = ['全部'];
      else {
        var i = state.cats.indexOf(c);
        if (i >= 0) state.cats.splice(i, 1); else state.cats.push(c);
        var a = state.cats.indexOf('全部'); if (a >= 0) state.cats.splice(a, 1);
        if (!state.cats.length) state.cats = ['全部'];
      }
      buildChips(); renderList();
    };
    el.appendChild(d);
  });
}
function buildRoutes() {
  var el = $('routes'); el.innerHTML = '';
  ROUTES.forEach(function (r) {
    var d = document.createElement('div');
    d.className = 'rchip' + (state.route && state.route.n === r.n ? ' on' : '');
    d.textContent = r.n;
    d.onclick = function () {
      if (state.route && state.route.n === r.n) { state.route = null; drawRoute(null); }
      else { state.route = r; drawRoute(r.ids); }
      buildRoutes(); renderList();
      if (state.route) startTour();
    };
    el.appendChild(d);
  });
}
function renderList() {
  var list = $('list'); list.innerHTML = '';
  var fs = filtered();
  var byCity = {};
  fs.forEach(function (s) { (byCity[s.city] = byCity[s.city] || []).push(s); });
  var any = false;
  CITY_ORDER.forEach(function (cn) {
    var arr = byCity[cn]; if (!arr || !arr.length) return; any = true;
    var h = document.createElement('div');
    h.className = 'city-h' + (closed[cn] ? ' closed' : '');
    h.innerHTML = '<span class="dot" style="background:' + (CITY_COLOR[cn] || '#888') + ';box-shadow:0 0 8px ' + (CITY_COLOR[cn] || '#888') + '"></span>' +
      cn + '<span class="cnt">' + arr.length + '</span><span class="cv">▾</span>';
    h.onclick = function () { closed[cn] = !closed[cn]; renderList(); };
    list.appendChild(h);
    if (closed[cn]) return;
    arr.sort(function (a, b) { return b.star - a.star; });
    arr.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'item' + (state.sel === s.id ? ' on' : '');
      var wk = hasTag(s, '黑神话取景地');
      d.innerHTML = '<span class="s s' + s.star + '"></span><span class="nm">' + s.n + '</span>' +
        (wk ? '<span class="tg">悟空</span>' : '') + '<span class="tp">' + s.cat + '</span>';
      d.onclick = function () { select(s.id, true); };
      d.onmouseenter = function () { setHover(s.id); };
      d.onmouseleave = function () { setHover(null); };
      list.appendChild(d);
    });
  });
  if (!any) list.innerHTML = '<div class="empty">没有匹配的景点<br/>换个关键词或清除筛选试试</div>';
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function hav(a, b) {
  var R = 6371, p = Math.PI / 180;
  var dLat = (b.lat - a.lat) * p, dLng = (b.lng - a.lng) * p;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function showCard(s) {
  $('cName').textContent = s.n;
  $('cSub').innerHTML = '<span style="color:' + (CITY_COLOR[s.city] || '#888') + '">' + s.city + '</span>' +
    '<span>' + s.cat + '</span><span>' + ['', '小众宝藏', '强烈推荐', '必打卡'][s.star] + '</span>';
  var tags = (s.tag || []).map(function (t) { return '<span class="tag' + (t === '黑神话取景地' ? ' wk' : '') + '">' + esc(t) + '</span>'; }).join('');
  var near = SPOTS.filter(function (o) { return o.id !== s.id; })
    .map(function (o) { return { o: o, d: hav(s, o) }; })
    .sort(function (a, b) { return a.d - b.d; }).slice(0, 4)
    .map(function (x) { return '<a data-go="' + x.o.id + '">' + esc(x.o.n) + '<i>' + x.d.toFixed(0) + 'km</i></a>'; }).join('');
  $('cBody').innerHTML =
    '<div class="tags">' + tags + '</div>' +
    '<div class="meta"><div><div class="k">门票参考</div><div class="v">' + esc(s.ticket) + '</div></div>' +
    '<div><div class="k">建议时长</div><div class="v">' + esc(s.time) + '</div></div>' +
    '<div><div class="k">最佳季节</div><div class="v">' + esc(s.season) + '</div></div></div>' +
    '<div class="blk"><h3>看什么</h3><p>' + esc(s.see) + '</p></div>' +
    '<div class="blk"><h3>游玩 TIPS</h3><ul>' + s.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' +
    '<div class="blk"><h3>顺路串联</h3><div class="near">' + near + '</div></div>' +
    '<div class="blk"><h3>坐标</h3><p style="color:#8b98ab;font-size:11.5px">' + s.lat.toFixed(4) + '°N　' + s.lng.toFixed(4) + '°E</p></div>';
  var as = $('cBody').querySelectorAll('a[data-go]');
  for (var i = 0; i < as.length; i++) as[i].onclick = function () { select(this.getAttribute('data-go'), true); };
  $('card').classList.add('show');
}

function select(id, fly) {
  state.sel = id;
  var s = SPOTS.filter(function (x) { return x.id === id; })[0];
  if (!s) return;
  showCard(s);
  if (fly) {
    var mk = markers.filter(function (m) { return m.sp.id === id; })[0];
    if (mk) {
      var p = mk.g.position;
      var v = new THREE.Vector3().subVectors(camera.position, controls.target);
      var az = Math.atan2(v.x, v.z), el = 0.74, d = 21;
      var off = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d);
      flyTo(p.clone().add(off), p.clone());
    }
  }
  renderList();
}
function deselect() { state.sel = null; $('card').classList.remove('show'); renderList(); }

/* ================= 交互 ================= */
var ray = new THREE.Raycaster();
var ptr = new THREE.Vector2();
var tip = $('tip');
var downXY = null;

function setHover(id) {
  state.hover = id;
  if (!id) { tip.classList.remove('show'); document.body.style.cursor = ''; return; }
  document.body.style.cursor = 'pointer';
}
renderer.domElement.addEventListener('pointermove', function (e) {
  ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
  ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  var hits = ray.intersectObjects(hitList, false);
  if (hits.length) {
    var sp = hits[0].object.userData.sp;
    setHover(sp.id);
    tip.innerHTML = sp.n + '<span class="c">' + sp.city + ' · ' + sp.cat + '</span><span class="t">点击查看详情</span>';
    tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
    tip.classList.add('show');
  } else setHover(null);
});
renderer.domElement.addEventListener('pointerdown', function (e) { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', function (e) {
  if (!downXY) return;
  var moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 5) return;
  ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
  ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  var hits = ray.intersectObjects(hitList, false);
  if (hits.length) select(hits[0].object.userData.sp.id, true);
  else deselect();
});

var keys = {};
window.addEventListener('keydown', function (e) {
  if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  keys[e.code] = true;
  if (e.code === 'KeyR') resetView();
  if (e.code === 'KeyN') toggleNight();
  if (e.code === 'KeyT') toggleTour();
  if (e.code === 'Escape') deselect();
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });

$('q').addEventListener('input', function () { state.q = this.value.trim(); $('qc').style.display = state.q ? 'block' : 'none'; renderList(); });
$('qc').onclick = function () { $('q').value = ''; state.q = ''; this.style.display = 'none'; renderList(); };
$('cx').onclick = deselect;
$('bReset').onclick = resetView;
$('bNight').onclick = toggleNight;
$('bTour').onclick = toggleTour;

function resetView() { flyTo(HOME_POS.clone(), HOME_TGT.clone()); }
function toggleNight() {
  state.night = !state.night;
  $('bNight').classList.toggle('on', state.night);
  $('bNight').textContent = state.night ? '☀ 日景' : '☾ 夜景';
  applyTheme();
}
function applyTheme() {
  if (state.night) {
    scene.background = new THREE.Color(0x03060c);
    scene.fog.color = new THREE.Color(0x03060c);
    scene.fog.near = 70; scene.fog.far = 200;
    hemi.color.set(0x27406e); hemi.groundColor.set(0x04060b); hemi.intensity = 0.15;
    sun.color.set(0x7fa4e0); sun.intensity = 0.13;
    fill.color.set(0x16305c); fill.intensity = 0.08;
    amb.intensity = 0.05;
  } else {
    scene.background = new THREE.Color(0x080b11);
    scene.fog.color = new THREE.Color(0x080b11);
    scene.fog.near = 130; scene.fog.far = 300;
    hemi.color.set(0xbcd4ff); hemi.groundColor.set(0x2a2218); hemi.intensity = 0.36;
    sun.color.set(0xffe2b8); sun.intensity = 0.72;
    fill.color.set(0x6ea8ff); fill.intensity = 0.18;
    amb.intensity = 0.13;
  }
}
function toggleTour() {
  state.tour = !state.tour;
  $('bTour').classList.toggle('on', state.tour);
  $('bTour').textContent = state.tour ? '❚❚ 停止漫游' : '▶ 自动漫游';
  if (state.tour) startTour();
}
var tourIdx = 0, tourT = 0;
function startTour() { state.tour = true; tourIdx = 0; tourT = 1e9; $('bTour').classList.add('on'); $('bTour').textContent = '❚❚ 停止漫游'; }
function tourStep() {
  var fs = filtered(); if (!fs.length) return;
  tourIdx = (tourIdx + 1) % fs.length;
  select(fs[tourIdx].id, true);
}

/* 相机飞行 */
var fly = null;
function flyTo(pos, tgt) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, k: 0 }; }
function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

/* ================= 动画 ================= */
var clock = new THREE.Clock();
var tAcc = 0;
function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);
  tAcc += dt;

  // 键盘漫游
  var sp = 26 * dt;
  var fwd = new THREE.Vector3().subVectors(controls.target, camera.position); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  var right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  var mv = new THREE.Vector3();
  if (keys['KeyW'] || keys['ArrowUp']) mv.add(fwd);
  if (keys['KeyS'] || keys['ArrowDown']) mv.sub(fwd);
  if (keys['KeyA'] || keys['ArrowLeft']) mv.sub(right);
  if (keys['KeyD'] || keys['ArrowRight']) mv.add(right);
  if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(sp); camera.position.add(mv); controls.target.add(mv); }
  if (keys['KeyQ']) { camera.position.y += sp; controls.target.y += sp; }
  if (keys['KeyE']) { camera.position.y -= sp; controls.target.y -= sp; }
  if (mv.lengthSq() > 0 || keys['KeyQ'] || keys['KeyE']) fly = null;

  if (fly) {
    fly.k += dt / 0.95;
    var e = ease(Math.min(1, fly.k));
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (fly.k >= 1) fly = null;
  }

  // 自动漫游
  if (state.tour) {
    tourT += dt;
    if (tourT > 4.6) { tourT = 0; tourStep(); }
  }

  // 瀑布水流动
  for (var i = 0; i < animTex.length; i++) animTex[i].offset.y -= dt * 1.6;

  // 标注动画
  var camDist, vis;
  for (var k = 0; k < markers.length; k++) {
    var m = markers[k];
    var isSel = state.sel === m.sp.id, isHov = state.hover === m.sp.id;
    var tgt = m.baseScale * (isSel ? 1.45 : (isHov ? 1.22 : 1));
    var cur = m.icon.scale.x + (tgt - m.icon.scale.x) * Math.min(1, dt * 10);
    m.icon.scale.setScalar(cur);
    m.icon.position.y = 1.57 + Math.sin(tAcc * 1.5 + m.phase) * 0.075 + (isSel ? 0.18 : 0);
    m.icon.rotation.y += dt * (isSel ? 0.55 : 0.09);
    var pulse = 1 + Math.sin(tAcc * 2.0 + m.phase) * 0.09;
    m.ring.scale.setScalar(pulse);
    m.ring.material.opacity = isSel ? 0.95 : (isHov ? 0.8 : 0.42);
    m.pillar.material.opacity = (isSel ? 0.85 : (isHov ? 0.62 : 0.34)) * (state.night ? 1.9 : 1);
    if (m.beam) m.beam.material.opacity = ((isSel ? 0.20 : 0.075) + Math.sin(tAcc * 1.2 + m.phase) * 0.02) * (state.night ? 2.6 : 1);

    camDist = camera.position.distanceTo(m.g.position);
    var lim = m.sp.star === 3 ? 135 : (m.sp.star === 2 ? 56 : 36);
    if (state.route && state.route.ids.indexOf(m.sp.id) >= 0) lim = Math.max(lim, 72);
    vis = (camDist < lim) || isSel || isHov;
    var wantOp = 0;
    if (vis) {
      wantOp = isSel ? 1 : (isHov ? 0.98 : Math.min(1, (lim - camDist) / 18) * (m.sp.star === 3 ? 0.95 : 0.78));
    }
    m.label.material.opacity += (wantOp - m.label.material.opacity) * Math.min(1, dt * 9);
    m.label.visible = m.label.material.opacity > 0.02;
    var ls = (isSel ? 1.14 : 1) * (1 + (1 - Math.min(1, camDist / 120)) * 0.05);
    m.label.scale.set(m.label.userData.w0 * ls, m.label.userData.h0 * ls, 1);
  }

  controls.update();
  renderer.render(scene, camera);
}

/* 保存标签原始尺寸 */
markers.forEach(function (m) { m.label.userData.w0 = m.label.scale.x; m.label.userData.h0 = m.label.scale.y; });

/* ================= 启动 ================= */
buildChips(); buildRoutes(); renderList();
(function brand() {
  if (CFG.title) document.title = CFG.title;
  var b = document.querySelector('.brand b'); if (b && CFG.title) b.textContent = CFG.title;
  var sp = document.querySelector('.brand span'); if (sp && CFG.subtitle) sp.textContent = CFG.subtitle;
  if (CFG.legend && CFG.legend.length) {
    var lg = document.getElementById('legend'); if (lg) {
      lg.innerHTML = CFG.legend.map(function (it) {
        var sw = it.type === 'bar'
          ? '<span class="bar" style="background:' + it.color + '"></span>'
          : '<i style="background:' + it.color + (it.glow ? ';box-shadow:0 0 8px ' + it.color : '') + '"></i>';
        return '<div class="lg">' + sw + it.text + '</div>';
      }).join('');
    }
  }
})();
(function stat() {
  var wk = SPOTS.filter(function (s) { return hasTag(s, '黑神话取景地'); }).length;
  var wh = SPOTS.filter(function (s) { return hasTag(s, '世界遗产') || hasTag(s, '世界文化景观遗产'); }).length;
  $('cntTxt').textContent = SPOTS.length + ' 处景点 · ' + GEO.cities.length + ' 个分区';
  $('stat').innerHTML = '收录 <b>' + SPOTS.length + '</b> 处景点 / <b>' + GEO.cities.length + '</b> 个分区<br/>'
    + (typeof CFG.statLine === 'function' ? CFG.statLine(SPOTS) : (CFG.statLine || '')) + '<br/><span style="opacity:.7">' + (CFG.disclaimer || '门票为参考价，以景区官方公告为准') + '</span>';
})();

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__SX = { camera: camera, controls: controls, markers: markers, scene: scene };
applyTheme();
animate();
setTimeout(function () { $('load').classList.add('gone'); setTimeout(function () { $('load').style.display = 'none'; }, 600); }, 500);

})();
