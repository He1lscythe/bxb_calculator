// js/soul-edit.js
import { state } from './soul-state.js';
import { ELEMENT, WEAPON, BUNRUI_SHORT, BUNRUI, CONDITION,
         ELEMS_ORDER, WEAPONS_ORDER, SOUL_TAG,
         renderEditSelect, renderEditCheckboxes } from '../shared/constants.js';
import { submitRevise, pickPatches, showSaveToast } from '../shared/save-client.js';
import { escHtml, fmtBairitu, fmtHitStages, ctPfx, min } from './utils.js';
import { getPath, setPath, _deepDiff, computeDiff, deepApply } from './diff.js';
import { selectSoul, setupStickyHeights, _deletedSet,
         AFF_LABEL, AFF_CLS } from './soul-render.js';
import { updateReviseBar } from './nav.js';

const BUNRUI_ALL = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

// 魂特性 tag toggle（手動編集；mirror chara.tags pattern in js/edit.js）
export const renderSoulTagToggles = (s) => {
  return Object.keys(SOUL_TAG).map(k => {
    const sid = +k;
    const on = (s.tags || []).includes(sid);
    return '<button class="btog' + (on ? ' on' : '') +
      '" onclick="toggleSoulTag(' + sid + ',this)">' + SOUL_TAG[sid] + '</button>';
  }).join('');
};

export const toggleSoulTag = (sid, btn) => {
  if (!state.editData) return;
  let tags = state.editData.tags || [];
  if (tags.includes(sid)) tags = tags.filter(x => x !== sid);
  else                    tags = [...tags, sid].sort((a, b) => a - b);
  state.editData.tags = tags;
  btn.classList.toggle('on');
};

export const toggleBunrui = (path, b, btn) => {
  // Hard rule: bunrui 含 7 (hit) 必须独占 [7]，与其他 bunrui 互斥
  // 同时强制保留至少 1 个 bunrui（soul 的约束）
  const prev = (getPath(state.editData, path + '.bunrui') || []).slice();
  const hadHit = prev.includes(7);
  let arr;
  if (b === 7) {
    if (hadHit) return;        // 已经是 [7]，不允许变空
    arr = [7];                 // 切到 hit
  } else if (hadHit) {
    arr = [b];                 // 当前是 [7]，替换
  } else {
    const idx = prev.indexOf(b);
    if (idx >= 0) {
      if (prev.length <= 1) return;  // 至少留 1
      arr = prev.filter(x => x !== b);
    } else {
      arr = prev.concat(b).sort((x,y)=>x-y);
    }
  }
  setPath(state.editData, path + '.bunrui', arr);
  // bunrui=[7] 时 bairitu 强制 0
  if (arr.length === 1 && arr[0] === 7) {
    setPath(state.editData, path + '.bairitu', 0);
  }
  reRenderEditSkills();        // 全量重渲：互斥导致多 btn 状态变 + bairitu/hit 块切换
}

export const toggleElem = (path, id, btn) => {
  const v   = getPath(state.editData, path + '.element');
  const arr = v == null ? [] : (Array.isArray(v) ? v.slice() : [v]);
  const idx = arr.indexOf(id);
  if (idx >= 0) { arr.splice(idx, 1); btn.classList.remove('on'); }
  else          { arr.push(id); arr.sort((a,b)=>a-b); btn.classList.add('on'); }
  setPath(state.editData, path + '.element', arr.length === 0 ? null : (arr.length === 1 ? arr[0] : arr));
}

export const toggleType = (path, id, btn) => {
  const v   = getPath(state.editData, path + '.weapon');
  const arr = v == null ? [] : (Array.isArray(v) ? v.slice() : [v]);
  const idx = arr.indexOf(id);
  if (idx >= 0) { arr.splice(idx, 1); btn.classList.remove('on'); }
  else          { arr.push(id); arr.sort((a,b)=>a-b); btn.classList.add('on'); }
  setPath(state.editData, path + '.weapon', arr.length === 0 ? null : (arr.length === 1 ? arr[0] : arr));
}

export const enterEditMode = (soulId) => {
  const s = state.allSouls.find(x => x.id === soulId);
  if (!s) return;
  state.editData = JSON.parse(JSON.stringify(s));
  document.getElementById('soul-detail').innerHTML = renderEditDetail(state.editData);
}

export const cancelEdit = () => {
  state.editData = null;
  selectSoul(state.selectedId);
}

