# GitHub Pages 公开介绍站

## Background

项目的 README 已经承载了完整功能说明、开发记录、运行方式和截图，但它更适合已经进入仓库的读者。公开传播入口需要在更短时间内说明三件事：这个项目解决什么问题、长篇小说生产链怎样推进、访问者下一步应该下载桌面版还是查看源码。

因此公开介绍站应作为独立站点维护，而不是把主客户端首页或 README 直接拿来部署。

## Decision

- 公开介绍站放在 `site/` workspace，使用 React + Vite 构建为纯静态产物。
- 站点只依赖已有产品截图和公开下载 / 仓库链接，不连接后端，不读取本地用户数据。
- GitHub Pages 部署由 `.github/workflows/site-pages.yml` 负责，推送到 `main` 或手动触发时构建 `@ai-novel/site` 并发布 `site/dist`。
- 站点视觉内容优先使用真实产品截图和项目社交预览图，避免用抽象插画替代产品界面。
- 站点设计方向定义在 `site/DESIGN.md`，采用“文学编辑部 + AI 控制台”的表达：暖纸面承载创作叙事，暗色控制台承载产品可信度。
- 文档展示采用白名单 manifest，公开入口只展示面向使用者和潜在用户的文档，不自动暴露整个 `docs/` 目录。

## Current Rule

介绍站的主要读者是第一次看到项目的人，文案应从用户视角解释：

- AI 小说创作工作台如何帮助新手从一句灵感推进到整本小说。
- 自动导演、世界 / 角色准备、卷级拆章、章节执行和质量修复之间的关系。
- 开发者为什么可以从这个项目研究 AI Native Product、Agent Workflow 和长篇生产链。
- 下载桌面版与查看源码的入口。

站点不应承担内部架构 wiki、执行计划或检查点浏览器职责。详细开发说明仍保留在 README 和 docs 中。

公开文档入口只展示以下来源：

- `docs/public/basic-introduction.md`：项目是什么、适合谁、核心能力和下载入口。
- `docs/public/advanced-introduction.md`：AI Native 长篇生产链、自动导演、RAG、写法引擎和本地运行等公开解释。
- `docs/public/usage-guide.md`：面向第一次使用者的安装、配置模型、创建小说和跑通主链指南。
- `docs/public/modules/`：与应用侧栏一致的模块介绍，每个侧栏模块至少有一个用户向入口说明页。
- `docs/public/development-roadmap.md`：公开路线图，只写高层产品方向。
- `docs/releases/release-notes.md`：用户可见更新日志。

公开文档入口不应默认展示：

- `docs/wiki/` 内部产品原则、工作流边界、架构规则、Prompt / RAG 维护规则。
- `docs/archive/` 历史归档。
- `docs/checkpoints/` 阶段检查点。
- `docs/plans/` 执行计划。
- `TASK.md`、临时任务清单和未整理检查项。

这个边界的原因是：公开站读者通常想快速判断项目是否值得使用或关注，而内部 wiki 面向维护者和 AI agent，包含大量架构约束、失败模式和开发治理规则。两类内容混在同一个入口里，会增加新用户理解成本，也会让内部维护文档承担不适合的传播职责。

## Design Rule

公开介绍站不使用通用 SaaS 卡片堆叠作为主要表达。首屏必须直接说明“从一句灵感到一整本小说”，并用真实界面作为产品证据。页面结构应优先围绕长篇生产链展开：方向、世界 / 角色、拆章、正文、修复。功能能力可以出现，但必须服务这条主线。

视觉上，站点应保持两种气质的平衡：

- 文学编辑感：serif 标题、瓷白纸面、克制线条、低噪声排版。
- AI 控制台感：暗色产品区、真实截图、状态与模块化能力说明。

新增站点页面或视觉改动时，应先检查 `site/DESIGN.md`，避免把站点改回普通营销页。

## Related Modules

- `site/`：公开介绍站源码与本地构建说明。
- `.github/workflows/site-pages.yml`：GitHub Pages 静态部署流程。
- `images/`：产品截图与 GitHub 社交预览图的源资产。
- `site/src/docsManifest.ts`：公开文档白名单。
- `site/src/DocsPage.tsx`：文档索引与 Markdown 阅读页。
- `docs/releases/release-notes.md`：用户可见发布记录。
