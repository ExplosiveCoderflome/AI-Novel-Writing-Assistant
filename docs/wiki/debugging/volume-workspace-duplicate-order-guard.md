# 卷工作区写入前必须预检序号重复：否则撞唯一约束并可能写成一半（issue #166）

## 背景

用户电脑重启后打开小说，保存卷工作区时报
`prisma.volumeChapterPlan.update()` 唯一约束冲突（`volumeId, chapterOrder`），
且卷战略/卷骨架为空。

`VolumeChapterPlan` 有 `@@unique([volumeId, chapterOrder])`，
`VolumePlan` 有 `@@unique([novelId, sortOrder])`。
`persistActiveVolumeWorkspace` 的写入策略是：先由 `requiresOrderParking`
判断是否需要把旧行"停车"到负数序号避让，再逐行 create/update。

停车只在"同一个（卷, 序号）槽位被**不同 id** 的章节/卷占用"时触发。
若 incoming 文档**自身**就带重复序号（例如同一卷里两个章节都是序号 3），
槽位在库里可能是空的、或被其中一个重复项自己占用，停车条件不成立；
随后的逐行写入会在同一个槽位上先 update/create 一个、再撞上另一个，
直接抛 Prisma P2002。更糟的是写入在中途 abort，工作区被写成一半
（这正是卷战略/卷骨架为空的原因：末尾的 novel.update 没跑到）。

## 决策

写入前先对 incoming 文档做序号重复预检，发现重复就抛明确错误、拒绝写入，
而不是让 Prisma 的原始错误透到用户面前，也不让半写状态落盘。
这是输入校验/安全护栏，不是业务分支表，符合 AI-First 规则中允许的固定判断。

## 当前规则

- `findDuplicateOrders`（`server/src/services/novel/volume/volumeWorkspacePersistence.ts`）
  检查 incoming 文档内重复的 `(volumeId, chapterOrder)` 和 `(novelId, sortOrder)`；
  `assertNoDuplicateOrders` 在 `persistActiveVolumeWorkspace` 开头调用，
  重复时抛中文明确错误（含卷名与重复序号）。
- parking 与写入是否同事务：已核查，全部 4 个调用方
  （`ChapterExecutionContractService` / `NovelVolumeService` ×2 /
  `VolumeChapterSyncService`）都经由 `runVolumeWorkspaceTransaction` 包裹，
  停车与写入天然在同一事务内，无需改动。
- 负数序号残留：parking 是唯一写入负数序号的地方；任何一次完整保存都会
  把负数行按 id 更新回正序号（id 在文档中）或经 stale-delete 删除（孤儿），
  因此不需要额外的清理删除——删了反而会把"更新时保留用户字段"
  （如 conflictLevel）的路径变成 create，丢字段。

## 失败模式

- 现象「`volumeChapterPlan.update()` / `volumePlan.update()` 报唯一约束冲突」，
  先查 incoming 文档（快照 contentJson 或刚生成的规划）里有没有重复序号，
  不要先怀疑 parking 逻辑——parking 的触发条件是窄的，防不住文档自带重复。
- 用户侧看到的不再是 Prisma 原始错误，而是
  「卷工作区文档存在重复序号，已拒绝保存以避免数据损坏……请检查卷/章节规划后重试」。
  收到这个错误意味着上游（生成/快照）产出了坏文档，要修的是文档来源，
  不是重试保存。

## 相关模块

- `server/src/services/novel/volume/volumeWorkspacePersistence.ts`
  （`findDuplicateOrders` / `assertNoDuplicateOrders` /
  `persistActiveVolumeWorkspace` / `requiresOrderParking`）
- `server/tests/volumeWorkspaceDuplicateOrderGuard.test.js`（回归测试）
- issue #166