// atk_effect / def_effect 値が「1」(=任意小数表記の 1.0) 時はデフォルトと同じ意味で
// revise に残す価値が無い → diff 計算前に剥がし「fieldが存在しない」状態にする。
// "5/4" 等の分式は別途残す（mathematical 1 ではあるが user intent 不明な為）。
const _isEffectDefault = (v) => {
  if (v == null) return false;
  const s = String(v).trim();
  if (s === '' || s.includes('/')) return false;
  const n = parseFloat(s);
  return Number.isFinite(n) && n === 1;
};
const _normalizeAffinityForDiff = (soul) => {
  const c = JSON.parse(JSON.stringify(soul));
  for (const fld of ['element_affinity', 'weapon_affinity']) {
    const d = c[fld];
    if (!d || typeof d !== 'object') continue;
    for (const k of Object.keys(d)) {
      const e = d[k];
      if (!e || typeof e !== 'object') continue;
      if (_isEffectDefault(e.atk_effect)) delete e.atk_effect;
      if (_isEffectDefault(e.def_effect)) delete e.def_effect;
    }
  }
  // 空 tags 数组 → 当作 base 无 tags 字段处理（diff 不 emit `tags: []` 残留）。
  // base 也无 tags 时，结合 prev-revise 撤回机制，diff 自动 emit `tags: null` pop。
  if (Array.isArray(c.tags) && c.tags.length === 0) delete c.tags;
  return c;
};

export const saveEdit = () => {
  if (!state.editData) return;
  // Clean up empty tombstone / added arrays
  if (Array.isArray(state.editData._deleted_skills) && state.editData._deleted_skills.length === 0) {
    delete state.editData._deleted_skills;
  }
  if (Array.isArray(state.editData._added_skills) && state.editData._added_skills.length === 0) {
    delete state.editData._added_skills;
  }
  const id  = state.editData.id;
  const idx = state.allSouls.findIndex(x => x.id === id);
  if (idx >= 0) {
    // session 内是否真改过：拿 editData 跟 pre-edit 的 allSouls[idx] 对比，
    // 而不是 originalData（base）。撤回到 base 算 session 变化。
    const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(state.allSouls[idx]);
    if (sessionChanged) {
      state.allSouls[idx] = state.editData;
      const normalizedEdit = _normalizeAffinityForDiff(state.editData);
      const prevRevise = state.reviseData[id];   // 撤回検知用
      const newDiff = computeDiff(state.originalData[id], normalizedEdit, prevRevise);
      const meaningful = Object.keys(newDiff).some(k => k !== 'id' && k !== 'name');
      if (meaningful) {
        state.reviseData[id] = newDiff;
        state.sessionReviseIds.add(id);
      } else {
        // 完全没差异（比如改了又改回来）→ 清空，不入队
        delete state.reviseData[id];
        state.sessionReviseIds.delete(id);
      }
    }
    updateReviseBar();
  }
  state.editData = null;
  selectSoul(state.selectedId);
}

