// js/cr-edit.js
import { state } from './cr-state.js';
import { ELEMENT, WEAPON, BUNRUI, BUNRUI_SHORT, CONDITION, SCOPE,
         renderEditSelect } from '../shared/constants.js';
import { submitRevise, pickPatches, showSaveToast } from '../shared/save-client.js';
import { escHtml, parseBairituVal } from './utils.js';
import { computeDiff } from './diff.js';
import { renderDetailBody, renderRowHd, crystalElement, crystalWeapon, fmtRowBairitu } from './cr-list.js';
import { updateReviseBar } from './nav.js';

const _CR_BUNRUI_ALL = Object.keys(BUNRUI).map(Number).sort((a,b)=>a-b);

export const enterEditMode = (id) => {
  if (state.editingId !== null && state.editingId !== id) cancelEdit();
  const c = state.allCrystals.find(function(x) { return x.id === id; });
  if (!c) return;
  state.editData = JSON.parse(JSON.stringify(c));
  state.editingId = id;
  const row  = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  if (!row || !body) return;
  row.classList.add('expanded');
  body.className = 'crystal-edit-body';
  body.innerHTML = renderEditBody(state.editData);
}

export const cancelEdit = () => {
  if (state.editingId === null) return;
  const id = state.editingId;
  state.editingId = null;
  state.editData = null;
  const row  = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  const c    = state.allCrystals.find(function(x) { return x.id === id; });
  if (body) {
    body.className = 'crystal-body';
    if (c) body.innerHTML = renderDetailBody(c);
  }
  if (row) row.classList.add('expanded');
}

export const saveEdit = () => {
  if (!state.editData) return;
  const id  = state.editData.id;
  const idx = state.allCrystals.findIndex(function(x) { return x.id === id; });
  if (idx >= 0) {
    // session 内是否真改过：跟 pre-edit 的 allCrystals[idx] 对比
    const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(state.allCrystals[idx]);
    if (sessionChanged) {
      state.allCrystals[idx] = state.editData;
      // prev-revise pattern：传上次落盘的 revise，_deepDiff 的 prev 规则会自动
      // emit null 撤回标记。配合 server _deep_merge null pop 实现「改回 base 时
      // 清除 stale revise 字段」的撤回。
      const prevRevise = state.reviseData[id];
      const newDiff = computeDiff(state.originalData[id], state.editData, prevRevise);
      const meaningful = Object.keys(newDiff).some(k => k !== 'id' && k !== 'name');
      if (meaningful) {
        state.reviseData[id] = newDiff;
        state.sessionReviseIds.add(id);
      } else {
        // 完全无差异且 prev 也无残留 → 清空，不入队
        delete state.reviseData[id];
        state.sessionReviseIds.delete(id);
      }
    }
    updateReviseBar();
  }
  state.editingId = null;
  state.editData  = null;

  const row  = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  if (row && idx >= 0) {
    const c = state.allCrystals[idx];
    // 整段替换 .crystal-row-hd（与初始 renderRow 同源 renderRowHd）— 避免
    // patchy 更新对 dual-layout 不同步（condition tag 漏、bairitu 重复）
    const hd = row.querySelector('.crystal-row-hd');
    if (hd) hd.innerHTML = renderRowHd(c);
  }
  if (body) {
    body.className = 'crystal-body';
    const c2 = idx >= 0 ? state.allCrystals[idx] : null;
    if (c2) body.innerHTML = renderDetailBody(c2);
  }
  if (row) row.classList.add('expanded');
}

export const reRenderCrystalEdit = () => {
  if (state.editingId == null) return;
  const body = document.getElementById('body-' + state.editingId);
  if (body) body.innerHTML = renderEditBody(state.editData);
}

export const toggleCrystalBunrui = (ei, b) => {
  // bunrui [7] (hit) 与其他互斥；至少留 1 个
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  const prev = (e.bunrui || []).slice();
  const hadHit = prev.includes(7);
  let arr;
  if (b === 7) {
    if (hadHit) return;
    arr = [7];
  } else if (hadHit) {
    arr = [b];
  } else {
    const idx = prev.indexOf(b);
    if (idx >= 0) {
      if (prev.length <= 1) return;
      arr = prev.filter(x => x !== b);
    } else {
      arr = prev.concat(b).sort((x,y) => x-y);
    }
  }
  e.bunrui = arr;
  // bunrui=[7] 时 bairitu 强制 0（占位），bairitu_init 同
  if (arr.length === 1 && arr[0] === 7) {
    e.bairitu = 0;
    if (e.bairitu_init != null) e.bairitu_init = 0;
  }
  reRenderCrystalEdit();
}

