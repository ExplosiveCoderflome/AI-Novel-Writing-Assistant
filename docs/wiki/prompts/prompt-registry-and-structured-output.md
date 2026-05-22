# Prompt Registry 与结构化输出

## 背景

项目是 AI-native 小说生产系统。意图识别、任务分类、规划、路由、工具选择、质量判断和修复建议都应依赖 AI 的结构化理解，而不是关键词和硬编码分支。

历史上，产品级 prompt 容易散落在 service 里，伴随本地 `JSON.parse`、try/catch 修复和局部 normalization。这样会让结构化输出、repair、语义重试、上下文要求和治理元数据无法统一审计。

## 决策

`server/src/prompting/` 是新增产品级 prompt 的唯一治理入口。产品级 prompt 必须作为 `PromptAsset` 注册，并通过统一 runner 执行。结构化输出使用 schema、JSON repair 和 semantic retry 处理；确定性代码只做输入校验、安全边界和已结构化输出后的处理。

## 当前规则

- 新增产品级 prompt 必须放在 `server/src/prompting/prompts/<family>/`。
- 新增产品级 prompt 必须在 `server/src/prompting/registry.ts` 注册。
- `PromptAsset` 必须提供 `id`、`version`、`taskType`、`mode`、`language`、`contextPolicy`、`render()`，结构化 prompt 还必须有 `outputSchema` 或等价校验。
- 结构化输出使用 `runStructuredPrompt`，纯文本使用 `runTextPrompt`，流式能力使用对应 stream runner。
- JSON 解析、schema 校验失败由 repair policy 处理；JSON 合法但业务语义不合格由 semantic retry 处理。
- 章节列表、卷级拆章这类规划 prompt 可以在结构化输出后增加轻量业务质量闸门，用于拦截空泛摘要、连续被动推进、第一人称长句章名、缺少主角主动行动或缺少阶段兑现 / 钩子的章节段。质量闸门只负责指出结构化结果的问题并触发重试，不能替代 AI 做章节规划，也不能用关键词分支生成章节内容。
- Prompt 中展示给模型的状态名、枚举名和示例必须与 schema 可接受值一致。上下文里如果存在历史别名或业务口语值，例如 `active` 表示已推进但未兑现，应在 prompt 明确转换规则，并在 schema preprocess 中做确定性归一，不能把同一类别名反复交给 LLM repair。
- 结构化输出后的确定性归一只用于字段别名、枚举别名和兼容旧形状，例如把 `pacing` 映射为接收闸门的 `plot`、把 payoff `active` 映射为 `pending_payoff`、把字符串风险转成 `{ code, severity, summary }` 对象。不能用这种归一替代 AI 对剧情事实、风险等级或下一步动作的判断。
- editable slots 只能开放低风险表达层内容，不能覆盖 schema、postValidate、taskType、mode、contextPolicy、工具目录、审批边界或 required context。
- 旧未纳管 prompt 路径被触碰时，默认先迁入 registry，再扩展能力。

批准例外：

- `server/src/llm/structuredInvoke.ts` 内部 JSON repair。
- `server/src/llm/connectivity.ts` 这类连通性探针。
- 阶段性保留的 stream bridge，例如 `graphs/*`、`routes/chat.ts`、`services/novel/runtime/*`。

## 示例

推荐做法：

- 新增章节接收闸门时，先定义结构化输出 schema，再注册 `PromptAsset`，最后由服务消费结构化结果。
- 新增意图识别能力时，扩展 AI schema 和工具合同，不加关键词 fallback。
- Prompt Workbench 预览只读返回 messages、上下文块、缺失 required groups 和 trace preview，不保存运行时 override。

禁止做法：

- 在 service 内直接拼 `systemPrompt/userPrompt` 后调用裸 LLM。
- 在业务文件里新增一套本地 JSON 修复和 schema 分支。
- 让 Prompt Override 直接替换整段系统提示词或结构化输出 schema。

## 失败模式

- 模型返回 JSON 不稳定：先检查 schema、provider JSON 能力和 repair policy，不在业务 service 里补局部解析。
- 同一 prompt 频繁进入 JSON repair：检查日志里的原始字段值是否来自上下文或示例中的非 schema 值。如果模型只是复用了 prompt 中出现的别名，应先修 prompt/schema 合同；如果输出语义完整但字段名是常见别名，应在 PromptAsset schema 层归一，而不是让后台任务无限重试。
- Prompt Catalog 缺上下文预览：补 `contextRequirements`，不要让预览临时查数据库。
- 意图识别漏判：修 PromptAsset、输入上下文、schema 或工具目录，不加关键词路由。

## 相关模块

- `server/src/prompting/`
- `server/src/prompting/core/promptRunner.ts`
- `server/src/prompting/registry.ts`
- `server/src/llm/structuredInvoke.ts`
- `server/src/llm/capabilities.ts`
- `server/src/agents/`
- `server/src/creativeHub/`

## 来源文档

- [Prompting Registry](../../../server/src/prompting/README.md)
- [Prompt Governance Audit 2026-05-08](../../checkpoints/prompt-governance-audit-2026-05-08.md)
- [提示词工作台、上下文装配与统一步骤运行时方案](../../plans/prompt-workbench-context-and-step-runtime-plan.md)
- [LLM Schema Refactor Checkpoint](../../checkpoints/llm-schema-refactor-checkpoint.md)
