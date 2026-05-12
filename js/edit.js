// js/edit.js
import { state, OMOIDE_KEYS } from './state.js';
import { RARITY, BUNRUI, BUNRUI_SHORT, ELEMENT, WEAPON, CONDITION, SCOPE,
         CHARA_TAG, renderEditSelect, renderEditCheckboxes, renderFilterToggles } from '../shared/constants.js';
import { submitRevise, pickPatches, showSaveToast } from '../shared/save-client.js';
import { escHtml, fmtBairitu, fmtHitStages, ctPfx, hasOmoide, min } from './utils.js';
import { selectChar, renderDetail, switchState, setupStickyHeights,
         _deletedSkillSet } from './render.js';
import { renderOmoideTemplateBar, renderLatentEditBody, reRenderLatentEdit } from './latent.js';
import { renderMasouEditSection } from './masou.js';
import { updateReviseBar } from './nav.js';
import { CHARA_SPEC } from '../shared/chara-spec.js';

export const getPath = (obj, pathStr) => {
  return pathStr.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
}

export const setPath = (obj, pathStr, value) => {
  const parts = pathStr.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

export const toggleBunrui = (path, b, btn) => {
  // Hard rule: bunrui 含 7 (hit) 必须独占 [7]，与其他 bunrui 互斥
  const prev = (getPath(state.editData, path + '.bunrui') || []).slice();
  const hadHit = prev.includes(7);
  let arr;
  if (b === 7) {
    arr = hadHit ? [] : [7];                         // 切换 hit
  } else if (hadHit) {
    arr = [b];                                        // 当前是 [7]，选非 hit → 替换
  } else {
    const idx = prev.indexOf(b);
    arr = idx >= 0 ? prev.filter(x => x !== b)        // 取消该 bunrui
                   : prev.concat(b).sort((x,y)=>x-y); // 加该 bunrui
  }
  setPath(state.editData, path + '.bunrui', arr);
  // bunrui=[7] 时 bairitu 强制 0（hit-only entry 不参与倍率计算）
  if (arr.length === 1 && arr[0] === 7) {
    setPath(state.editData, path + '.bairitu', 0);
    if (getPath(state.editData, path + '.bairitu_scaling') != null) {
      setPath(state.editData, path + '.bairitu_scaling', 0);
    }
  }
  reRenderActiveState();   // 全量重渲：互斥导致多 btn 状态变 + bairitu/hit 块切换
}

export const setHit = (stateLabel, idx, value) => {
  const arr = state.editData.states[stateLabel].basic_info['Hit数'];
  if (Array.isArray(arr)) arr[idx] = value;
}

export const enterEditMode = (charId) => {
  const c = state.allChars.find(x => x.id === charId);
  if (!c) return;
  state.editData = JSON.parse(JSON.stringify(c));
  const detail = document.getElementById('chara-detail');
  detail.innerHTML = renderEditDetail(state.editData);
  const stateKeys = Object.keys(state.editData.states || {});
  const first = ['極弐','改造','通常'].find(s => stateKeys.includes(s));
  if (first) switchState(charId, first, detail);
  setupStickyHeights();
}

export const cancelEdit = () => {
  state.editData = null;
  selectChar(state.selectedId);
}

export const _deepDiff = (oval, mval) => {
  // Plain object: recurse into changed keys
  if (mval && typeof mval === 'object' && !Array.isArray(mval) &&
      oval && typeof oval === 'object' && !Array.isArray(oval)) {
    const sub = {};
    for (const k in mval)
      if (JSON.stringify(mval[k]) !== JSON.stringify(oval[k]))
        sub[k] = _deepDiff(oval[k], mval[k]);
    return sub;
  }
  // Same-length array of objects: sparse index-keyed diff (only changed indices)
  if (Array.isArray(oval) && Array.isArray(mval) && oval.length === mval.length &&
      mval.length > 0 &&
      mval.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
    const sparse = {};
    mval.forEach((m, i) => {
      if (JSON.stringify(m) !== JSON.stringify(oval[i]))
        sparse[i] = _deepDiff(oval[i], m);
    });
    return sparse;
  }
  return JSON.parse(JSON.stringify(mval));
}

export const computeDiff = (original, modified) => {
  const diff = { id: modified.id, name: modified.name };
  for (const key in modified) {
    if (key === 'id') continue;
    if (JSON.stringify(modified[key]) !== JSON.stringify(original[key]))
      diff[key] = _deepDiff(original[key], modified[key]);
  }
  return diff;
}

export const deepApply = (target, patch) => {
  for (var k in patch) {
    if (k === 'id') continue;
    let pv = patch[k], tv = target[k];
    // Sparse array diff: target field is array, patch is plain object with numeric-string keys
    if (Array.isArray(tv) && pv && typeof pv === 'object' && !Array.isArray(pv) &&
        Object.keys(pv).every(kk => /^\d+$/.test(kk))) {
      for (const idx in pv) {
        const i = +idx;
        if (i >= tv.length) continue;
        const pvi = pv[idx];
        if (pvi && typeof pvi === 'object' && !Array.isArray(pvi) &&
            tv[i] && typeof tv[i] === 'object' && !Array.isArray(tv[i])) {
          deepApply(tv[i], pvi);
        } else {
          tv[i] = JSON.parse(JSON.stringify(pvi));
        }
      }
    } else if (pv !== null && typeof pv === 'object' && !Array.isArray(pv) &&
        tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
      deepApply(tv, pv);
    } else {
      target[k] = JSON.parse(JSON.stringify(pv));
    }
  }
}

export const saveEdit = () => {
  if (!state.editData) return;
  // 魔装 overrides は chara schema の外側 — 先に切り出しておかないと
  // chara diff に紛れ込む。後段で state.allMasou に手書きで反映する。
  const masouOverrides = state.editData.masou_overrides || null;
  if (masouOverrides) delete state.editData.masou_overrides;
  // Strip null slots (unselected after 追加)
  if (state.editData.omoide) {
    state.editData.omoide.forEach(function(row) {
      row.slots = (row.slots || []).filter(function(s) { return s != null; });
    });
    state.editData.omoide = state.editData.omoide.filter(function(row) { return row.slots.length > 0; });
  }
  // 如果设置了 omoide_template 但 omoide 已经和模板不一致 → 清掉 omoide_template
  // 用 null 而不是 delete：computeDiff 只遍历 modified 的 keys，delete 后字段不会进 diff，
  // server 上 revise 落不下来；显式置 null 才能在 deepApply 时把旧值覆盖掉
  if (state.editData.omoide_template != null) {
    const tpl = (state.omoideTemplates || [])
      .find(t => t.id === state.editData.omoide_template);
    if (!tpl || JSON.stringify(state.editData.omoide || []) !== JSON.stringify(tpl.omoide || [])) {
      state.editData.omoide_template = null;
    }
  }
  // Clean up empty tombstone / added skill arrays
  if (Array.isArray(state.editData._deleted_skills) && state.editData._deleted_skills.length === 0) {
    delete state.editData._deleted_skills;
  }
  if (state.editData._added_skills && typeof state.editData._added_skills === 'object') {
    Object.keys(state.editData._added_skills).forEach(k => {
      if (!Array.isArray(state.editData._added_skills[k]) || state.editData._added_skills[k].length === 0)
        delete state.editData._added_skills[k];
    });
    if (!Object.keys(state.editData._added_skills).length) delete state.editData._added_skills;
  }
  const id  = state.editData.id;
  const idx = state.allChars.findIndex(x => x.id === id);
  if (idx >= 0) {
    // 本次会话有没有真的改东西：拿当前 state.editData 跟「编辑前的 state.allChars[idx]」对比，
    // 而不是跟 state.originalData 对比（后者不含已加载的 revise 补丁，会误判）
    const sessionChanged = JSON.stringify(state.editData) !== JSON.stringify(state.allChars[idx]);
    if (sessionChanged) {
      state.allChars[idx] = state.editData;
      const totalChanged = JSON.stringify(state.editData) !== JSON.stringify(state.originalData[id]);
      if (totalChanged) {
        const diff = computeDiff(state.originalData[id], state.editData);
        const charDiff = { id: diff.id, name: diff.name };
        const omoideDiff = { id: diff.id, name: diff.name };
        let hasChar = false, hasOmoide = false;
        for (const key in diff) {
          if (key === 'id' || key === 'name') continue;
          if (OMOIDE_KEYS.has(key)) { omoideDiff[key] = diff[key]; hasOmoide = true; }
          else                       { charDiff[key]   = diff[key]; hasChar   = true; }
        }
        // tags 撤回：computeDiff 不 emit 与 base 相同的字段，但 server _deep_merge 也不会
        // 主动清除 existing revise.tags。chara 仍有其他改动（hasChar）但 tags 已回到 base
        // 时显式 emit tags=null 触发 server null 撤回（参考 crystal weight_step 机制）。
        // chara 完全无 chara-level 改动时不注入：totalChanged=false 路径 / hasChar=false
        // 都会触发整条 revise 删除、不需要 tags=null。
        if (hasChar && !('tags' in charDiff)) {
          charDiff.tags = null;
        }
        // OMOIDE_KEYS 撤回保護：hasOmoide なのに特定 key が diff に居ない場合、
        // その field は base と一致するように戻った（けど revise には stale 値が
        // 残ってる可能性）。null 注入で server _deep_merge に pop させる。
        // 例：template 5 → template 2（rarity 5 → 4=base）切替時、omoide_rarity
        // が diff に出ないため revise の rarity=5 が残留する bug を防ぐ。
        if (hasOmoide) {
          for (const k of OMOIDE_KEYS) {
            if (!(k in omoideDiff)) omoideDiff[k] = null;
          }
        }
        // omoide_template 非 null 時、omoide 配列は冗長（render 時 resolveOmoideTemplates
        // が templates から復元）。template 切替時も omoide=null で revise の stale
        // omoide を明示的に消す。template===null（slot 手改で脱離）時は omoide を残す。
        if (hasOmoide && omoideDiff.omoide_template != null) {
          omoideDiff.omoide = null;
        }
        if (hasChar)   { state.reviseData[id]       = charDiff;   } else { delete state.reviseData[id]; }
        if (hasOmoide) { state.omoideReviseData[id] = omoideDiff; } else { delete state.omoideReviseData[id]; }
      } else {
        // 这次改回了原始状态：清掉 state.reviseData 但保留 state.sessionReviseIds 让服务端把条目删掉
        delete state.reviseData[id];
        delete state.omoideReviseData[id];
      }
      state.sessionReviseIds.add(id);
    }
    // sessionChanged === false：用户没改任何东西，原样保留 state.reviseData/state.sessionReviseIds
  }
  // 魔装 overrides をローカル data に書き戻し（永続化はまだ未実装；session 内のみ反映）
  if (masouOverrides) {
    Object.entries(masouOverrides).forEach(([mid, patch]) => {
      const i = state.allMasou.findIndex(m => m.id === +mid);
      if (i >= 0) {
        // patch.effects が dict 形式（generic setPath が plain object として作った場合）
        // で来た時は array にマージし直してから上書きする。dict のまま代入すると
        // state.allMasou[i].effects が array でなくなり、後続の m.effects.map() が
        // TypeError で死ぬ（魔装 modal / 修正 button 無反応の原因）。
        let mergedPatch = patch;
        const pe = patch && patch.effects;
        if (pe && !Array.isArray(pe) && typeof pe === 'object') {
          const base = state.allMasou[i].effects || [];
          const next = base.map(e => Object.assign({}, e));
          Object.entries(pe).forEach(([k, p]) => {
            const ei = +k;
            if (!isNaN(ei) && ei >= 0 && ei < next.length && p && typeof p === 'object') {
              next[ei] = Object.assign({}, next[ei], p);
            }
          });
          mergedPatch = Object.assign({}, patch, { effects: next });
        }
        state.allMasou[i] = Object.assign({}, state.allMasou[i], mergedPatch);
        state.masouReviseData[+mid] = Object.assign({ id: +mid }, mergedPatch);
        // session 内に masou を触れたことを記録 → updateReviseBar が右上の保存
        // ボタンを点ける + saveRevise が masou_revise を提出する根拠になる。
        state.masouSessionReviseIds.add(+mid);
      }
    });
    // 再グルーピング
    state.masouByChara = {};
    state.allMasou.forEach(m => {
      if (m.chara_id == null) return;
      (state.masouByChara[m.chara_id] = state.masouByChara[m.chara_id] || []).push(m);
    });
  }
  state.editData = null;
  // chara + masou 両方の session id 反映後に更新（右上の保存 bar の表示判定）
  updateReviseBar();
  selectChar(state.selectedId);
}

export const saveRevise = async () => {
  let btn    = document.querySelector('.btn-revise-save');
  let status = document.getElementById('revise-status');
  btn.textContent = '保存中...';
  btn.disabled    = true;
  try {
    const ids       = Array.from(state.sessionReviseIds);
    const masouIds  = Array.from(state.masouSessionReviseIds);
    const json = await submitRevise({
      session_ids:        ids,
      masou_session_ids:  masouIds,
      revise:             pickPatches(state.reviseData,        ids),
      omoide_revise:      pickPatches(state.omoideReviseData,  ids),
      masou_revise:       pickPatches(state.masouReviseData,   masouIds),
    });
    state.sessionReviseIds.clear();
    state.masouSessionReviseIds.clear();
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

export const renderEditDetail = (c) => {
  const stateKeys = Object.keys(c.states || {});
  const tabs = ['極弐','改造','通常'].filter(s => stateKeys.includes(s)).map(s =>
    `<div class="state-tab" data-state="${s}" onclick="switchState(${c.id},'${s}',document.getElementById('chara-detail'))">${s}</div>`
  ).join('');
  const contents = ['極弐','改造','通常'].filter(s => stateKeys.includes(s)).map(s =>
    `<div class="state-content" data-state="${s}">${renderEditStateContent(c, s)}</div>`
  ).join('');

  const bdEditSection = c.bd_skill?.name ? min`
    <div class="section">
      <div class="section-title">ブレイズドライブ</div>
      <div class="bd-card">
        <div class="bd-label">BD SKILL${c.bd_skill.cost != null ? `&nbsp;<span class="bd-cost-tag">コスト ${c.bd_skill.cost}</span>` : ''}</div>
        <div class="bd-name">${escHtml(c.bd_skill.name || '')}</div>
        <div class="edit-readonly">${escHtml(c.bd_skill.effect_text || '')}</div>
        <div id="bd-effects-edit-container">${renderBDEffectsEdit(c.bd_skill)}</div>
      </div>
    </div>` : '';
  return min`
    <div class="chara-header edit-mode-active">
      <div class="chara-title">
        <span class="name-text">${escHtml(c.name)}</span>
        <img class="chara-icon" src="https://img.altema.jp/bxb/chara/icon/${c.id}.jpg" onerror="this.style.display='none'" alt="">
      </div>
      <div class="chara-edit-meta">
        <select class="edit-select" onchange="setPath(state.editData,'rarity',Number(this.value))">
          ${[4,3,2,1].map(r=>`<option value="${r}"${c.rarity==r?' selected':''}>${RARITY[r]}ランク</option>`).join('')}
        </select>
        <select class="edit-select" onchange="setPath(state.editData,'element',Number(this.value))">
          ${Object.entries(ELEMENT).map(([k,v])=>`<option value="${k}"${c.element==k?' selected':''}>${v}属性</option>`).join('')}
        </select>
        <select class="edit-select" onchange="setPath(state.editData,'type',Number(this.value))">
          ${Object.entries(WEAPON).map(([k,v])=>`<option value="${k}"${c.type==k?' selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="chara-tag-row">
        <span class="field-label" style="margin:0">魔剣特性</span>
        <div class="bunrui-toggles">${renderCharaTagToggles(c)}</div>
      </div>
      <div class="edit-actions">
        <button class="btn-save"   onclick="saveEdit()">保存</button>
        <button class="btn-cancel" onclick="cancelEdit()">キャンセル</button>
      </div>
    </div>
    <div class="state-tabs">${tabs}</div>
    ${bdEditSection}
    ${contents}
    ${renderMasouEditSection(c)}
    <div class="section" style="margin-top:16px">
      <div class="section-title">潜在開放</div>
      ${renderOmoideTemplateBar(c)}
      <div id="latent-edit-section" class="latent-edit-container">${renderLatentEditBody(c)}</div>
    </div>`;
}

export const renderEditStateContent = (c, lbl) => {
  const state = c.states[lbl];
  const p     = `states.${lbl}`;
  const parts = [];

  // Skills (base + user-added)
  const baseSkills  = state.skills || [];
  const addedSkills = (c._added_skills && c._added_skills[lbl]) ? c._added_skills[lbl] : [];
  const dead        = _deletedSkillSet(c);

  if (baseSkills.length || addedSkills.length) {
    const BUNRUI_ALL = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
    const items = baseSkills.map((sk, i) => ({sk, src:'base', i}))
      .concat(addedSkills.map((sk, i) => ({sk, src:'added', i})));
    const cards = items.map(it => {
      const s = it.sk, i = it.i, src = it.src;
      const isAdded = src === 'added';
      const isDeleted = !isAdded && dead.has(s.name||'');
      const sp = isAdded ? `_added_skills.${lbl}.${i}` : `${p}.skills.${i}`;
      const tombBtn = isAdded
        ? `<button class="btn-skill-tomb" onclick="removeAddedCharaSkill('${lbl}',${i})" title="削除">×</button>`
        : `<button class="btn-skill-tomb" onclick="toggleSkillTombstone(${JSON.stringify(s.name||'').replace(/"/g,'&quot;')})" title="${isDeleted?'復活':'削除'}">${isDeleted?'↻':'×'}</button>`;
      const tagBadge = isAdded ? '<span style="font-size:10px;background:rgba(91,127,255,0.25);border:1px solid #5b7fff;color:#7b9fff;padding:1px 5px;border-radius:3px;margin-left:6px">追加</span>' : '';
      const effectBlocks = (s.effects || [{}]).map((e, ei) => {
        const ep = `${sp}.effects.${ei}`;
        const isHitOnly = (e.bunrui || []).length === 1 && (e.bunrui || [])[0] === 7;
        const bunrui = e.bunrui || [];
        const btogs = BUNRUI_ALL.map(b =>
          `<button class="btog${bunrui.includes(b)?' on':''}" onclick="toggleBunrui('${ep}',${b},this)">${BUNRUI_SHORT[b]||b}</button>`
        ).join('');
        const elemOpts = `<option value=""${e.element==null?' selected':''}>—</option>` +
          Object.entries(ELEMENT).map(([k,v])=>`<option value="${k}"${e.element==+k?' selected':''}>${v}</option>`).join('');
        const typeOpts = `<option value=""${e.type==null?' selected':''}>—</option>` +
          Object.entries(WEAPON).map(([k,v])=>`<option value="${k}"${e.type==+k?' selected':''}>${v}</option>`).join('');
        return min`
          <div class="field-label">分類</div>
          <div class="bunrui-toggles">${btogs}</div>
          <div class="skill-edit-meta">
            <div>
              <div class="field-label">scope</div>
              ${renderEditSelect({0:'自身',1:'全体',2:'限定'}, e.scope, `setPath(state.editData,'${ep}.scope',+this.value)`)}
            </div>
            <div>
              <div class="field-label">condition</div>
              ${renderEditSelect(CONDITION, e.condition, `setPath(state.editData,'${ep}.condition',+this.value)`)}
            </div>
            <div>
              <div class="field-label">element</div>
              <select class="edit-select" onchange="setPath(state.editData,'${ep}.element',this.value===''?null:+this.value)">${elemOpts}</select>
            </div>
            <div>
              <div class="field-label">type</div>
              <select class="edit-select" onchange="setPath(state.editData,'${ep}.type',this.value===''?null:+this.value)">${typeOpts}</select>
            </div>
            ${isHitOnly ? '' : min`
              <div>
                <div class="field-label">倍率</div>
                <div style="display:flex;align-items:center;gap:4px">
                  ${renderEditSelect({0:'×',1:'+',2:'+(終)',3:'×(終)'}, e.calc_type, `setPath(state.editData,'${ep}.calc_type',+this.value)`)}
                  <input type="text" class="edit-num-sm" value="${e.bairitu??''}"
                         oninput="setPath(state.editData,'${ep}.bairitu',parseBairituVal(this.value))">
                </div>
              </div>
              <div>
                <div class="field-label">熟度補正</div>
                <input type="text" class="edit-num-sm" value="${e.bairitu_scaling??''}"
                       oninput="setPath(state.editData,'${ep}.bairitu_scaling',parseBairituVal(this.value))">
              </div>`}
          </div>
          ${_renderHitEdit(ep, e)}`;
      }).join('');
      const nameField = isAdded
        ? `<input type="text" class="edit-input" style="font-weight:600;font-size:13px;color:var(--accent);margin-bottom:4px;width:100%" value="${escHtml(s.name||'')}" oninput="setPath(state.editData,'${sp}.name',this.value)">`
        : `<div class="skill-name" style="font-weight:600;font-size:13px;color:var(--accent);margin-bottom:4px">${escHtml(s.name||'')}${tagBadge}</div>`;
      const effectField = isAdded
        ? `<input type="text" class="edit-input" style="font-size:13px;width:100%;margin-bottom:8px" value="${escHtml(s.effect_text||'')}" oninput="setPath(state.editData,'${sp}.effect_text',this.value)">`
        : `<div style="font-size:13px;line-height:1.6;color:var(--text);margin-bottom:8px">${escHtml(s.effect_text||'')}</div>`;
      return min`
        <div class="skill-edit-card${isDeleted?' deleted':''}">
          ${tombBtn}
          ${nameField}
          ${effectField}
          ${isDeleted ? '<div style="color:#ff8080;font-size:12px;padding:4px 0">⚠ このスキルは削除マーク中（保存後ビューで非表示）</div>' : effectBlocks}
        </div>`;
    }).join('');
    parts.push(`<div class="section"><div class="section-title">スキル構成 (${baseSkills.length + addedSkills.length})</div><div class="skills-list">${cards}</div><button class="btn-add-slot" style="margin-top:8px" onclick="addNewCharaSkill('${lbl}')">+ スキル追加</button></div>`);
  }

  // Stats
  if (state.stats) {
    const maxS  = state.stats.max  || {};
    const initS = state.stats.initial || null;
    const cards = Object.keys(maxS).map(k => {
      const lbl2 = {HP:'HP','攻撃力':'攻撃力','防御力':'防御力','ブレイク力':'ブレイク力','フルヒット攻撃力':'フルヒット'}[k] || k;
      return min`
        <div class="stat-card">
          <div class="stat-label">${escHtml(lbl2)}</div>
          <div class="stat-row">
            <span class="stat-row-label">最大</span>
            <input type="number" class="edit-stat-num" value="${maxS[k]??''}"
                   oninput="setPath(state.editData,'${p}.stats.max.${k}',this.value===''?null:Number(this.value))">
          </div>
          ${initS ? min`
            <div class="stat-row">
              <span class="stat-row-label">初期</span>
              <input type="number" class="edit-stat-num init" value="${initS[k]??''}"
                     oninput="setPath(state.editData,'${p}.stats.initial.${k}',this.value===''?null:Number(this.value))">
            </div>` : ''}
        </div>`;
    }).join('');
    parts.push(`<div class="section"><div class="section-title">ステータス</div><div class="stat-grid">${cards}</div></div>`);
  }

  // Basic Info
  if (state.basic_info) {
    const STRING_KEYS = new Set(['武器種','モーション','結晶スロット']);
    const rows = Object.entries(state.basic_info).map(([k, v]) => {
      let inp;
      if (k === 'Hit数' && Array.isArray(v)) {
        inp = `<div class="hit-inputs">${v.map((n,i)=>
          `<input type="number" class="hit-num" value="${n}"
                  oninput="setHit('${lbl}',${i},Number(this.value))">`
          + (i<v.length-1?'<span class="hit-arrow">-</span>':'')).join('')}</div>`;
      } else if (STRING_KEYS.has(k)) {
        inp = `<input class="edit-input" value="${escHtml(String(v??''))}"
                      oninput="setPath(state.editData,'${p}.basic_info.${k}',this.value)">`;
      } else {
        inp = `<input type="number" class="edit-input" value="${v??''}"
                      oninput="setPath(state.editData,'${p}.basic_info.${k}',this.value===''?null:Number(this.value))">`;
      }
      return `<div class="info-cell label">${escHtml(k)}</div><div class="info-cell value">${inp}</div>`;
    }).join('');
    parts.push(`<div class="section"><div class="section-title">基本情報</div><div class="info-table">${rows}</div></div>`);
  }

  return parts.join('') || '<div class="no-results">データなし</div>';
}

