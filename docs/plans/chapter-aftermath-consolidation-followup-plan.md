# 章节事后提取收敛——遗留项跟进方案（Follow-up）

> 状态：代码跟进已执行；运行时质量对比待 LLM 凭据环境复跑
> 前置：`chapter-aftermath-extraction-consolidation-plan.md` 已实现（commit 638b3229），
> 本方案处理其验收（2026-06-11）发现的 4 个非阻塞问题 + 1 项未完成的运行时验收。
> 各项相互独立，可单独实施，按优先级排序。

## Item 1 — 修复信息边界写入的截断方向（bug，优先做）

**问题：** `ChapterArtifactDeltaService.mergeKnowledgeBoundaryState`
（server/src/services/novel/runtime/ChapterArtifactDeltaService.ts）当前实现为
`[base, boundaryLine].join("\n").slice(0, 1200)` —— 从尾部截断。
当角色 `currentState` 本身接近 1200 字时，**恰好被切掉的是本次要写入的
【信息边界】行**，即越需要边界约束的长状态角色越写不进去。

**修改：** 改为「先给 boundaryLine 保留配额，再截断 base」：

```
const reserved = boundaryLine.length + 1;          // +1 为换行
const base = cleanedCurrentState.slice(0, Math.max(0, 1200 - reserved));
return [base, boundaryLine].filter(Boolean).join("\n");
```

boundaryLine 自身超过 1200 字的极端情况可直接对 boundaryLine 再做一次 slice 兜底。

**验收：** 单元测试：base 为 1190 字时，合并结果必须包含完整（或至少非空的）
【信息边界】行；base 为空时结果即 boundaryLine。

## Item 2 — 修复链路对齐统一提取（一致性）

**问题：** `ChapterRepairStreamRuntime`
（server/src/services/novel/runtime/repair/ChapterRepairStreamRuntime.ts，约 189 行）
调用 `artifactSyncService.syncChapterArtifacts` 时未传
`skipLegacySummaryAndFacts` / `awaitArtifactDelta`。修复完成后会先同步写入一份
正则粗摘要（briefSummary），稍后才被异步 artifact delta 的 LLM 摘要覆盖——
存在一个摘要质量降级的时间窗口，且修复路径的事实/状态就绪时序没有保证。

**修改：** 与定稿链路对齐，传入：

```
{
  scheduleBackgroundSync: true,
  awaitArtifactDelta: true,
  skipLegacySummaryAndFacts: true,
  provider: <修复请求的 provider>,
  model: <修复请求的 model>,
}
```

注意：repair 流是流式响应，await delta 会让"修复完成"事件晚于现在发出。
若产品上不可接受，可退一步只传 `skipLegacySummaryAndFacts: true`
（消除粗摘要覆盖窗口，时序保持异步）——实施时二选一并在 PR 描述里说明取舍。

**验收：** 修复一章后，chapterSummary.summary 不再出现正则粗摘要内容
（特征：截断的正文片段拼接），且 consistencyFact 不再写入 `chapter_auto_extract` 来源。

## Item 3 — 决断路径 B（chapter:drafted 链路）的去留

**现状：** `chapter:drafted` 事件在代码中**没有任何发射点**
（仅 events/types.ts 定义 + registerNovelEventHandlers.ts 订阅），
`character.chapterDraftSync` 任务实际不会入队，路径 B（独立角色动态提取）
处于休眠状态。Step 1 加的检查点护栏目前只防御"未来被重新启用"。

**二选一（需项目负责人拍板，建议选 A）：**

- **方案 A（建议）：正式退役** —— 删除 registerNovelEventHandlers 中
  chapter:drafted → chapterDraftSync 的入队逻辑与 NovelSideEffectJobHandlers
  中对应 case；`syncChapterDraftDynamics` 与
  `chapterDynamicsExtractionPrompt`（characterDynamicsLlm.ts /
  characterDynamicsSchemas.ts）保留并改挂到一个**手动触发的运维入口**
  （现有管理路由或脚本），用途：artifact delta 提取明显遗漏时的人工补救。
  同时删除 `chapter:drafted` 事件类型定义，避免误导后续开发者。
- **方案 B：接通事件** —— 在章节定稿点补上 `chapter:drafted` 发射。
  不建议：检查点护栏会让任务入队后立刻空跑（artifact delta 已 awaited 完成），
  纯粹浪费队列吞吐；只有 artifact delta 失败时才有价值，而失败重试
  更应该由 BackgroundSyncService 的检查点重试机制负责。

**验收：** 方案 A：全文搜索 `chapter:drafted` 无残留订阅；手动入口可成功
触发一次 syncChapterDraftDynamics 并在 artifact delta 检查点存在时正确跳过。

## Item 4 — 存量检查点失配的一次性处理（低优先级，可只记录不处理）

**现状：** contentHash 从 `sha256(原文)` 改为 `sha256(compactText(原文))`
（后台去重同时从 sha1 统一过来），所有存量 `artifact_delta` 检查点不再匹配。
影响：已同步章节下次被触碰时重新跑一次完整提取（多一次 LLM 调用），
落库逻辑幂等（upsert / deleteMany→create），无数据正确性风险。

