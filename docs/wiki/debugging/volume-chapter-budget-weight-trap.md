# 章节预算加权陷阱：写作中的卷被分到极小预算（issue #173）

## 背景

用户在第 9 卷生成后续章节标题时，连续收到"当前卷节奏板的章节跨度异常，
建议先重生成节奏板，再继续生成章节标题。"前 8 卷同样的操作都没问题；
重生成节奏板后再生成标题，依然报同样的错。

排查起点在 `generateBeatChunkedChapterList`
（`server/src/services/novel/volume/volumeChapterListGeneration.ts`）的预算校验：
节奏板要求的章数（55）超过了信任上限（`maxTrusted = 预算 + max(6, 25%)`）就会抛错。
节奏板本身完全自洽（1-3、4-10、…、53-55，连续覆盖 55 章），问题在预算侧。

## 决策

章节预算的加权分配里，权重应当估计各卷的"计划规模"，而不是"当前进度"。
正在生成的卷当前章数小，只说明它还没写完，不能因此把它未来的预算压没。
以某卷为目标分配预算时，其预算不得低于均分份额
（`resolveEvenShareChapterBudget`）。

## 当前规则

- `resolveEvenShareChapterBudget(chapterBudget, volumeCount)`
  （`server/src/services/novel/volume/volumeChapterBudgetAllocation.ts`）返回
  单卷预算下限 `max(3, round(chapterBudget / volumeCount))`。
- 生成章节标题时（`generateBeatChunkedChapterList`），目标卷的兜底预算取
  `max(加权分配, 均分份额)`。
- 生成/重生成节奏板时（`resolveBeatSheetTargetChapterCount`），目标章数取
  `max(现有章数, 加权分配, 均分份额)`。注意此前代码里的 `?? 均分` 分支恒为
  dead code（预算数组恒有该下标），且加权会把写作中的卷压到只有当前章数。
- 不要用"当前章数"作为"计划章数"的代理去做一致性校验；校验节奏板是否离谱
  时，分母必须是计划口径。

## 示例

复现场景（已用 `~/workspace/repro-173.mjs` 以仓库真实函数逐字复现）：

1. 9 卷，前 8 卷共 443 章，第 9 卷已生成 3 章（开卷抓手），节奏板规划 55 章。
2. `allocateChapterBudgets`：9 卷都有 ≥3 章 → 按现有章数加权 → 第 9 卷分到 3 章。
3. `resolveTargetChapterCount({ budgeted: 3, required: 55 })`：
   `maxTrusted = 3 + 6 = 9`，55 > 9 → 抛"跨度异常"。
4. 前 8 卷生成标题时目标卷通常是 0 章（<3），走均分路径，每卷约 49 章，
   55 落在容差内 → 通过。所以跟"卷数多了"无关，是"先生成开头几章、
   再回来生成后续标题"这个操作顺序触发了加权路径。

修复后：第 9 卷兜底到均分份额 50 章，`maxTrusted = 63 ≥ 55`，节奏板被接受，
目标章数取 55。`estimatedChapterCount` 是否设置不影响结论。

## 失败模式

- 把"当前进度"当"计划规模"做预算校验：写作中的卷永远通不过自家节奏板的校验。
- 报错文案把用户引向"重生成节奏板"，而节奏板不是问题；重生成时 AI 还会被喂
  "目标 3 章"的错误提示。修文案或修分母，二选一，这里选择了修分母。
- `??` 兜底写在恒有值的数组下标后面，等于没写；兜底要用 `Math.max` 显式表达。

## 相关模块

- `server/src/services/novel/volume/volumeChapterBudgetAllocation.ts`
  （`allocateChapterBudgets`、`deriveChapterBudget`、`resolveEvenShareChapterBudget`）
- `server/src/services/novel/volume/volumeBeatSheetChapterBudget.ts`
  （`resolveTargetChapterCount`、`inferRequiredChapterCountFromBeatSheet`）
- `server/src/services/novel/volume/volumeChapterListGeneration.ts`
  （`generateBeatChunkedChapterList` 抛错点）
- `server/src/services/novel/volume/volumeBeatSheetGeneration.ts`
  （`resolveBeatSheetTargetChapterCount`）
- `server/src/services/novel/director/phases/novelDirectorChapterTitleRepair.ts`
  （见到该报错会刷新节奏板——方向是错的，根因修好后该分支不再被触发）

## 来源资料

- issue #173：章节跨度异常的bug
- 根因分析、数值复现与修复：2026-10-07
