// js/bg-edit.js
import { state } from './bg-state.js';
import { ELEMENT, WEAPON, BUNRUI, BUNRUI_SHORT, CONDITION, SCOPE,
         renderEditSelect } from '../shared/constants.js';
import { submitRevise, pickPatches, showSaveToast } from '../shared/save-client.js';
import { escHtml } from './utils.js';
import { _deepDiff, computeDiff, deepApply } from './diff.js';
import { renderList, renderDetailBody, cardElement, cardWeapon, fmtRowBairitu } from './bg-list.js';
import { updateReviseBar } from './nav.js';

const _BG_BUNRUI_ALL = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

export const enterEditMode = (id) => {
  // 当前已有别的行在编辑 → 先 cancel，避免之前那行的保存/キャンセル按钮卡死
  if (state.editingId !== null && state.editingId !== id) cancelEdit();
  const c = state.allBG.find(function(x){return x.id===id;});
  if (!c) return;
  state.editData = JSON.parse(JSON.stringify(c));
  state.editingId = id;
  const row  = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  if (!row || !body) return;
  row.classList.add('expanded');
  body.className = 'bg-edit-body';
  body.innerHTML = renderEditBody(state.editData);
}

export const cancelEdit = () => {
  if (state.editingId === null) return;
  const id = state.editingId;
  state.editingId = null; state.editData = null;
  const row  = document.getElementById('row-' + id);
  const body = document.getElementById('body-' + id);
  const c = state.allBG.find(function(x){return x.id===id;});
  if (body) { body.className = 'bg-body'; if(c) body.innerHTML = renderDetailBody(c); }
  if (row)  row.classList.add('expanded');
}

export const saveEdit = () => {
  if (!state.editData) return;
  const id  = state.editData.id;
  const idx = state.allBG.findIndex(function(x){return x.id===id;});
  if (idx >= 0) {
    // session 内是否真改过：跟 pre-edit 的 allBG[idx] 对比
    const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(state.allBG[idx]);
    if (sessionChanged) {
      state.allBG[idx] = state.editData;
      const totalChanged = JSON.stringify(state.editData) !== JSON.stringify(state.originalData[id]);
      if (totalChanged) {
        state.reviseData[id] = computeDiff(state.originalData[id], state.editData);
      } else {
        // 改回了 base：清掉 reviseData 但保留 session 让 server 删除条目
        delete state.reviseData[id];
      }
      state.sessionReviseIds.add(id);
    }
    updateReviseBar();
  }
  const id2 = id;
  state.editingId = null; state.editData = null;

  const row  = document.getElementById('row-' + id2);
  const body = document.getElementById('body-' + id2);
  const c = idx >= 0 ? state.allBG[idx] : null;
  if (row && c) {
    const rb = '<span class="badge r'+c.rarity+'">★'+c.rarity+'</span>';
    const ce2 = cardElement(c), cw2 = cardWeapon(c);
    const eb = ce2 ? '<span class="badge elem-'+ce2+'">'+(ELEMENT[ce2]||ce2)+'</span>' : '';
    const wb = cw2 ? '<span class="badge weapon">'+(WEAPON[cw2]||cw2)+'</span>' : '';
    const hasScope5 = (c.effects||[]).some(function(e){return e.scope===5;});
    const s5b = hasScope5 ? '<span class="badge scope5">キャラ限</span>' : '';
    const timeb = c.time_start ? '<span class="badge time">時間</span>' : '';
    const bt = (c.effects||[]).reduce(function(acc,e){return acc.concat(e.bunrui||[]);}, [])
      .filter(function(v,i,a){return a.indexOf(v)===i;}).slice(0,2)
      .map(function(b){return '<span class="badge bunrui-sm">'+(BUNRUI_SHORT[b]||b)+'</span>';}).join('');
    row.querySelector('.row-badges').innerHTML = rb + eb + wb + s5b + timeb;
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
  if (body) { body.className = 'bg-body'; if(c) body.innerHTML = renderDetailBody(c); }
  if (row)  row.classList.add('expanded');
}

export const reRenderBgEdit = () => {
  if (state.editingId == null) return;
  const body = document.getElementById('body-' + state.editingId);
  if (body) body.innerHTML = renderEditBody(state.editData);
}

export const toggleBladeBunrui = (ei, b, btn) => {
  // Hard rule: bunrui 含 7 (hit) 必须独占 [7]，与其他 bunrui 互斥；至少留 1 个
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  const prev = (e.bunrui || []).slice();
  const hadHit = prev.includes(7);
  let arr;
  if (b === 7) {
    if (hadHit) return;            // 已是 [7]，不许变空
    arr = [7];
  } else if (hadHit) {
    arr = [b];                     // 当前是 [7]，替换
  } else {
    const idx = prev.indexOf(b);
    if (idx >= 0) {
      if (prev.length <= 1) return;
      arr = prev.filter(x => x !== b);
    } else {
      arr = prev.concat(b).sort((x,y)=>x-y);
    }
  }
  e.bunrui = arr;
  reRenderBgEdit();                // 全量重渲：互斥导致多 btn 状态变
}

export const _toggleBgArrayField = (ei, field, id, btn) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  const v = e[field];
  const arr = v == null ? [] : (Array.isArray(v) ? v.slice() : [v]);
  const idx = arr.indexOf(id);
  if (idx >= 0) { arr.splice(idx, 1); btn.classList.remove('on'); }
  else          { arr.push(id); arr.sort((a,b)=>a-b); btn.classList.add('on'); }
  e[field] = arr.length === 0 ? null : (arr.length === 1 ? arr[0] : arr);
}

