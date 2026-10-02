# 新导演生产适配的业务边界

## Background

新导演负责授权范围、运行控制、依赖与产物台账；小说业务服务负责生成与内容保存。把旧导演阶段当作业务服务复用，会引入第二套暂停、恢复和进度控制，使运行事实无法保持单一来源。

## Decision

步骤处理器使用模块内部定义的服务端口，由外部装配注入实际业务服务。处理器不导入旧导演阶段、运行时或编排器，也不引入产品提示词。结构化生成仍使用现有 Prompt Registry。

## Current Rule

- 输入读取器接收 `StepContext`，以当前 Run 的持久化输入解析故事想法和模型选项。不得在恢复时重新读取可变的书级模型默认值。
- `story_macro` 将模型提供商、模型和温度原样交给故事宏观服务。输入快照初始化尚未完成时，不应注册到默认 Worker。
- 返回产物引用的前提是业务服务完成保存；步骤不能自行写控制状态，台账由执行器统一记录。
- `world_setup` 通过现有世界网关读取或生成；已有世界不重新生成，缺少作者来源时保守保护。只有取得保存的世界切片才落账。显式跳过世界需要独立持久化合同，不能通过空世界伪造完成。
- 桩测试验证适配协议；真实业务服务的类型兼容检查验证接口可接入；两者都不能代替真实 AI、数据库和完整生产联调。

## Related Modules

- `server/src/modules/director/steps/`
- `server/src/modules/director/application/runExecutor.ts`
- `docs/superpowers/plans/2026-09-30-director-rebuild-05-step-adapters.md`
