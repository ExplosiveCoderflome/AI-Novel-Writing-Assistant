# 读者体验合同闭环：第一阶段实施方案

## 背景

当前小说生产链已经具备 Book Contract、故事宏观规划、卷战略、节奏板、章节任务单、场景卡、事实账本、伏笔账本、章节验收和质量修复。主要问题不是缺少规划层级，而是这些资产在进入正文生成时，没有统一回答以下问题：

- 本章让读者追问什么？
- 本章承诺给出什么回报？
- 主角当前主动争取什么，又被什么阻挡？
- 场景在哪里发生有效转折？
- 章末相对章初产生了什么净变化？
- 上一章留下的追读责任在本章如何承接？

因此系统可能生成“任务完成但读感平”的章节，也可能在书级规划中定义了阅读承诺、主角幻想和阶段兑现，却在逐章写作时只剩下泛化卖点。

## 第一阶段目标

第一阶段建立一个结构化、可兼容、可贯穿现有链路的 `ReaderExperienceContract`，并完成以下闭环：

1. 章节细化阶段由 AI 生成读者体验合同，不依赖关键词或固定路由。
2. 合同随现有章节执行合同持久化，不新增数据库迁移。
3. 正文写作、章节验收和章节修复消费同一份合同。
4. 完整 Book Contract 的阅读承诺、主角幻想、关系主线、升级阶梯和 3/10/30 章阶段兑现进入写章上下文。
5. 卷级读者回报梯度与当前卷核心回报进入章节运行时，而不只停留在卷战略文档。
6. 写章连续性上下文明确职责，移除已经停用却仍被声明为 required 的 Timeline 上下文。

## 非目标

以下内容不在第一阶段一次性完成：

- 不新增读者画像、商业题材分类器或新的平行规划器。
- 不改变自动导演的全局停止规则；普通读者体验问题仍属于局部修复或质量债。
- 不在本阶段重做完整质量评分体系；先让现有验收和修复读取统一合同，独立的读者体验评分维度放入后续阶段。
- 不在本阶段把第 3/10/30 章承诺自动写成 Payoff Ledger 持久化条目；第一阶段先保证写章可见，账本化在第二阶段实施。
- 不执行数据库重置、清理或破坏性迁移。

## 核心领域合同

### ReaderExperienceContract

每章只维护一份读者体验合同：

```ts
interface ReaderExperienceContract {
  readerQuestion: string;
  promisedReward: string;
  rewardLevel: "setup" | "partial" | "major";
  protagonistWant: string;
  primaryResistance: string;
  keyTurn: string;
  emotionalShift: string;
  informationReveal: string;
  netChange: string;
  inheritedHookResponsibilities: string[];
  endingHook: string;
}
```

字段语义：

- `readerQuestion`：读者进入本章时最想知道的核心问题。
- `promisedReward`：本章必须让读者实际得到的进展、揭示、爽感、关系变化或情绪回报。
- `rewardLevel`：本章是铺设回报、部分兑现还是重大兑现，由 AI 根据卷节奏和章节职责判断。
- `protagonistWant`：主角本章主动争取的即时目标。
- `primaryResistance`：直接阻止主角的具体人、局面、规则或代价。
- `keyTurn`：本章中段或后段必须发生的方向变化。
- `emotionalShift`：读者和核心角色从何种情绪状态转向何种状态。
- `informationReveal`：本章允许交付的关键信息，不等同于强制大反转。
- `netChange`：章末相对章初不可忽略的局面变化。
- `inheritedHookResponsibilities`：上一章或短弧钩子在本章必须回应、触达或部分兑现的责任。
- `endingHook`：本章结束时把读者推向的下一关注点，不允许只制造新问题而不支付旧问题。

### Scene Experience Fields

场景卡在原有 `purpose / entryState / exitState / mustAdvance` 基础上补充：

```ts
interface ChapterSceneExperience {
  resistance: string;
  turn: string;
  emotionalShift: string;
  readerValue: string;
}
```

这些字段分别说明场景阻力、转折、情绪位移和读者获得的有效内容，避免场景只承担信息搬运或过渡。

## 数据流

```text
Book Contract + 卷战略 + 节奏段 + 相邻章节
  -> AI 章节执行合同
  -> ReaderExperienceContract + Scene Cards
  -> 现有 sceneCards JSON 持久化
  -> GenerationContextAssembler
  -> chapterWriteContext.readerExperience
  -> writer / acceptance / repair 共用 reader_experience context block
```

### 持久化决策

第一阶段不增加数据库列。`ReaderExperienceContract` 作为 `ChapterScenePlan` 顶层字段，与场景卡一起序列化到现有 `sceneCards` JSON。

原因：

- 它与章节执行合同同生命周期、同生成入口、同版本更新。
- 不引入双写，也不需要数据迁移。
- 旧章节仍可被现有解析器读取。
- 后续如果读者体验合同需要独立版本和人工编辑，再根据真实使用情况升级为独立持久化模型。

## Book Contract 下沉规则

写章上下文补充以下完整字段：

