// tests/ui/test_hensei_interactions.spec.js — e2e
// 覆盖 docs/hensei_calc.md「UI 控件 ↔ 计算联动 checklist」18 控件。
// 公式已按 unpacking + v1 校准。

import { test, expect } from '@playwright/test';

const HENSEI_URL = '/pages/hensei.html';

async function waitHenseiReady(page) {
  await page.goto(HENSEI_URL);
  await page.waitForFunction(() => {
    const g = document.getElementById('slots-grid');
    return g && getComputedStyle(g).display === 'grid';
  }, { timeout: 10000 });
}

// 装 chara id 到 slot si、等 omoide fetch 完
async function setupSlotWithChara(page, si, id) {
  await page.evaluate(([s, i]) => window.setChara(s, i), [si, id]);
  // 等 omoide fetch 完成 (异步 ~10-100ms) + DOM 二次 render
  await page.waitForTimeout(800);
}
async function setupSlot0WithChara(page, id) {
  await setupSlotWithChara(page, 0, id);
}

// 读 slot stat — cell idx 跟 hensei.html 的显示顺序一致:
//   1=攻撃力max 2=攻撃力min 3=防御力 4=HP 5=BK 6=Hit数 7=転速 8=攻速 9=ダメ上限
// (転速/攻速 是后来插进 6 和 9 之间的、ダメ上限 从 7 挪到 9;7/8 的文本不是纯整数,
//  用下面的 readStatText 读原文)
async function readStat(page, slot, idx) {
  const txt = await page
    .locator(`#slot-${slot} .stats-cell:nth-child(${idx}) .stats-val`)
    .first()
    .textContent();
  return parseInt((txt || '0').replace(/[^\d-]/g, ''), 10);
}

async function setTr(page, slot, key, val) {
  await page.evaluate(([s, k, v]) => window.setTrField(s, k, v), [slot, key, val]);
  await page.waitForTimeout(80);
}

// ============================================================
// Smoke (2)
// ============================================================
test('smoke: hensei page loads, 3 slots render', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await waitHenseiReady(page);
  await expect(page.locator('#slot-0')).toBeVisible();
  await expect(page.locator('#slot-1')).toBeVisible();
  await expect(page.locator('#slot-2')).toBeVisible();
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('smoke: setChara → slot 渲染内容', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const slotText = await page.locator('#slot-0').textContent();
  expect(slotText.length).toBeGreaterThan(50);
  const atk = await readStat(page, 0, 1);
  expect(atk).toBeGreaterThan(0);
});

// ============================================================
// chara_meta (8): 結婚 / 燃心 / LP / MP (tr.mp slider、§3.9.1 _mpRate)
// ============================================================
test('chara_meta: 結婚 0 → 1 → 攻撃力 ×1.03', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const before = await readStat(page, 0, 1);
  await setTr(page, 0, 'marriage', 1);
  const after = await readStat(page, 0, 1);
  expect(after).toBeGreaterThanOrEqual(Math.ceil(before * 1.03) - 2);
  expect(after).toBeLessThanOrEqual(Math.ceil(before * 1.03) + 2);
});

test('chara_meta: 結婚 0 → 2 → 攻撃力 ×1.05', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const before = await readStat(page, 0, 1);
  await setTr(page, 0, 'marriage', 2);
  const after = await readStat(page, 0, 1);
  expect(after).toBeGreaterThanOrEqual(Math.ceil(before * 1.05) - 2);
  expect(after).toBeLessThanOrEqual(Math.ceil(before * 1.05) + 2);
});

test('chara_meta: 燃心 OFF → ON → 攻撃力 ×1.3', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const before = await readStat(page, 0, 1);
  await setTr(page, 0, 'moeshin', true);
  const after = await readStat(page, 0, 1);
  expect(after).toBeGreaterThanOrEqual(Math.ceil(before * 1.3) - 2);
  expect(after).toBeLessThanOrEqual(Math.ceil(before * 1.3) + 2);
});

test('chara_meta: LP 0 → 1 → 攻撃力 ×1.1', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const before = await readStat(page, 0, 1);
  await setTr(page, 0, 'lp', 1);
  const after = await readStat(page, 0, 1);
  expect(after).toBeGreaterThanOrEqual(Math.ceil(before * 1.1) - 2);
  expect(after).toBeLessThanOrEqual(Math.ceil(before * 1.1) + 2);
});

test('chara_meta: LP 0 → 2 → 攻撃力 ×1.5', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const before = await readStat(page, 0, 1);
  await setTr(page, 0, 'lp', 2);
  const after = await readStat(page, 0, 1);
  expect(after).toBeGreaterThanOrEqual(Math.ceil(before * 1.5) - 2);
  expect(after).toBeLessThanOrEqual(Math.ceil(before * 1.5) + 2);
});

test('chara_meta: LP 0 → 3 (0残血) 普通 → 攻撃力 ×2.0', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const before = await readStat(page, 0, 1);
  await setTr(page, 0, 'lp', 3);
  const after = await readStat(page, 0, 1);
  expect(after).toBeGreaterThanOrEqual(Math.ceil(before * 2.0) - 2);
  expect(after).toBeLessThanOrEqual(Math.ceil(before * 2.0) + 2);
});

test('chara_meta: LP 3 + bd_on → 仍用普通表 ×2.0 (hensei 算普通攻击)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await setTr(page, 0, 'bd_on', true);
  // bd_on 改完后 attack 已变 (bd_skill effects 加入)、再读取一次新 base
  const afterBd = await readStat(page, 0, 1);
  await setTr(page, 0, 'lp', 3);
  const afterLp = await readStat(page, 0, 1);
  // 用户决策: bd_on 不切 Blaze 表、LP×2.0 跟 bd_off 时一样
  expect(afterLp).toBeGreaterThanOrEqual(Math.ceil(afterBd * 2.0) - 5);
  expect(afterLp).toBeLessThanOrEqual(Math.ceil(afterBd * 2.0) + 5);
});

test('chara_meta: MP 滿 → 空 (slider=0) → 攻撃力 ×(1/21) (§3.9.1 mp_ratio=0)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const before = await readStat(page, 0, 1);
  await page.evaluate(() => window.setMpInput(0, 0)); // MP 空 → mp_ratio 0 → rate 1/21
  await page.waitForTimeout(80);
  const after = await readStat(page, 0, 1);
  const expected = Math.ceil(before / 21);
  expect(after).toBeGreaterThanOrEqual(expected - 2);
  expect(after).toBeLessThanOrEqual(expected + 2);
});