export const toggleSkillTombstone = (name) => {
  if (!state.editData) return;
  if (!Array.isArray(state.editData._deleted_skills)) state.editData._deleted_skills = [];
  const idx = state.editData._deleted_skills.indexOf(name);
  if (idx >= 0) state.editData._deleted_skills.splice(idx, 1);
  else          state.editData._deleted_skills.push(name);
  reRenderActiveState();
}

export const addNewCharaSkill = (stateLabel) => {
  if (!state.editData) return;
  if (!state.editData._added_skills || typeof state.editData._added_skills !== 'object' || Array.isArray(state.editData._added_skills)) {
    state.editData._added_skills = {};
  }
  if (!Array.isArray(state.editData._added_skills[stateLabel])) state.editData._added_skills[stateLabel] = [];
  state.editData._added_skills[stateLabel].push({
    name: '新しいスキル',
    effect_text: '',
    effects: [{bunrui:[1], scope:0, condition:0, calc_type:0, bairitu:0, bairitu_scaling:0}]
  });
  reRenderActiveState();
}

export const removeAddedCharaSkill = (stateLabel, i) => {
  if (!state.editData || !state.editData._added_skills || !state.editData._added_skills[stateLabel]) return;
  state.editData._added_skills[stateLabel].splice(i, 1);
  if (!state.editData._added_skills[stateLabel].length) delete state.editData._added_skills[stateLabel];
  reRenderActiveState();
}