- `readingPromise`
- `protagonistFantasy`
- `coreSellingPoint`
- `chapter3Payoff`
- `chapter10Payoff`
- `chapter30Payoff`
- `escalationLadder`
- `relationshipMainline`
- `activeMilestonePayoffs`

`activeMilestonePayoffs` 是对显式 3/10/30 章合同的确定性投影：第 1-3 章关注第 3 章兑现，第 4-10 章关注第 10 章兑现，第 11-30 章关注第 30 章兑现。它不是关键词判断，也不替代 AI 规划。

## 卷级回报下沉规则

`VolumeWindowContext` 增加：

- `readerRewardLadder`：全书卷级回报梯度。
- `coreReward`：当前卷必须交付的核心读者回报。

章节细化 Prompt 已读取卷战略；运行时继续从当前卷所属的版本文档恢复这两个字段，保证正文和修复阶段仍然可见。

## 连续性职责边界

第一阶段采用以下稳定边界：

- Novel Fact Ledger：已发生、不可逆、已验收的事实；负责防止重复追求和事实回滚。
- Payoff Ledger：长期承诺、伏笔、应兑现窗口和兑现状态。
- Reader Experience Contract：当前章的读者问题、回报、主角驱动、转折、净变化及钩子承接责任。
- Timeline：保留前端事件展示、异步抽取和诊断价值；不再作为正文 Prompt 的 required context。

正文生成只读取统一后的事实、伏笔、章节义务和读者体验合同，不再要求一个实际为空的 `timeline_context` 或 `previous_chapter_hook` 占位块。

## 兼容策略

### 旧章节

旧 `sceneCards` 不包含读者体验合同或场景体验字段时：

- 解析器使用空合同保持可读，不让恢复链或旧运行包崩溃。
- 运行时根据现有 chapter mission、章节 expectation、边界合同、伏笔指令和 hookTarget 生成兼容投影。
- 兼容投影只用于旧资产，不取代新章节由 AI 生成结构化合同。

### 旧运行包和缓存

新增字段使用默认值，旧缓存反序列化仍可通过。Prompt Context 只在合同具有内容时渲染；新生成章节必须通过结构化输出 schema 返回完整合同。

## Prompt 与 AI-first 规则

- 新能力通过现有注册 Prompt Asset 的 output schema 扩展实现。
- 不增加关键词匹配、正则意图路由或硬编码题材分支。
- AI 负责理解本章应给出的读者回报、转折、情绪位移和钩子责任。
- 确定性代码只做 schema 校验、旧资产兼容、显式章节窗口投影和上下文装配。

## 实施拆分

### 1A：共享合同与章节细化

- 新增读者体验领域 schema。
- 扩展 ChapterScenePlan 和新生成场景卡 schema。
- 扩展章节执行合同 Prompt 与序列化链路。

### 1B：运行时上下文下沉

- 扩展 BookContractContext。
- 恢复持久化 Book Contract 的完整字段。
- 恢复卷战略读者回报字段。
- 构建 `reader_experience` context block。

### 1C：写作、验收与修复消费

- writer 将 `reader_experience` 设为 required。
- acceptance 检查合同是否形成可见回报、主动性、转折和净变化。
- repair / patch repair 保留已经兑现的读者价值，并定向修复合同缺口。

### 1D：连续性收敛

- 从正文 Prompt required contract 移除停用的 timeline blocks。
- 更新 Wiki，明确事实、伏笔、读者体验与 Timeline 的所有权。

## 验收标准

### 合同完整性

- 新生成章节执行合同必须包含完整 `ReaderExperienceContract`。
- 新生成场景卡必须包含阻力、转折、情绪位移和读者价值。
- 旧章节执行合同仍可解析并进入写章链路。

### 上下文完整性

- writer 能看到完整 Book Contract、当前阶段兑现和卷级核心回报。
- writer、acceptance、repair 读取同一 `reader_experience` block。
- 正文 Prompt 不再声明实际未构建的 timeline required blocks。

### 行为边界

- 普通读者体验缺口不得自动升级为全局 `replan_required`。
- 第一阶段不产生破坏性数据库操作。
- 不增加平行 Prompt 入口或未注册业务 Prompt。

### 验证

- shared build / typecheck。
- server targeted typecheck。
- 章节分层上下文、结构化输出标准化、生成上下文装配相关测试。
- 文档与 Git diff 检查。

## 后续阶段

第二阶段将处理 Book Contract 3/10/30 章承诺到 Payoff Ledger 的自动建账、钩子兑现窗口和连续只铺垫不回报检测。

第三阶段将增加独立的读者体验评分、证据化 Rewrite Directive 和按读者影响排序的质量债。

第四阶段将建立 AI 驱动的全书收束状态与完本检查。

## 实施状态

- [x] 第一阶段边界与领域合同确认
- [x] 1A 共享合同与章节细化
- [x] 1B 运行时上下文下沉
- [x] 1C 写作、验收与修复消费
- [x] 1D 连续性收敛
- [x] 针对性验证