// ============================================================
// chara base (5): state / level / 熟度 / 觉醒 / HP%
// ============================================================
// 1001 レヴァンテイン=ヘル 有 通常(100101) / 改造(100102) 两个 state。
// 只切 state、**不动 jukudo/level** —— 否则 stat 变化可能来自等级而非 state 切换、测不出东西。
test('chara base: state 通常 → 改造 → 4 项 base stat 全部切换 (lv/熟度 固定)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);

  // 前提: 该 chara 真有改造 state (否则整个测试无意义、显式失败而不是静默通过)。
  // 注: slot.chara 存的是 wiki id (number)、chara 对象在 state.allCharas 里按 id 查。
  const states = await page.evaluate(() => {
    const id = window.state.team[0].chara;
    const c = (window.state.allCharas || []).find((x) => x.id === id);
    return Object.keys(c?.states || {});
  });
  expect(states, `1001 应同时有 通常/改造、实际: ${states}`).toEqual(expect.arrayContaining(['通常', '改造']));

  await setTr(page, 0, 'state', '通常');
  await setTr(page, 0, 'jukudo', 60);
  await setTr(page, 0, 'level', 250);
  const normal = await page.evaluate(() => ({ ...window.__lastStats[0].stats }));

  // 只改 state,jukudo/level 保持 60/250
  await setTr(page, 0, 'state', '改造');
  const kaizo = await page.evaluate(() => ({ ...window.__lastStats[0].stats }));
  const tr = await page.evaluate(() => {
    const t = window.state.team[0].tr;
    return { state: t.state, jukudo: t.jukudo, level: t.level };
  });
  expect(tr, 'jukudo/level 必须没被动过').toEqual({ state: '改造', jukudo: 60, level: 250 });

  // 改造 = 上位 variant、4 项 base stat 都应变化 (且更高)
  for (const k of ['攻撃力', '防御力', 'HP', 'ブレイク力']) {
    expect(kaizo[k], `${k}: 改造 ${kaizo[k]} 应 ≠ 通常 ${normal[k]}`).not.toBe(normal[k]);
    expect(kaizo[k], `${k}: 改造 ${kaizo[k]} 应 > 通常 ${normal[k]}`).toBeGreaterThan(normal[k]);
  }

  // 切回通常 → 复原 (无残留 state)
  await setTr(page, 0, 'state', '通常');
  const back = await page.evaluate(() => ({ ...window.__lastStats[0].stats }));
  expect(back).toEqual(normal);
});

test('chara base: level 1 → max 单调递增', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await setTr(page, 0, 'level', 1);
  const at1 = await readStat(page, 0, 1);
  await setTr(page, 0, 'level', 250);
  const at250 = await readStat(page, 0, 1);
  expect(at250).toBeGreaterThan(at1);
});

test('chara base: 熟度 (jukudo) 1 → 60 → stat 变化', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await setTr(page, 0, 'jukudo', 1);
  const at1 = await readStat(page, 0, 1);
  await setTr(page, 0, 'jukudo', 60);
  const at60 = await readStat(page, 0, 1);
  expect(at60).not.toBe(at1);
});

test('chara base: 觉醒 0 → max → stat 变化', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await setTr(page, 0, 'awakening', 0);
  const at0 = await readStat(page, 0, 1);
  await setTr(page, 0, 'awakening', 9);  // 4★ awkMax=9
  const at9 = await readStat(page, 0, 1);
  expect(at9).toBeGreaterThanOrEqual(at0);
});

test('chara HP 100 → 0 → Vitality_Attack stat 变 (chara 107601 通常)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 107601);  // ヴァンギヌス=ローン Vitality_Attack ×1.75
  await setTr(page, 0, 'hp', 100);
  const hp100 = await readStat(page, 0, 1);
  await setTr(page, 0, 'hp', 0);
  const hp0 = await readStat(page, 0, 1);
  // Vitality: factor = HP%/100、HP=100 → Mul ×1.75、HP=0 → ×1.0 (不增益)
  // 所以 hp100 > hp0
  expect(hp100).toBeGreaterThan(hp0);
});

test('chara HP via setHpSlider/setHpInput → Vitality_Attack stat 变 (走真 UI setter、防 hpPercent/hp 字段错位 regress)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 107601);
  await page.evaluate(() => window.setHpSlider(0, 100));
  await page.waitForTimeout(80);
  const slider100 = await readStat(page, 0, 1);
  await page.evaluate(() => window.setHpInput(0, 0));
  await page.waitForTimeout(80);
  const input0 = await readStat(page, 0, 1);
  expect(slider100).toBeGreaterThan(input0);
});

test('chara HP 100 → 0 → Vitality_Defense 也响应 (chara 129301、防御变)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 129301);  // Vitality_Defense ×2.8
  await page.evaluate(() => window.setHpSlider(0, 100));
  await page.waitForTimeout(80);
  const def100 = await readStat(page, 0, 3);   // cell 3 = 防御力
  await page.evaluate(() => window.setHpSlider(0, 0));
  await page.waitForTimeout(80);
  const def0 = await readStat(page, 0, 3);
  // Vitality_Defense: HP=100 factor 1 (满效果)、HP=0 factor 0 (无加成) → def100 > def0
  expect(def100).toBeGreaterThan(def0);
});

test('chara HP 100 → 0 → RemHP_Attack 反向激活 (chara 111601 通常)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 111601);  // バールのようなもの RemHP_Attack ×2.25
  await setTr(page, 0, 'hp', 100);
  const hp100 = await readStat(page, 0, 1);
  await setTr(page, 0, 'hp', 0);
  const hp0 = await readStat(page, 0, 1);
  // RemHP: factor = (100-HP%)/100、HP=0 → Mul ×2.25、HP=100 → ×1.0
  expect(hp0).toBeGreaterThan(hp100);
});

test('chara HP 51 → 50 → Break_Attack hard gate 触发 (chara 124901、攻撃力变)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 124901);  // Break_Attack ×2.5
  await setTr(page, 0, 'hp', 51);
  const hp51 = await readStat(page, 0, 1);
  await setTr(page, 0, 'hp', 50);   // unpacking §2.3 IsBreak = HpRate ≤ 0.5 含等号
  const hp50 = await readStat(page, 0, 1);
  expect(hp50).toBeGreaterThan(hp51);  // 破損 ON 后 Mul ×2.5 激活
});

test('chara HP 51 → 50 → Break_Defense 触发 (chara 158901、防御变)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 158901);  // Break_Defense ×0.7 (破損時降防御)
  await setTr(page, 0, 'hp', 51);
  const def51 = await readStat(page, 0, 3);  // cell 3 = 防御力
  await setTr(page, 0, 'hp', 50);
  const def50 = await readStat(page, 0, 3);
  expect(def50).not.toBe(def51);  // gate 切换、防御应该不一样 (×0.7 debuff)
});

test('FellDown_Attack 触发 (chara 107701 slot 0、另一 slot chara hp=0 → 队友倒地 gate)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 107701);  // FellDown_Attack ×2.5
  // slot 1 装别的 chara、HP=100 → 无队友倒地
  await page.evaluate(() => window.setChara(1, 100101));
  await page.waitForTimeout(800);
  await setTr(page, 1, 'hp', 100);
  await page.waitForTimeout(80);
  const noFell = await readStat(page, 0, 1);
  // slot 1 chara HP=0 → FellDown gate ON
  await setTr(page, 1, 'hp', 0);
  await page.waitForTimeout(80);
  const fell = await readStat(page, 0, 1);
  expect(fell).toBeGreaterThan(noFell);
});