export const toggleBladeElement = (ei, id, btn) => { _toggleBgArrayField(ei, 'element', id, btn); }

export const toggleBladeType = (ei, id, btn) => { _toggleBgArrayField(ei, 'type',    id, btn); }

// 入力を hit 値として正規化：空 → null、"5/4" 等分数 → 文字列保持、純数値 → number。
const _normalizeHitVal = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (s.includes('/')) return s;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : s;
};

export const setBladeHitStage = (ei, idx, val) => {
  const arr = ((state.editData.effects[ei]||{}).hit_per_stage || [null, null, null]).slice();
  while (arr.length < 3) arr.push(null);
  arr[idx] = _normalizeHitVal(val);
  state.editData.effects[ei].hit_per_stage = arr;
}

export const setBladeHitStageScaling = (ei, idx, val) => {
  const arr = ((state.editData.effects[ei]||{}).hit_per_stage_scaling || [null, null, null]).slice();
  while (arr.length < 3) arr.push(null);
  arr[idx] = _normalizeHitVal(val);
  state.editData.effects[ei].hit_per_stage_scaling = arr;
}

export const setBladeScope = (ei, val) => {
  const e = state.editData?.effects?.[ei];
  if (!e) return;
  e.scope = +val;
  // scope=5 显示 name 输入框 → 重渲
  reRenderBgEdit();
}

export const addBladeEffect = () => {
  if (!state.editData) return;
  if (!Array.isArray(state.editData.effects)) state.editData.effects = [];
  state.editData.effects.push({ bunrui:[1], scope:0, condition:0, calc_type:0, bairitu:1.0 });
  reRenderBgEdit();
}

export const removeBladeEffect = (ei) => {
  if (!state.editData?.effects) return;
  if (state.editData.effects.length <= 1) return;
  state.editData.effects.splice(ei, 1);
  reRenderBgEdit();
}

