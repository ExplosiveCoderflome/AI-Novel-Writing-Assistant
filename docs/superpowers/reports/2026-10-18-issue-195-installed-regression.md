# #195 追加反馈：v0.5.13 安装包真实回归

## 结论与覆盖范围

#195 新评论为“用了更新后的版本直接写不了了，选完创作方案直接就停掉了”。本轮下载并安装 GitHub 正式安装包，通过实际 Electron 界面、真实模型和包内服务测试，没有使用开发服务或组件替身。

本样本未复现“确认方案后停止”或“接受全部后保存回旧文”。完成默认开书准备、第 1 章生成、选段 AI 改写采纳、手动追加保存、完全退出重启，以及第 2 章续写。但发现了可以由正常操作产生的状态展示、入口和手动同步缺口，不能将本轮结论概括为“新版没有问题”。未获得评论者的模型、创作模式、错误信息和现场数据，其原始停止原因仍未知。

## 安装与数据保护

- 安装资产：`Biz-Novel-Studio-0.5.13-setup-x64.exe`，131,968,532 字节，SHA-256 为 `e33788a344301718b735273ab17ebec20d6befe4985ca999df7b1af801ba47f5`，与 GitHub 资产 digest 一致。
- 使用安装器静默安装到新目录；程序文件 ProductVersion 为 `0.5.13.0`，实际界面显示 `v0.5.13`。
- 测试根目录：`C:/Users/李皮/AppData/Local/Temp/issue195-installed-1792326821582`。程序位于 `install/`，通过 `AI_NOVEL_APP_DATA_DIR` 指向独立 `test-data/`。
- 原桌面数据库通过 SQLite backup 生成 `original-data-backup/data/dev.db`，16,207,872 字节，quick_check 为 ok；相关本地草稿目录一并备份。原数据库修改时间仍为 2026-09-13，未用测试内容回写。
- 新库仅从只读打开的源码开发库复制模型与应用配置，不复制用户小说。密钥、数据库和运行日志只保留本机，不提交或上传为附件。
- 样本《十四毫米》，全书目标 90 章，模型 DeepSeek / deepseek-flash，温度 0.7，导演 V2，默认先完成导演准备。仅分别授权第 1–1、2–2 章正文，没有生成其余 88 章。

## 实际操作与结果

| 操作 | 结果 |
| --- | --- |
| 首页自动导演入口，填写想法，默认设置生成方案 | 真实返回两套方向；开书任务进入 waiting_approval |
| 点击第一套“选用这套” | 20:40:06 建书并打开导演 V2，开书交接命令成功；新导演继续规划 |
| 等待准备 | 20:43:40 完成 7/7 阶段，约 3 分 34 秒；保存 90 条空正文路线，出现后续正文范围表单 |
| 提交生成第 1–1 章 | 作业 succeeded，导演 completed，原正文 3,661 字符；有质量债，未把质量债当全局失败 |
| 点击“编辑正文”，在实际 Plate 编辑器选中首段 76 字，点击“AI优化这段” | 真实返回多个候选，保留正文原片段用于比较 |
| 采用默认“自然顺句”候选，点击“接受全部” | 编辑器显示新文并标记已保存；SQLite 为 3,664 字符，首段变化，未选中的其余正文逐字不变 |
| 继续输入“他向前挪了半步。”并 Ctrl+S | 保存为 3,672 字符，保留已采纳 AI 文字 |
| 退出并重新启动安装版，从首页返回小说，再打开导演台 | 阅读页仍显示 AI 改写与手动追加；不是仅保留当前页面内存 |
| 再提交第 2–2 章 | 第二个正文作业 succeeded，导演 completed；第 2 章 3,033 字符，可以打开阅读；首章未被续写覆盖 |

小说 ID：`director-opening-book-cmvdtatl70000vku5g0898ayi`。开书任务为 `cmvdtatl70000vku5g0898ayi`；规划 Run 为 `61901b07-ec8c-4604-b086-036e2e5d0fab`，首章 Run 为 `f7ec4e6f-97cf-42a2-a238-9daddf407acf`，次章 Run 为 `0b587457-3ad3-4dd1-8763-18ce762e9100`。三个 Run 均 completed，无暂停原因；两个正文作业均 succeeded。

关键证据：测试目录的 `before-confirmation.json`、`after-confirmation.json`、`acceptance-verification.json`、`novel-list-after-restart.json`、`sync-check.json`、`final-results.json` 和 `真实正文.txt`。最终独立库快照 `final-verified-installer.db` 为 6,107,136 字节，quick_check 为 ok。测试结束正常关闭程序，没有继续运行收费任务。

## 确认的问题及位置

