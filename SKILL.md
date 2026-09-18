---
name: 3d-travel-map
description: 生成某地区（省/市/景区）的可交互 3D 旅行导览地图单页 HTML：真实行政区边界的低多边形地形 + 景点微缩模型 + 点击查看看点/门票/游玩Tips + 主题筛选与经典线路巡游。当用户要求"做一份 XX 的 3D 地图/导览/沙盘"、"景点可视化"、"旅游攻略地图"，或要求可点击交互、可移动、带介绍信息的地理可视化时使用。产出为可离线双击打开的单文件 HTML。
agent_created: true
---

# 3D Travel Map（3D 旅行导览地图生成器）

为一个地理区域生成**可交互 3D 旅行导览地图**：真实行政区边界的低多边形地形沙盘，景点以浮动微缩模型呈现，点击查看看点/门票/Tips，支持旋转/缩放/键盘漫游、主题筛选、经典线路自动巡游、昼夜切换。交付物是**单个自包含 HTML**（可离线双击打开），约 770KB。

## 何时使用

- "做一个 XX省/XX市 的 3D 旅行地图/导览/沙盘"
- "把 XX 的景点做成可点击的可视化"
- "旅游攻略地图，能看到每个景点在哪、有什么看点、有什么 tips"
- 任何"地理区域 + 景点 + 可交互"组合的可视化需求

## 资源清单

| 路径 | 用途 |
|---|---|
| `assets/app_template.js` | **通用 3D 主程序**（约 960 行，已把区域差异全部抽到配置里，无需改动，直接复制使用） |
| `assets/index_template.html` | 页面骨架（UI/样式/加载态），仅 `<title>` 等文案会被 region.js 覆盖 |
| `assets/lib/three.min.js`、`assets/lib/OrbitControls.js` | three.js r147 UMD（离线可用，r147 是支持 file:// 直开的最后版本） |
| `assets/data/region.example.js` | 区域配置模板（bbox/scale/vert/山脉/盆地/水系/线路/图例），以山西省为完整示例 |
| `assets/data/spots.example.js` | 景点数据结构 + 写作口径说明 |
| `scripts/fetch_admin_geo.py` | 按 adcode 抓取并简化行政区边界 → `geo.js` |
| `scripts/build_standalone.py` | 把 src/ 内联成单 HTML |
| `scripts/smoke_test.js` | 无头浏览器冒烟测试（截图/报错/帧率） |
| `references/implementation.md` | 二次开发参考：渲染管线各环节的实现要点与推荐参数（配色、光照、地形、标签、性能预算） |
| `references/content-guide.md` | 内容调研流程、写作口径、效率清单 |

## 工作流程

### Step 0 · 建项目
```bash
mkdir -p <区域>3d/src/{data,lib}
cp $SKILL/assets/lib/* <区域>3d/src/lib/
cp $SKILL/assets/index_template.html <区域>3d/src/index.html
cp $SKILL/assets/app_template.js   <区域>3d/src/app.js
cp $SKILL/assets/data/region.example.js <区域>3d/src/data/region.js
cp $SKILL/assets/data/spots.example.js  <区域>3d/src/data/spots.js
cp $SKILL/scripts/build_standalone.py   <区域>3d/build.py
```

### Step 1 · 边界数据
```bash
python scripts/fetch_admin_geo.py <adcode> --out <区域>3d/src/data/geo.js
```
- adcode：省 6 位（如 140000 山西）、市 6 位（如 330100 杭州）。数据源是阿里云 DataV，无需 key。
- 拿到 `cities[].n` 后，它们就是 spots.js 里 `city` 字段与 region.js 里 `cityOrder` 的合法取值。
- 若 curl 抓取失败（exit 35 / SSL），用脚本内建的 urllib 方式，不要反复重试 curl。

### Step 2 · 区域配置（region.js）——必改 4 项
`bbox`（外接框）、`center`（内部参考点）、`scale`（≈900/纬度跨度）、`vert`（高程夸张，山地 2~3）。
然后整理**山脉（每个 3~6 个中心点 + 半径 0.15°~0.19°）、盆地、水系**，最后设计 4~6 条经典线路。

### Step 3 · 内容调研（工作量主体）
按 `references/content-guide.md` 的流程：WebSearch 定骨架 → 逐条填看点/门票/Tips → 反向审计。
关键原则：**门票不确定就写"低价／以现场为准"，数字类事实必须核实，官方名单类标签必须查官方来源。**

### Step 4 · 打包与验证
```bash
python build.py --src src --out "<区域>3D旅行导览地图.html"
NODE_PATH=<node workspace>/node_modules node $SKILL/scripts/smoke_test.js "<产物>.html" ./shots
```
判定标准：0 个报错、`listItems` 数 == 景点数、三张截图（全景/详情卡/夜景+线路）肉眼检查。
**注意：无头软渲染只有 ~3 FPS，截图前等 10s+，否则会把"飞行动画没播完"误判成 bug。**

### Step 5 · 交付
用 present_files 交付最终 HTML，并简要说明玩法（拖拽旋转/点击景点/筛选/线路/昼夜）。
清理调试脚本与截图（保留 src/、build.py 便于后续迭代）。

## 常见问题速查（详见 references/implementation.md）

| 症状 | 原因 → 解法 |
|---|---|
| 山体一片死白/蜡状 | 光照过曝 → 按 implementation.md 第 5 节的灯光数值 + ACESFilmic |
| 山是尖锐金字塔 | 山脊半径太小（<0.14°）→ 放宽到 0.15~0.19 并拉开中心点间距 |
| 地形边界锯齿/漏光 | 只设了 transparent 没设 alphaTest → 用 `alphaTest:0.5` 且不设 transparent |
| 侧壁出现大片死黑 | 侧壁用了受光材质 → 改 `MeshBasicMaterial` + 顶点色渐变 |
| 标签小到看不清 | 用了世界单位缩放 → sprite 用 `sizeAttenuation:false`，scale≈0.03 |
| 74 个标签糊成一团 | 没按距离分级 → star3<135 / star2<56 / star1<36 单位 |
| 线路飘带看不见 | 用了 AdditiveBlending 在亮背景上白化 → 暗色描边带 + 亮色主线普通混合 |
| 河流悬浮在地图外 | 界外坐标 → 所有水系点过 `ensureInside()` 钳制 |
| file:// 打开白屏 | 用了 ES module/import → 全部用经典 `<script>` 并内联 |
| 点击列表卡住 | loading 遮罩没消失 → 脚本有异常，看 ERRORS 输出定位 |

## 迭代与扩展

- **改内容**：只动 `src/data/spots.js` 和 `src/data/region.js`，改完重跑 Step 4。
- **加模型类型**：在 app_template.js 的 `BUILDERS` 里加一个返回 THREE.Group 的函数，spots 的 `icon` 字段即可引用。
- **换主题色**：region.js 的 `RG_CITIES`（下级行政区配色）与 `STOPS`（高程渐变）。
- **接真实高程**：当前是手工山脉示意；如需 DEM，替换 `rawH()` 的数据源（见 implementation.md 第 13 节）。