export const renderEditBody = (c) => {
  const roEffect = '<div class="field-row"><div class="field-key">効果</div><div class="field-val edit-ro">'
    + escHtml(c.effect_text||'') + '</div></div>';
  const roTime = c.time_start
    ? '<div class="field-row"><div class="field-key">時間</div><div class="field-val edit-ro">'
      + escHtml(c.time_start + '～' + c.time_end) + '</div></div>'
    : '';

  const metaRow =
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--border);margin-bottom:4px;">' +
    '</div>';

  const allEffects = (Array.isArray(c.effects) && c.effects.length) ? c.effects
    : [{bunrui:[1], scope:0, condition:0, calc_type:0, bairitu:1.0}];

  const effEdits = allEffects.map(function(e, i) {
    const bunrui = e.bunrui || [];
    const btogs = _BG_BUNRUI_ALL.map(function(b) {
      return '<button class="btog' + (bunrui.includes(b)?' on':'') + '" onclick="toggleBladeBunrui('+i+','+b+',this)">' + (BUNRUI_SHORT[b]||b) + '</button>';
    }).join('');

    const selElems = e.element == null ? [] : (Array.isArray(e.element) ? e.element : [e.element]);
    const elemTogs = [1,2,3,4,5,6].map(function(k) {
      return '<button class="btog' + (selElems.indexOf(k)>=0?' on':'') + '" onclick="toggleBladeElement('+i+','+k+',this)">' + ELEMENT[k] + '</button>';
    }).join('');

    const selTypes = e.type == null ? [] : (Array.isArray(e.type) ? e.type : [e.type]);
    const typeTogs = [1,2,3,4,5,6,7,8,9,10,11,12].map(function(k) {
      return '<button class="btog' + (selTypes.indexOf(k)>=0?' on':'') + '" onclick="toggleBladeType('+i+','+k+',this)">' + WEAPON[k] + '</button>';
    }).join('');

    const scopeSel = renderEditSelect(SCOPE, e.scope, 'setBladeScope('+i+',this.value)');
    const condSel  = renderEditSelect(CONDITION, e.condition, 'state.editData.effects['+i+'].condition=+this.value');
    const ctSel    = renderEditSelect({0:'×', 1:'+', 2:'+(終)', 3:'×(終)'}, e.calc_type, 'state.editData.effects['+i+'].calc_type=+this.value');
    const bairituInput = '<input type="text" class="edit-num-sm" value="'+(e.bairitu!=null?e.bairitu:'')+'" ' +
      'oninput="state.editData.effects['+i+'].bairitu=parseBairituVal(this.value)">';

    const nameInput = (e.scope === 5)
      ? '<div class="field-label">キャラ名</div><input type="text" class="edit-input" style="width:100%" value="'+escHtml(e.name||'')+'" oninput="state.editData.effects['+i+'].name=this.value">'
      : '';

    const delBtn = allEffects.length > 1
      ? '<button class="latent-rm-btn" onclick="removeBladeEffect('+i+')" title="削除">×</button>' : '';

    let hitBlock = '';
    if (bunrui.includes(7)) {
      const ht = e.hit_type != null ? e.hit_type : 0;
      const hps  = Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [null,null,null];
      const hpss = Array.isArray(e.hit_per_stage_scaling) ? e.hit_per_stage_scaling : [null,null,null];
      const stageIn = function(idx){
        const v = hps[idx] != null ? hps[idx] : '';
        return '<div><div class="field-label">' + (idx+1) + '撃</div>' +
          '<input type="text" class="edit-num-sm" style="width:60px" value="'+v+'" oninput="setBladeHitStage('+i+','+idx+',this.value)"></div>';
      };
      const scaleIn = function(idx){
        const v = hpss[idx] != null ? hpss[idx] : '';
        return '<div><div class="field-label">' + (idx+1) + '撃+</div>' +
          '<input type="text" class="edit-num-sm" style="width:60px" value="'+v+'" oninput="setBladeHitStageScaling('+i+','+idx+',this.value)"></div>';
      };
      hitBlock = '<div class="field-label" style="margin-top:6px">ヒット計算 <span style="color:var(--text2);font-weight:400">(bunrui=7のみ)</span></div>' +
        '<div class="skill-edit-meta">' +
          '<div><div class="field-label">hit_type</div>' + renderEditSelect({0:'0 減衰なし加算',1:'1 ダメージ維持加算',2:'2 乗算',3:'3 設定値'}, ht, 'state.editData.effects['+i+'].hit_type=+this.value') + '</div>' +
          stageIn(0) + stageIn(1) + stageIn(2) +
          scaleIn(0) + scaleIn(1) + scaleIn(2) +
        '</div>';
    }

    return '<div class="bg-effect-card">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px">' +
          '<div class="field-label" style="margin:0">効果 #' + (i+1) + '</div>' + delBtn +
        '</div>' +
        '<div class="field-label">分類</div>' +
        '<div class="bunrui-toggles">' + btogs + '</div>' +
        '<div class="field-label">属性条件 <span style="color:var(--text2);font-weight:400">(複数可、不選択=なし)</span></div>' +
        '<div class="bunrui-toggles">' + elemTogs + '</div>' +
        '<div class="field-label">武器条件 <span style="color:var(--text2);font-weight:400">(複数可、不選択=なし)</span></div>' +
        '<div class="bunrui-toggles">' + typeTogs + '</div>' +
        '<div class="skill-edit-meta">' +
          '<div><div class="field-label">scope</div>' + scopeSel + '</div>' +
          '<div><div class="field-label">condition</div>' + condSel + '</div>' +
          '<div><div class="field-label">倍率</div><div style="display:flex;align-items:center;gap:4px">' + ctSel + bairituInput + '</div></div>' +
        '</div>' +
        nameInput +
        hitBlock +
      '</div>';
  }).join('');

  return '<div class="edit-actions">' +
      '<button class="btn-save" onclick="saveEdit()">保存</button>' +
      '<button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>' +
    '</div>' +
    roEffect + roTime + metaRow +
    '<div>' + effEdits + '</div>' +
    '<button class="btn-add-slot" style="margin-top:8px" onclick="addBladeEffect()">+ 効果追加</button>';
}

export const saveRevise = async () => {
  const btn    = document.querySelector('.btn-revise-save');
  const status = document.getElementById('revise-status');
  btn.textContent = '保存中...';
  btn.disabled    = true;
  try {
    const ids = Array.from(state.sessionReviseIds);
    const json = await submitRevise({
      session_ids:       ids,
      bladegraph_revise: pickPatches(state.reviseData, ids),
    });
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

