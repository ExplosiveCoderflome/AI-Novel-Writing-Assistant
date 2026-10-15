# 章节修订同步：独立发布范围检查

## 基线与结论

- 对应 [Issue #185](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/issues/185)：手动编辑后无法继续导演，以及 AI 推荐修改采纳时保存冲突。
- 基线为发布标签 `v0.5.10`，提交 `e4420c4b7010bb456baaeaf49dcf611c5dd9ef38`。开发分支为 `codex/fix-chapter-edit-sync`，使用独立工作树，未混入 `codex/prompt-workbench-clarity` 的提示词工作台等功能。
- 修复已完成代码级验证，版本候选 `1947441e` 已快进合入本地 `beta` 并通过下述集成检查。界面、真实模型与正式发行包验收尚未执行，不能将本报告视为发布成功证明。
- 发布目标为 `desktop/package.json` 的 `0.5.11`，正式标签必须为 `v0.5.11`。发布准备时已重新拉取远端，`origin/main` 与 `origin/beta` 均为上述 `v0.5.10` 基线，修复提交为 `66fc3894`；不存在混入其他候选功能的分支差异。
- GitHub 正式打包工作流为 `Desktop Release`（`.github/workflows/desktop-release.yml`），由匹配版本的 tag 推送触发。版本准备阶段尚未触发；正式安装包、自动更新文件与 GitHub Release 上传由该工作流执行。

## 根因与处理范围

| 问题 | 原因 | 修复边界 |
| --- | --- | --- |
| 普通保存或采纳候选误报冲突 | 后台摘要更新也改变 chapter.updatedAt | 仅正文请求比较最近保存原文，并使用数据库条件写入；混合字段与旧客户端保留时间版本保护 |
| 正文已写入却返回保存失败 | 正文提交后仍等待派生资料写入 | 正文与持久同步任务同事务提交，资料同步失败通过任务重试 |
| 修改后继续反复报资料未同步 | 旧正文完成记录失效；手动路径缺少 V2 策略和持久恢复责任 | 当前修订使用 V2 运行/模型快照与既有结构化消费者；继续前等待同步，兼容旧版本已完成章节 |
| 修订正文可能重进生成流程 | 未闭合章节被当作待生成正文；部分恢复只认旧审校结果 | 有手动修订证明时只重查现有正文，兼容审校结果版本 2/3，保留原 Token 与自动重试记录 |
| 快速编辑、重试或改回旧正文错误复用记录 | 单纯正文 hash 无法区分 A → B → A | 章节租约串行执行、独立 revision/执行证明、旧任务拒绝、失败消费者恢复 |
| 等待确认阶段仍被同步问题卡住 | 短门控事务内只校验旧完成记录 | AI 同步在事务前执行，事务内重新核对与锁定正文；真实修订登记为受保护结果 |

涉及章节编辑、手动章节 CRUD、既有 side-effect worker、章节资产同步、生产恢复及正文阶段确认。没有修改数据库 schema / migrations、依赖锁文件、桌面构建/发布脚本、Prompt 资产、共享 Prompt Schema、世界观或分卷规划算法。新增能力复用现有结构化抽取与验收 Prompt，没有关键词决策或新的模型提示词。

V1 的摘要、事实与人物时间线兼容处理移入持久任务；V2 保持人物身份确认、运行归属及 epoch 限制。资料同步不会推进导演、清除人工恢复锁或重写正文。局部质量问题和暂不可用的审校记为质量债，quality-first 的人工暂停保持有效。

## 验证证据

| 检查 | 结果 / 复用理由 |
| --- | --- |
| `pnpm --filter @ai-novel/shared build` | 通过；之后未修改 shared |
| `pnpm --filter @ai-novel/server build` | 最终服务端修改后通过，使用 SQLite Prisma client |
| `pnpm --filter @ai-novel/client typecheck` | 通过；之后未修改客户端实现 |
| 后端范围回归 | 15 个相关文件、90 项通过，覆盖资产恢复、事实写入、人物候选/出场、生产完成、预算、质量暂停、门控/进程恢复、编辑预览和副作用任务 |
| 最后两次针对性回归 | 36 项恢复检查与 15 项门控检查通过，包含新增的完成记录缺失恢复和普通确认保护场景；合计覆盖 92 个不同后端测试用例 |
| `node --experimental-strip-types --test client/tests/directorChapterEditing.test.js` | 23 项组件测试通过，包含正文保存/候选接受的原文保护字段、保存冲突保留候选、问题卡处理与保存中操作保护；之后客户端实现未变 |
| `pnpm check:docs-manifest` | 通过：36 篇公开文档、17 个导演进度键；新增报告和模块说明不属于公开文档注册范围 |
| `git diff --check` | 通过；按仓库既有换行配置检查 |
| beta 代码一致性 | `git diff 66fc3894 HEAD -- server client shared pnpm-lock.yaml .github desktop/src desktop/scripts` 为空；可复用同日上述服务端构建与 92 + 23 项回归结果 |
| beta 桌面前端构建 | `pnpm --filter @ai-novel/client build:desktop` 通过，包含 TypeScript 检查和相对路径静态资源构建，版本注入为 0.5.11；存在 Browserslist 数据较旧与较大 bundle 提示，未影响构建 |
| beta 桌面主进程构建 | `pnpm --filter @ai-novel/desktop build` 通过 |
| beta 启动与迁移检查 | `node --test server/tests/prismaMigrationCompleteness.test.js server/tests/runtimeMigrations.test.js server/tests/desktopDirectorDefaults.test.js`：11 项全部通过；使用内存或新建临时数据库 |
| beta 文档与差异检查 | 公开文档注册检查与相对 `origin/main` 的完整差异空白检查通过 |

SQLite 测试只使用新建临时数据库；模型调用由测试替身提供，未对用户小说执行数据修复或迁移。测试通过真实事务验证：元数据变动可保存、真正的正文冲突被拒绝、并发保存只有一个成功、outbox 写入失败回滚正文、失败消费者重复恢复、跨服务实例继续、旧任务过期、A → B → A、前置章节同步、V1 兼容、V2 暂停回填证明、epoch 拒绝、门控重验及审校期间正文变化。

本机日志保存在 `C:\Users\李皮\AppData\Local\Temp\issue185-release-checks-3c1083db4bd247fb8d7874e5bf0247eb`。主要文件为 `release-targeted-check.log`、`final-recovery-check.log`、`final-gate-check.log`、`client-edit-check.log`、`beta-client-build.log` 和 `beta-desktop-check.log`。

## 发布前人工验收

按项目规则，没有启动浏览器、截图或 Playwright 验收。建议使用备份后的测试作品检查以下来源页流程：

1. V2 暂停时修改已写章节并保存，关闭编辑器后从保存进度继续；确认修改保留、资料同步后从后续章节推进。
2. 点击问题卡 AI 推荐处理，完整采纳并保存；确认不会因后台摘要更新误报冲突，对应问题卡只在保存成功后完成。
3. 半自动模式在正文阶段编辑后确认；如需要人物身份确认，应在导演来源页完成，不能由后台任务跳过。
4. 两个窗口编辑同章，先保存其中一个；另一个窗口应收到真实冲突且草稿/候选仍保留。
5. 同步遇到模型断网后重启应用；正文应仍可读，从保存进度重试后继续，原预算/重试额度和质量优先暂停不可被清空。

未运行完整全仓测试、真实模型调用、PostgreSQL 实例验证或本地桌面打包。beta 的代码级集成检查已完成，真实模型资料质量与发行包行为仍需上述验收。GitHub 正式工作流会在上传前执行完整类型检查、桌面 staging、迁移检查和打包布局检查；未获得工作流完成证据前，只能声称已触发发布。

正式发布按 `beta -> main -> v0.5.11` 推进。本地 beta 与修复分支没有代码集成差异，版本准备只修改版本源与说明，桌面前端构建、桌面 TypeScript 构建和迁移兼容检查已补齐。真实界面与模型验收按项目规则交由用户，不能将代码级验证或打包触发当作其通过证据。版本准备和验证记录没有新增长期架构规则，沿用本修复已更新的 wiki，不另设重复条目；验证记录提交不重复增加用户更新说明。

无需数据库结构迁移，但旧版服务不识别新增的手动同步任务类型；如需回退应用版本，应先确认本版本的同步任务已完成或保留升级后恢复计划，不能把“schema 未变”当作所有后台任务均可向旧版回退的保证。

稳定契约见 [正文章节编辑闭环](../../wiki/workflows/chapter-editor.md)，用户可见说明见 [更新历史](../../releases/release-notes.md)。
