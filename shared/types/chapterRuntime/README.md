# 章节运行时 Schema 边界

`chapterRuntime.ts` 是对外兼容门面和跨域运行包装配合同。本目录按稳定领域拆分可独立维护的 Schema：

- `styleSchemas.ts`：写作风格合同与运行时样式上下文。
- `dynamicCharacterSchemas.ts`：动态角色、关系阶段、阵营轨迹与出场风险。
- `payoffSchemas.ts`：Payoff 账本运行时投影。
- `qualitySchemas.ts`：审计、接收、样式审查和长度控制结果。

外部模块应继续从 `@ai-novel/shared/types/chapterRuntime` 导入，不应依赖本目录内部文件。子模块只能持有纯 Zod Schema 和推导类型，不得引入数据库、服务单例或运行编排。

章节上下文中的 `postGenerationStyleReviewEnabled` 是书级检测开关快照，旧上下文缺少该字段时沿用开启默认。有效写法合同的 `meta.antiAiRulePolicies` 携带规则身份和自动修文权限；它属于可验证的执行配置，不能用正文关键词判断替代。正文接收、检测报告和缓存身份应消费同一快照。检测报告复用统一验收的证据，局部修文与章节终态仍由生产运行时拥有。
