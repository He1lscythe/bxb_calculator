// 各 viewer 页面共享的纯数据常量。
// 通过 <script src="../shared/constants.js"></script> 在 nav.js 之后加载，
// 保证所有依赖这些常量的页面脚本能直接访问。

// 0 = 全属性（用于 crystal / bladegraph 等需要 effect.element=0 = 不限属性 的下拉），
// 实际数据 element 字段只取 1-6
export const ELEMENT     = {0:'全属性',1:'火',2:'水',3:'風',4:'光',5:'闇',6:'無'};
export const ELEM_COLOR  = {1:'#ff5533',2:'#3388ff',3:'#44cc66',4:'#ffcc00',5:'#aa55ff',6:'#888899'};
export const ELEMS_ORDER = ['火','水','風','光','闇','無'];

export const WEAPON        = {1:'長剣',2:'大剣',3:'太刀',4:'杖棒',5:'弓矢',6:'連弩',7:'戦斧',8:'騎槍',9:'投擲',10:'拳闘',11:'魔典',12:'大鎌'};
export const WEAPONS_ORDER = ['長剣','大剣','太刀','杖棒','弓矢','連弩','戦斧','騎槍','投擲','拳闘','魔典','大鎌'];

export const RARITY = {4:'SS',3:'S',2:'AA',1:'A'};

// 长格式（详情字段 / 编辑下拉）
export const BUNRUI = {
  1:'攻撃力', 2:'ブレイク力', 3:'BD攻撃力', 4:'スピード',
  5:'攻撃モーション', 6:'BDゲージ', 7:'ヒット数', 8:'攻撃全体化',
  9:'状態異常回避', 10:'HP', 11:'HP回復', 12:'防御力',
  13:'被ダメ軽減', 14:'サファイア', 15:'ルビー', 16:'その他',
  17:'ダメージ上限', 18:'ゲージ最大値', 19:'結晶枠', 20:'獲得EXP', 21:'BDヒット数'
};
// 短格式（badge / 紧凑标签）
export const BUNRUI_SHORT = {
  1:'攻',  2:'BK',  3:'BD攻', 4:'転',  5:'速',
  6:'BD値',7:'hit', 8:'aoe',  9:'異常',10:'HP',
  11:'回復',12:'防', 13:'軽',  14:'蓝', 15:'紅',
  16:'他',17:'限', 18:'BD最大',19:'枠',20:'EXP', 21:'BDhit'
};
// 中等格式（筛选按钮专用，比 SHORT 长比 BUNRUI 短）
export const BUNRUI_FILTER = {
  1:'攻撃力',  2:'BK力',     3:'BD攻撃力', 4:'スピード', 5:'モーション',
  6:'BD上昇',  7:'hit',      8:'aoe',     9:'異常',     10:'HP',
  11:'回復',   12:'防御力',  13:'ダメージ軽減', 14:'サファイア', 15:'ルビー',
  16:'他',     17:'ダメージ上限', 18:'BD最大値', 19:'結晶枠', 20:'EXP', 21:'BDhit'
};

export const BD_SPECIAL       = {1:'時止め',2:'麻痺',3:'強制ブレイク',5:'弱体解除',6:'高倍率バフ'};
export const BD_SPECIAL_COLOR = {1:'#60c0ff',2:'#c060ff',3:'#ff9a40',5:'#50d070',6:'#ffc840'};

// 結晶 effects[].scope（详情/编辑下拉用长版，filter 按钮用短版）
export const SCOPE       = {0:'自身/制限なし', 1:'セット全体', 2:'セット属性/武器限', 3:'自身属性/武器限', 5:'キャラ限定'};
export const SCOPE_SHORT = {0:'自身',           1:'セット全',   2:'セット限',           3:'対象限',           5:'キャラ限'};

// effects[].condition：1=逆窮鼠(HP高) / 2=窮鼠(HP低) / 3=破損状態 / 4=敵ブレイク中
export const CONDITION = {0:'なし', 1:'逆窮鼠', 2:'窮鼠', 3:'破損', 4:'敵ブレイク状態'};

// 元素 → CSS 颜色变量名（用于 filter 按钮 inline style.color）
export const ELEM_CSS_VAR = {1:'--fire', 2:'--water', 3:'--wind', 4:'--light', 5:'--dark', 6:'--none'};

