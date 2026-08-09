# Prompting Registry

`server/src/prompting/` 是本项目产品级 prompt 的唯一新增管理入口。

## Hard Rules

- 新增产品级 prompt 必须定义为 `PromptAsset`。
- 新增产品级 prompt 必须放在 `server/src/prompting/prompts/<family>/` 下。
- 新增产品级 prompt 必须在 `server/src/prompting/registry.ts` 注册。
- 新增产品级 prompt 必须进入提示词管理目录，并支持目录检索、版本查看、上下文预览和受控测试；只注册运行时资产不算完成纳管。
- 新增业务能力不得在 service 内直接拼 `systemPrompt/userPrompt` 后调用 `invokeStructuredLlm`。
- 新增业务能力不得在 service 内直接使用裸 `getLLM()` 发起产品级 prompt 调用。
- 修改到旧的未纳管 prompt 业务链路时，默认一并迁入 registry，而不是继续在原文件扩写。

## Allowed Exceptions

- `server/src/llm/structuredInvoke.ts` 内部 JSON repair prompt。
- `server/src/llm/connectivity.ts` 这类探活/连通性探针。
- 二期范围内的 `graphs/*`、`routes/chat.ts`、`services/novel/runtime/*`、以及其他流式桥接代码。

## Asset Checklist

新增 prompt 时必须同时提供：

- `id`
- `version`
- `taskType`
- `mode`
- `language`
- `contextPolicy`
- `outputSchema` 或 text 模式的 `postValidate`
- `render()`

可选但推荐同时评估：

- `repairPolicy`：控制结构化 JSON/schema repair 次数
- `semanticRetryPolicy`：控制 `postValidate` 失败后的统一语义重试次数

正文生成 Prompt 还必须提供：

- 安全的基础编辑 slots，用于调整语气、节奏、段落、对话、描写、钩子和禁用倾向；
- 高级 System / Human 模板编辑能力，支持作品范围、上下文 token、预览、测试、版本、回滚和恢复官方模板；
- required context 保护，确保角色硬事实、任务、连续性、世界规则、平台写法和风格合同不能被模板静默移除；
- PromptAsset / catalog 能力声明，禁止在前端通过固定 Prompt ID 决定是否支持高级编辑。

`PromptAsset.management` 是提示词管理能力的可信声明：

- `productPrompt` 表示该资产必须进入目录、预览和受控测试；
- `proseGeneration` 表示它属于小说正文治理门禁；
- `editModes` 声明 `readonly`、`slots`、`advanced_template`，前端只能按该能力渲染；
- `advancedTemplate.requiredContextGroups` 定义高级模板不能静默移除的正式上下文。

结构化正文 Prompt 使用高级模板时，自定义模板先编译，结构化输出提示随后由运行时追加，最终输出仍必须通过注册资产的 Schema。用户模板不能覆盖或删除 Schema、repair、postValidate 和输出字段合同。

## Naming

- 使用 `family.capability` 风格的 `id`
- `version` 使用 `v1`、`v2`
- 示例：
  - `audit.chapter.full@v2`
  - `world.structure.generate@v1`
  - `style.recommendation@v1`

## Runner Usage

- 结构化输出使用 `runStructuredPrompt`
- 纯文本输出使用 `runTextPrompt`
- 流式文本输出使用 `streamTextPrompt`
- 流式结构化输出使用 `streamStructuredPrompt`
- 调用方继续保留原 service 的 public method、数据库写入和返回 shape

说明：

- `repairPolicy` 负责 JSON 解析 / schema 校验失败后的 repair
- `semanticRetryPolicy` 负责 JSON 已合法但 `postValidate` 未通过时的再生成

## Migration Default

- 如果一个 prompt 还没有资产化，不要在原 service 里继续加分支。
- 先创建资产，再把 service 切到 registry + runner。
