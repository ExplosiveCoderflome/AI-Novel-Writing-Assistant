# 章节运行时 Schema 边界

`chapterRuntime.ts` 是对外兼容门面和跨域运行包装配合同。本目录按稳定领域拆分可独立维护的 Schema：

- `styleSchemas.ts`：写作风格合同与运行时样式上下文。
- `dynamicCharacterSchemas.ts`：动态角色、关系阶段、阵营轨迹与出场风险。
- `payoffSchemas.ts`：Payoff 账本运行时投影。
- `qualitySchemas.ts`：审计、接收、样式审查和长度控制结果。

外部模块应继续从 `@ai-novel/shared/types/chapterRuntime` 导入，不应依赖本目录内部文件。子模块只能持有纯 Zod Schema 和推导类型，不得引入数据库、服务单例或运行编排。