// ============================================================
// BD ON
// ============================================================
// 1617 鳳凰円文螺鈿黒櫃:Blaze (通常 = variant 161701) 的 bd_skill 有 4 条 effect、
// 全是 Multiply ×50.0、target Player / range All、additional_value 0 (故 bd_count 不影响倍率):
//   Speed / Attack / MotionSpeed / GuardBreak
// 该 chara 自身只有一条 Speed Multiply ×13 的被动 — 乘算、前后同乘 → 不破坏「精确 50 倍」关系;
// 4 个 parameter 上都没有 Addition,所以比值应严格 = 50。
//
// 注意不能读 DOM: 転速 cell 是 "N.N · Nfr" 整形字符串、攻速 cell 显示的是**帧数**
// (max(2, ceil(dur×60/spd)+1)、非线性且有 2fr 下限、×50 后直接贴底) → 必须读
// window.__lastStats[slot] 的生值 (r.stats / r.speed.latestRecover / r.motionSpeed.speeds)。
test('bd_skill: BD OFF → ON → 攻撃力/ブレイク力/攻速/転速 四项精确 ×50 (chara 1617)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 161701);

  const snap = () =>
    page.evaluate(() => {
      const r = window.__lastStats[0];
      return {
        atk: r.stats['攻撃力'],
        bk: r.stats['ブレイク力'],
        spd: r.speed.latestRecover,
        ms: r.motionSpeed.speeds.slice(),
      };
    });

  const before = await snap();
  // 前提: 基线必须非零,否则 ×50 断言退化成 0===0 恒真
  expect(before.atk, 'base 攻撃力').toBeGreaterThan(0);
  expect(before.bk, 'base ブレイク力').toBeGreaterThan(0);
  expect(before.spd, 'base 転速').toBeGreaterThan(0);
  before.ms.forEach((v, i) => expect(v, `base 攻速${i + 1}`).toBeGreaterThan(0));

  await setTr(page, 0, 'bd_on', true);
  const after = await snap();

  // 攻撃力 / ブレイク力 走 applyStaged、**出口有 ceil**,而 ceil 是在 ×50 之后才施加的:
  //   before = ceil(P)、after = ceil(50·P)   (P = 未取整的中间值)
  // 所以严格 50 倍不成立,精确关系是 before×50 − 50 < after ≤ before×50。
  // (实测 1617: P=29977.58 → before=29978、after=ceil(1498879.0)=1498879,差 21)
  for (const [k, b, a] of [['攻撃力', before.atk, after.atk], ['ブレイク力', before.bk, after.bk]]) {
    expect(a, `${k} ${b} → ${a} 应 ≤ ${b}×50`).toBeLessThanOrEqual(b * 50);
    expect(a, `${k} ${b} → ${a} 应 > ${b}×50−50`).toBeGreaterThan(b * 50 - 50);
    expect(a / b, `${k} 比值`).toBeCloseTo(50, 1);
  }
  // 転速 / 攻速 是纯浮点 fold、无取整环节 → 严格 50 倍
  expect(after.spd / before.spd, `転速 ${before.spd} → ${after.spd}`).toBeCloseTo(50, 6);
  after.ms.forEach((v, i) =>
    expect(v / before.ms[i], `攻速${i + 1} ${before.ms[i]} → ${v}`).toBeCloseTo(50, 6),
  );

  // 关掉 BD → 复原
  await setTr(page, 0, 'bd_on', false);
  expect(await snap()).toEqual(before);
});

// ============================================================
// omoide
// ============================================================
test('omoide: clearAllOmoide → stat 不含 omoide buff (Session 3 patch: setChara 默认 equipAll)', async ({ page }) => {
  await waitHenseiReady(page);
  await page.evaluate(() => window.setChara(0, 100101));
  await page.waitForTimeout(1600);  // 等 omoide fetch 完 + auto equipAll
  const equipped = await readStat(page, 0, 1);
  await page.evaluate(() => window.clearAllOmoide(0));
  await page.waitForTimeout(80);
  const cleared = await readStat(page, 0, 1);
  // 清 picks 后 stat 必须降 (Session 3 patch 默认 equip、clearAll 后 buff 消失)
  expect(cleared).toBeLessThanOrEqual(equipped);
});

test('omoide: equipAllOmoide → stat 增加 (picker 自动选所有候选)', async ({ page }) => {
  // omoide data (data/omoide/{base_id}.json、Frida 抓) 2026-06-09 起已入 git tracked → 正常都在;
  // 防御性 guard: 万一缺失 (旧 checkout) 才 skip
  const hasOmoide = await page.request.get('/data/omoide/1001.json').then((r) => r.ok()).catch(() => false);
  test.skip(!hasOmoide, 'data/omoide/1001.json not present');

  await waitHenseiReady(page);
  await page.evaluate(() => window.setChara(0, 100101));
  await page.waitForTimeout(2000);  // 等 omoide fetch 完 (CI Linux 慢、本地 1600ms 足够)
  // Session 3 patch: setChara 默认已自动 equipAll、先 clear 再测 equipAll 增量
  await page.evaluate(() => window.clearAllOmoide(0));
  await page.waitForTimeout(150);
  const beforePick = await readStat(page, 0, 1);
  await page.evaluate(() => window.equipAllOmoide(0));
  await page.waitForTimeout(250);
  const afterPick = await readStat(page, 0, 1);
  expect(afterPick).toBeGreaterThan(beforePick);
});

test('omoide: 锁定槽 (好感不足) 不显示勾选 — #hash 导入高好感 picks 后按好感度 gate (2026-06-20)', async ({ page }) => {
  await waitHenseiReady(page);
  await page.evaluate(() => window.setChara(0, 100101));
  await page.waitForTimeout(2000); // omoide fetch + auto-equip (affinity 90000、全选)
  const info = await page.evaluate(() => {
    const c = window.state.allCharas.find((x) => x._master?.id === 1001);
    const slots = c?._omoide_slots || [];
    if (!slots.length) return { noOmoide: true };
    // 模拟「导入了 picks 全选但好感很低」: 好感设到中位 threshold-1 → 后一半槽锁定
    const ths = slots.map((s) => +s.affection_threshold || 0).sort((a, b) => a - b);
    const aff = Math.max(0, ths[Math.floor(ths.length / 2)] - 1);
    window.state.team[0].tr.affinity = aff;
    window.openOmoideModal(0);
    const body = document.getElementById('omoide-modal-body');
    const r = {
      checked: body.querySelectorAll('.om-opt.on').length,
      lockedRows: body.querySelectorAll('.om-row.locked').length,
      lockedChecked: body.querySelectorAll('.om-row.locked .om-opt.on').length,
    };
    window.closeOmoideModal();
    return r;
  });
  test.skip(info.noOmoide, 'chara 100101 无 omoide 数据');
  expect(info.lockedRows, '中位好感应锁住部分槽').toBeGreaterThan(0);
  expect(info.lockedChecked, '锁定槽不应有勾选').toBe(0);   // ← 本次修复: 锁定槽 sel = !locked
  expect(info.checked, '解锁槽仍应勾选').toBeGreaterThan(0);
});

test('omoide: 改好感 → 装备计数标签自动更新 (setAffinity 联动 _refreshOmoideCountLabel、2026-06-23)', async ({ page }) => {
  await waitHenseiReady(page);
  await page.evaluate(() => window.setChara(0, 100101));
  await page.waitForTimeout(2000); // omoide fetch + auto-equip (affinity 90000、全选)
  const parse = () =>
    page.evaluate(() => {
      const el = document.getElementById('om-count-0');
      const m = (el?.textContent || '').match(/\((\d+)\/(\d+)\)/);
      return m ? { eq: +m[1], total: +m[2] } : null;
    });
  const full = await parse();
  test.skip(!full || full.total === 0, 'chara 100101 无 omoide');
  expect(full.eq).toBe(full.total); // 90000 全解锁、全装备
  // 降好感 → 锁住上半 → 计数应下降 (本次修复: setAffinity 调 _refreshOmoideCountLabel)
  await page.evaluate(() => {
    const c = window.state.allCharas.find((x) => x._master?.id === 1001);
    const ths = (c._omoide_slots || []).map((s) => +s.affection_threshold || 0).sort((a, b) => a - b);
    window.setAffinity(0, Math.max(0, ths[Math.floor(ths.length / 2)] - 1));
  });
  await page.waitForTimeout(80);
  const dropped = await parse();
  expect(dropped.total).toBe(full.total); // 总数不变
  expect(dropped.eq).toBeLessThan(full.eq); // 已装备下降
  // 升回 90000 → picks 都还在、gating 重新计入 → 恢复
  await page.evaluate(() => window.setAffinity(0, 90000));
  await page.waitForTimeout(80);
  expect((await parse()).eq).toBe(full.eq);
});

