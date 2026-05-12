// ===== Omoide Template Resolution =====
// chara.omoide_template != null 时，用 templates 里对应 entry 的 omoide 覆盖
// chara.omoide。找不到 template 则保留 chara.omoide 原值（降级）。
//
// 设计前提：save 层（js/edit.js）保证 omoide_template 非 null 时 revise
// 不写 omoide 字段；render 前调一次此函数把 slots 还原出来。
// template 修改后，引用它的 chara 自动跟随更新（live reference 语义）。
export const resolveOmoideTemplates = (charas, templates) => {
  if (!Array.isArray(charas) || !Array.isArray(templates)) return;
  const tmap = {};
  templates.forEach(t => { if (t?.id != null) tmap[t.id] = t; });
  for (const c of charas) {
    if (c == null || c.omoide_template == null) continue;
    const tpl = tmap[c.omoide_template];
    if (tpl?.omoide?.length) {
      c.omoide = JSON.parse(JSON.stringify(tpl.omoide));
    }
  }
};