export const setCrystalScope = (ei, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  val = +val;
  e.scope = val;
  // 用 null（不 delete）：让 computeDiff 看到 mval=null 与 base 比对，能 emit
  // null 撤回标记。base 没该字段时 diff.js 会判断为 nullish-equiv 不写冗余 null。
  if (val === 0 || val === 1) {
    e.element = null; e.weapon = null; e.name = null;
  } else if (val === 2 || val === 3) {
    e.name = null;
  } else if (val === 5) {
    e.element = null; e.weapon = null;
    const tok = state.editData['特殊条件'];
    e.name = tok ? tok : null;
  }
  reRenderCrystalEdit();
}

export const setCrystalElement = (ei, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  val = +val;
  if (e.scope === 5) return;
  if (val === 0) {
    e.element = null;
    // 全清 element/type → 降回无限 scope（0/1 配对的 *限 scope 反向转换）
    if (e.weapon == null) {
      if (e.scope === 3) e.scope = 0;
      else if (e.scope === 2) e.scope = 1;
    }
  } else {
    // 添加 element → 升级到对应 *限 scope（0→3, 1→2; 2/3/5 保持）
    if (e.scope === 0) e.scope = 3;
    else if (e.scope === 1) e.scope = 2;
    e.element = val;
  }
  reRenderCrystalEdit();
}

export const setCrystalWeapon = (ei, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  val = +val;
  if (e.scope === 5) return;
  if (val === 0) {
    e.weapon = null;
    if (e.element == null) {
      if (e.scope === 3) e.scope = 0;
      else if (e.scope === 2) e.scope = 1;
    }
  } else {
    if (e.scope === 0) e.scope = 3;
    else if (e.scope === 1) e.scope = 2;
    e.weapon = val;
  }
  reRenderCrystalEdit();
}

// 入力を hit 値として正規化：空 → null、"5/4" 等分数 → 文字列保持、純数値 → number。
const _normalizeHitVal = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (s.includes('/')) return s;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : s;
};
// 数値化（max 計算用）
const _parseHitNum = (v) => {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(parseFloat);
    return (Number.isFinite(a) && Number.isFinite(b) && b !== 0) ? a / b : NaN;
  }
  return parseFloat(s);
};

export const setCrystalBairitu = (ei, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  e.bairitu = parseBairituVal(val);
  // bunrui 含 7 时，bairitu 也同步 hit_per_stage[]（bairitu / hit 各段とも数値・分式文字列両対応）
  if (e.bunrui && e.bunrui.indexOf(7) !== -1) {
    const arr = (Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [null,null,null]).slice();
    while (arr.length < 3) arr.push(null);
    arr[0] = e.bairitu; arr[1] = e.bairitu; arr[2] = e.bairitu;
    e.hit_per_stage = arr;
    for (let i = 0; i < 3; i++) {
      const inp = document.getElementById('edit-hps-' + ei + '-' + i);
      if (inp) inp.value = (e.bairitu != null ? e.bairitu : '');
    }
  }
}

export const setCrystalHitStage = (ei, idx, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  const arr = (Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [null,null,null]).slice();
  while (arr.length < 3) arr.push(null);
  arr[idx] = _normalizeHitVal(val);
  e.hit_per_stage = arr;
  // bairitu = max(非空 hit_per_stage の数値化値)。分数字列も含めて parse → max。
  const nums = arr.map(_parseHitNum).filter(v => Number.isFinite(v));
  if (nums.length) {
    e.bairitu = Math.max.apply(null, nums);
    const bairituInp = document.getElementById('edit-bairitu-' + ei);
    if (bairituInp) bairituInp.value = e.bairitu;
  }
}

export const setCrystalHitStageScaling = (ei, idx, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  const arr = (Array.isArray(e.hit_per_stage_scaling) ? e.hit_per_stage_scaling : [null,null,null]).slice();
  while (arr.length < 3) arr.push(null);
  arr[idx] = _normalizeHitVal(val);
  e.hit_per_stage_scaling = arr;
}

