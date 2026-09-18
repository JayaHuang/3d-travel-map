/* ==========================================================================
 * region.js —— 区域配置模板（以山西省为例）
 * 换成别的地区时，只改 bbox / center / scale / vert / cityOrder 四项必改，
 * 其余（山脉、盆地、水系、线路）按当地地理填充；没有就给空数组。
 * ========================================================================== */

window.RG_CONFIG = {
  /* ---------- 必改：范围与比例尺 ---------- */
  // bbox = [最小经度, 最小纬度, 最大经度, 最大纬度]，要比行政区外接框略放大 0.05~0.15 度
  bbox: [110.10, 34.55, 114.62, 40.92],
  // center = 区域内部一点（用于把落在界外的河流点"拉"回境内），取几何中心或省会
  center: [112.35, 37.75],
  // scale: 每纬度对应的世界单位。经验值 = 900 / (纬度跨度)，使地图高约 55~60 单位
  scale: 9.2,
  // vert: 高程夸张系数。平原为主用 1.5~2，山地为主用 2~3
  vert: 2.45,

  /* ---------- 文案 ---------- */
  title: '山西 · 3D 旅行导览',
  subtitle: 'TABLE MOUNTAINS & RIVERS',
  disclaimer: '门票为参考价，淡旺季/节假日会浮动，以景区官方公告为准',

  // 统计行：可以是字符串，也可以是 function(spots) 返回字符串
  statLine: function (spots) {
    var t = function (tag) { return spots.filter(function (s) { return (s.tag || []).indexOf(tag) >= 0; }).length; };
    return '世界遗产 <b>' + (t('世界遗产') + t('世界文化景观遗产')) + '</b> · 黑神话取景地 <b>' + t('黑神话取景地') + '</b>';
  },

  /* ---------- 左侧城市排序（不填则用 RG_CITIES 的键顺序） ---------- */
  cityOrder: ['大同', '朔州', '忻州', '太原', '晋中', '吕梁', '阳泉', '长治', '晋城', '临汾', '运城'],

  /* ---------- 除 cat 之外的额外筛选器 ---------- */
  extraFilters: [
    {
      label: '黑神话取景地',
      test: function (s) { return (s.tag || []).indexOf('黑神话取景地') >= 0; }
    },
    {
      label: '世界遗产',
      test: function (s) { var t = s.tag || []; return t.indexOf('世界遗产') >= 0 || t.indexOf('世界文化景观遗产') >= 0; }
    }
  ],

  /* ---------- 图例 ---------- */
  legend: [
    { type: 'dot', color: '#e9b950', glow: true, text: '必打卡' },
    { type: 'dot', color: '#9fb4c9', text: '推荐' },
    { type: 'dot', color: '#5a6478', text: '小众' },
    { type: 'bar', color: 'linear-gradient(90deg,#22301c,#6f7a3a,#7a7268)', text: '海拔' },
    { type: 'bar', color: '#d9a441', text: '黄河' },
    { type: 'bar', color: '#4fb8e8', text: '其他水系' },
    { type: 'bar', color: '#5fd3f3', text: '推荐线路' }
  ]
};

/* ==========================================================================
 * 经典线路：ids 必须能在 spots.js 里找到，否则该点被忽略
 * ========================================================================== */
window.RG_ROUTES = [
  { n: '晋北古建朝圣 4日', ids: ['dtcity', 'shanhua', 'huayan', 'jiulongbi', 'yungang', 'hengshan', 'xkong', 'yongansi', 'yingxian', 'chongfu', 'yanmen', 'wutai', 'foguang', 'nanchan'] },
  { n: '晋商民俗 3日', ids: ['pingyao', 'shuanglin', 'zhenguo', 'qiaojia', 'wangjia', 'zhangbi', 'mianshan', 'changjia', 'jinci', 'tygucheng'] },
  { n: '晋南黄河 4日', ids: ['hukou', 'yunqiu', 'guangsheng', 'dahuashu', 'xiaoxitian', 'houtu', 'lijia', 'guandi', 'yanhu', 'yongle', 'queque', 'pujiu'] },
  { n: '太行山水 3日', ids: ['baquan', 'tongtian', 'huangya', 'balujun', 'guanyintang', 'chongqing', 'wangmangling', 'huangcheng', 'situ', 'yuhuangmiao'] },
  { n: '黑神话巡礼 5日', ids: ['yungang', 'xkong', 'huayan', 'shanhua', 'yongansi', 'jueshan', 'yingxian', 'chongfu', 'foguang', 'nanchan', 'huijisi', 'zhenguo', 'shuanglin', 'xiaoxitian', 'guangsheng', 'linfentiesi', 'guanyintang', 'chongqing', 'yuhuangmiao', 'gaopingsi', 'erxian', 'queque', 'guandi', 'fusheng'] },
  { n: '太原周边周末 2日', ids: ['sxmuseum', 'jinci', 'tianlong', 'mengshan', 'shuangta', 'zhonglou', 'tygucheng', 'xzgucheng', 'pingyao'] }
];
