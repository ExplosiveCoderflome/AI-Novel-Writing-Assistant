# 章节执行合同细化边界

## 职责

本目录负责卷规划进入单章生产前的最后一层结构化细化：章节目的、边界、任务单、读者体验合同与场景卡 Schema，以及对应的 AI 生成和质量门禁调用。

## 依赖规则

- Prompt 资产可以通过 `volumeGenerationSchemas.ts` 的兼容导出取得 Schema；Schema 文件不得反向加载 Prompt 或生成服务，避免模块初始化循环。
- AI 生成只通过 Prompt Registry 资产与 `runStructuredPrompt` 进入，不允许在服务内新增内联业务 Prompt。
- `volumeGenerationHelpers.ts` 是兼容门面；外部调用方不应深层导入本目录内部文件。
- 已有任务单和场景卡在无新 guidance 时继续复用；质量门禁、读者体验字段和场景体验字段不得在兼容层放宽。
