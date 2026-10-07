# 节奏/拆章工作区选中被抢回的排查（issue #172）

## 背景

用户在节奏 / 拆章工作区手动选中某卷某章、展开高级设置后，只要在「目标字数」
等数字输入框里敲一个数字，右侧细化面板就会跳回第 1 章，输入的值其实写进了
正确的章节，但视图焦点丢失了。

排查起点在 `StructuredChapterDetailCard`（受控输入）→ `onChapterNumberChange` →
`useNovelVolumePlanning.updateVolumeDraft` → `setVolumeDraft`。输入本身、ID 匹配、
`normalizeVolumeDraft` 都没有重建章节 ID；纯手动编辑流程里没有任何 effect 会
重置选中。真正的抢回者是 `NovelEdit.tsx` 里跟随导演进度的 effect。

## 决策

工作区的手动选中是用户意图，导演跟随是辅助意图。两者冲突时遵循两条规则：

1. 只有当“导演目标章节”本身发生变化时才跟随一次；目标不变时，即使用户修改
   草稿导致 effect 重跑，也不再重复抢回。
2. `patchWorkspace` 的 patch 中 `undefined` 一律视为“不修改”，不允许用对象展开
   的语义清空已有选中。

## 当前规则

- `resolveStructuredOutlineDirectorFollow`
  （`client/src/pages/novels/stores/structuredOutlineDirectorFollow.ts`）是唯一的
  导演跟随决策入口，纯函数、可单测。`NovelEdit` 里的 effect 只负责调用它并用
  ref 记录上一次跟随过的目标。
- effect 依赖仍保留 `normalizedVolumeDraft`（草稿异步加载后才能定位目标卷），
  但重复触发时靠 memory 短路，不再产生 patch。
- `useStructuredOutlineWorkspaceStore.patchWorkspace` 过滤掉值为 `undefined` 的
  字段；`NovelEdit` 挂载时同步 URL 参数的 effect 只在参数非空时才 patch。
- 不要在 effect 依赖里放“每次用户输入都会变”的派生状态来做一次性跟随；
  一次性跟随必须用 ref/memory 记录已处理的目标。

## 示例

复现场景（已用 `~/workspace/repro-172.mjs` 以仓库真实函数逻辑复现）：

1. 打开节奏 / 拆章页，选中第 8 卷，在节奏组里点选一章（此时
   `selectedBeatKey` 为组 key，不为 `"all"`），展开高级设置。
2. 该小说存在导演任务快照，其 `chapter_detail_bundle` 步骤处于 running /
   waiting_approval（或中断残留为 running），目标为第 1 章。
   服务端 `activeStep` 取最新 running/waiting_approval/blocked_scope 的步骤；
   客户端 `resolveActiveStructuredOutlineChapterId` 还会兜底找
   `runtime.steps` 里状态为 running 的同类步骤。
3. 在「目标字数」输入框敲数字 → `normalizedVolumeDraft` 产生新引用 →
   effect 重跑 → 守卫三元组（选中章/卷/beatKey）不精确匹配导演目标 →
   `patchWorkspace` 把选中抢回第 1 卷第 1 章。

## 失败模式

- 用“effect 每次重跑都重新断言一次选中”来实现跟随：任何让依赖变化的用户
  输入都会触发抢回。跟随类 effect 必须记录已处理目标。
- 给 `patchWorkspace` 传 `selectedVolumeId: selectedVolumeId || undefined`：
  对象展开会把 `undefined` 写进 state，`?? defaultVolumeId` 兜底让工作区静默
  回到第 1 卷。patch 语义里 `undefined` 必须等于“不修改”。
- 工作区 `selectedChapter` 的 fallback 链（找不到 id 就显示 `visibleChapters[0]`）
  会让“选中丢失”表现为“跳到第 1 章”，排查时容易误判为列表排序问题；
  先查选中 id 是否还在，不在再查排序。

## 相关模块

- `client/src/pages/novels/NovelEdit.tsx`（导演跟随 effect、URL 参数同步 effect）
- `client/src/pages/novels/stores/useStructuredOutlineWorkspaceStore.ts`
- `client/src/pages/novels/stores/structuredOutlineDirectorFollow.ts`
- `client/src/pages/novels/components/StructuredOutlineWorkspace.tsx`
- `client/src/pages/novels/components/StructuredChapterDetailCard.tsx`
- `server/src/services/novel/director/state/DirectorStateReader.ts`
  （`activeStep` 取 running/waiting_approval/blocked_scope 的最新步骤）

## 来源资料

- issue #172：细化当前章节-高级设置-目标字数的 bug
- 根因分析与复现：2026-10-07