// ============================================================
// Soul / Crystal / enemy_break
// ============================================================
test('soul 装入 → effect / affinity 立即生效 (chara 100101 + soul 1508 5★ Attack Mul range=All)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const noSoul = await readStat(page, 0, 1);
  await page.evaluate(() => window.setSoul(0, 1508));
  await page.waitForTimeout(120);
  const withSoul = await readStat(page, 0, 1);
  // soul 装入后 effect/affinity 立即生效 (Lv1 也有效果)
  expect(withSoul).not.toBe(noSoul);
});

test('soul lv 1 → max → effect ×soulMultiplier 翻倍', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => window.setSoul(0, 1508));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.setSoulLv(0, 1));
  await page.waitForTimeout(80);
  const lv1 = await readStat(page, 0, 1);
  await page.evaluate(() => window.setSoulLv(0, 50));   // 5★ base cap
  await page.waitForTimeout(80);
  const lvMax = await readStat(page, 0, 1);
  expect(lvMax).toBeGreaterThan(lv1);
});

test('soul 觉醒 0 → max → cap +5×awk、stat 进一步 scale', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => window.setSoul(0, 1508));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.setSoulAwk(0, 0));
  await page.evaluate(() => window.setSoulLv(0, 50));
  await page.waitForTimeout(80);
  const awk0 = await readStat(page, 0, 1);
  await page.evaluate(() => window.setSoulAwk(0, 5));   // 5★ awkMax=5、cap → 75
  await page.evaluate(() => window.setSoulLv(0, 75));
  await page.waitForTimeout(80);
  const awk5 = await readStat(page, 0, 1);
  expect(awk5).toBeGreaterThan(awk0);
});

test('crystal 装入 + lv 1 → max → effect init → max', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => window.setCrystal(0, 0, 120101));  // Attack Mul init=1.01 max=1.22
  await page.waitForTimeout(200);
  await page.evaluate(() => window.setCrystalDim(0, 0, 'lv', 1));
  await page.waitForTimeout(200);
  const lv1 = await readStat(page, 0, 1);
  await page.evaluate(() => window.setCrystalDim(0, 0, 'lv', 20));  // crystal max_level=20
  await page.waitForTimeout(200);
  const lvMax = await readStat(page, 0, 1);
  expect(lvMax).toBeGreaterThan(lv1);
});

test('enemy break OFF → ON → Enemy_BreakAttack 激活 (chara 107701)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 107701);  // バーチャレヴ=シャ Enemy_BreakAttack
  await page.evaluate(() => window.setEnemyBk(false));
  await page.waitForTimeout(80);
  const off = await readStat(page, 0, 1);
  await page.evaluate(() => window.setEnemyBk(true));
  await page.waitForTimeout(80);
  const on = await readStat(page, 0, 1);
  // Enemy_Break stage 6 gate by enemy.bk + stage 7 inline ×3 → on 必然 > off
  expect(on).toBeGreaterThan(off);
});

// ============================================================
// — Speed (転速) + MotionSpeed (攻速) cell
// stats panel 顺序: 攻撃力max(1) / min(2) / 防御力(3) / HP(4) / BK(5) / Hit数(6) / 転速(7) / 攻速(8) / ダメ上限(9)
// ============================================================
async function readStatText(page, slot, idx) {
  const txt = await page.locator(`#slot-${slot} .stats-cell:nth-child(${idx}) .stats-val`).first().textContent();
  return (txt || '').trim();
}

test('Speed/MotionSpeed: cell 7/8 渲染 + 数值非空', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const spd = await readStatText(page, 0, 7);
  const ms = await readStatText(page, 0, 8);
  // 転速: '<recover>.<x> · <cooldownFr+setFr>fr' 例 '13.0 · 463fr'
  expect(spd).toMatch(/^\d+\.\d+ · \d+fr$/);
  // 攻速: [N, N, N] 計 Nfr 形式 (例 [21, 34, 204] 計 259fr)
  expect(ms).toMatch(/\[\d+, \d+, \d+\] 計 \d+fr/);
});

test('Speed: 装 soul + soul lv 拉 → 転速 partnerFactor 加成 (chara 100101 + soul 1508 5★)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  // 解析 "<recover>.<x> · <fr>fr (+<n>fr 状)" 前缀 recover 浮点
  const parseRecover = (s) => parseFloat(s.split(' ')[0]);
  // 没装 soul: partnerFactor = 1.0
  const noSoul = parseRecover(await readStatText(page, 0, 7));
  await page.evaluate(() => window.setSoul(0, 1508));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.setSoulLv(0, 1));
  await page.waitForTimeout(80);
  const lv1 = parseRecover(await readStatText(page, 0, 7));
  await page.evaluate(() => window.setSoulLv(0, 50));   // 5★ base cap
  await page.waitForTimeout(80);
  const lv50 = parseRecover(await readStatText(page, 0, 7));
  // partnerFactor: lv1 → 1.01、lv50 → 1.5、所以 lv50 > lv1 ≥ noSoul
  expect(lv50).toBeGreaterThan(lv1);
  expect(lv1).toBeGreaterThanOrEqual(noSoul);
});

test('MotionSpeed: 装 chara 100101 → 攻速 fr 转换正确 (motion_speed [4,4,1] + dur [1.3333, 2.2, 3.375])', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const ms = await readStatText(page, 0, 8);
  // chara 100101 motion_id=558、dur=[1.3333, 2.2, 3.375]、speed=[4,4,1]
  // 1 + max(1, ceil(dur×60/speed)): 1+20=21, 1+33=34, 1+203=204、合計 259fr
  expect(ms).toBe('[21, 34, 204] 計 259fr');
});

// ============================================================
// — enemy bar 字段接 stats-calc
// ============================================================
test('enemy.element 切换 → 攻撃力 变 (元素相性)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);   // chara 1001 火属性
  await page.evaluate(() => { window.setEnemyElem(6); window.setEnemyMode('normal'); });
  await page.waitForTimeout(80);
  const elem6 = await readStat(page, 0, 1);
  await page.evaluate(() => window.setEnemyElem(2));   // 火 vs 水 = ×0.5
  await page.waitForTimeout(80);
  const elem2 = await readStat(page, 0, 1);
  expect(elem2).toBeLessThan(elem6);
});

test('enemy.bd_cap 拉满 → 攻撃力 ×2.0 (全局生效、不分 mode)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => { window.setEnemyElem(6); window.setEnemyMode('normal'); window.setEnemyBdCap(0); });
  await page.waitForTimeout(80);
  const cap0 = await readStat(page, 0, 1);
  // 拉到 8: 1 + floor(8/2)×0.25 = 1 + 1.0 = 2.0
  await page.evaluate(() => window.setEnemyBdCap(8));
  await page.waitForTimeout(80);
  const cap8 = await readStat(page, 0, 1);
  expect(cap8).toBe(cap0 * 2);
});

