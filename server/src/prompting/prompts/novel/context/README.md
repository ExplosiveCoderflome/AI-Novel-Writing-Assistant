# 章节 Prompt 上下文模块边界

## Background

章节规划、正文生成、验收与修复需要共享同一份运行时合同，但合同构建、历史兼容与 Prompt 文本渲染属于不同责任。将它们堆叠在单一文件中会扩大修改影响面，也容易让旧运行包兼容逻辑与具体 Prompt 表达互相污染。

## Decision

- `chapterLayeredContext.ts` 是稳定门面，负责构建书级、卷级和章节级合同，并保留外部兼容导出。
- `chapterContextPolicies.ts` 负责旧运行包归一化、默认值投影和写作所需角色硬事实筛选。
- `chapterContextBlocks.ts` 只负责把结构化章节合同渲染成 writer、review、repair 可消费的上下文块。

## Current Rule

1. 新的读者体验、章节义务或连续性能力先进入共享结构化合同，再由上下文块渲染层消费。
2. 历史兼容只放在策略层，不能在各个 Prompt 渲染函数中重复添加分支。
3. 外部模块从 `chapterLayeredContext.ts` 门面导入，不深度依赖 `context/` 内部文件。
4. 普通章节读感问题只能形成本章修复建议或质量债；只有结构化决策明确要求重规划时，才允许影响全局执行链。

## Failure Modes

- writer、review、repair 分别拼装不同版本的章节目标，导致验收和修复偏离正文任务。
- 在渲染层临时猜测缺失字段，使历史兼容规则无法统一测试。
- 将 Timeline、Fact Ledger、Payoff Ledger 与读者体验合同混为同一责任，造成上下文重复和错误质量告警。

## 复用范围

文风合同以结构化来源声明 book；场景、角色事实、资源、义务和近期状态缺省 request。布局在预算取舍之后进行，同层保持声明顺序，不能为提高命中冻结任何内容或复制全书上下文。参考 core/cache 的边界规则。
