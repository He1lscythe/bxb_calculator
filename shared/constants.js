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

// ============ 魔剣特性 tag enum ============
// chara.tags = int[]（顶层字段；旧 chara.bd_skill.special 已整体迁移上来）
// ⚠ 新 tag 在下方追加 entry（id 唯一、不重用）。
// 同时改：
//   - CHARA_TAG_COLOR（同 id 的色彩）
//   - scripts/crawl_chara.py compute_chara_tags()（自動検出 logic）
//   - tests/test_data_integrity.cjs 的 EXPECTED_TAG_IDS（chara.tags 校验）
//   - docs/skills_schema.md CHARA_TAG 表
export const CHARA_TAG = {
  1:  '時止め',       // BD 子页面 altema.jp/bxb/tokitomebd
  2:  '麻痺',         // BD 子页面 altema.jp/bxb/mahibd
  3:  '強制ブレイク',  // BD 効果文「強制ブレイク」
  4:  '弱体解除',     // BD 効果文「弱体化解除」「弱体化を解除」
  5:  'BDバフ',       // BD 子页面 altema.jp/bxb/buffbd
  6:  'AOE',          // chara skill effect の bunrui に 8 を含む（「攻撃範囲が敵全体になる」全体化）
  7:  '13倍',         // chara 通常 skill 内 bunrui=[1] + scope∈{1,2} + bairitu>=13（BD 除外）
  8:  '回復',         // chara skill effect の bunrui に 11 を含む（パッシブ HP 回復）
  9:  '復活',         // skill / BD 効果文に「復活」「蘇生」
  10: 'BD回復',       // BD effect の bunrui に 11 を含む（BD 発動時の味方 HP 回復）
  11: 'ルビー',       // chara skill effect の bunrui に 15 を含む（ルビー量 UP 系 passive buff）
  12: 'ダメ上限',     // chara skill effect: bunrui に 17 を含む + scope∈{1,2}（団体ダメージ上限 UP；BD 除外）
  13: 'HIT',          // chara 通常 skill 内 bunrui に 7 を含む + scope∈{1,2}（団体ヒット数 UP；BD 除外）
  14: 'BDHIT',        // chara 通常 skill 内 bunrui に 21 を含む + scope∈{1,2}（団体 BD ヒット数 UP；BD 除外）
};
export const CHARA_TAG_COLOR = {
  1:  '#60c0ff',
  2:  '#c060ff',
  3:  '#ff9a40',
  4:  '#50d070',
  5:  '#ffc840',
  6:  '#ff85b7',  // AOE — pink, range-attack
  7:  '#e84a4a',  // 13倍 — red, attacker
  8:  '#5fd8a0',  // 回復 — mint, healer (passive)
  9:  '#b070ff',  // 復活 — lavender, revive
  10: '#2db383',  // BD回復 — darker mint, BD-active healer
  11: '#e0115f',  // ルビー — ruby red gem
  12: '#4ab8c8',  // ダメ上限 — cyan-blue, hard-cap breaker
  13: '#4488dd',  // HIT — royal blue, multi-hit
  14: '#cc7733',  // BDHIT — rust orange, BD multi-hit
};

// ============ 魂特性 tag enum ============
// soul.tags = int[]（玩家手动追加；无 crawler 自動検出）。
// ⚠ 新 tag 在下方追加 entry（id 唯一、不重用）。同时改：
//   - SOUL_TAG_COLOR（同 id 色彩）
//   - tests/test_data_integrity.cjs EXPECTED_SOUL_TAG_IDS
//   - docs/skills_schema.md SOUL_TAG 表
export const SOUL_TAG = {
  1: '天魔',
  2: '大罪',
  3: '特典',
  4: '全体HIT',
  5: '全体ダメ限',
  6: '200億',
  7: 'ルビー',
  8: 'BDHIT',
};
export const SOUL_TAG_COLOR = {
  1: '#a040c8',  // 天魔 — 紫
  2: '#dd4488',  // 大罪 — magenta
  3: '#ffc840',  // 特典 — 金
  4: '#4488dd',  // 全体HIT — royal blue
  5: '#4ab8c8',  // 全体ダメ限 — cyan
  6: '#e84a4a',  // 200億 — red
  7: '#e0115f',  // ルビー — ruby
  8: '#cc7733',  // BDHIT — rust orange
};

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
