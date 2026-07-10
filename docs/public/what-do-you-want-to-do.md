# 我想做什么

这页是面向第一次使用者和维护者的公开文档入口。你可以按当前目标直接进入对应文档，不需要先理解所有模块。

## 我想快速开始

| 目标 | 入口 |
| --- | --- |
| 了解项目是什么 | [项目介绍](./introduction.md) |
| 安装和准备环境 | [安装与准备](./installation.md) |
| 跑起本地开发环境 | [README 快速开始](../../README.md#快速开始) |
| 查看常见问题 | [常见问题](./faq.md) |
| 排查启动、连接或任务失败 | [故障排查](./troubleshooting.md) |

## 我想写第一本小说

| 目标 | 入口 |
| --- | --- |
| 从一句灵感开始 | [第一本小说实操路径](./playbook/first-novel-walkthrough.md) |
| 理解整本生产主链 | [端到端生产链](./flow/end-to-end-production.md) |
| 理解自动导演每个阶段 | [自动导演阶段全景](./flow/auto-director-pipeline.md) |
| 逐章推进正文 | [章节执行链](./flow/chapter-execution.md) |
| 失败后按阶段恢复 | [按阶段恢复手册](./playbook/recovery-by-phase.md) |

## 我想配置能力

| 目标 | 入口 |
| --- | --- |
| 配置模型供应商和路由 | [模型路由](./modules/model-routing.md) |
| 配置知识库和 RAG | [知识与 RAG](./flow/knowledge-and-rag.md) |
| 管理写法和反 AI 规则 | [写法引擎](./modules/style-engine.md) |
| 管理题材、流派和世界样本 | [类型管理](./modules/genre-base-library.md) / [流派管理](./modules/progression-mode-library.md) / [世界样本库](./modules/world-sample-library.md) |
| 查看任务排队和失败状态 | [任务中心](./modules/task-center.md) |

## 我想了解宫寒个人版和贡献规则

| 目标 | 入口 |
| --- | --- |
| 了解宫寒个人版定位 | [宫寒个人版说明](./gonghan-personal-edition.md) |
| 查看文档目录约定 | [docs 管理约定](../README.md) |
| 查看贡献协议和披露要求 | [CONTRIBUTING](../../CONTRIBUTING.md) |
| 查看许可证和归属 | [LICENSE](../../LICENSE) / [NOTICE](../../NOTICE) / [FORK_NOTICE](../../FORK_NOTICE.md) |

## PR 前检查

提交 PR 前建议确认：

- README 或公开文档是否需要同步更新。
- 是否包含 AI 辅助生成或整理的内容，并在 PR 中说明使用范围。
- 是否包含第三方代码、素材、数据、模型权重、模型输出或其他受许可证约束内容，并补充来源、许可证和必要归属信息。
- 是否已经运行与本次修改相关的验证命令，或说明无法验证的原因。
