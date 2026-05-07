// js/cr-edit.js
import { state } from './cr-state.js';
import { ELEMENT, WEAPON, BUNRUI, BUNRUI_SHORT, CONDITION, SCOPE,
         renderEditSelect } from '../shared/constants.js';
import { submitRevise, pickPatches, showSaveToast } from '../shared/save-client.js';
import { escHtml } from './utils.js';
import { computeDiff } from './diff.js';
import { renderDetailBody, crystalElement, crystalWeapon, fmtRowBairitu } from './cr-list.js';
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
    const changed = JSON.stringify(state.editData) !== JSON.stringify(state.originalData[id]);
    state.allCrystals[idx] = state.editData;
    if (changed) {
      state.reviseData[id] = computeDiff(state.originalData[id], state.editData);
      state.sessionReviseIds.add(id);
    } else {
      delete state.reviseData[id];
      state.sessionReviseIds.delete(id);
    }
    updateReviseBar();
  }
  state.editingId = null;
  state.editData  = null;

  const row  = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  if (row && idx >= 0) {
    const c    = state.allCrystals[idx];
    const elem = crystalElement(c), weap = crystalWeapon(c);
    const rb = '<span class="badge r' + c.rarity + '">★' + c.rarity + '</span>';
    const eb = elem ? '<span class="badge elem-' + elem + '">' + (ELEMENT[elem] || elem) + '</span>' : '';
    const wb = weap ? '<span class="badge weapon">' + (WEAPON[weap] || weap) + '</span>' : '';
    const bt = (c.effects || []).reduce(function(acc, e) { return acc.concat(e.bunrui || []); }, [])
      .filter(function(v, i, a) { return a.indexOf(v) === i; })
      .slice(0, 2)
      .map(function(b) { return '<span class="badge bunrui-sm">' + (BUNRUI_SHORT[b] || b) + '</span>'; }).join('');
    row.querySelector('.row-badges').innerHTML = rb + eb + wb;
    row.querySelector('.row-name').textContent = c.name;
    row.querySelector('.row-bunrui').innerHTML = bt;
    const oldBairitu = row.querySelector('.row-bairitu');
    if (oldBairitu) oldBairitu.remove();
    const newBairituHtml = fmtRowBairitu(c);
    if (newBairituHtml) {
      const btn = row.querySelector('.expand-btn');
      btn.insertAdjacentHTML('beforebegin', newBairituHtml);
    }
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
  if (val === 0 || val === 1) {
    delete e.element; delete e.type; delete e.name;
  } else if (val === 2 || val === 3) {
    delete e.name;
  } else if (val === 5) {
    delete e.element; delete e.type;
    const tok = state.editData['特殊条件'];
    if (tok) e.name = tok; else delete e.name;
  }
  reRenderCrystalEdit();
}

export const setCrystalElement = (ei, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  val = +val;
  if (e.scope === 5) return;
  if (val === 0) {
    delete e.element;
    if (e.scope !== 1 && e.scope !== 2 && e.type == null) e.scope = 0;
  } else {
    if (e.scope !== 1) e.scope = (e.scope === 2) ? 2 : 3;
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
    delete e.type;
    if (e.scope !== 1 && e.scope !== 2 && e.element == null) e.scope = 0;
  } else {
    if (e.scope !== 1) e.scope = (e.scope === 2) ? 2 : 3;
    e.type = val;
  }
  reRenderCrystalEdit();
}

export const setCrystalBairitu = (ei, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  e.bairitu = val === '' ? null : Number(val);
  // bunrui 含 7 时，bairitu 也同步 hit_per_stage[]
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
  arr[idx] = val === '' ? null : +val;
  e.hit_per_stage = arr;
  // bairitu = max(非空 hit_per_stage)
  const nums = arr.filter(function(v) { return v != null && !isNaN(v); });
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
  arr[idx] = val === '' ? null : +val;
  e.hit_per_stage_scaling = arr;
}

export const addCrystalEffect = () => {
  if (!state.editData) return;
  if (!Array.isArray(state.editData.effects)) state.editData.effects = [];
  state.editData.effects.push({ bunrui:[16], scope:0, condition:0, calc_type:0, bairitu:1 });
  reRenderCrystalEdit();
}

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
  const weapSel  = renderEditSelect({0:'全武器種', ...WEAPON},         e.type || 0, 'setCrystalWeapon('+i+',this.value)');
  const condSel  = renderEditSelect(CONDITION,                        e.condition || 0, 'state.editData.effects['+i+'].condition=+this.value');
  const ctSel    = renderEditSelect({0:'×', 1:'+'},                   e.calc_type || 0, 'state.editData.effects['+i+'].calc_type=+this.value');

  const bairituInitInput = '<input type="number" step="any" class="edit-num-sm" style="width:90px" value="' + (e.bairitu_init != null ? e.bairitu_init : '') + '" ' +
    'oninput="state.editData.effects['+i+'].bairitu_init=this.value===\'\'?null:Number(this.value)">';
  const bairituInput = '<input id="edit-bairitu-'+i+'" type="number" step="any" class="edit-num-sm" style="width:90px" value="' + (e.bairitu != null ? e.bairitu : '') + '" ' +
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
        '<input id="edit-hps-'+i+'-'+idx+'" type="number" step="any" class="edit-num-sm" style="width:60px" value="'+v+'" oninput="setCrystalHitStage('+i+','+idx+',this.value)"></div>';
    };
    const scaleIn = function(idx) {
      const v = hpss[idx] != null ? hpss[idx] : '';
      return '<div><div class="field-label">' + (idx+1) + '撃+</div>' +
        '<input type="number" step="any" class="edit-num-sm" style="width:60px" value="'+v+'" oninput="setCrystalHitStageScaling('+i+','+idx+',this.value)"></div>';
    };
    hitBlock = '<div class="field-label" style="margin-top:6px">ヒット計算 <span style="color:var(--text2);font-weight:400">(bunrui=7のみ)</span></div>' +
      '<div class="skill-edit-meta">' +
        '<div><div class="field-label">hit_type</div>' + renderEditSelect({0:'0 減衰なし加算',1:'1 ダメージ維持加算',2:'2 乗算',3:'3 設定値'}, ht, 'state.editData.effects['+i+'].hit_type=+this.value') + '</div>' +
        stageIn(0) + stageIn(1) + stageIn(2) +
        scaleIn(0) + scaleIn(1) + scaleIn(2) +
      '</div>';
  }

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
      '<div class="field-label" style="margin-top:6px">倍率</div>' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
        ctSel + bairituInitInput +
        '<span style="color:var(--text2)">～</span>' +
        bairituInput +
      '</div>' +
      nameInput +
      hitBlock +
    '</div>';
}

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

  return '<div class="edit-actions">' +
      '<button class="btn-save" onclick="saveEdit()">保存</button>' +
      '<button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>' +
    '</div>' +
    '<div class="edit-ro" style="font-size:13px;color:var(--text);padding:3px 0 8px">' + escHtml(c.name) + '</div>' +
    roEffect + roTokushu +
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
    state.sessionReviseIds.clear();
    if (json.mode === 'remote') {
      showSaveToast(`✓ 提出済み`);
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