export const addCrystalEffect = () => {
  if (!state.editData) return;
  if (!Array.isArray(state.editData.effects)) state.editData.effects = [];
  state.editData.effects.push({ bunrui:[16], scope:0, condition:0, calc_type:0, bairitu:1 });
  reRenderCrystalEdit();
}

// ===== 顶层 level_max / weight_step / purity_step（撤回机制）=====
// step 设 0 / 空 → 撤回该字段（editData 设 null，diff 时 emit null 撤回，落盘时 deepMerge 删字段）
// step 撤回时 + 联动撤回所有 effect 内对应 delta（语义：step=0 = 该结晶不可调，delta 没意义）
export const setCrystalLevelMax = (val) => {
  const cr = state.editData;
  if (!cr) return;
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) cr.level_max = null;
  else cr.level_max = n;
};

export const setCrystalStep = (kind, val) => {  // kind: 'weight' | 'purity'
  const cr = state.editData;
  if (!cr) return;
  const stepKey  = kind + '_step';
  const deltaKey = kind + '_delta';
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) {
    cr[stepKey] = null;
    (cr.effects || []).forEach(e => { e[deltaKey] = null; });
  } else {
    cr[stepKey] = n;
  }
  reRenderCrystalEdit();
};

export const setCrystalDelta = (ei, kind, val) => {  // kind: 'weight' | 'purity'
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  const deltaKey = kind + '_delta';
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n === 0 || val === '') e[deltaKey] = null;
  else e[deltaKey] = n;
};

export const removeCrystalEffect = (ei) => {
  if (!state.editData?.effects) return;
  if (state.editData.effects.length <= 1) return;
  state.editData.effects.splice(ei, 1);
  reRenderCrystalEdit();
}