test('enemy.mode normal → guildbattle → 元素相性放大 (火 vs 火 K=0→0、但其他对位 K 不同)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);   // 火 chara
  // 选 element=6 (無): normal K=0 → ×1.0、guildbattle K=2 → ×10.0
  await page.evaluate(() => { window.setEnemyElem(6); window.setEnemyMode('normal'); });
  await page.waitForTimeout(80);
  const normal = await readStat(page, 0, 1);
  await page.evaluate(() => window.setEnemyMode('guildbattle'));
  await page.waitForTimeout(80);
  const guild = await readStat(page, 0, 1);
  expect(guild).toBeGreaterThan(normal);   // ×10 应该明显增
});

test('enemy.difficulty Lunatic guildbattle → Attack ×0.005 (大幅减)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => { window.setEnemyElem(4); window.setEnemyMode('guildbattle'); window.setEnemyDiff('Normal'); });
  await page.waitForTimeout(80);
  const normal = await readStat(page, 0, 1);
  await page.evaluate(() => window.setEnemyDiff('Lunatic'));
  await page.waitForTimeout(80);
  const lunatic = await readStat(page, 0, 1);
  expect(lunatic).toBeLessThan(normal);   // Lunatic ×0.005 应大幅减
});

test('BlazeGaugeMaxLevel: chara 1658 (Masterpiece +13) 装上后 BD ゲージ上限 slider max 变 22', async ({ page }) => {
  await waitHenseiReady(page);
  // 装一个无 BlazeGaugeMaxLevel skill 的 chara、确认 max=9 baseline
  await setupSlot0WithChara(page, 100101);
  const baselineMax = await page.evaluate(() => +document.querySelector('.bd-cap-slider').max);
  expect(baselineMax).toBe(9);
  // 装 chara 1658 (Masterpiece +13 BlazeGaugeMaxLevel)
  await page.evaluate(() => window.setChara(0, 165801));
  await page.waitForTimeout(800);
  const withSkill = await page.evaluate(() => +document.querySelector('.bd-cap-slider').max);
  // (9 + 13) × 1 = 22、floor 22
  expect(withSkill).toBe(22);
});

test('BlazeGauge mode 2: chara 1595 (skill 80598 +150 target=火) + slot 加另一个火 chara → bd_cap 跟队伍属性 count 联动', async ({ page }) => {
  await waitHenseiReady(page);
  // chara 1595 通常 = variant 159501 (有 skill 80598 +150 火属性 mode 2、自身火属性)
  await page.evaluate(() => window.setChara(0, 159501));
  await page.waitForTimeout(800);
  const oneFire = await page.evaluate(() => +document.querySelector('.bd-cap-slider').value);
  // 1 火 chara × 150 = 150 → bd_cap=1.5
  expect(oneFire).toBe(1.5);
  // slot 1 装另一个火 chara (1001 レヴァンテイン=ヘル) → 2 火 × 150 = 300 → bd_cap=3
  await page.evaluate(() => window.setChara(1, 100101));
  await page.waitForTimeout(800);
  const twoFire = await page.evaluate(() => +document.querySelector('.bd-cap-slider').value);
  expect(twoFire).toBe(3);
});

test('BlazeGauge 初始 bd_cap: chara 1484 装上 (setChara 默认改造 state +200 +300 mode 1) → enemy.bd_cap 自动设 5', async ({ page }) => {
  await waitHenseiReady(page);
  // chara 1484: 通常 +100+300=400 (4 gauge) / 改造 +200+300=500 (5 gauge)
  // setChara 默认选最高 state = 改造、bd_cap 应为 5
  await page.evaluate(() => window.setChara(0, 148401));
  await page.waitForTimeout(800);
  const bdCap = await page.evaluate(() => +document.querySelector('.bd-cap-slider').value);
  expect(bdCap).toBe(5);
});

test('enemy.emblems[0] 默认装 id=1 (guild_only=false) → 全局生效、normal mode 也 affect', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => { window.setEnemyElem(6); window.setEnemyMode('normal'); window.setEnemyBdCap(0); });
  await page.waitForTimeout(80);
  const withEmblem = await readStat(page, 0, 1);
  // 卸下 emblem[0] (默认 id=1)
  await page.evaluate(() => window.setEmblem(0, ''));
  await page.waitForTimeout(80);
  const noEmblem = await readStat(page, 0, 1);
  // emblem id=1 攻撃力アップⅠ 是 guild_only=false (全局生效)
  expect(withEmblem).toBeGreaterThan(noEmblem);
});

// ============================================================
// 秘録記憶: 自分の weapon_base_id 一致 → 結晶枠 +1 (上限1)
// ============================================================
test('秘録記憶 装着 → 結晶枠 +1、外す → 戻る、他人の秘録は無効', async ({ page }) => {
  await waitHenseiReady(page);
  // 練刀･有里村正 (base 1519) ← 54150008 が自分の秘録記憶
  const vid = await page.evaluate(() => window.state.allCharas.find((c) => c._master?.id === 1519)?.id);
  expect(vid).toBeTruthy();
  await page.evaluate((id) => window.setChara(0, id), vid);
  await page.waitForTimeout(800);
  const base = await page.evaluate(() => window.state.team[0].crystals.length);
  expect(base).toBeGreaterThan(0);
  // 自分の秘録記憶 → +1
  await page.evaluate(() => window.setCrystal(0, 0, 54150008));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.state.team[0].crystals.length)).toBe(base + 1);
  // 外す → 戻る (固定点 sync)
  await page.evaluate(() => window.setCrystal(0, 0, null));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.state.team[0].crystals.length)).toBe(base);
  // 他人の秘録記憶 (七詩村正 1518 の 54150009) → 変化なし
  await page.evaluate(() => window.setCrystal(0, 0, 54150009));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.state.team[0].crystals.length)).toBe(base);
});

// ============================================================
// ギルバト スコア計算: score-btn 可见性 / modal 内 メイン 互斥 / 計算 / mainSlot 持久化
// ============================================================
test('score-btn: guild 模式显示、普通/他 隐藏', async ({ page }) => {
  await waitHenseiReady(page);
  const btn = page.locator('#score-btn');
  await expect(btn).toBeHidden();
  await page.evaluate(() => window.setEnemyMode('guildbattle'));
  await expect(btn).toBeVisible();
  await page.evaluate(() => window.setEnemyMode('normal'));
  await expect(btn).toBeHidden();
  await page.evaluate(() => window.setEnemyMode('guildbattle_special'));
  await expect(btn).toBeVisible();
  await page.evaluate(() => window.setEnemyMode('other'));
  await expect(btn).toBeHidden();
});

