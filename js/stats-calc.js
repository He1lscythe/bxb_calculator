// js/stats-calc.js — hensei.html computeStats 提取出的 stats 计算引擎
//
// 设计：所有运行时状态 / hensei 顶层 helper 通过 ctx 参数注入，使得 stats-calc.js
// 不依赖 hensei.html 的 module scope。这样 hensei.html 巨型单文件能拆小、且
// stats-calc.js 在测试 / 未来其他 viewer 复用时不需要重写 closure 引用。
//
// ctx 接口 (flat):
//   数据集:    allCharas, allCrystals, allSouls, allMasou, allBGs,
//             allGuildTitles, allGuildEmblems, SENZAI_TABLE
//   队伍/敌方: team, teamSize, enemy
//   常量:     SLOT_COLORS, COLOR_LABELS, IS_LOCAL_DEV
//   helper:   _STAT_KEYS, _BUNRUI_TO_STAT, _LV2_5_RE,
//             _baseStat, _resolveCharaSkills, _resolveSoulSkills,
//             _crystalEffectiveBairitu, _buffApplies,
//             _conditionFactor, _parseScaling, _parseHit, _parseAff,
//             _scaledBairitu, soulMultiplier, elementMatchupMult, emblemLvMax
//
// Trace 行为：ctx.IS_LOCAL_DEV=true 时生成 trace; 否则 trace=null、_enterStage/_pushStep 为 no-op。
// 返回 { stats, damageLimit, hits, bdCapMax, trace? }。

import { ELEMENT, WEAPON, ELEMS_ORDER, WEAPONS_ORDER } from '../shared/constants.js';

