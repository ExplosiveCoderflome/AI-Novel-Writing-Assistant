# A3 Phase 2 交付

分支 `feat/outline-feedback-a3`，Phase 1 基线 `918799df`。已完成桌面正文反馈面板、设置、逐项采纳/拒绝与源修订预览，未启动服务器、浏览器或真实模型。

## UI 与合同

- 绑定小说来源条与大纲工作台标题栏均有“正文反馈回大纲”；深链 `?panel=feedback`。反馈替换右侧 AI 协作面，不占下一章控制，不改变目录/正文编辑/保存区。
- 来源摘要最多3000字符、局部滚动；每项显示分析快照原值、建议值、原因、待确认/已采纳/已拒绝；使用“− 调整前 / ＋ 建议调整后”文字。后续章明确标为任务提议。
- 可多选待确认项后采纳/拒绝；每项采纳创建修订，持久化 revisionId/version，并链接精确只读预览；拒绝不创建修订。部分采纳后剩余项仍可处理。
- 每章（默认）、每 N 章（1–100整数）、每卷、关闭；保存携带既有 provider/model，失败保留选择与就地错误。
- 保护字段可展开；未保存大纲、锁定项、过期建议禁采纳。409 保留建议并提示按摘要重分析。加载、空、失败、重试、待分析均有文字状态。
- 绑定查询提供 feedbackEligible，未绑定/B1/未知资格没有入口且不装配面板；手机不装配 A3 或分析控件。反馈读接口不启动分析。
- 服务端只读投影补 sourceSummary/sourceNodes、baseVersion、stale、canRetry；stale 比较工作版本、策略、摘要、绑定修订、活动章纲与已写后章。采纳仍走事务内权威校验。

## 本地真实数据夹具

脚本 `.tmp/a3-seed.cjs` 使用实际 Prisma SQLite、mapOutlineBook、buildOutlineWorkspace、persistActiveVolumeWorkspace 与 OutlineFeedbackService.enqueue/execute/status。确定性 analyzer 通过服务构造器注入；建议落入真实运行和 A1 提案表，不是截图假数据。没有模型调用。新文件初始化完整 schema；既有数据库只新增专属 fixture IDs，不 reset、不迁移、不清空。重复执行保留 UI 已作决定。

```bash
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node .tmp/a3-seed.cjs
# 或向协调器已完成迁移的 SQLite 追加 fixture：
node .tmp/a3-seed.cjs /absolute/path/to/coordinator.sqlite
```

已实际生成数据库 `/workspace/anw-a3/.tmp/a3-ui.sqlite`。协调器可令服务端使用 `DATABASE_URL=file:/workspace/anw-a3/.tmp/a3-ui.sqlite`；由协调器负责端口3360/5360及客户端代理配置，本阶段未启动它们。

稳定 IDs：

| 对象 | ID |
| --- | --- |
| 大纲项目 | a3-ui-project |
| 小说 | a3-ui-novel |
| 原采用修订 | a3-ui-revision |
| 绑定 / 活动规划 | a3-ui-binding / a3-ui-workspace |
| 已完成章节、摘要 | a3-ui-chapter-1 |
| 未来章 | a3-ui-chapter-2、a3-ui-chapter-3 |
| 源章节点 | a3-source-1、a3-source-2、a3-source-3 |
| 人物 / 伏笔 / 固定设定 | a3-hero / a3-key / a3-locked |
| 未绑定大纲 | a3-ui-unbound |
| 三项操作 | a3-arc、a3-hook、a3-future |

本次已生成 run IDs（新的数据库会有新的 UUID，以脚本输出或 GET status 为准）：

- 完成、有3条待确认建议：`44ee9ae2-8b21-423f-b939-521c8dfa3727`
- 失败：`1530c15a-441c-4d2c-bd51-37fcaf4a06e9`
- pending：`d314df3f-12fd-4922-a684-8f6a1bf3094e`
- 初始设置 `every_n / 3`，工作大纲 v1。三个建议仍待确认，供 UI 实际采纳/拒绝。

入口链接：

- `http://127.0.0.1:5360/outlines/a3-ui-project?panel=feedback`
- `http://127.0.0.1:5360/lab/director/a3-ui-novel`
- `http://127.0.0.1:5360/outlines/a3-ui-unbound`（应无反馈入口）
- 初始只读修订 `/outlines/a3-ui-project?revisionId=a3-ui-revision`

## Playwright headless 验收定位

建议桌面1440×1000，手机390×844。协调器自行执行，不依赖页面假响应。