// 潜在開放（魔剣 omoide）熟度阈值，40 段
export const OMOIDE_THRESHOLDS = [
  10,200,400,700,1000,2000,3000,4000,5000,6000,
  7000,9000,11000,13000,15000,18000,21000,24000,27000,30000,
  33000,36000,39000,42000,45000,48000,51000,54000,57000,60000,
  63000,66000,69000,72000,75000,78000,81000,84000,87000,90000
];

// =====================================================================
// UI 渲染助手
// 让 viewer 页面的「filter toggle 按钮 / edit dropdown / edit checkbox 网格」
// 全部从这里的 const 派生，避免标签散落在各页面里漂移。
// =====================================================================

// 共用过滤：按 opts.skip / opts.only 选 key
export function _pickKeys(map, opts) {
  opts = opts || {};
  const skip = opts.skip ? new Set(opts.skip.map(Number)) : null;
  const only = opts.only ? new Set(opts.only.map(Number)) : null;

  if (only) {
    return opts.only.map(String).filter(function(k) {
      return Object.prototype.hasOwnProperty.call(map, k);
    });
  }

  const keys =  Object.keys(map).filter(function(k){
    const n = +k;
    if (skip) return !skip.has(n);
    return true;
  });

  if (opts.sort === 'desc') keys.sort(function(a, b) { return b - a; });
  if (opts.sort === 'asc')  keys.sort(function(a, b) { return a - b; });

  return keys;
}

// 渲染一行 filter toggle 按钮（class .ftog，配合各页 toggleFilter(field,key,btn)）
//   field      : toggleFilter 的字段名
//   map        : 数据 const（如 ELEMENT / WEAPON / BUNRUI_SHORT / SCOPE / CONDITION）
//   opts.skip  : 跳过的 key 数组（如 [0]）
//   opts.only  : 仅渲染这些 key
//   opts.attr  : (key) => 附加属性串（含前导空格），如 ' style="color:var(--fire)"'
//   opts.cls   : (key) => 附加 class 串（用空格分隔），如 'elem-1'
export function renderFilterToggles(field, map, opts) {
  opts = opts || {};
  return _pickKeys(map, opts).map(function(k){
    const attr = opts.attr ? opts.attr(+k) : '';
    const extraCls = opts.cls ? ' ' + opts.cls(+k) : '';
    return '<button class="ftog' + extraCls + '" data-val="' + k + '" onclick="toggleFilter(\'' + field + '\',' + k + ',this)"' + attr + '>' + map[k] + '</button>';
  }).join('');
}

// 元素 filter 专用：默认 inline color（未选中文字带色），加 elem-N class（让 .ftog.elem-N.on 规则在选中时上 bg+border）
export function renderElementFilterToggles(field, opts) {
  opts = Object.assign({}, opts || {});
  const attrFn = opts.attr;
  opts.attr = function(k){
    const base = ELEM_CSS_VAR[k] ? ' style="color:var(' + ELEM_CSS_VAR[k] + ')"' : '';
    return base + (attrFn ? attrFn(k) : '');
  };
  const clsFn = opts.cls;
  opts.cls = function(k){
    const base = ELEM_CSS_VAR[k] ? 'elem-' + k : '';
    const extra = clsFn ? clsFn(k) : '';
    return base + (extra ? ' ' + extra : '');
  };
  return renderFilterToggles(field, ELEMENT, opts);
}

// 编辑模式 single-select dropdown
export function renderEditSelect(map, currentVal, onchangeExpr, opts) {
  opts = opts || {};
  const cls = opts.cls || 'edit-select';
  return '<select class="' + cls + '" onchange="' + onchangeExpr + '">' +
    _pickKeys(map, opts).map(function(k){
      return '<option value="' + k + '"' + (currentVal == k ? ' selected' : '') + '>' + map[k] + '</option>';
    }).join('') + '</select>';
}

// 编辑模式 multi-checkbox 网格（每个 input 触发 onchangeExpr，this 即 input）
//   selected : number[] | Set<number>
export function renderEditCheckboxes(map, selected, onchangeExpr, opts) {
  opts = opts || {};
  const cls = opts.cls || 'bunrui-check';
  const sel = (selected instanceof Set) ? selected : new Set((selected||[]).map(Number));
  return _pickKeys(map, opts).map(function(k){
    const checked = sel.has(+k) ? 'checked' : '';
    return '<label class="' + cls + '"><input type="checkbox" value="' + k + '" ' + checked + ' onchange="' + onchangeExpr + '"> ' + map[k] + '</label>';
  }).join('');
}
