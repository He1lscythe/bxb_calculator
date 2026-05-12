// 测试 revise 字段级 deepMerge + null 撤回 + empty prune 的端到端流程。
// 镜像 api/save.js 和 scripts/start.py 的 deepMerge / mergeById 逻辑。
// 用法: node tests/test_revise_merge.js

let pass = 0, fail = 0;
const _sortKeys = (obj) => {
  if (Array.isArray(obj)) return obj.map(_sortKeys);
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = _sortKeys(obj[k]);
  return out;
};
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(_sortKeys(actual)) === JSON.stringify(_sortKeys(expected));
  if (ok) { pass++; }
  else {
    fail++;
    console.error(`✗ ${label}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
  }
};

// ===== mirror api/save.js =====
function deepMerge(target, source) {
  if (source === null) return null;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const result = (target !== null && typeof target === 'object' && !Array.isArray(target))
    ? { ...target } : {};
  for (const k of Object.keys(source)) {
    const merged = deepMerge(result[k], source[k]);
    if (merged === null) delete result[k];
    else result[k] = merged;
  }
  for (const k of Object.keys(result)) {
    const v = result[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
      delete result[k];
    }
  }
  return result;
}
const _hasRealContent = e => Object.keys(e).some(k => k !== 'id' && k !== 'name');
function mergeById(existing, patches, sessionIds) {
  const sessionSet = new Set(sessionIds);
  const patchMap = new Map(
    (patches || []).filter(p => sessionSet.has(p.id)).map(p => [p.id, p])
  );
  const merged = [];
  for (const c of existing || []) {
    if (!sessionSet.has(c.id)) merged.push(c);
    else if (patchMap.has(c.id)) {
      const e = deepMerge(c, patchMap.get(c.id));
      patchMap.delete(c.id);
      if (_hasRealContent(e)) merged.push(e);
    }
  }
  for (const p of patchMap.values()) {
    const e = deepMerge({}, p);
    if (_hasRealContent(e)) merged.push(e);
  }
  merged.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return merged;
}

// ===== Tests =====
console.log('--- deepMerge basic ---');
eq('plain merge', deepMerge({a:1}, {b:2}), {a:1, b:2});
eq('overwrite', deepMerge({a:1}, {a:2}), {a:2});
eq('nested merge', deepMerge({x:{a:1}}, {x:{b:2}}), {x:{a:1, b:2}});
eq('null deletes leaf', deepMerge({a:1, b:2}, {a:null}), {b:2});
eq('null on missing key = noop', deepMerge({a:1}, {b:null}), {a:1});
eq('all-null nested → empty pruned', deepMerge({x:{a:1}}, {x:{a:null}}), {});
eq('partial-null retains other', deepMerge({x:{a:1, b:2}}, {x:{a:null}}), {x:{b:2}});
eq('empty target + null in source → empty', deepMerge({}, {x:{a:null}}), {});

console.log('\n--- mergeById ---');
// (1) 新规 entry
eq('new entry pushed', mergeById([], [{id:1, name:'a', x:1}], [1]),
   [{id:1, name:'a', x:1}]);
// (2) session 在 patch 缺失 = 删除
eq('session no patch deletes', mergeById([{id:1, name:'a', x:1}], [], [1]),
   []);
// (3) 字段级合并
eq('field-level merge keeps both',
   mergeById([{id:1, name:'a', x:1}], [{id:1, name:'a', y:2}], [1]),
   [{id:1, name:'a', x:1, y:2}]);
// (4) null 撤回
eq('null retracts field',
   mergeById([{id:1, name:'a', x:1, y:2}], [{id:1, name:'a', x:null}], [1]),
   [{id:1, name:'a', y:2}]);
// (5) 空 entry 不写
eq('empty entry pruned',
   mergeById([{id:1, name:'a', x:1}], [{id:1, name:'a', x:null}], [1]),
   []);
// (6) 新 entry 但所有字段 null
eq('new entry with only nulls dropped',
   mergeById([], [{id:1, name:'a', skills:{0:{bairitu:null}}}], [1]),
   []);
// (7) 多 id 混合
eq('multi-id mix',
   mergeById(
     [{id:1, name:'a', x:1}, {id:2, name:'b', y:2}, {id:3, name:'c', z:3}],
     [{id:2, name:'b', y:null}, {id:3, name:'c', z:99}],
     [2, 3]
   ),
   [{id:1, name:'a', x:1}, {id:3, name:'c', z:99}]);
// (8) 原 id 不在 session_ids → 保留原值
eq('non-session id untouched',
   mergeById([{id:1, name:'a', x:1}], [{id:1, name:'a', x:99}], []),
   [{id:1, name:'a', x:1}]);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
