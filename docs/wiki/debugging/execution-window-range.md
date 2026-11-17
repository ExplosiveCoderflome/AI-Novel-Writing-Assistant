# 执行窗口的章节范围契约

## Background

导演台的正文启动入口（`DirectorStart`）让用户自选起始章与结束章，开书流程的全自动模式也会带上整本的章节范围开一个 run。2026 年 11 月的 issue #256 里，用户选了第 1—38 章，run 在正文准备阶段停下，报「按大纲写作每次只确认一章，请选择当前章」，0/38 章。同一句报错也在真实试玩里复现：1—3 章的范围在 open 时通过，到步骤里才被拦。

根因在 `executionWindow`（`server/src/app/director/productionInputs.ts`）：它只认 `from === to` 的单章范围，多章范围直接抛 422。而它下游的三个环节本来都按范围实现：章节细化步骤逐个处理 `targets` 数组，执行合同同步步骤按起止章选出全部章节，正文批处理步骤（新内核与旧批处理两条路）都按起止章取章。单章限制只存在于 `executionWindow` 这一处，与上下游的范围契约不一致。

## Decision

把范围支持补到 `executionWindow` 这一处，不动上下游。另一条路是在 open 时拒掉多章范围，但开书流程与导演台入口都会发出多章范围，拒掉等于把正常入口砸掉；让执行窗口返回完整范围，产品行为与入口承诺一致。

大纲交接路径（`outlineOpening/handoff.ts`）的单章限制保留：大纲开书每次只确认一章是那条路自己的产品规则，大纲启动入口发出的本来就是单章范围，两边一致，不必改。

## Current Rule

- `executionWindow` 返回授权范围内的全部章节：按卷规划匹配起止章之间的每一章，目标按章序排列，`executionRange` 取完整的起止章。
- 范围内的每一章都必须有且只有一条章节路线：缺章、重章、章序不连续时抛 422「授权范围缺少唯一的章节路线。」
- 范围本身无效（起止章不是正整数、起始章小于 1、结束章小于起始章）时抛 422「章节授权范围无效。」
- 未传范围时抛 400，与之前一致。
- 大纲交接路径仍要求单章范围（`OUTLINE_SINGLE_CHAPTER_REQUIRED`），与大纲启动入口的单章约定对应。

## Failure Modes

- 卷规划里缺了范围内的某一章：执行窗口抛 422，run 在正文准备前停下，不会写出半截范围。先补齐卷拆章列表再启动。
- 同一章序在两卷各出现一次：路线不唯一，同样抛 422；先处理卷规划里的重复章序。
- 大纲开书带多章范围：大纲交接在 open 时抛 `OUTLINE_SINGLE_CHAPTER_REQUIRED`，这是大纲路自己的规则，不是执行窗口的问题。

## Related Modules

- `server/src/app/director/productionInputs.ts`（`executionWindow`、`targetVolume`）
- `server/src/modules/director/steps/planning/chapterDetailBundle.ts`（逐目标细化）
- `server/src/modules/director/steps/planning/executionContractSync.ts`（按范围同步执行合同）
- `server/src/app/director/productionKernel/batch/step.ts`（新内核按范围取章）
- `server/src/app/director/outlineOpening/handoff.ts`（大纲路单章规则，保留）
- `client/src/components/directorNext/DirectorStart.tsx`（范围入口）
