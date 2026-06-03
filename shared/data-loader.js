// shared/data-loader.js — fetch data/*.json 并缓存
//
// v2 全部业务 JSON 来自 master_tables → build_*.py 产出。
// view-only 阶段: 只 fetch 不写。Phase 6+ 才考虑 revise edit 系统。

const BASE = '../data';

const cache = new Map();

const _fetchJson = async (name) => {
  if (cache.has(name)) return cache.get(name);
  const url = `${BASE}/${name}`;
  const promise = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
    return r.json();
  });
  cache.set(name, promise);
  return promise;
};

export const loadCharacters = () => _fetchJson('characters.json');
export const loadSouls = () => _fetchJson('souls.json');
export const loadCrystals = () => _fetchJson('crystals.json');
export const loadBladegraphs = () => _fetchJson('bladegraphs.json');
export const loadMasou = () => _fetchJson('masou.json');
export const loadSenzaiTable = () => _fetchJson('senzai_table.json');

// 一次性 load 全部 (hensei viewer 用)
export const loadAll = async () => {
  const [characters, souls, crystals, bladegraphs, masou, senzai] = await Promise.all([
    loadCharacters(), loadSouls(), loadCrystals(), loadBladegraphs(), loadMasou(), loadSenzaiTable(),
  ]);
  return { characters, souls, crystals, bladegraphs, masou, senzai };
};