export const computeStats = (chara, tr, slotIdx, ctx) => {
  if (!chara || !tr) return null;
  const {
    allCharas,
    allCrystals,
    allSouls,
    allMasou,
    allBGs,
    allGuildTitles,
    allGuildEmblems,
    SENZAI_TABLE,
    team,
    teamSize,
    enemy,
    SLOT_COLORS,
    COLOR_LABELS,
    IS_LOCAL_DEV,
    _STAT_KEYS,
    _BUNRUI_TO_STAT,
    _LV2_5_RE,
    _baseStat,
    _resolveCharaSkills,
    _resolveSoulSkills,
    _crystalEffectiveBairitu,
    _buffApplies,
    _conditionFactor,
    _parseScaling,
    _parseHit,
    _parseAff,
    _scaledBairitu,
    soulMultiplier,
    elementMatchupMult,
    emblemLvMax,
  } = ctx;

  const stats = {};
  for (const attr of _STAT_KEYS) {
    const b = _baseStat(chara, tr, attr);
    stats[attr] = b != null ? b : 0;
  }
  // Init hits from chara state's basic_info
  const baseHitsRaw = chara.states?.[tr.state]?.basic_info?.['Hit数'];
  const hits = Array.isArray(baseHitsRaw) ? baseHitsRaw.slice(0, 3).map((h) => +h || 0) : [0, 0, 0];
  while (hits.length < 3) hits.push(0);
  let damageLimit = 2147483647;
  // bunrui=18（BDゲージの最大値）は 4 種 calc_type を独立に累加し、最後に合成式で max を計算：
  //   raw      = ((10 + Σadd) * (1 + Σmul) + ΣfinalAdd) * (1 + ΣfinalMul)
  //   bdCapMax = floor(raw) - 1
  // mul/finalMul は (v-1) を累加（「N倍」加性叠加で 1.5×+1.2× → 1.7× の意味）。
  // base = 10、表示時 -1（BD ゲージ上限は 0-indexed level、buff 無し floor(10)-1 = 9）。
  const acc = {
    stats,
    damageLimit,
    hits,
    bdCapAdd: 0, // ct=1（普通加算）の累加
    bdCapMul: 0, // ct=0（普通乗算）の累加：bairitu-1 を加える
    bdCapFinalAdd: 0, // ct=2（最終加算）
    bdCapFinalMul: 0, // ct=3（最終乗算）：bairitu-1 を加える
  };
  const tgt = chara;

  // ===== Trace 容器（IS_LOCAL_DEV のみ生成、それ以外は no-op）=====
  // 始終生成 / 同 pass push で必ず最終値と一致。
  let _curStage = null;
  const trace = IS_LOCAL_DEV
    ? {
        base: _STAT_KEYS.reduce((m, k) => ((m[k] = stats[k]), m), {}),
        damageLimitBase: damageLimit,
        hitsBase: hits.slice(),
        stages: [],
      }
    : null;
  const _enterStage = IS_LOCAL_DEV
    ? (key, label) => {
        _curStage = { key, label, steps: [] };
        trace.stages.push(_curStage);
      }
    : () => {};
  const _pushStep = IS_LOCAL_DEV
    ? (step) => {
        if (_curStage) _curStage.steps.push(step);
      }
    : () => {};

  // Apply one effect to acc, scaled by source HP via _conditionFactor.
  // sourceMult: 来源倍率（魂等级用），默认 1 不影响。
  // mode: 'add' (ct=1, normal additive) / 'mul' (ct=0, normal multiplicative)
  //       'final-add' (ct=2, 最終加算) / 'final-mul' (ct=3, 最終乗算)
  // 加算系（add / final-add）と乗算系（mul / final-mul）は値の適用ロジック共通、ct 過濾だけ違う。
  function _applyEf(e, srcJk, srcHp, mode, sourceMult = 1, srcLabel = '') {
    const factor = _conditionFactor(e.condition, srcHp);
    const bunrui = e.bunrui || [];
    const isAddMode = mode === 'add' || mode === 'final-add';
    const isMulMode = mode === 'mul' || mode === 'final-mul';
    const _label = srcLabel || e._srcLabel || '';

    // ===== Hit 处理（bunrui 含 7）— 每步取整 =====
    // hit_type: 1/0=add (default), 2=mul, 3=set
    // hit は mode='add'/'mul' のみ処理。final-add/final-mul は hit を再走しない（hit_type=2 で乗算は十分）。
    if (bunrui.includes(7) && (mode === 'add' || mode === 'mul')) {
      const ht = e.hit_type != null ? e.hit_type : 1;
      const isHitAdd = ht === 1 || ht === 0 || ht === 3;
      const isHitMul = ht === 2;
      const hps = e.hit_per_stage || [];
      const hpss = e.hit_per_stage_scaling || [];
      if ((mode === 'add' && isHitAdd) || (mode === 'mul' && isHitMul)) {
        for (let s = 0; s < 3; s++) {
          // 新公式：base + (jukudo - 1) * scaling。分数字符列対応のため _parseHit 経由。
          const baseV = _parseHit(hps[s]) + (srcJk - 1) * _parseHit(hpss[s]);
          if (baseV === 0) continue;
          let v = baseV * sourceMult;
          const hitBefore = acc.hits[s];
          if (mode === 'add') {
            v = v * factor;
            if (ht === 3)
              acc.hits[s] = Math.floor(v); // set
            else acc.hits[s] = acc.hits[s] + Math.floor(v); // add (ht 0/1)
          } else {
            // mul: (v-1)*factor + 1，再乘到当前 hit 后取整
            v = (v - 1) * factor + 1;
            acc.hits[s] = Math.floor(acc.hits[s] * v);
          }
          _pushStep({
            src: _label,
            stat: 'Hit' + (s + 1),
            op: mode,
            val: v,
            hpFactor: factor,
            sourceMult,
            scope: e.scope,
            calc_type: e.calc_type,
            condition: e.condition,
            before: hitBefore,
            after: acc.hits[s],
          });
        }
      }
    }

    // ===== Stat / Damage Limit 处理（bunrui 含 1/2/10/12/17 等）=====
    const ct = e.calc_type ?? 1;
    if (mode === 'add' && ct !== 1) return;
    if (mode === 'mul' && ct !== 0) return;
    if (mode === 'final-add' && ct !== 2) return;
    if (mode === 'final-mul' && ct !== 3) return;
    // sourceMult（魂 lv 加成等）の適用 — ゲーム仕様：魂 lv は bairitu に直接乗算される。
    //   加算：v = bairitu * sourceMult * factor             （加える量を K 倍）
    //   乗算：v = (bairitu * sourceMult - 1) * factor + 1   （bairitu に直接乗算 →
    //                                                         condition で净增量を割引）
    // 例：bairitu=1.5（+50%UP）+ 4★ lv40 (sourceMult=1.4) + 浑身 50%血 (factor=0.5)
    //   = (1.5*1.4 - 1)*0.5 + 1 = 1.55× （+55%）
    // bairitu=1 占位 entry も soulMult を受ける — ゲーム仕様で「占位 = ×1 base に魂 lv 倍率」が乗る。
    const v0 = _scaledBairitu(e.bairitu, e.bairitu_scaling, srcJk, !!e._jkm1);
    let v;
    if (isAddMode) v = v0 * sourceMult * factor;
    else v = (v0 * sourceMult - 1) * factor + 1;
    for (const b of bunrui) {
      if (b === 7) continue; // 已在上面处理
      if (b === 17) {
        const before = acc.damageLimit;
        if (isAddMode) acc.damageLimit += v;
        else acc.damageLimit *= v;
        _pushStep({
          src: _label,
          stat: 'ダメ上限',
          op: mode,
          val: v,
          bairituRaw: e.bairitu,
          hpFactor: factor,
          sourceMult,
          scope: e.scope,
          calc_type: e.calc_type,
          condition: e.condition,
          before,
          after: acc.damageLimit,
        });
      } else if (b === 18) {
        // BDゲージ最大値：4 種 mode を独立に累加。mul/finalMul は (v-1) を加える
        // （v 自体は乗数なので、加性叠加には 1 を引いた残差を取る）。
        let beforeBD, afterBD, bdKey;
        if (mode === 'add') {
          beforeBD = acc.bdCapAdd;
          acc.bdCapAdd += v;
          afterBD = acc.bdCapAdd;
          bdKey = 'BDCap-add';
        } else if (mode === 'mul') {
          beforeBD = acc.bdCapMul;
          acc.bdCapMul += v - 1;
          afterBD = acc.bdCapMul;
          bdKey = 'BDCap-mul';
        } else if (mode === 'final-add') {
          beforeBD = acc.bdCapFinalAdd;
          acc.bdCapFinalAdd += v;
          afterBD = acc.bdCapFinalAdd;
          bdKey = 'BDCap-final-add';
        } else if (mode === 'final-mul') {
          beforeBD = acc.bdCapFinalMul;
          acc.bdCapFinalMul += v - 1;
          afterBD = acc.bdCapFinalMul;
          bdKey = 'BDCap-final-mul';
        }
        _pushStep({
          src: _label,
          stat: bdKey,
          op: mode,
          val: v,
          bairituRaw: e.bairitu,
          hpFactor: factor,
          sourceMult,
          scope: e.scope,
          calc_type: e.calc_type,
          condition: e.condition,
          before: beforeBD,
          after: afterBD,
        });
      } else {
        const stat = _BUNRUI_TO_STAT[b];
        if (!stat || acc.stats[stat] == null) continue;
        const before = acc.stats[stat];
        if (isAddMode) acc.stats[stat] += v;
        else acc.stats[stat] *= v;
        _pushStep({
          src: _label,
          stat,
          op: mode,
          val: v,
          bairituRaw: e.bairitu,
          hpFactor: factor,
          sourceMult,
          scope: e.scope,
          calc_type: e.calc_type,
          condition: e.condition,
          before,
          after: acc.stats[stat],
        });
      }
    }
  }

  // 全 _applyList 完了後の Final pass 用キュー。BD はここに push しない（skipFinal=true）。
  const finalDeferred = [];

  // Apply a list of effects with srcChara/srcHp/srcJk context: filter by buff scope,
  // then run additive pass, then multiplicative pass.
  // Condition (逆窮鼠/窮鼠/破損) scales bairitu inside _applyEf, no longer a gate.
  // sourceMult: 来源倍率（如魂的 lv 倍率），同时作用于 stat / hit。
  // useElementBuff: 仅魔剣技能 → element 走 tgt.element_buff[]；其他来源传 false。
  // skipFinal: BD effects は final pass に参加しない（BD 自体が「最後」なので）。
  function _applyList(
    effects,
    srcChara,
    srcHp,
    srcJk,
    sourceMult = 1,
    useElementBuff = false,
    skipFinal = false,
    srcLabel = '',
  ) {
    if (!effects || !effects.length) return;
    const filtered = effects.filter((e) => _buffApplies(srcChara, tgt, e, useElementBuff));
    if (!filtered.length) return;
    for (const e of filtered) _applyEf(e, srcJk, srcHp, 'add', sourceMult, srcLabel);
    for (const e of filtered) _applyEf(e, srcJk, srcHp, 'mul', sourceMult, srcLabel);
    if (!skipFinal) finalDeferred.push({ effects: filtered, srcJk, srcHp, sourceMult, srcLabel });
  }

  // ===== Stage 1: Self omoide (gated by affinity) =====
  const selfJk = Math.max(1, tr.jukudo || 1);
  const selfHp = tr.hpPercent ?? 100;
  // trace 用：threshold + koka を捕えるためインライン展開。_omoidePicksFor は外部 API として残す。
  const _picksWithLabel = [];
  {
    const aff = +tr.affinity || 0;
    const omPicks = tr.omoide_picks || {};
    (chara.omoide || []).forEach((row) => {
      if ((+row.threshold || 0) > aff) return;
      const pickedIcon = omPicks[row.threshold];
      if (pickedIcon == null) return;
      const info = SENZAI_TABLE[pickedIcon] || SENZAI_TABLE[String(pickedIcon)];
      if (info)
        _picksWithLabel.push({
          info,
          label: '思い出 thresh ' + row.threshold + ' ' + (info.koka || ''),
        });
    });
  }
  _enterStage('omoide', 'Stage 1 思い出');
  for (const p of _picksWithLabel) _applyEf(p.info, selfJk, selfHp, 'add', 1, p.label);
  for (const p of _picksWithLabel) _applyEf(p.info, selfJk, selfHp, 'mul', 1, p.label);

  // ===== Stage 2: External buffs in fixed slot order =====
  // slot s: crystals → chara skills, then souls (1..3), then bgs (1..3)
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);

    // Crystals — 乗性 delta 三次元衰减（weight / purity / lv）、step 仅 slider 颗粒度、不入公式。
    // 公式见 _crystalEffectiveBairitu / _crystalDimFactor (renderEffList 上方)。
    _enterStage('stage2-cr-s' + si, 'Stage 2 Slot' + (si + 1) + ' 記憶結晶');
    const crEffs = [];
    (slot.crystals || []).forEach((cfg) => {
      if (!cfg) return;
      const cr = allCrystals.find((x) => x.id === cfg.id);
      if (!cr) return;
      const crLabel = 'Slot' + (si + 1) + ' 結晶 ' + (cr.name || '');
      for (const e of cr.effects || []) {
        const eff = _crystalEffectiveBairitu(cr, cfg, e);
        const rawB = _parseScaling(e.bairitu);
        if (eff != null && Number.isFinite(rawB) && eff !== rawB) {
          crEffs.push({ ...e, bairitu: eff, _srcLabel: crLabel });
        } else {
          crEffs.push({ ...e, _srcLabel: crLabel });
        }
      }
    });
    _applyList(crEffs, srcChara, srcHp, srcJk);

    // Chara skills (current state, with revise) — element 匹配走 tgt.element_buff[]
    if (srcChara) {
      _enterStage(
        'stage2-ch-s' + si,
        'Stage 2 Slot' + (si + 1) + ' ' + (srcChara.name || '') + ' (魔剣 skill)',
      );
      const skills = _resolveCharaSkills(srcChara, slot.tr?.state);
      const charaEffs = [];
      // skill name に Lv2/Lv3/Lv4/Lv5 → bairitu_scaling 公式 (jk-1)*s。それ以外 jk*s。
      // _jkm1 を effect の浅 copy に注入（src データを汚染しない）。
      skills.forEach((sk) => {
        const jkm1 = _LV2_5_RE.test(sk.name || '');
        const skLabel = (srcChara.name || '') + ' ' + (sk.name || '');
        (sk.effects || []).forEach((e) => {
          const ec = { ...e, _srcLabel: skLabel };
          if (jkm1) ec._jkm1 = true;
          charaEffs.push(ec);
        });
      });
      _applyList(charaEffs, srcChara, srcHp, srcJk, 1, true);
    }

    // Masou effects（chara-bound; element 匹配走 tgt.element 直接判定，不走 element_buff[]）
    if (slot.masou != null) {
      const masou = allMasou.find((x) => x.id === slot.masou);
      if (masou) {
        _enterStage('stage2-ms-s' + si, 'Stage 2 Slot' + (si + 1) + ' 魔装 ' + (masou.name || ''));
        const msLabel = 'Slot' + (si + 1) + ' 魔装 ' + (masou.name || '');
        const msEffs = (masou.effects || []).map((e) => ({ ...e, _srcLabel: msLabel }));
        _applyList(msEffs, srcChara, srcHp, srcJk, 1, false);
      }
    }
  }
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    const soul = allSouls.find((x) => x.id === slot.soul);
    if (!soul) continue;
    _enterStage(
      'stage2-so-s' + si,
      'Stage 2 Slot' + (si + 1) + ' ' + (soul.name || '') + ' (魂 skill)',
    );
    // 魂的倍率：根据 rarity + lv 计算（task 7+8）。乘到所有 effect 的 bairitu / hit_per_stage 上。
    const soulMult = soulMultiplier(soul.rarity || 1, slot.tr?.soul_lv || 1);
    const skills = _resolveSoulSkills(soul);
    const soulEffs = [];
    skills.forEach((sk) => {
      const skLabel = (soul.name || '') + ' ' + (sk.name || '');
      (sk.effects || []).forEach((e) => soulEffs.push({ ...e, _srcLabel: skLabel }));
    });
    _applyList(soulEffs, srcChara, srcHp, srcJk, soulMult);
  }
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    const bg = allBGs.find((x) => x.id === slot.bg);
    if (!bg) continue;
    _enterStage(
      'stage2-bg-s' + si,
      'Stage 2 Slot' + (si + 1) + ' ' + (bg.name || '') + ' (心象結晶)',
    );
    const bgLabel = 'Slot' + (si + 1) + ' 心象結晶 ' + (bg.name || '');
    const bgEffs = (bg.effects || []).map((e) => ({ ...e, _srcLabel: bgLabel }));
    _applyList(bgEffs, srcChara, srcHp, srcJk);
  }

  // ===== Stage 2.5: Soul Affinity (独立乘区, self-only) =====
  // 自分の chara の element/weapon ↔ 装備した soul の affinity を引き、
  // atk_effect → 攻撃力 + ブレイク力、def_effect → 防御力 を独立に乗算。
  const mySlot = team[slotIdx];
  if (mySlot && mySlot.soul != null) {
    const mySoul = allSouls.find((x) => x.id === mySlot.soul);
    if (mySoul) {
      const elemName = ELEMS_ORDER[(chara.element || 6) - 1];
      const weapName = WEAPONS_ORDER[(chara.weapon || 1) - 1];
      const eAff = (mySoul.element_affinity || {})[elemName] || {};
      const wAff = (mySoul.weapon_affinity || {})[weapName] || {};
      const atkAff = _parseAff(eAff.atk_effect) * _parseAff(wAff.atk_effect);
      const defAff = _parseAff(eAff.def_effect) * _parseAff(wAff.def_effect);
      _enterStage('affinity', 'Stage 2.5 魂 affinity (自身)');
      const atkSrc =
        '元素 ' +
        elemName +
        ' atk ' +
        (eAff.atk_effect ?? '1') +
        ' × 武器 ' +
        weapName +
        ' atk ' +
        (wAff.atk_effect ?? '1');
      const defSrc =
        '元素 ' +
        elemName +
        ' def ' +
        (eAff.def_effect ?? '1') +
        ' × 武器 ' +
        weapName +
        ' def ' +
        (wAff.def_effect ?? '1');
      {
        const before = acc.stats['攻撃力'];
        acc.stats['攻撃力'] *= atkAff;
        _pushStep({
          src: atkSrc,
          stat: '攻撃力',
          op: 'mul',
          val: atkAff,
          before,
          after: acc.stats['攻撃力'],
        });
      }
      {
        const before = acc.stats['ブレイク力'];
        acc.stats['ブレイク力'] *= atkAff;
        _pushStep({
          src: atkSrc,
          stat: 'ブレイク力',
          op: 'mul',
          val: atkAff,
          before,
          after: acc.stats['ブレイク力'],
        });
      }
      {
        const before = acc.stats['防御力'];
        acc.stats['防御力'] *= defAff;
        _pushStep({
          src: defSrc,
          stat: '防御力',
          op: 'mul',
          val: defAff,
          before,
          after: acc.stats['防御力'],
        });
      }
    }
  }

  // ===== Stage 3: Self-only finishers (結婚 / 燃心 / LP / 主武器) =====
  _enterStage('stage3', 'Stage 3 結婚 / 燃心 / LP / 主武器');
  const mr = [1.0, 1.03, 1.05][tr.marriage] || 1;
  if (mr !== 1) {
    const mrSrc = '結婚 ' + tr.marriage + ' (×' + mr + ')';
    for (const k of _STAT_KEYS) {
      const before = acc.stats[k];
      acc.stats[k] *= mr;
      _pushStep({ src: mrSrc, stat: k, op: 'mul', val: mr, before, after: acc.stats[k] });
    }
  }
  if (tr.moeshin) {
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= 1.3;
    _pushStep({
      src: '燃心 ×1.3',
      stat: '攻撃力',
      op: 'mul',
      val: 1.3,
      before,
      after: acc.stats['攻撃力'],
    });
  }
  const lpMult = [1.0, 1.1, 1.5][tr.lp] || 1;
  if (lpMult !== 1) {
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= lpMult;
    _pushStep({
      src: 'LP ' + tr.lp + ' (×' + lpMult + ')',
      stat: '攻撃力',
      op: 'mul',
      val: lpMult,
      before,
      after: acc.stats['攻撃力'],
    });
  }
  // 主武器装備（あり=1.0 / なし=1/21）作用于 攻撃力 + ブレイク力
  const mwMult = tr.main_weapon === false ? 1 / 21 : 1.0;
  if (mwMult !== 1) {
    const mwSrc = '主武器なし (×1/21)';
    {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= mwMult;
      _pushStep({
        src: mwSrc,
        stat: '攻撃力',
        op: 'mul',
        val: mwMult,
        before,
        after: acc.stats['攻撃力'],
      });
    }
    {
      const before = acc.stats['ブレイク力'];
      acc.stats['ブレイク力'] *= mwMult;
      _pushStep({
        src: mwSrc,
        stat: 'ブレイク力',
        op: 'mul',
        val: mwMult,
        before,
        after: acc.stats['ブレイク力'],
      });
    }
  }

  // ===== Stage 4: 敵 / 副本 / 公会 multipliers =====
  //   元素克制 / BK / 有利武器 / 難易度 / 公会役職 + 4 紋章 / 副本 BD 上限
  _enterStage('stage4-env', 'Stage 4 敵 / 副本');
  const isGuildMode = enemy.mode === 'guildbattle' || enemy.mode === 'guildbattle_special';
  // 4a. 元素克制 → 攻撃力 + ブレイク力
  const elemMult = elementMatchupMult(chara.element, enemy.element, enemy.mode);
  if (elemMult !== 1) {
    const emSrc =
      '元素克制 ' +
      (ELEMENT[chara.element] || '?') +
      '→' +
      (ELEMENT[enemy.element] || '?') +
      ' (×' +
      elemMult +
      ')';
    {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= elemMult;
      _pushStep({
        src: emSrc,
        stat: '攻撃力',
        op: 'mul',
        val: elemMult,
        before,
        after: acc.stats['攻撃力'],
      });
    }
    {
      const before = acc.stats['ブレイク力'];
      acc.stats['ブレイク力'] *= elemMult;
      _pushStep({
        src: emSrc,
        stat: 'ブレイク力',
        op: 'mul',
        val: elemMult,
        before,
        after: acc.stats['ブレイク力'],
      });
    }
  }
  // 4b. BK状態 → 攻撃力（普通 3.0；ギルバト 高耐性 6.0）
  if (enemy.bk) {
    const bkMult = isGuildMode && enemy.bkResistance === 'high' ? 6.0 : 3.0;
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= bkMult;
    _pushStep({
      src: 'BK状態 ×' + bkMult,
      stat: '攻撃力',
      op: 'mul',
      val: bkMult,
      before,
      after: acc.stats['攻撃力'],
    });
  }
  // 4c. ギルバト/特別版 限定（有利武器 + 難易度）→ 攻撃力
  if (isGuildMode) {
    if (
      chara.weapon != null &&
      enemy.advantageWeapons &&
      enemy.advantageWeapons.has(chara.weapon)
    ) {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= 2.0;
      _pushStep({
        src: '有利武器 ' + (WEAPON[chara.weapon] || '?') + ' ×2.0',
        stat: '攻撃力',
        op: 'mul',
        val: 2.0,
        before,
        after: acc.stats['攻撃力'],
      });
    }
    const diffMult = { Normal: 1.0, Hard: 0.1, Lunatic: 0.005 }[enemy.difficulty] ?? 1.0;
    if (diffMult !== 1) {
      const before = acc.stats['攻撃力'];
      acc.stats['攻撃力'] *= diffMult;
      _pushStep({
        src: '難易度 ' + enemy.difficulty + ' ×' + diffMult,
        stat: '攻撃力',
        op: 'mul',
        val: diffMult,
        before,
        after: acc.stats['攻撃力'],
      });
    }
  }
  // 4d. 公会役職 + 4 紋章（外部 buff，按 effects schema 应用）
  _enterStage('stage4-guild', 'Stage 4 公会役職 + 紋章');
  const guildEffects = [];
  if (isGuildMode && enemy.guildTitle != null) {
    const gt = allGuildTitles.find((g) => g.id === enemy.guildTitle);
    if (gt) {
      const gtLabel = '役職 ' + (gt.name || '');
      (gt.effects || []).forEach((e) => guildEffects.push({ ...e, _srcLabel: gtLabel }));
    }
  }
  (enemy.emblems || []).forEach((slot, s) => {
    if (slot.id == null) return;
    const em = allGuildEmblems.find((g) => g.id === slot.id);
    if (!em) return;
    if (em.guild_only && !isGuildMode) return;
    // bairitu 在配置里填的是"满级倍率"。按 level 线性插值到 1.0：
    //   bairitu(lv) = (bairitu_max - 1) * (lv - 1) / (lvMax - 1) + 1
    const lvMax = emblemLvMax(em.rarity);
    const lv = Math.max(1, Math.min(lvMax, +slot.level || 1));
    const emLabel =
      '紋章 ' + (COLOR_LABELS[SLOT_COLORS[s]] || '') + ' ' + (em.name || '') + ' lv' + lv;
    for (const e of em.effects || []) {
      const ec = Object.assign({}, e, { _srcLabel: emLabel });
      // bairitu は数値・分式文字列 ("1/2") 双方受け入れ。
      const baseB = _parseScaling(e.bairitu);
      if (lvMax > 1 && Number.isFinite(baseB) && baseB !== 0) {
        ec.bairitu = ((baseB - 1) * (lv - 1)) / (lvMax - 1) + 1;
      }
      guildEffects.push(ec);
    }
  });
  if (guildEffects.length) {
    // src=null：scope=0/3 不会应用（要 src.id===tgt.id），其他全部按 _buffApplies 走
    _applyList(guildEffects, null, 100, 1, 1);
  }
  // 4e. BDゲージ上限：enemy.bd_cap = 当前選択値（[0, _computeBdCapMax()] 範囲）。
  //     倍率 = 1 + (bd_cap // 2) * 0.25 → 攻撃力 (bunrui=1)。
  //     bunrui=18 effects は 4 種 ct を独立累加し、合成式
  //     ((10 + Σadd)*(1 + Σmul) + ΣfinalAdd)*(1 + ΣfinalMul) を floor して -1 で slot ごとに max を出し、
  //     slot 間の最大値を取って floor → slider/input の max 属性に流す。倍率公式自体には加算しない。
  const bdCap = +enemy.bd_cap || 0;
  const bdCapMult = 1 + Math.floor(bdCap / 2) * 0.25;
  if (bdCapMult !== 1) {
    _enterStage('stage4-bdcap', 'Stage 4 BDゲージ上限');
    const before = acc.stats['攻撃力'];
    acc.stats['攻撃力'] *= bdCapMult;
    _pushStep({
      src: 'BDゲージ上限 ' + bdCap + ' (×' + bdCapMult + ')',
      stat: '攻撃力',
      op: 'mul',
      val: bdCapMult,
      before,
      after: acc.stats['攻撃力'],
    });
  }

  // ===== Stage 5: Final pass — 全 normal stage 完了後に ct=2 (最終加算) → ct=3 (最終乗算) =====
  // BD は finalDeferred に入っていない（_applyList を skipFinal=true で呼ぶ）ので影響しない。
  _enterStage('final-add', 'Stage 5 Final pass (最終加算)');
  for (const it of finalDeferred) {
    for (const e of it.effects)
      _applyEf(e, it.srcJk, it.srcHp, 'final-add', it.sourceMult, it.srcLabel);
  }
  _enterStage('final-mul', 'Stage 5 Final pass (最終乗算)');
  for (const it of finalDeferred) {
    for (const e of it.effects)
      _applyEf(e, it.srcJk, it.srcHp, 'final-mul', it.sourceMult, it.srcLabel);
  }

  // ===== Stage 6: BD effects（仅 tr.bd_on === true 的 slot 触发；BD は全 final 之後に走る）=====
  for (let si = 0; si < teamSize; si++) {
    const slot = team[si];
    if (!slot) continue;
    if (!slot.tr?.bd_on) continue;
    const srcChara = allCharas.find((x) => x.id === slot.chara) || null;
    if (!srcChara) continue;
    const bdEffs = (srcChara.bd_skill && srcChara.bd_skill.effects) || [];
    if (!bdEffs.length) continue;
    const srcHp = slot.tr?.hpPercent ?? 100;
    const srcJk = Math.max(1, slot.tr?.jukudo || 1);
    _enterStage(
      'stage6-bd-s' + si,
      'Stage 6 Slot' + (si + 1) + ' ' + (srcChara.name || '') + ' B.D.',
    );
    const bdLabel = 'Slot' + (si + 1) + ' ' + (srcChara.name || '') + ' B.D.';
    const bdEffsLabeled = bdEffs.map((e) => ({ ...e, _srcLabel: bdLabel }));
    _applyList(bdEffsLabeled, srcChara, srcHp, srcJk, 1, true, /* skipFinal */ true);
  }

  // BDゲージ最大値の合成：((10 + 普通加算) * (1 + 普通乗算) + 最終加算) * (1 + 最終乗算) → floor して -1
  const bdCapRaw =
    ((10 + acc.bdCapAdd) * (1 + acc.bdCapMul) + acc.bdCapFinalAdd) * (1 + acc.bdCapFinalMul);
  const bdCapMax = Math.floor(bdCapRaw) - 1;
  const result = { stats: acc.stats, damageLimit: acc.damageLimit, hits: acc.hits, bdCapMax };
  if (trace) result.trace = trace;
  return result;
};
