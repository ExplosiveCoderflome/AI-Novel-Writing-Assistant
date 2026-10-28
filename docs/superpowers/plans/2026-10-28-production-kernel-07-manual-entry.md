# 正文生产内核 · 计划07：手动入口 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在当前会话逐项执行；未经用户逐次授权不委派子代理。

**Goal:** V2 长篇的手动写章、修章、重新审校复用正文内核，V1 请求继续原入口。

**Architecture:** 应用层在旧小说路由前安装兼容入口，按数据库中的作品版本分流。新手动作业通过既有导演命令、任务表、worker 和租约执行独立的单章计划；复用原生内核及其模型配置、预算、选稿和事务保存，不借用已结束的自动任务，也不另建执行表。手动审校使用同一长篇配置并关闭自动修补，显式修章仍遵守统一问题策略。

**Tech Stack:** TypeScript、Express、Prisma、Node test、临时 SQLite。

**Spec:** `docs/superpowers/specs/2026-10-22-production-kernel-design.md`；`2026-10-22-production-kernel-03-08-task-level.md` 计划07。

## Global Constraints

- 用户已指定继续当前恢复修复分支；保留现有短篇及回填改动，不新建工作树、不提交或推送。
- 冻结目录零修改；内核不得导入导演模块；应用层承担任务装配。
- 路由只看持久 `Novel.directorVersion`；复用现有默认关闭的 `PRODUCTION_KERNEL_V2_CHAPTERS` 进行灰度，不改变设置。已打开的手动内核作业恢复不受之后的开关变化影响。
- 运行记录只读，所有变更从正文来源页发起。继续使用导演台已有的恢复入口。
- 不新增表、依赖或 Prompt；不连接业务库，数据库测试仅临时 SQLite，加入 integrationTests。
- 新内核文件不超过400行，同层不超过12个 TS 文件。只为实际并发、版本与付费请求边界保留保护。
- 06仍由原短篇任务收口；08须05/06/07在beta稳定且开关默认打开一个发布周期，不在本次提前删除。

### Task 1：手动契约与原生内核复用

**Files:**
- Create: `server/src/app/director/productionKernel/manual/contract.ts`
- Modify: `server/src/app/director/productionKernel/composition/runtime.ts`、`composition/stages.ts`、`composition/preparation.ts`
- Test: `server/tests/production/application/manualKernelContract.test.js`

**Interfaces:**
- `readManualChapterRequest(contract: RunContract): ManualChapterRequest | undefined`：读取已保存手动操作，核对单章身份和计划版本。
- `configureManualChapterProfile(profile: ProductionProfile, operation?: ManualChapterOperation): ProductionProfile`：审校保留接收与选稿规则，repair为detect_only/0；写章、修章沿用长篇配置。
- `ManualChapterRequest` 保存 operation、chapterId、正文基线和原生请求选项，模型与任务归属仍由运行快照决定。

- [x] 编写契约、请求参数不能改变作品归属、审校不修稿及原配置不被修改的失败测试，运行 `node --test tests/production/application/manualKernelContract.test.js`。
- [x] 实现上述类型和纯函数；原生准备/commit 的 purpose 仅在合法手动契约时为 `user_requested`，允许显式处理人工正文，仍保留正文CAS。
- [x] 重跑测试并检查自动模式配置不变。

### Task 2：持久任务与来源入口

**Files:**
- Create: `server/src/app/director/productionKernel/manual/entry.ts`、`manual/http.ts`、`manual/README.md`
- Modify: `server/src/modules/director/bootstrap.ts`、`server/src/app/director/productionComposition.ts`、`server/src/app/director/productionKernel/batch/step.ts`、`server/src/app.ts`
- Test: `server/tests/production/application/manualKernelEntry.test.js`

**Interfaces:**
- 导演服务选项增加 `additionalPlans?: readonly PlanDefinition[]`，注册 `production-kernel-manual@1`（novel_seed → chapter_batch）。旧计划的版本、依赖与自动范围不变。
- `createManualChapterEntry({db, services, enabled})` 读取作品和章节，创建单章手动契约；写章要求空正文，修章/审校要求已保存正文。存在其他活动任务时复用既有冲突规则。
- `createManualChapterRouter(...)` 保留 generate/runtime/run/repair 的SSE协议以及 review/audit 的JSON结构；只有选中并保存的正文可作为最终结果返回。V1及关闭开关的全新请求交回旧路由。

- [x] 写入口分流、单章范围、编辑后审校、请求不能伪造版本以及V1原调用回归测试，看到行为失败。
- [x] 新计划通过既有命令和worker领取真实租约，模型与进度持久化复用已有实现；手动契约强制绑定kernel，不在错误后退回旧执行器。
- [x] 应用根安装带鉴权和原Schema校验的兼容路由；审校完整执行但不生成新正文，报告只对应保存的正文。请求中未保存的内容不同则返回来源页保存提示。
- [x] 构建服务并运行定向入口测试。

### Task 3：临时库完整链与交接

**Files:**
- Create: `server/tests/production/manualKernelSqlite.test.js`
- Modify: `server/scripts/run-tests.cjs`、`server/src/modules/production/README.md`、`server/src/app/director/productionKernel/README.md`、路线图
- Create: `docs/superpowers/reports/production-kernel/07-2026-10-28.md`

- [x] 基于现有 SQLite 夹具，用真实进度仓储、原生适配器和替身模型传输跑“写章→修章→通过原编辑服务保存→重新审校”；断言审校不改正文、候选复验后才保存、报告哈希对应最后正文。
- [x] 覆盖并发编辑拒写、重入不重复付费、V1旧入口和开关恢复；所有数据库测试加入integrationTests。
- [x] 运行 `pnpm --filter @ai-novel/server build`、新增测试及受影响production/directorNext定向回归；运行代码政策、文档检查、diff及冻结检查。
- [x] 更新稳定模块边界、报告、中央记录与本地实际文件清单。未验证的真实模型、PostgreSQL和beta发布明确保留，不冒称整个项目全绿。

不执行阶段提交；遵守本地提交时间例外与用户当前授权。

执行完成：验证与边界见 ../reports/production-kernel/07-2026-10-28.md。额外修正 readModel/completion 的手动作业归属与 prompts/stageServices 的原生复验基线；临时库夹具包含真实worker与跨进程重读。
