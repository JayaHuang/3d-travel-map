<div align="center">

# 🗺️ 3D Travel Map

**给任意地区生成一张可交互的 3D 旅行导览地图 —— 单文件 HTML，可离线双击打开**

真实行政区边界 · 低多边形地形沙盘 · 景点微缩模型 · 点击查看看点/门票/游玩 Tips · 主题筛选 · 经典线路巡游

![演示](docs/demo.gif)

**[▶ 观看完整演示视频 (MP4)](docs/demo.mp4)** · **[下载山西示例（双击即开）](examples/shanxi/山西3D旅行导览地图.html)**

`Agent Skill` `SKILL.md` `Three.js` `单文件 HTML` `离线可用` `数据驱动`

</div>

---

## 它做什么

告诉 AI（或命令行）一个地区，它返回一张**可以直接发给别人打开**的 3D 地图：

| 输入 | 输出 |
|---|---|
| 行政区代码（如 `140000` 山西省、`330100` 杭州市） | 单个 HTML 文件（约 700KB，含全部依赖） |
| 景点清单：名称 / 坐标 / 看点 / 门票 / 游玩 Tips | 3D 沙盘 + 交互导览，无需服务器、无需联网 |

景区介绍与门票等信息由 AI 按 [`references/content-guide.md`](references/content-guide.md) 的规范调研整理，你也可以自己写或修正。

## 安装

本仓库遵循通用的 **Agent Skill** 约定（目录内 `SKILL.md` 声明能力，Agent 按需加载）。克隆到对应工具的技能目录即可，装完重启生效。

| 使用方式 | 安装位置 | 命令 |
|---|---|---|
| 用户级（所有项目可用） | WorkBuddy `~/.workbuddy/skills/`<br>Claude Code `~/.claude/skills/`<br>Cursor `~/.cursor/skills/` | `git clone https://github.com/JayaHuang/3d-travel-map.git <技能目录>/3d-travel-map` |
| 项目级（团队共享） | 仓库根目录 `.workbuddy/skills/`、`.claude/skills/` 或 `.cursor/skills/` | 克隆到项目内对应目录后一并提交 |

```bash
# 例：安装到 WorkBuddy 用户级技能目录
git clone https://github.com/JayaHuang/3d-travel-map.git "$HOME/.workbuddy/skills/3d-travel-map"
```

> 各工具的技能目录命名以其官方文档为准；本质都是"含 `SKILL.md` 的目录"。卸载直接删除该目录即可。

装好后验证：问一句"**帮我做一份杭州的 3D 旅行地图**"，Agent 应当自动加载本技能并给出执行步骤。

## 怎么用

直接用自然语言提需求，越具体越好：

- "做一份山西的 3D 旅行地图，要有古建和自然风光"
- "给杭州市做一份景点导览，重点放西湖周边"
- "做一份云南的 3D 地图，包含 6 条自驾线路"

Agent 会依次完成：抓行政区划边界 → 整理景点清单 → 生成地形与 3D 场景 → 打包成单文件 HTML。
过程中通常只需你确认一次区域范围与景点清单方向。

## 能力清单

- **真实地理**：行政区边界来自阿里云 DataV GeoAtlas（省 / 市 / 区县均可），景点按真实经纬度落点
- **地形沙盘**：按当地山脉走向生成低多边形地形，盆地自动下凹，"表里山河"一目了然
- **水系绘制**：黄河、汾河等按实际走向绘制（黄河用浑金色区分）
- **景点即模型**：10 类程序化微缩模型（石窟 / 木塔 / 寺庙 / 山岳 / 瀑布 / 大院 / 古城 / 关隘 / 湖泊 / 博物馆），密集区域自动避让
- **内容即价值**：每处景点含看点详解、门票参考、建议时长、最佳季节、3~5 条实操 Tips、顺路串联推荐
- **交互**：拖拽旋转 / 滚轮缩放 / WASD 漫游 / 主题筛选 / 搜索 / 经典线路一键巡游 / 昼夜切换

## 效果预览

| 全景 | 景点详情 |
|---|---|
| ![全景](docs/images/01-overview.png) | ![详情](docs/images/02-detail.png) |

| 经典线路 | 夜景模式 |
|---|---|
| ![线路](docs/images/03-route-day.png) | ![夜景](docs/images/04-night.png) |