export const reRenderActiveState = () => {
  // Re-render the entire chara detail (preserves active state via switchState below)
  const detail = document.getElementById('chara-detail');
  if (!detail || !state.editData) return;
  const active = state.activeState[state.editData.id] || Object.keys(state.editData.states || {})[0];
  detail.innerHTML = renderEditDetail(state.editData);
  if (active) switchState(state.editData.id, active, detail);
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

export const _renderHitEdit = (ep, e) => {
  if (!(e.bunrui || []).includes(7)) return '';
  const ht  = e.hit_type != null ? e.hit_type : 0;
  const hps = Array.isArray(e.hit_per_stage) ? e.hit_per_stage : [null, null, null];
  const hpss = Array.isArray(e.hit_per_stage_scaling) ? e.hit_per_stage_scaling : [null, null, null];
  function opt(v, lbl) {
    return '<option value="' + v + '"' + (ht === v ? ' selected' : '') + '>' + lbl + '</option>';
  }
  function stageIn(idx) {
    const v = hps[idx] != null ? hps[idx] : '';
    return '<div><div class="field-label">' + (idx + 1) + '撃</div>'
      + '<input type="text" class="edit-num-sm" style="width:42px" value="' + v + '"'
      + ' oninput="setHitStage(\'' + ep + '\',' + idx + ',this.value)"></div>';
  }
  function scaleIn(idx) {
    const v = hpss[idx] != null ? hpss[idx] : '';
    return '<div><div class="field-label">' + (idx + 1) + '撃+</div>'
      + '<input type="text" class="edit-num-sm" style="width:42px" value="' + v + '"'
      + ' oninput="setHitStageScaling(\'' + ep + '\',' + idx + ',this.value)"></div>';
  }
  return '<div class="field-label" style="margin-top:6px">ヒット計算 <span style="font-weight:400;color:var(--text2)">(bunrui=7)</span></div>'
    + '<div class="skill-edit-meta">'
    + '<div><div class="field-label">hit_type</div>'
    + '<select class="edit-select" onchange="setPath(state.editData,\'' + ep + '.hit_type\',+this.value)">'
    + opt(0, '0 減衰なし加算') + opt(1, '1 ダメージ維持加算') + opt(2, '2 乗算') + opt(3, '3 設定値')
    + '</select></div>'
    + stageIn(0) + stageIn(1) + stageIn(2)
    + scaleIn(0) + scaleIn(1) + scaleIn(2)
    + '</div>';
}

export const renderCharaTagToggles = (c) => {
  return Object.keys(CHARA_TAG).map(function(k) {
    const sid = +k;
    const on = (c.tags || []).includes(sid);
    return '<button class="btog' + (on ? ' on' : '') + '" onclick="toggleCharaTag(' + sid + ',this)">' + CHARA_TAG[sid] + '</button>';
  }).join('');
}

export const renderBDEffectsEdit = (bd) => {
  const BUNRUI_A = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
  const effects = bd.effects || [];
  const blocks = effects.map(function(e, ei) {
    const ep = 'bd_skill.effects.' + ei;
    const bunrui = e.bunrui || [];
    const isHitOnly = bunrui.length === 1 && bunrui[0] === 7;
    const btogs = BUNRUI_A.map(function(b) {
      return '<button class="btog' + (bunrui.includes(b) ? ' on' : '') + '" onclick="toggleBunrui(\'' + ep + '\',' + b + ',this)">' + (BUNRUI_SHORT[b] || b) + '</button>';
    }).join('');
    const delBtn = effects.length > 0
      ? '<button class="latent-rm-btn" onclick="removeBDEffect(' + ei + ')" title="削除">×</button>' : '';
    const meta =
      '<div><div class="field-label">scope</div>'
      + renderEditSelect({0:'自身',1:'全体',2:'限定'}, e.scope, 'setPath(state.editData,\'' + ep + '.scope\',+this.value)')
      + '</div>'
      + '<div><div class="field-label">condition</div>'
      + renderEditSelect(CONDITION, e.condition, 'setPath(state.editData,\'' + ep + '.condition\',+this.value)')
      + '</div>'
      + (isHitOnly ? '' :
          '<div><div class="field-label">倍率</div>'
          + '<div style="display:flex;align-items:center;gap:4px">'
          + renderEditSelect({0:'×',1:'+',2:'+(終)',3:'×(終)'}, e.calc_type, 'setPath(state.editData,\'' + ep + '.calc_type\',+this.value)')
          + '<input type="text" class="edit-num-sm" value="' + (e.bairitu != null ? e.bairitu : '') + '"'
          + ' oninput="setPath(state.editData,\'' + ep + '.bairitu\',parseBairituVal(this.value))">'
          + '</div></div>'
          + '<div><div class="field-label">熟度補正</div>'
          + '<input type="text" class="edit-num-sm" value="' + (e.bairitu_scaling != null ? e.bairitu_scaling : '') + '"'
          + ' oninput="setPath(state.editData,\'' + ep + '.bairitu_scaling\',parseBairituVal(this.value))">'
          + '</div>');
    return '<div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:4px">'
      + '<div class="field-label" style="margin:0">効果 #' + (ei + 1) + '</div>' + delBtn + '</div>'
      + '<div class="bunrui-toggles">' + btogs + '</div>'
      + '<div class="skill-edit-meta">' + meta + '</div>'
      + _renderHitEdit(ep, e);
  }).join('');
  return blocks + '<button class="btn-add-slot" style="margin-top:6px" onclick="addBDEffect()">+ 効果追加</button>';
}

export const toggleCharaTag = (sid, btn) => {
  let arr = (state.editData.tags || []).slice();
  let idx = arr.indexOf(sid);
  if (idx >= 0) { arr.splice(idx, 1); btn.classList.remove('on'); }
  else { arr.push(sid); arr.sort(function(a,b){return a-b;}); btn.classList.add('on'); }
  state.editData.tags = arr;
}

export const addBDEffect = () => {
  if (!state.editData.bd_skill) return;
  if (!state.editData.bd_skill.effects) state.editData.bd_skill.effects = [];
  state.editData.bd_skill.effects.push({bunrui:[1], scope:0, condition:0, calc_type:0});
  const el = document.getElementById('bd-effects-edit-container');
  if (el) el.innerHTML = renderBDEffectsEdit(state.editData.bd_skill);
}

export const removeBDEffect = (ei) => {
  if (!state.editData.bd_skill?.effects) return;
  state.editData.bd_skill.effects.splice(ei, 1);
  const el = document.getElementById('bd-effects-edit-container');
  if (el) el.innerHTML = renderBDEffectsEdit(state.editData.bd_skill);
}