test('modal 内 メイン 1/2/3号位 互斥 + 缩 teamSize 回落 + disabled', async ({ page }) => {
  await waitHenseiReady(page);
  await page.evaluate(() => window.openScoreModal());
  const btn = (n) => page.locator('#score-body .score-ctrl .tr-btn', { hasText: new RegExp(`^${n}$`) });
  // 默认 1号位 亮
  await expect(btn(1)).toHaveClass(/\bon\b/);
  await expect(btn(2)).not.toHaveClass(/\bon\b/);
  // 点 2号位 → 互斥切换
  await btn(2).click();
  await expect(btn(2)).toHaveClass(/\bon\b/);
  await expect(btn(1)).not.toHaveClass(/\bon\b/);
  expect(await page.evaluate(() => window.state.mainSlot)).toBe(1);
  // 缩编到 1体 → mainSlot 回落 0、再开 modal 2/3号位 disabled
  await page.evaluate(() => { window.closeScoreModal(); window.setTeamSize(1); window.openScoreModal(); });
  expect(await page.evaluate(() => window.state.mainSlot)).toBe(0);
  await expect(btn(1)).toHaveClass(/\bon\b/);
  await expect(btn(2)).toBeDisabled();
  await expect(btn(3)).toBeDisabled();
});

test('計算: 骨架 label 固定、按 計算 填值、無魔剣 提示、開始秒=剩余窗口', async ({ page }) => {
  await waitHenseiReady(page);
  await page.evaluate(() => window.setEnemyMode('guildbattle'));
  await page.locator('#score-btn').click();
  await expect(page.locator('#score-modal')).toBeVisible();
  const runBtn = page.locator('#score-body .score-run-btn');
  // 打开时骨架 label 齐全、值全空、開始秒 默认 40
  const skeleton = await page.locator('#score-result').textContent();
  for (const l of ['推定ダメージ', '獲得ギルドスコア', '基礎スコア', '難易度ボーナス', '結界ボーナス'])
    expect(skeleton).toContain(l);
  expect(skeleton).not.toMatch(/\d/);
  expect(await page.locator('#score-start-sec').inputValue()).toBe('40');
  // 无 chara 按 計算 → carry 行提示未選択、值保持空
  await runBtn.click();
  expect(await page.locator('#score-carry').textContent()).toContain('未選択');
  expect(await page.locator('#score-v-dmg').textContent()).toBe('');
  // 装 chara → 計算 → carry 行 + 5 值填充
  await page.evaluate(() => window.closeScoreModal());
  await setupSlot0WithChara(page, 100101);
  await page.locator('#score-btn').click();
  await runBtn.click();
  expect(await page.locator('#score-carry').textContent()).toContain('メイン:');
  expect(await page.locator('#score-v-dmg').textContent()).toMatch(/\d[\d,]{3,}/);
  expect(await page.locator('#score-v-barrier').textContent()).toBe('×2.6');
  const dmg = async () => {
    await runBtn.click();
    return parseInt((await page.locator('#score-v-dmg').textContent()).replace(/[^\d]/g, ''), 10);
  };
  const dmgFull = await dmg();
  // 開始秒=20 (剩 20s 开始) → 旧值保留 (只有 計算 才刷新)、再按 計算 → ダメージ 变小
  await page.evaluate(() => window.setScoreStartSec(20));
  expect(parseInt((await page.locator('#score-v-dmg').textContent()).replace(/[^\d]/g, ''), 10)).toBe(dmgFull);
  const dmg20 = await dmg();
  expect(dmg20).toBeLessThan(dmgFull);
  expect(dmg20).toBeGreaterThan(0);
  // 難易度 Hard → スコア = 基礎 × 5 × 2.6
  await page.evaluate(() => window.setEnemyDiff('Hard'));
  await runBtn.click();
  const num = async (id) => parseFloat((await page.locator(id).textContent()).replace(/[^\d.]/g, ''));
  expect(await page.locator('#score-v-diff').textContent()).toBe('×5');
  expect(await num('#score-v-score')).toBeCloseTo(Math.round((await num('#score-v-base')) * 5 * 26) / 10, 5);
});

test('移动端 .size-btn padding 缩窄 (4px 9px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitHenseiReady(page);
  const pad = await page.evaluate(() => getComputedStyle(document.querySelector('.size-btn')).padding);
  expect(pad).toBe('4px 9px');
});

test('bxb1 往返: mainSlot 保留', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => window.setScoreMainSlot(1));
  const code = await page.evaluate(async () => {
    await window.openIoModal();
    return document.getElementById('io-export-str').value;
  });
  expect(code).toMatch(/^bxb1:/);
  // 改到 3号位 再 import → 应回滚到导出时的 2号位 (mainSlot=1)
  await page.evaluate(() => window.setScoreMainSlot(2));
  await page.evaluate((c) => {
    document.getElementById('io-import-str').value = c;
    return window.ioImportString();
  }, code);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.state.mainSlot)).toBe(1);
});

// ============================================================
// stats 説明トグル
// ============================================================
test('stats 説明: ? タグで popover 開閉 (body 直下 / 再クリックで閉じる / 外側クリックで閉じる)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  const btn = page.locator('#stats-panel-0 .stats-help-btn');
  const pop = page.locator('#stats-help-note-0');

  await expect(btn).toBeVisible();
  await expect(pop).toHaveCount(0);                     // 初始状态: DOM 里根本不存在

  await btn.click();
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('黄色');
  expect(await btn.getAttribute('aria-expanded')).toBe('true');

  // 生成在 body 直下 = 不会被祖先的 overflow 裁切
  expect(await pop.evaluate((el) => el.parentElement.tagName)).toBe('BODY');
  // 浮在 ? 按钮上方(箭头朝下) + 层级在其他元素之前
  const [rBtn, rPop] = [await btn.boundingBox(), await pop.boundingBox()];
  expect(rPop.y + rPop.height).toBeLessThanOrEqual(rBtn.y + 1);
  expect(await pop.evaluate((el) => +getComputedStyle(el).zIndex)).toBeGreaterThan(1000);

  await btn.click();                                    // 再点一次 = 关闭
  await expect(pop).toHaveCount(0);

  await btn.click();
  await expect(pop).toBeVisible();
  await page.locator('#slot-0 .stats-grid').click();    // 点外面 = 关闭
  await expect(pop).toHaveCount(0);
});

// ============================================================
// import: read url (共享 URL → 编成)
// ============================================================
// 短链 key → bxb1 串的反查走 /share 端点。本地 serve.js 没有它(那是 start.py 的镜像)、
// 生产是 Vercel /api/share → 用 route 伪造响应,body 里的 bxb1 串由页面自己导出得来,
// 所以这个测试不依赖任何外部服务、也不硬编码 hash。
test('import read url: 共享 URL / 片段 / 裸 key 都能读回编成', async ({ page }) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => window.setScoreMainSlot(1));

  // 先拿一份真实导出码,当作短链反查的返回值
  const code = await page.evaluate(async () => {
    await window.openIoModal();
    return document.getElementById('io-export-str').value;
  });
  expect(code).toMatch(/^bxb1:/);
  await page.route('**/share?k=*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hash: code }) }));

  // 按钮顺序: read url 在最左
  expect(await page.locator('#io-import-str ~ .io-btns .io-btn').allTextContents())
    .toEqual(['read url', 'read code', 'file']);

  // 三种写法都该被接受: 整条 URL / 只有片段 / 裸 key
  for (const v of [
    'https://he1lscythe.github.io/bxb_calculator/pages/hensei.html#s:HvICtlZCCb',
    '#s:HvICtlZCCb',
    's:HvICtlZCCb',
  ]) {
    await page.evaluate(() => window.setScoreMainSlot(2));   // 先破坏状态
    await page.evaluate(() => window.openIoModal());
    await page.fill('#io-import-str', v);
    await page.click('.io-btn:has-text("read url")');
    await expect(page.locator('#io-msg'), `输入 ${v}`).toContainText('loaded');
    expect(await page.evaluate(() => window.state.mainSlot), `输入 ${v}`).toBe(1);
    // ioImportUrl 成功后排了 setTimeout(closeIoModal, 500)。不等它落地就进下一轮的话,
    // 这个悬挂的 timer 会把下一轮刚打开的 modal 关掉 → 随机失败。等 modal 真关上再继续。
    await expect(page.locator('#io-modal')).not.toHaveClass(/\bopen\b/);
  }

  // 不含 s:/bxb1: 的 URL → 明确报错,不静默
  await page.evaluate(() => window.openIoModal());
  await page.fill('#io-import-str', 'https://example.com/x.html#foo');
  await page.click('.io-btn:has-text("read url")');
  await page.waitForTimeout(300);
  expect(await page.locator('#io-msg').textContent()).toContain('load failed');

  expect(errs, errs.join('\n')).toHaveLength(0);
});