const _renderEffectCard = (e, i, total) => {
  const bunrui = e.bunrui || [];
  const btogs = _CR_BUNRUI_ALL.map(function(b) {
    return '<button class="btog' + (bunrui.includes(b)?' on':'') + '" onclick="toggleCrystalBunrui('+i+','+b+')">' + (BUNRUI_SHORT[b]||b) + '</button>';
  }).join('');

  const scopeSel = renderEditSelect(SCOPE,                            e.scope || 0, 'setCrystalScope('+i+',this.value)');
  const elemSel  = renderEditSelect({0:'全属性', ...ELEMENT},          e.element || 0, 'setCrystalElement('+i+',this.value)');
  const weapSel  = renderEditSelect({0:'全武器種', ...WEAPON},         e.weapon || 0, 'setCrystalWeapon('+i+',this.value)');
  const condSel  = renderEditSelect(CONDITION,                        e.condition || 0, 'state.editData.effects['+i+'].condition=+this.value');
  const ctSel    = renderEditSelect({0:'×', 1:'+', 2:'+(終)', 3:'×(終)'}, e.calc_type || 0, 'state.editData.effects['+i+'].calc_type=+this.value');

  const bairituInitInput = '<input type="text" class="edit-num-sm" style="width:90px" value="' + (e.bairitu_init != null ? e.bairitu_init : '') + '" ' +
    'oninput="state.editData.effects['+i+'].bairitu_init=parseBairituVal(this.value)">';
  const bairituInput = '<input id="edit-bairitu-'+i+'" type="text" class="edit-num-sm" style="width:90px" value="' + (e.bairitu != null ? e.bairitu : '') + '" ' +
    'oninput="setCrystalBairitu('+i+',this.value)">';

  const nameInput = (e.scope === 5)
    ? '<div class="field-label" style="margin-top:6px">キャラ名</div><input type="text" class="edit-input" style="width:100%" value="' + escHtml(e.name||'') + '" oninput="state.editData.effects['+i+'].name=this.value">'
    : '';

  const delBtn = total > 1
    ? '<button class="latent-rm-btn" onclick="removeCrystalEffect('+i+')" title="削除">×</button>' : '';

  let hitBlock = '';
  if (bunrui.includes(7)) {
    const ht = e.hit_type != null ? e.hit_type : 0;
    const hps  = Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [null,null,null];
    const hpss = Array.isArray(e.hit_per_stage_scaling) ? e.hit_per_stage_scaling : [null,null,null];
    const stageIn = function(idx) {
      const v = hps[idx] != null ? hps[idx] : '';
      return '<div><div class="field-label">' + (idx+1) + '撃</div>' +
        '<input id="edit-hps-'+i+'-'+idx+'" type="text" class="edit-num-sm" style="width:60px" value="'+v+'" oninput="setCrystalHitStage('+i+','+idx+',this.value)"></div>';
    };
    const scaleIn = function(idx) {
      const v = hpss[idx] != null ? hpss[idx] : '';
      return '<div><div class="field-label">' + (idx+1) + '撃+</div>' +
        '<input type="text" class="edit-num-sm" style="width:60px" value="'+v+'" oninput="setCrystalHitStageScaling('+i+','+idx+',this.value)"></div>';
    };
    hitBlock = '<div class="field-label" style="margin-top:6px">ヒット計算 <span style="color:var(--text2);font-weight:400">(bunrui=7のみ)</span></div>' +
      '<div class="skill-edit-meta">' +
        '<div><div class="field-label">hit_type</div>' + renderEditSelect({0:'0 減衰なし加算',1:'1 ダメージ維持加算',2:'2 乗算',3:'3 設定値'}, ht, 'state.editData.effects['+i+'].hit_type=+this.value') + '</div>' +
        stageIn(0) + stageIn(1) + stageIn(2) +
        scaleIn(0) + scaleIn(1) + scaleIn(2) +
      '</div>';
  }

  // weight_delta / purity_delta — 仅当 crystal 顶层有对应 step > 0 才显示。
  // 与「倍率」放一行；宽度 90px 跟 bairitu 同宽（占位公式说明放整段 label 上）。
  const cr = state.editData || {};
  const wStep = +cr.weight_step || 0;
  const pStep = +cr.purity_step || 0;
  const wDeltaInline = wStep > 0
    ? '<div><div class="field-label">重 / ' + wStep + 'g</div>' +
      '<input type="number" step="any" class="edit-num-sm" style="width:90px" value="' + (e.weight_delta != null ? e.weight_delta : '') + '"' +
      ' oninput="setCrystalDelta(' + i + ',\'weight\',this.value)"></div>'
    : '';
  const pDeltaInline = pStep > 0
    ? '<div><div class="field-label">純 / ' + pStep + '%</div>' +
      '<input type="number" step="any" class="edit-num-sm" style="width:90px" value="' + (e.purity_delta != null ? e.purity_delta : '') + '"' +
      ' oninput="setCrystalDelta(' + i + ',\'purity\',this.value)"></div>'
    : '';
  // ctSel + init + max 也加 label，让一行内字段对齐
  const ctWithLabel       = '<div><div class="field-label">type</div>' + ctSel + '</div>';
  const initWithLabel     = '<div><div class="field-label">init</div>' + bairituInitInput + '</div>';
  const bairituWithLabel  = '<div><div class="field-label">max</div>' + bairituInput + '</div>';

  return '<div class="crystal-effect-card">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px">' +
        '<div class="field-label" style="margin:0">効果 #' + (i+1) + '</div>' + delBtn +
      '</div>' +
      '<div class="field-label">分類</div>' +
      '<div class="bunrui-toggles">' + btogs + '</div>' +
      '<div class="skill-edit-meta">' +
        '<div><div class="field-label">scope</div>' + scopeSel + '</div>' +
        '<div><div class="field-label">属性</div>' + elemSel + '</div>' +
        '<div><div class="field-label">武器</div>' + weapSel + '</div>' +
        '<div><div class="field-label">condition</div>' + condSel + '</div>' +
      '</div>' +
      '<div class="field-label" style="margin-top:6px">倍率' +
        ((wStep > 0 || pStep > 0) ? ' <span style="color:var(--text2);font-weight:400">／ 重·純 衰減 (per step bairitu 減少；占位公式)</span>' : '') +
      '</div>' +
      '<div class="skill-edit-meta">' +
        ctWithLabel + initWithLabel + bairituWithLabel + wDeltaInline + pDeltaInline +
      '</div>' +
      nameInput +
      hitBlock +
    '</div>';
}

// step 下拉可选值（含 0 表示「不可调」）
const _WEIGHT_STEPS = [0, 0.1, 1, 10, 20, 25, 50, 100];
const _PURITY_STEPS = [0, 0.01, 1, 10, 20, 25, 50, 100];