## 不装 Agent 也能用：命令行一键生成

```bash
# 一条命令：抓边界 + 搭项目 + 自动推算 bbox/center/scale + 打包
python scripts/generate.py --adcode 330100 --name 杭州

# 已写好景点数据时
python scripts/generate.py --adcode 140000 --name 山西 --spots ./my_spots.js
```

只依赖 Python 3.8+（无需第三方库）。产出目录 `<名称>3d/` 与可直接打开的 HTML；景点内容填进 `src/data/spots.js` 后重新打包即可。

想完全手动控制则按顺序执行：

```bash
python scripts/fetch_admin_geo.py 140000 --out mymap/src/data/geo.js      # 1. 边界
#                                                                         2. 填 region.js / spots.js
python scripts/build_standalone.py --src mymap/src --out "我的地图.html"    # 3. 打包
node  scripts/smoke_test.js "我的地图.html" ./shots                        # 4. 可选：渲染自检
```

## 配置一览

改 `src/data/region.js` 即可适配任意地区，`generate.py` 会自动填好前四项：

| 字段 | 说明 | 示例 |
|---|---|---|
| `bbox` | `[最小经度, 最小纬度, 最大经度, 最大纬度]` | `[110.10, 34.55, 114.62, 40.92]` |
| `center` | 区域内部参考点（用于把界外河流点拉回境内） | `[112.35, 37.75]` |
| `scale` | 每纬度对应的世界单位，取值 `60 / 纬度跨度` | `9.2` |
| `vert` | 高程夸张系数，山地 2~3、平原 1.5~2 | `2.45` |
| `RG_CITIES` | 下级行政区配色 | `{'大同': '#ff8a5c', ...}` |
| `RG_RANGES` | 山脉：每条 3~6 个中心点 + 半径 + 高度 | 见 `assets/data/region.example.js` |
| `RG_BASINS` | 盆地（下凹区域） | 同上 |
| `RG_RIVERS` | 水系折线；样式可用 `riverStyles` 覆盖 | 同上 |
| `RG_ROUTES` | 经典线路 `{n, ids[]}` | 同上 |

## 示例：山西省

[`examples/shanxi/`](examples/shanxi/) 内含完整成品与全部数据源，可直接当作填数模板：

| 指标 | 数值 |
|---|---|
| 景点 | 74 处（必打卡 20 / 推荐 30 / 小众 24） |
| 覆盖 | 11 个地市 |
| 世界遗产 | 3 处（云冈石窟、平遥古城、五台山） |
| 黑神话取景地 | 27 处（按山西省文物局官方名单标注） |
| 经典线路 | 6 条（晋北古建 / 晋商民俗 / 晋南黄河 / 太行山水 / 黑神话巡礼 / 太原周边） |

## 目录结构

```
3d-travel-map/
├── SKILL.md                     # 技能声明（Agent 读取入口）
├── assets/
│   ├── app_template.js          # 通用 3D 主程序（区域差异全部抽到配置，换地区无需改代码）
│   ├── index_template.html      # 页面骨架
│   ├── data/region.example.js   # 区域配置模板（山西省完整示例）
│   ├── data/spots.example.js    # 景点数据结构说明
│   └── lib/                     # three.js r147 + OrbitControls（离线可用）
├── scripts/
│   ├── generate.py              # 一键生成（推荐入口）
│   ├── fetch_admin_geo.py       # 行政区代码 → 简化边界
│   ├── build_standalone.py      # 内联打包为单文件 HTML
│   ├── make_media.js            # 生成演示截图与分镜序列帧
│   └── smoke_test.js            # 无头浏览器渲染自检
├── references/
│   ├── implementation.md        # 实现要点与推荐参数（二次开发参考）
│   └── content-guide.md         # 内容调研与写作规范
├── docs/                        # 演示素材（GIF / MP4 / 截图）
└── examples/shanxi/             # 山西省完整示例（成品 + 数据源）
```

## 已知限制

- 地形山体为程序化表达（按真实山脉走向拟合），不是真实 DEM 高程；需要精确高程可替换高度函数
- 行政区边界做了抽稀简化（省级轮廓约 375 点），放大到街区级会有棱角
- 演示数据中的门票 / 开放信息整理自公开资料，出行前请以景区官方公告为准

## License

[MIT](LICENSE)