export const saveRevise = async () => {
  const btn    = document.querySelector('.btn-revise-save');
  const status = document.getElementById('revise-status');
  btn.textContent = '保存中...';
  btn.disabled    = true;
  try {
    const ids = Array.from(state.sessionReviseIds);
    const json = await submitRevise({
      session_ids: ids,
      souls_revise: pickPatches(state.reviseData, ids),
    });
    // submit 成功后，refresh state.reviseData[id] 反映 disk 实际状態（去除 null マーカー）。
    // 否则下次 saveEdit 拿到带 null 的 stale prev → computeDiff 重复产出 null。
    for (const id of ids) {
      const idx = state.allSouls.findIndex(s => s.id === id);
      if (idx < 0) continue;
      const norm = _normalizeAffinityForDiff(state.allSouls[idx]);
      const fresh = computeDiff(state.originalData[id], norm);   // no prev → 无 null
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

export const renderEditDetail = (s) => {
  return min`
    <div class="soul-header edit-mode-active">
      <div class="soul-header-top" style="margin-bottom:10px">
        <div class="title" style="flex:1;margin-right:10px;font-size:18px;font-weight:700">${escHtml(s.name)}</div>
        <div class="edit-actions">
          <button class="btn-save"   onclick="saveEdit()">保存</button>
          <button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>
        </div>
      </div>
      <img class="soul-banner" src="${escHtml(s.image||`https://img.altema.jp/bxb/soul/banner/${s.id}.jpg`)}"
           onerror="this.style.display='none'" alt="">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="field-label" style="margin:0">レア度</span>
          ${renderEditSelect({5:'★★★★★',4:'★★★★',3:'★★★',2:'★★',1:'★'}, s.rarity, `setPath(state.editData,'rarity',+this.value)`, {only:[5,4,3,2,1]})}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="field-label" style="margin:0">最大Lv</span>
          <input type="number" class="edit-num-sm" style="width:70px" value="${s.max_level||''}"
                 oninput="setPath(state.editData,'max_level',this.value===''?null:+this.value)">
        </div>
      </div>
      <div class="chara-tag-row" style="margin-top:10px">
        <span class="field-label" style="margin:0">魂特性</span>
        <div class="bunrui-toggles">${renderSoulTagToggles(s)}</div>
      </div>
    </div>
    ${renderEditAffinitySection(s, 'element_affinity', ELEMS_ORDER, '属性相性')}
    ${renderEditAffinitySection(s, 'weapon_affinity', WEAPONS_ORDER, '得意武器')}
    <div id="skills-edit-section">${renderEditSkillsSection(s)}</div>`;
}

export const renderEditAffinitySection = (s, field, keys, title) => {
  const cells = keys.map(name => {
    const aff   = (s[field]||{})[name] || {level:0, atk_effect:'1', def_effect:'1'};
    const lv    = String(aff.level != null ? aff.level : 0);
    const label = AFF_LABEL[lv] || '普通';
    const cls   = AFF_CLS[lv]  || 'aff-0';
    const atkPath = `${field}.${name}.atk_effect`;
    const defPath = `${field}.${name}.def_effect`;
    const atkVal  = aff.atk_effect != null ? aff.atk_effect : '1';
    const defVal  = aff.def_effect != null ? aff.def_effect : '1';
    return min`
      <div class="edit-aff-cell">
        <span class="edit-aff-name">${name}</span>
        <span class="edit-aff-level ${cls}">${label}</span>
        <div class="edit-aff-inputs">
          <div class="edit-aff-input-pair">
            <span class="edit-aff-mini-label">ATK</span>
            <input type="text" class="edit-num-xs" value="${atkVal}"
                   oninput="setPath(state.editData,'${atkPath}',parseAffEffect(this.value))">
          </div>
          <div class="edit-aff-input-pair">
            <span class="edit-aff-mini-label">DEF</span>
            <input type="text" class="edit-num-xs" value="${defVal}"
                   oninput="setPath(state.editData,'${defPath}',parseAffEffect(this.value))">
          </div>
        </div>
      </div>`;
  }).join('');
  return min`
    <div class="section">
      <div class="section-title">${title}</div>
      <div class="edit-aff-grid">${cells}</div>
    </div>`;
}

export const renderEditSkillsSection = (s) => {
  const baseSkills  = s.skills || [];
  const addedSkills = Array.isArray(s._added_skills) ? s._added_skills : [];
  if (!baseSkills.length && !addedSkills.length) {
    return `<div class="section"><div class="section-title">スキル構成</div><button class="btn-add-slot" onclick="addNewSkill()">+ スキル追加</button></div>`;
  }
  const dead = _deletedSet(s);
  // Combine: base skills with source='base', added skills with source='added'
  const items = baseSkills.map((sk, i) => ({sk, src:'base', i}))
    .concat(addedSkills.map((sk, i) => ({sk, src:'added', i})));
  const cards = items.map(it => {
    const sk = it.sk, i = it.i, src = it.src;
    const isAdded = src === 'added';
    const isDeleted = !isAdded && dead.has(sk.name||'');
    const path = isAdded ? `_added_skills.${i}` : `skills.${i}`;
    const tombBtn = isAdded
      ? `<button class="btn-skill-tomb" onclick="removeAddedSkill(${i})" title="削除">×</button>`
      : `<button class="btn-skill-tomb" onclick="toggleSkillTombstone(${JSON.stringify(sk.name||'').replace(/"/g,'&quot;')})" title="${isDeleted?'復活':'削除'}">${isDeleted?'↻':'×'}</button>`;
    const tagBadge = isAdded ? '<span style="font-size:10px;background:rgba(91,127,255,0.25);border:1px solid #5b7fff;color:#7b9fff;padding:1px 5px;border-radius:3px;margin-left:6px">追加</span>' : '';
    const sp = path;
    const allEffects = sk.effects && sk.effects.length ? sk.effects : [{}];
    const effectBlocks = allEffects.map((e, ei) => {
      const ep     = `${sp}.effects.${ei}`;
      const bunrui = e.bunrui || [];
      const btogs  = BUNRUI_ALL.map(b =>
        `<button class="btog${bunrui.includes(b)?' on':''}" onclick="toggleBunrui('${ep}',${b},this)">${BUNRUI_SHORT[b]||b}</button>`
      ).join('');
      const selElems = e.element == null ? [] : (Array.isArray(e.element) ? e.element : [e.element]);
      const elemTogs = Object.entries(ELEMENT).map(([k,v]) =>
        `<button class="btog${selElems.includes(+k)?' on':''}" onclick="toggleElem('${ep}',${k},this)">${v}</button>`
      ).join('');
      const selTypes = e.weapon == null ? [] : (Array.isArray(e.weapon) ? e.weapon : [e.weapon]);
      const typeTogs = Object.entries(WEAPON).map(([k,v]) =>
        `<button class="btog${selTypes.includes(+k)?' on':''}" onclick="toggleType('${ep}',${k},this)">${v}</button>`
      ).join('');
      const delBtn = allEffects.length > 1
        ? `<button class="latent-rm-btn" onclick="removeSkillEffect('${src}',${i},${ei})" title="削除">×</button>` : '';
      return min`
        <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:4px">
          <div class="field-label" style="margin:0">効果 #${ei+1}</div>${delBtn}
        </div>
        <div class="field-label">分類</div>
        <div class="bunrui-toggles">${btogs}</div>
        <div class="field-label">属性条件 <span style="color:var(--text2);font-weight:400">(複数可、不選択=なし)</span></div>
        <div class="bunrui-toggles">${elemTogs}</div>
        <div class="field-label">武器条件 <span style="color:var(--text2);font-weight:400">(複数可、不選択=なし)</span></div>
        <div class="bunrui-toggles">${typeTogs}</div>
        <div class="skill-edit-meta">
          <div>
            <div class="field-label">scope</div>
            ${renderEditSelect({0:'自身',1:'全体',3:'装備→自',4:'装備→全'}, e.scope, `setPath(state.editData,'${ep}.scope',+this.value)`)}
          </div>
          <div>
            <div class="field-label">condition</div>
            ${renderEditSelect(CONDITION, e.condition, `setPath(state.editData,'${ep}.condition',+this.value)`)}
          </div>
          <div>
            <div class="field-label">倍率</div>
            <div style="display:flex;align-items:center;gap:4px">
              ${renderEditSelect({0:'×',1:'+',2:'+(終)',3:'×(終)'}, e.calc_type, `setPath(state.editData,'${ep}.calc_type',+this.value)`)}
              <input type="text" class="edit-num-sm" value="${e.bairitu!=null?e.bairitu:''}"
                     oninput="setPath(state.editData,'${ep}.bairitu',parseBairituVal(this.value))">
            </div>
          </div>
        </div>
        ${(bunrui.includes(7)) ? (() => {
          const hps = Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [null,null,null];
          const hpss = Array.isArray(e.hit_per_stage_scaling) ? e.hit_per_stage_scaling : [null,null,null];
          const stageIn = (i) => `<div><div class="field-label">${i+1}撃</div><input type="text" class="edit-num-sm" style="width:42px" value="${hps[i]!=null?hps[i]:''}" oninput="setHitStage('${ep}',${i},this.value)"></div>`;
          const scaleIn = (i) => `<div><div class="field-label">${i+1}撃+</div><input type="text" class="edit-num-sm" style="width:42px" value="${hpss[i]!=null?hpss[i]:''}" oninput="setHitStageScaling('${ep}',${i},this.value)"></div>`;
          return min`
            <div class="field-label" style="margin-top:6px">ヒット計算 <span style="color:var(--text2);font-weight:400">(bunrui=7のみ)</span></div>
            <div class="skill-edit-meta">
              <div>
                <div class="field-label">hit_type</div>
                ${renderEditSelect({0:'0 減衰なし加算',1:'1 ダメージ維持加算',2:'2 乗算',3:'3 設定値'}, e.hit_type??0, `setPath(state.editData,'${ep}.hit_type',+this.value)`)}
              </div>
              ${stageIn(0)}${stageIn(1)}${stageIn(2)}
              ${scaleIn(0)}${scaleIn(1)}${scaleIn(2)}
            </div>`;
        })() : ''}`;
    }).join('');
    const nameField = isAdded
      ? `<input type="text" class="edit-input" style="font-size:13px;color:var(--accent);font-weight:600;width:100%" value="${escHtml(sk.name||'')}" oninput="setPath(state.editData,'${path}.name',this.value)">`
      : `<div class="skill-name-edit" style="font-size:13px;color:var(--accent);font-weight:600;padding:4px 0 6px">${escHtml(sk.name||'')}${tagBadge}</div>`;
    const effectField = isAdded
      ? `<input type="text" class="edit-input" style="font-size:13px;width:100%" value="${escHtml(sk.effect_text||'')}" oninput="setPath(state.editData,'${path}.effect_text',this.value)">`
      : `<div style="font-size:13px;line-height:1.6;padding:4px 0 6px;color:var(--text)">${escHtml(sk.effect_text||'')}</div>`;
    return min`
      <div class="skill-edit-card${isDeleted?' deleted':''}">
        ${tombBtn}
        <div class="field-label">スキル名</div>
        ${nameField}
        <div class="field-label">効果</div>
        ${effectField}
        ${isDeleted ? '<div style="color:#ff8080;font-size:12px;padding:4px 0">⚠ このスキルは削除マーク中（保存後ビューで非表示）</div>' : effectBlocks + `<button class="btn-add-slot" style="margin-top:6px" onclick="addSkillEffect('${src}',${i})">+ 効果追加</button>`}
      </div>`;
  }).join('');
  return min`
    <div class="section">
      <div class="section-title">スキル構成 (${baseSkills.length + addedSkills.length})</div>
      <div class="skills-list">${cards}</div>
      <button class="btn-add-slot" style="margin-top:8px" onclick="addNewSkill()">+ スキル追加</button>
    </div>`;
}

