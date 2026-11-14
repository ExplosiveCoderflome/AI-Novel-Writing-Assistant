# 卷工作区注水与大纲保留字段

## Background

卷工作区读取路径（`NovelVolumeService.ensureVolumeWorkspace`）会用规范 Chapter 行的字段
“注水”卷规划文档：章标题取 Chapter 标题，章摘要取 Chapter `expectation`。
注水后只要文档有变化，读路径就会把文档落盘。

大纲开书的书另有保留守卫（`assertOutlineWorkspaceCandidate`）：绑定策略里
`mode !== "fill_missing"` 的章字段（标题、摘要、目标）必须与策略值逐字一致，
写路径一律拒绝改动。

章节被导演执行后，`Chapter.expectation` 会被改写为执行简报，与大纲原摘要
合法地不一致。此时两者冲突：读路径注水把执行简报写进规划摘要，落盘时
守卫以 `OUTLINE_PRESERVED_FIELD` 拒绝；写不进去，下一次读又重复同一套，
卷版本读取与卷工作区写入被永久楔死，编辑页每次加载都弹出冲突提示。

## Decision

注水时跳过受保留策略保护的章字段，守卫本身不放宽：

- `readPreservedChapterFields`（`protection.ts`）只读绑定行的 mapping 与 policy，
  按与守卫相同的过滤条件（`mode !== "fill_missing"`、章字段表）算出每个
  plan 章节受保护的字段集合；无绑定的书返回空集，注水行为不变。
- `hydrateCanonicalChapterFields` 对受保护的标题/摘要保留文档里的值，只注水
  其余规范字段（任务单、场景卡、字数等）。
- 显式写路径（`mirrorChapterIntoWorkspace`、卷更新）不走这条豁免：显式写入
  违反保留策略时守卫照常 409，由调用方提示用户调整保留策略。

## Current Rule

- 读路径的任何“回读再持久化”都不得改写守卫保护的字段；先查策略，再决定
  哪些字段可以回填。
- 保留策略的唯一真相来源是绑定行的 policyJson；注水与守卫必须用同一张
  字段表、同一条 mode 过滤，不得各自维护一份。
- 规划摘要与执行简报是两个东西：规划摘要归大纲策略管，执行简报归 Chapter
  行管；两者不一致是执行后的正常状态，不是数据损坏，不得用数据补丁
  把 `expectation` 改回原摘要来“修”。

## Failure Modes

- 症状：小说编辑页每次加载弹出多条红色「保留内容发生冲突：`<nodeId>.summary`」，
  `GET /volumes/versions` 与 `GET /volumes` 返回 409 `OUTLINE_PRESERVED_FIELD`。
- 定位：按 nodeId 在绑定 mapping 里找到章，比较三处值——policy 规则值、
  卷规划文档摘要、Chapter `expectation`。文档值与策略值一致、而
  `expectation` 不同，即为本模式。
- 与“回读再持久化毒化冻结指纹”同属读路径写回家族，但机制不同：那一例是
  指纹被改写，这里是注水字段撞上保留守卫。

## Related Modules

- `server/src/services/novel/volume/NovelVolumeService.ts`（`hydrateCanonicalChapterFields`）
- `server/src/modules/planning/outline/openBook/domain/protection.ts`（守卫与
  `readPreservedChapterFields`）
- `server/src/services/novel/volume/volumeWorkspacePersistence.ts`（`persistActiveVolumeWorkspace`）
- 回归测试：`server/tests/volumeHydrationSkipsPreservedFields.test.js`