const _renderStepSelect = (kind, current, opts) => {
  const cur = +current || 0;
  const items = opts.map(v => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + (v === 0 ? '不可調' : v) + '</option>').join('');
  return '<select class="edit-select" onchange="setCrystalStep(\'' + kind + '\',this.value)">' + items + '</select>';
};

export const renderEditBody = (c) => {
  const allEffects = (Array.isArray(c.effects) && c.effects.length) ? c.effects
    : [{bunrui:[16], scope:0, condition:0, calc_type:0, bairitu:1}];

  const effEdits = allEffects.map(function(e, i) { return _renderEffectCard(e, i, allEffects.length); }).join('');

  const roEffect = c.effect_text
    ? '<div class="field-row"><div class="field-key">効果</div><div class="field-val edit-ro">' + escHtml(c.effect_text) + '</div></div>'
    : '';
  const roTokushu = c['特殊条件']
    ? '<div class="field-row"><div class="field-key">特殊条件</div><div class="field-val edit-ro">' + escHtml(c['特殊条件']) + '</div></div>'
    : '';

  // 顶层 level_max / weight_step / purity_step（撤回机制：空 / 0 → 字段被删）
  const lvBlock =
    '<div><div class="field-label">level_max（缺省＝rarity 表）</div>' +
    '<input type="number" min="0" step="any" class="edit-num-sm" style="width:80px" value="' + (c.level_max != null ? c.level_max : '') + '"' +
    ' oninput="setCrystalLevelMax(this.value)"></div>';
  const wStepBlock =
    '<div><div class="field-label">weight_step (g)</div>' + _renderStepSelect('weight', c.weight_step, _WEIGHT_STEPS) + '</div>';
  const pStepBlock =
    '<div><div class="field-label">purity_step (%)</div>' + _renderStepSelect('purity', c.purity_step, _PURITY_STEPS) + '</div>';
  const topMeta =
    '<div class="field-label" style="margin-top:8px">結晶 上限 / 颗粒度</div>' +
    '<div class="skill-edit-meta">' + lvBlock + wStepBlock + pStepBlock + '</div>';

  return '<div class="edit-actions">' +
      '<button class="btn-save" onclick="saveEdit()">保存</button>' +
      '<button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>' +
    '</div>' +
    '<div class="edit-ro" style="font-size:13px;color:var(--text);padding:3px 0 8px">' + escHtml(c.name) + '</div>' +
    roEffect + roTokushu +
    topMeta +
    '<div>' + effEdits + '</div>' +
    '<button class="btn-add-slot" style="margin-top:8px" onclick="addCrystalEffect()">+ 効果追加</button>';
}

export const saveRevise = async () => {
  const btn    = document.querySelector('.btn-revise-save');
  const status = document.getElementById('revise-status');
  btn.textContent = '保存中...';
  btn.disabled    = true;
  try {
    const ids = Array.from(state.sessionReviseIds);
    const json = await submitRevise({
      session_ids:    ids,
      crystal_revise: pickPatches(state.reviseData, ids),
    });
    // submit 成功后 refresh：用无 prev 的 computeDiff 重算 state.reviseData，
    // 去掉 null 撤回标记，防止下次 saveEdit 拿到 stale prev 重复 emit null。
    // mirror js/soul-edit.js:147-157 / js/bg-edit.js 同款。
    for (const id of ids) {
      const idx = state.allCrystals.findIndex(c => c.id === id);
      if (idx < 0) continue;
      const fresh = computeDiff(state.originalData[id], state.allCrystals[idx]);
      if (Object.keys(fresh).some(k => k !== 'id' && k !== 'name')) {
        state.reviseData[id] = fresh;
      } else {
        delete state.reviseData[id];
      }
    }
    state.sessionReviseIds.clear();
    if (json.mode === 'remote') {
      showSaveToast(`✓ 提案受付完了 — 管理者の審査・マージ後に反映されます`);
      status.textContent = '';
    } else {
      status.textContent = '✓ 保存完了';
    }
  } catch (err) {
    status.textContent = '保存失敗';
    console.error(err);
  } finally {
    btn.disabled = false;
    updateReviseBar();
  }
}