// 页面加载时的 #hash 自动载入 —— 和 read url 共用 _configFromFragment,重构后要守住
test('import read url: 直接带 #s: 打开页面 → 自动载入 + 清掉 hash', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 100101);
  await page.evaluate(() => window.setScoreMainSlot(1));
  const code = await page.evaluate(async () => {
    await window.openIoModal();
    return document.getElementById('io-export-str').value;
  });

  await page.route('**/share?k=*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hash: code }) }));
  // goto 到「只有 fragment 不同」的同一 URL 是**同文档导航**、页面不会重新初始化 →
  // autoload 不会跑,断言会变成拿前面自己设的状态、假通过。必须 reload 强制真实重载。
  await page.goto('/pages/hensei.html#s:HvICtlZCCb');
  await page.reload();
  await page.waitForFunction(() => {
    const l = document.getElementById('loading');
    return l && getComputedStyle(l).display === 'none';
  }, { timeout: 30000 });
  await page.waitForTimeout(1200);

  expect(await page.evaluate(() => window.state.team[0].chara)).toBe(100101);
  expect(await page.evaluate(() => window.state.mainSlot)).toBe(1);
  expect(await page.evaluate(() => location.hash)).toBe('');   // 用完清掉、避免 reload 重复应用
});

// ============================================================
// 装備パネル (col{i}c 魔剣 / col{i}s ソウル / col{i}r 記憶結晶 …)
// ============================================================
// 面板不读静态 master 值、而是 collectEffects({forDisplay:true}) 的**解算后**结果:
//   倍率跟着 熟度 / ソウル Lv / 結晶 lv·重量·純度 / HP 曲线走,
//   range=All 打到别的 slot 的技能**也会出现在那个 slot 的面板里** (带「N号位」徽章)。

// 读面板里的行: [{ val, srcSlot, cross, off, txt }]
async function readPanel(page, slot, kind) {
  return page.evaluate(
    ([s, k]) => {
      const el = document.getElementById(`col${s}${k}`);
      if (!el) return null;
      return [...el.querySelectorAll('.skill-item, .cr-eff-row')].map((r) => ({
        val: r.querySelector('.tag-val')?.textContent || '',
        srcSlot: r.querySelector('.src-slot-tag')?.textContent || '',
        cross: r.classList.contains('eff-cross'),
        off: r.classList.contains('eff-off'),
        txt: (r.querySelector('.skill-eftxt') || r.querySelector('.cr-eff-name'))?.textContent || '',
      }));
    },
    [slot, kind],
  );
}

test('装備パネル: 他 slot の range=All 技能が対象 slot に出る (1680 の「長剣のヒット数2.5倍」→ 長剣 slot)', async ({ page }) => {
  await waitHenseiReady(page);
  // 1680 按武器种分了 3 条 (大剣 / 長剣 / 拳闘) HitCount ×2.5 的 range=All 技能
  await setupSlot0WithChara(page, 168001);
  await setupSlotWithChara(page, 1, 169701);   // 169701 = 長剣

  const own = await readPanel(page, 0, 'c');
  expect(own.every((r) => !r.cross)).toBe(true);          // 本 slot 自己的不带徽章

  const cross = (await readPanel(page, 1, 'c')).filter((r) => r.cross);
  expect(cross.length).toBeGreaterThan(0);
  expect(cross.every((r) => /^\d+号位$/.test(r.srcSlot))).toBe(true);
  // 長剣 限定的 ×2.5 落到 長剣 那个 slot
  expect(cross.some((r) => r.val === '×2.5' && r.txt.includes('長剣'))).toBe(true);
  // 大剣 / 拳闘 限定的不落 (weapon_type_id 跟接收方不一致)
  expect(cross.some((r) => r.txt.includes('大剣') || r.txt.includes('拳闘'))).toBe(false);
});

test('装備パネル: 倍率が熟度 / HP / ソウル Lv / 結晶 lv に追従する', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 169701);   // 带 value_scaling 的技能 (×2.98 + 熟度)

  await setTr(page, 0, 'jukudo', 1);
  const jk1 = (await readPanel(page, 0, 'c'))[0].val;
  await setTr(page, 0, 'jukudo', 99);
  const jk99 = (await readPanel(page, 0, 'c'))[0].val;
  expect(jk1).not.toBe(jk99);
  expect(jk99).not.toContain('熟度');       // 是解算值、不是原始的 "+ sc * 熟度" 公式

  // Vitality_ (逆窮鼠) 按 HP% 线性生效
  const vitVals = async () =>
    (await page.evaluate(() =>
      [...document.querySelectorAll('#col0c .skill-item')]
        .filter((r) => r.querySelector('.cond-tag')?.textContent === '逆窮鼠')
        .map((r) => r.querySelector('.tag-val')?.textContent),
    ));
  await setTr(page, 0, 'hp', 100);
  const hp100 = await vitVals();
  await setTr(page, 0, 'hp', 50);
  const hp50 = await vitVals();
  expect(hp100.length).toBeGreaterThan(0);
  expect(hp100).not.toEqual(hp50);

  // ソウル Lv
  await page.evaluate(() => window.setSoul(0, 1508));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.setSoulLv(0, 1));
  await page.waitForTimeout(100);
  const sl1 = (await readPanel(page, 0, 's')).map((r) => r.val).join('|');
  await page.evaluate(() => window.setSoulLv(0, 75));
  await page.waitForTimeout(100);
  const sl75 = (await readPanel(page, 0, 's')).map((r) => r.val).join('|');
  expect(sl1).not.toBe(sl75);

  // 結晶 lv (120101: Attack Mul init=1.01 max=1.22)
  await page.evaluate(() => window.setCrystal(0, 0, 120101));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.setCrystalDim(0, 0, 'lv', 1));
  await page.waitForTimeout(100);
  const cr1 = (await readPanel(page, 0, 'r')).map((r) => r.val).join('|');
  await page.evaluate(() => window.setCrystalDim(0, 0, 'lv', 20));
  await page.waitForTimeout(100);
  const cr20 = (await readPanel(page, 0, 'r')).map((r) => r.val).join('|');
  expect(cr1).not.toBe(cr20);
});