### 1. 首页把开书交接成功当作整本完成

主因分类：功能闭环未完成，影响 V2 的书级展示。正常路径可以重现，非脏数据。

只写完第 1 章并重启时，首页显示“小说主流程已完成”、整本旅程 100%，正文与质量阶段全部打勾。实际另外 89 条 Chapter 只有路线，没有正文。

- `server/src/app/director/opening/execution.ts` 正确地把候选交接任务设为 succeeded / progress=1 / opening_complete；它仅证明交接完成。
- `NovelCatalogQuery.listLatestVisibleAutoDirectorTasksByNovelIds` 仍将该历史开书任务作为 latestAutoDirectorTask。
- `novelWorkflowExplainability.ts:266` 把一般 succeeded 映射成“小说主流程已完成”；`homeJourney.ts:39` 则把这个任务的 100% 当成整本阶段全部完成。
- `homeViewModel.ts:237` 和 `HomeNextActionPanel.tsx:182` 用 `_count.chapters` 显示“已沉淀章节”，没有区分空路线与已写正文。

应以 V2 当前运行、冻结全书目标和实际有正文的章节分别表达本次范围与全书进度，不能修改历史开书任务去伪造整本运行状态。

### 2. 首页主入口没有遵守 V2 来源路由

主因分类：入口闭环未完成。列表响应已经包含正确的 `directorVersion=v2` 和 `/lab/director/<novelId>` 来源。

实际点击首页“查看推进状态”进入旧小说编辑工作台；需再点击“打开导演台”才能返回正确页面。`client/src/pages/Home.tsx:204` 在有 task 的通用分支硬编码 `getNovelEditHref(novel.id)`，绕过已有的来源感知路由。此问题不能用“导演后端可以继续”判定为正常。

### 3. 已完成批次之后的手动同步被错误运行状态挡住

主因分类：手动修订与导演运行的授权边界不闭合，正常编辑可以产生。

第一次“接受全部”20:47:59 保存成功，同修订的资料同步在 20:48:53 失败，原因为“本次创作已停止，不能回填角色出场记录”。此时该正文仍是当前版本，下一次手动保存发生在 20:49:21，因此不是后来的输入让旧同步过期。

- `ManualChapterSyncService.ts:64–74` 选择同 epoch 的最近 Run，并把它的 ID 传入 V2 资料同步，没有区分这个 Run 已 completed。
- `ChapterArtifactDeltaService.ts:406` 的角色出场消费者仍调用生产路径 `applyFinalChapter`。
- `CharacterAppearanceService.ts:58` 只接受 queued/running，拒绝已完成 Run。生产执行安全守卫本身应保留，手动修订必须用独立 revision/正文/epoch/租约证明贯穿消费者，不能解除全局停止保护。
- 后来手动保存的新修订在第 2 章的新 Run 开始后同步成功。最终当前首章 hash 对应的 manual_chapter_sync 与 artifact_sync_boundary 均 succeeded，第 2 章也有当前正文的资产同步成功记录。这个后续成功不能抹去前一个当前修订同步被错误拒绝的事实。

以上相关模块在 `v0.5.12..v0.5.13` 没有代码差异，证据支持现有边界缺口，不足以认定是本次三个补丁新引入的回归。

## 质量、用量与未覆盖项

- 第 1 章的十四毫米核算链条不完整；补丁候选复验没有通过正文身份/证据校验，系统保留原稿并登记 quality.loop_exhausted。第 2 章规划另记录重复调档和入口决策冲突两个局部修复指导，未阻断正文。
- 第 2 章稳定时间线收尾记录失败（timeline_failed），降级记录成功；不能把作业 succeeded 写成全部时间线质量通过。已有检查点唯一约束冲突日志被恢复/幂等路径处理，未凭日志本身认定发生正文损坏。
- 全流程 70 次模型调用，原始 507,244 Tokens、报告缓存命中 167,808，相减 339,436；这不是费用。90 条路线按 8 个节奏段基础生成，额外发生 10 次标题/规划语义重试。应把基础规划的架构用量与这些额外检查用量分开，不能将全部消耗都解释为生成两章所必需。
- 本轮真实验证了原生窗口、Plate 选区、默认 AI 优化候选、接受全部、Ctrl+S、重启和再次续写；没有覆盖全部去 AI 预设、其他模型、完整 12/90 章或评论者的旧数据库。
- 本轮只做排查与真实回归，未修改产品源码、未修复上述缺口、未发布新包，也没有将 Issue 关闭。后续修复应分别验证书级投影/来源导航和 completed、暂停、取消等状态下的手动 revision 同步，不能只复用组件替身或在 queued/running 样本上验收。