// 入力を hit 値として正規化：空 → null、"5/4" など分数 → 文字列保持、それ以外 → number。
// 既存の int/float データとの diff を増やさないため、純数値は number で保存。
const _normalizeHitVal = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (s.includes('/')) return s;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : s;
};

export const setHitStage = (path, idx, val) => {
  const arr = (getPath(state.editData, path + '.hit_per_stage') || [null, null, null]).slice();
  while (arr.length < 3) arr.push(null);
  arr[idx] = _normalizeHitVal(val);
  setPath(state.editData, path + '.hit_per_stage', arr);
}

export const setHitStageScaling = (path, idx, val) => {
  const arr = (getPath(state.editData, path + '.hit_per_stage_scaling') || [null, null, null]).slice();
  while (arr.length < 3) arr.push(null);
  arr[idx] = _normalizeHitVal(val);
  setPath(state.editData, path + '.hit_per_stage_scaling', arr);
}

export const toggleSkillTombstone = (name) => {
  if (!state.editData) return;
  if (!Array.isArray(state.editData._deleted_skills)) state.editData._deleted_skills = [];
  const idx = state.editData._deleted_skills.indexOf(name);
  if (idx >= 0) state.editData._deleted_skills.splice(idx, 1);
  else          state.editData._deleted_skills.push(name);
  reRenderEditSkills();
}

