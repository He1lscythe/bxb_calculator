// ===== BG (Bladegraph) Spec =====
// Usage: import { BG_SPEC } from '../shared/bg-spec.js';

import { classifyParameter, conditionTrigger, bgScopeTags } from './parameter-class.js';

// bg 有多个 skill、所有 filter 用 op='any' 检测 skills[] 任一命中
export const BG_SPEC = {
  searchFields: ['name'],
  filters: {
    rarity: { extract: (b) => b.rarity },
    // 跟 crystal 统一: 保留 0、选「全」时含无限定的 skill
    element: {
      op: 'any',
      extract: (b) => {
        const ids = [...new Set((b._skills || []).map((s) => s.element_id || 0))];
        return ids.length ? ids : [0];
      },
    },
    weapon: {
      op: 'any',
      extract: (b) => {
        const ids = [...new Set((b._skills || []).map((s) => s.weapon_type_id || 0))];
        return ids.length ? ids : [0];
      },
    },
    effect: {
      op: 'any',
      extract: (b) => (b._skills || []).map((s) => classifyParameter(s.parameter)).filter(Boolean),
    },
    condition_trigger: {
      op: 'any',
      extract: (b) => (b._skills || []).map((s) => conditionTrigger(s.parameter)),
    },
    scope: { op: 'any', extract: (b) => bgScopeTags(b) },
    time: {                                              // 時間限定 (bg 独有)
      extract: (b) => (b.skill_effective_time || b.long_skill_effective_time) ? 1 : 0,
    },
  },
  sortFns: {
    rarity: (c) => c.rarity || 0,
    id: (c) => c.id || 0,
  },
};