**处理建议：接受成本，不做迁移。** 理由：重提取反而让存量章节获得新增的
summary/concreteFacts/knowledgeStates 字段；写迁移脚本重算 hash 的工作量
大于收益。仅需在 release-notes 中注明"升级后已有章节首次重同步会多一次
提取调用"。若运营侧对批量重提取的费用敏感，可提供一个一次性脚本：
遍历 succeeded 检查点，按新算法重算 contentHash 并 update——实施与否由负责人决定。

## Item 5 — 运行时提取质量对比（方案遗留的验收项，必做）

**目标：** 验证统一调用（一次输出 8 类信息）相比旧的分散调用没有明显质量下降。
这是原方案 Step 3 的上线前置条件，代码审查无法覆盖。

**做法：**
1. 选 3-5 个真实章节（覆盖：高信息差章节、多资源变动章节、纯过渡章节）。
2. 对每章分别运行：
   - 新：`chapterArtifactDeltaService.syncChapterArtifacts`（或直接跑 prompt 取原始输出）
   - 旧基线：`chapterSummaryPrompt`（review.prompts.ts）单独跑摘要 + concreteFacts
3. 人工对比三个维度：摘要信息覆盖度（关键事件/悬念是否齐全）、
   concreteFacts 召回（旧版抽到的硬事实新版是否漏）、
   characterKnowledgeStates 是否只在真有信息差的章节出现（无信息差章节应为空数组）。
4. 结果记录到本文件附录；若 concreteFacts 召回明显下降（漏掉承诺/交易条款类硬事实），
   触发原方案的回退预案：摘要+事实独立调用，其余保持统一。

**产出物：** 本文件追加「附录：质量对比记录」小节，列出每章的对比结论与最终判定。

## 优先级与依赖

| 项 | 性质 | 优先级 | 依赖 |
|---|---|---|---|
| Item 1 信息边界截断 | bug 修复 | 高 | 无 |
| Item 5 质量对比 | 上线验收 | 高 | 无（应尽快，决定是否回退） |
| Item 2 修复链路对齐 | 一致性 | 中 | 无 |
| Item 3 路径 B 去留 | 清理决策 | 中 | 需负责人选 A/B |
| Item 4 存量检查点 | 记录/可选脚本 | 低 | 需负责人决定是否写脚本 |

## 附录：跟进执行记录（2026-06-11）

### 已执行

- Item 1：`mergeKnowledgeBoundaryState` 已改为先给【信息边界】行预留配额，再截断旧 `currentState`；新增单元测试覆盖 1190 字旧状态仍保留边界行。
- Item 2：手动修复流已与定稿链路对齐，修复后同步调用 `artifact_delta`，并传入 `awaitArtifactDelta=true`、`skipLegacySummaryAndFacts=true`、`provider/model`。取舍：接受修复完成事件延后，以换取修复后摘要/事实/状态在下一步前就绪。
- Item 3：采用方案 A。`chapter:drafted` 事件类型、事件订阅、`character.chapterDraftSync` side-effect job 类型和 worker case 已退役；`syncChapterDraftDynamics` 本体保留，作为后续手动运维入口可复用的兜底能力。
- Item 4：采用“接受一次性重提取成本，不写迁移脚本”。原因不变：存量章节首次重同步可以补齐新增的 `summary/concreteFacts/characterKnowledgeStates`，且落库路径幂等；费用敏感时再单独做只读评估和迁移脚本。

### Item 5 质量对比记录

本地 `server/dev.db` 中存在可用真实章节样本：共 3166 章，其中正文长度不少于 500 字的章节 569 章。当前环境没有可用 LLM 凭据（`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY`、`XAI_API_KEY`、`ANTHROPIC_API_KEY` 均未设置），因此未实际调用新旧 prompt，不能给出质量通过结论。

候选样本如下，后续在有 LLM 凭据的环境中复跑：

| 用途 | novelId | chapterId | 章节 | 标题 | 正文字数 |
|---|---|---|---:|---|---:|
| 长正文/综合信息 | `cmmbi9xcj0000fgv1op7zd8de` | `cmmboxapg0000yov1vf1m2rz4` | 1 | 新章节 1 | 6846 |
| 连续章节基线 | `cmmivm3980000ksv142lzy1pl` | `cmmiyc6v9000gwgv1z7ewgplm` | 1 | 滨城隐居 | 6391 |
| 连续章节基线 | `cmmivm3980000ksv142lzy1pl` | `cmmiyc6v9000hwgv152era5iz` | 2 | 陈墨求助 | 5118 |
| 连续章节基线 | `cmmivm3980000ksv142lzy1pl` | `cmmiyc6v9000iwgv1fpbq49ek` | 3 | 风土初探 | 5286 |
| 短中篇/过渡候选 | `cmmsuhi6z0003z4v14yswlxg8` | `cmmsuyea6000hz4v13e56ythy` | 1 | 桥头夜雨 | 1690 |

待复跑命令建议：

1. 为服务进程配置实际 LLM provider key。
2. 对上表每章分别运行 `chapterArtifactDeltaPrompt` 与 `chapterSummaryPrompt`。
3. 按正文覆盖度、`concreteFacts` 召回、`characterKnowledgeStates` 克制性记录人工判断。

当前判定：Item 5 未完成，不应据此宣称统一提取质量已经通过上线验收。