export const addNewSkill = () => {
  if (!state.editData) return;
  if (!Array.isArray(state.editData._added_skills)) state.editData._added_skills = [];
  state.editData._added_skills.push({
    name: '新しいスキル',
    effect_text: '',
    effects: [{bunrui:[1], scope:0, condition:0, calc_type:0, bairitu:0}]
  });
  reRenderEditSkills();
}

export const removeAddedSkill = (i) => {
  if (!state.editData || !Array.isArray(state.editData._added_skills)) return;
  state.editData._added_skills.splice(i, 1);
  if (!state.editData._added_skills.length) delete state.editData._added_skills;
  reRenderEditSkills();
}

export const _getSkillRef = (src, i) => {
  if (src === 'added') return (state.editData._added_skills || [])[i];
  return (state.editData.skills || [])[i];
}

export const addSkillEffect = (src, i) => {
  const sk = _getSkillRef(src, i);
  if (!sk) return;
  if (!sk.effects) sk.effects = [];
  sk.effects.push({bunrui:[1], scope:0, condition:0, calc_type:0});
  reRenderEditSkills();
}

export const removeSkillEffect = (src, i, ei) => {
  const sk = _getSkillRef(src, i);
  if (!sk || !sk.effects || sk.effects.length <= 1) return;
  sk.effects.splice(ei, 1);
  reRenderEditSkills();
}

export const reRenderEditSkills = () => {
  const el = document.getElementById('skills-edit-section');
  if (el) el.innerHTML = renderEditSkillsSection(state.editData);
}