test('装備パネル: 未発動条件の行は消えずに薄く残る (敵BK OFF → 敵ブレイク状態 行)', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 107701);   // 带 Enemy_BreakAttack
  await page.evaluate(() => window.setEnemyBk(false));
  await page.waitForTimeout(120);
  const off = await readPanel(page, 0, 'c');
  const bkRow = off.filter((r) => r.off);
  expect(bkRow.length).toBeGreaterThan(0);
  // 加取消线、显示「发动了会是这个值」(不压成 ×1 / +0)
  expect(bkRow.every((r) => r.val && r.val !== '+0' && r.val !== '×1')).toBe(true);

  await page.evaluate(() => window.setEnemyBk(true));
  await page.waitForTimeout(120);
  const on = await readPanel(page, 0, 'c');
  expect(on.filter((r) => r.off).length).toBeLessThan(bkRow.length);
});

test('装備パネル: ▶ の表示は中身に追従、他 slot 変更でも展開状態が残る', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 168001);
  await setupSlotWithChara(page, 1, 169701);

  const state = await page.evaluate(() => {
    const o = {};
    for (let i = 0; i < 3; i++)
      for (const k of ['c', 's', 'b', 'm', 'r']) {
        const t = document.getElementById(`tog${i}${k}`);
        const w = document.getElementById(`col${i}${k}`);
        if (t && w) o[`${i}${k}`] = { hidden: t.style.display === 'none', empty: !w.innerHTML };
      }
    return o;
  });
  expect(Object.keys(state).length).toBeGreaterThan(0);
  for (const [k, s] of Object.entries(state)) expect(s.hidden, k).toBe(s.empty);

  // 展开着去动别的 slot 也不该合上 (refreshEffPanels 只换 innerHTML)
  await page.evaluate(() => document.getElementById('col1c').classList.add('open'));
  await setTr(page, 0, 'jukudo', 50);
  expect(await page.evaluate(() => document.getElementById('col1c').classList.contains('open'))).toBe(true);

  // ★ refreshEffPanels 真正吃劲的地方: slot0 插一个 range=All 的結晶, 没跑 renderSlot 的
  //   slot1 的 記憶結晶 面板会从 空 → 有内容。▶ 也得在这里放出来、否则根本点不开。
  //   32010325 ダ=ンベル = Attack Multiply / range=All / 无属性·武器·魔剣 限定
  const tog1r = async () =>
    page.evaluate(() => {
      const t = document.getElementById('tog1r');
      const w = document.getElementById('col1r');
      return { hidden: t?.style.display === 'none', empty: !w?.innerHTML };
    });
  expect(await tog1r()).toEqual({ hidden: true, empty: true });
  await page.evaluate(() => window.setCrystal(0, 0, 32010325));
  await page.waitForTimeout(250);
  expect(await tog1r()).toEqual({ hidden: false, empty: false });
  await page.evaluate(() => window.setCrystal(0, 0, null));
  await page.waitForTimeout(250);
  expect(await tog1r()).toEqual({ hidden: true, empty: true });
});

test('装備パネル: 表示行 (発動中) の数 == 計算が使う装備 effect の数', async ({ page }) => {
  await waitHenseiReady(page);
  await setupSlot0WithChara(page, 168001);
  await setupSlotWithChara(page, 1, 169701);
  await page.evaluate(() => {
    window.setSoul(0, 1508);
    window.setCrystal(0, 0, 120101);
  });
  await page.waitForTimeout(400);

  const { panel, calc } = await page.evaluate(() => {
    const KIND = { chara_skill: 'c', bd_skill: 'c', soul: 's', soul_affinity: 's', bg: 'b', masou: 'm', crystal: 'r' };
    let calc = 0;
    for (let i = 0; i < 3; i++)
      for (const e of window.__lastStats?.[i]?.effects || [])
        if (KIND[e._origin ?? e._source]) calc++;
    let panel = 0;
    for (let i = 0; i < 3; i++)
      for (const k of ['c', 's', 'b', 'm', 'r']) {
        const el = document.getElementById(`col${i}${k}`);
        if (!el) continue;
        panel += [...el.querySelectorAll('.skill-item, .cr-eff-row')].filter(
          (r) => !r.classList.contains('eff-off'),
        ).length;
      }
    return { panel, calc };
  });
  expect(calc).toBeGreaterThan(5);
  expect(panel).toBe(calc);
});

// ============================================================
// 魔装 (costume) 的 range
// ============================================================
// masou master effect 没有 range 字段 (masou.json 1200 条全无) → stats-calc 兜底成 'Single'。
// 真正全队的 11 条 (effect_text 含「味方全体」) 由 build_masou_aux.py 注入 range:'All' 进
// masou_revise.json。所以本测试依赖 revise 数据 (CI 从 data-staging fetch;本地缺 revise 会红)。
test('魔装 range: 普通魔装は自身のみ / 全队魔王装 (味方全体) は他槽にも効く', async ({ page }) => {
  await waitHenseiReady(page);

  // base_id → variant id (chara wiki shape 的 id 是 6 位 variant)
  const variantOf = (base) =>
    page.evaluate((b) => window.state.allCharas.find((x) => x._master?.id === b)?.id ?? null, base);
  const readSlot0 = () =>
    page.evaluate(() => ({
      atk: window.__lastStats[0].stats['攻撃力'],
      dl: window.__lastStats[0].damageLimit,
    }));
  // slot2 に costume を着せて slot0 への影響を測る
  const wear = async (masouId) => {
    await page.evaluate((id) => window.setMasou(2, id), masouId);
    await page.waitForTimeout(300);
    return readSlot0();
  };
  const crossRows = () =>
    page.evaluate(() => {
      const el = document.getElementById('col0m');
      if (!el) return null;
      return [...el.querySelectorAll('.skill-item.eff-cross')].map(
        (r) => r.querySelector('.tag-val')?.textContent,
      );
    });

  // slot0 = 169701 (base 1697、自分の魔装なし → 魔装 section は動的に生える側)
  // slot2 = 1001 レヴァンテイン=ヘル (1001011 魔装《晴着》= 攻撃力13%UP、range なし)
  await setupSlotWithChara(page, 0, 169701);
  await setupSlotWithChara(page, 2, await variantOf(1001));
  const plainBefore = await readSlot0();
  const plainAfter = await wear(1001011);
  expect(plainAfter.atk).toBe(plainBefore.atk);          // 自身のみ → 他槽は不変
  expect(await crossRows()).toBeNull();                  // 魔装 section すら生えない

  // slot2 を 1502 神菓王ザッハトルテ に替えて 1502704 魔王装 (味方全体 4 効果) を着せる
  await setupSlotWithChara(page, 2, await variantOf(1502));
  const teamBefore = await readSlot0();
  const teamAfter = await wear(1502704);
  expect(teamAfter.atk).toBeGreaterThan(teamBefore.atk);                 // 味方全体の攻撃力1.75倍
  expect(teamAfter.dl).toBe(teamBefore.dl + 1000000000);                 // ダメージ上限+10億
  // slot0 は自分の魔装を持たないが、他槽の全队魔王装を受けるので section が生えて 4 行出る
  const rows = await crossRows();
  expect(rows).not.toBeNull();
  expect(rows.length).toBe(4);
  expect(rows).toContain('+10億');

  // 外すと section も消える (存在性が内容に追従)
  await page.evaluate(() => window.setMasou(2, null));
  await page.waitForTimeout(300);
  expect(await crossRows()).toBeNull();
  expect((await readSlot0()).atk).toBe(teamBefore.atk);
});