1. `getByRole('region', {name:'正文反馈回大纲', exact:true})`；页面含3个“第 1 章正文反馈”section，完成项可通过含 `林舟反馈建议` 的 section 定位。
2. `getByLabel('自动分析频率')` 选择 chapter/every_n/volume/off；`getByLabel('间隔章数')` 填3；`getByRole('button',{name:'保存频率'})` 保存后刷新，验证持久化。填0应禁用保存并显示错误。
3. `getByRole('article',{name:'林舟反馈建议'}).getByRole('checkbox')` 勾选；在完成运行 section 内点击“采纳所选”，真实 POST `/api/outlines/a3-ui-project/feedback/44ee9ae2-8b21-423f-b939-521c8dfa3727/adopt` body `{operationIds:['a3-arc']}`。期望显示已采纳与“查看采纳修订 v2”，工作版本为2。
4. `getByRole('article',{name:'假钥匙与旧刻痕反馈建议'}).getByRole('checkbox')` 勾选，再点“拒绝所选”，真实 reject body `{operationIds:['a3-hook']}`；仍为 v2，人物已采纳、伏笔已拒绝、后续章仍待确认。再次刷新验证决定保留。
5. “追查来历反馈建议”显示后续任务提议与原/新摘要；展开“保留与固定字段受保护”可见“雾港铁律”。pending section 提示可继续下一章；返回本书的下一章控制不被反馈占用。
6. 点击“查看采纳修订 v2”打开精确 revisionId；指定修订只读预览可核对人物变化方向。源采用修订仍为v1。
7. 冲突场景可在保存大纲新修订后返回反馈：待确认项显示需重新分析，采纳禁用。不要点重分析。
8. 手机/未绑定页面不应显示反馈入口或触发控件；不得产生 `/feedback` 请求。B1 资格在服务端回归中验证为false。

离线 UI 只执行设置、既有建议采纳/拒绝及只读导航。**“分析本章摘要”“按本章摘要重新分析”“重试分析”会走真实模型路径**；失败与pending夹具仅用于展示，其重试操作由注入分析器的服务测试验证。

## 验证

- `pnpm --filter @ai-novel/shared build`：通过。
- `pnpm --filter @ai-novel/server build`：通过，最后修改后重跑通过。
- `pnpm --filter @ai-novel/client test`：279/279通过；最后模块门面与拒绝缓存变更后复用同分支全量结果，并重跑 A3/A2 定向7/7通过。
- `pnpm --filter @ai-novel/client build`：通过。随后仅收窄重试/重新分析成功后的缓存失效范围，避免刷新未保存的大纲；该调整后 typecheck 与 A3 定向3/3通过，复用上述构建产物验证，不重复完整打包。构建仅有 Browserslist 数据年龄与既有大vendor chunk提示。
- 服务端首轮 outlineFeedback / outlineOpenBookProtection / outlineOpenBookMapping / outlineApplication：33/33通过；最后投影变更后 outlineFeedback / outlineOpenBookNativeSqlite：16/16通过，覆盖新增快照、修订链接、stale和B1资格。
- `node .tmp/a3-seed.cjs`：实际创建并再次执行，保留所有建议状态、追加pending成功。
- `git diff --check`：通过。
- UI视觉、浏览器交互与截图留给协调器验收；本阶段未启动服务器、未操作端口或其他worktree。

## 后续真实验收

真实模型仅在协调器独立授权验收阶段调用：OpenAI兼容自定义厂商 `https://kuaipao.ai/v1`，模型 `gpt-6.1-sol`。协调器从环境注入 `KUAIPAO_API_KEY`，不得输出或写入结果文档。配置应用自定义厂商后，将该配置的provider ID和模型通过反馈 settings 保存（完整替换时保留mode/everyN）；然后显式分析 `a3-ui-chapter-1`。本阶段未配置密钥，也未调用该服务。

## 文件与维护知识

- 新增 `client/src/api/outlineFeedback.ts`、`client/src/pages/outlines/feedback/{index.ts,README.md,feedbackModel.ts,FeedbackSettings.tsx,FeedbackRun.tsx,OutlineFeedbackPanel.tsx}`、`client/tests/outlineFeedback.test.js`。
- 修改工作台与小说来源条、shared反馈/绑定类型、反馈服务与开书绑定投影、`server/tests/outlineFeedback.test.js`。
- 更新 `DESIGN_SYSTEM.md`、`docs/wiki/workflows/outline-text-feedback.md`、`README.md`、`docs/releases/release-notes.md`。
- 夹具与交付文件 `.tmp/a3-seed.cjs`、本文件。数据库为本地验收产物，不提交。
- Wiki记录桌面装配、分析快照、过期提示、精确修订和设置完整替换的长期合同；用户更新合并到既有2026-11-11条目。
