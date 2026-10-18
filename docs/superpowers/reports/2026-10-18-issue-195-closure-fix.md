# Issue #195 安装包实测发现问题的修复核验

## 范围与原因分类

基于 [v0.5.13 安装包实测报告](./2026-10-18-issue-195-installed-regression.md) 修复三处正常路径可以产生的缺陷。主因分类为**功能闭环未完成**，次要因素为读取投影误用了不同范围的完成状态。

| 症状 | 具体位置与根因 | 修复边界 |
| --- | --- | --- |
| 批次完成后手动保存、采纳 AI 改写的资料同步失败 | `CharacterAppearanceService.applyFinalChapter` 要求 Run 为 queued/running；手动修订误用了生产许可。候选身份处理也需要相同边界 | 当前手动 revision/attempt 是独立写入证明，在角色身份、出场、位置消费者事务内校验；保留普通生产停止守卫 |
| 首页显示整书 100%、90 章已写，实际上只有 1 章正文 | `HomeNextActionPanel` 使用旧开书任务成功的旅程投影，`homeViewModel` 使用含空占位的 `_count.chapters` | 目录返回真实非空正文计数、全书目标和当前世代 V2 状态；V2 不使用旧开书成功代表生产完成 |
| 首页“查看推进状态”打开旧编辑器 | `Home.renderNovelPrimaryAction` 先使用旧任务动作，忽略本书 V2 来源；辅助入口也使用旧编辑地址 | 主、辅入口使用已验证的本书来源路由；来源未知时重新读取，不执行旧任务继续命令 |

不修改数据库 schema、Prompt、历史任务或用户正文；不以更改 completed/running 状态、新建假 Run 或放开全局停止守卫绕过同步错误。未调整审校、质量债务和 quality-first 的人工恢复策略。

## 代码与 SQLite 回归

- `@ai-novel/shared build`、服务端 build、客户端 typecheck 通过。服务端构建产物在相关源码最后修改后产生，被后续测试复用；最终首页补充 V1/短篇兼容后重新执行客户端 typecheck。
- 聚焦服务端 25 项全部通过：当前手动修订经真实候选身份、角色出场与位置消费者和 SQLite 事务，在 completed / paused / waiting_gate / cancelled / failed 下同步；逐列比较运行控制不变；缺失证明、过期 attempt、跨章节及旧 epoch 被拒绝。原生产调用在停止状态仍被拒绝。
- 目录 SQLite 用 90 行目录、1 章正文和空白内容核对计数，覆盖运行、暂停、确认、失败、取消及旧世代；目录查询前后历史任务与控制行完全一致，V1 仍保留原任务摘要。
- 首页 7 项聚焦检查通过：使用真实 Home 组件和 React SSR 校验显示文本及链接，覆盖 90 行目录 / 1 章正文、暂停和中断、未知来源和未知全书目标，以及 V1/短篇各自的工作区与进度展示；不以源码包含某字符串替代组件结果。
- 服务端质量门：共 532 项，530 通过、2 按既有条件跳过、0 失败，含上述新增服务端用例。
- 未运行浏览器交互、视觉验收或新版桌面打包；本轮是代码和真实模型回归，修复未包含在既有公开 v0.5.13 安装包中。

验证日志目录：`C:/Users/李皮/AppData/Local/Temp/issue195-closure-1a78cea2d9b54b219088d8ff2f4c1d04`。仓库只保存本报告，不提交含配置的数据库或完整运行日志。

## 真实模型回归

2026-10-18 21:23（Asia/Hong_Kong），对上轮独立安装包测试的 `final-verified-installer.db` 以只读方式打开并使用 SQLite backup 克隆到新目录。没有读取或修改用户小说数据库。副本保持原有三个导演控制均为 completed，不启动 Worker 或新批次。

- 小说：《十四毫米》，目标 90 章，已有第 1、2 章正文。
- 第 1 章经真实 HTTP `PUT /api/novels/:novelId/chapters/:chapterId` 追加一段测试文字，携带原文并发保护，200 回执与数据库正文一致。
- 使用持久化的新 revision 执行真实 `ManualChapterSyncService.run`，供应商 deepseek，模型 deepseek-flash；未 mock AI、数据库或资料消费者。
- 返回 completed，artifact_delta、角色出场、位置和其余适用消费者完成；当前 revision 检查点 succeeded，`ensureCurrent` 正常返回。
- 所有导演控制逐列未变，Run 数量未变，正文与提交值完整相同。无需启动第 3 章来使旧批次同步成功。
- 真实 `GET /api/novels` 返回 `writtenChapters=2`、`targetChapters=90`、最新 Run completed、旧开书生产摘要 null、本书来源 `/lab/director/director-opening-book-cmvdtatl70000vku5g0898ayi`。

最终证据：`real-model-1792329796802/summary.json`、`sync-result.json`、`verified-after.db`；最终快照 6,197,248 字节，`PRAGMA quick_check=ok`。

### 用量与验证限制

此次抽取经历首策略格式不符、JSON 纠错及第二策略，实际调用 4 次，原始 Token 30,649，已报告缓存命中 6,784，相减口径 23,865。它证明同步链可以在无活跃批次时闭合，不证明模型格式稳定性或 Token 效率得到改善。本轮未改模型结构化输出策略，仍保留这一观察用于后续独立优化。

本轮未重新生成 12 章或检查整书内容质量；上轮样本的数字一致性、时间线质量债务不属于这三处修复。Issue 原反馈“选择方案后立即停止”此前未复现，仍不能用本轮回归代替报告者原配置与日志的核验，也不能宣称 #195 的所有现象均已解决。

## 长期维护知识

手动修订与生产许可的区别写入章节编辑 Wiki、同步模块及出场模块 README；正文计数、目录占位与范围进度的区别写入目录模块 README 和导演入口 Wiki。发布说明标注为待发布，不修改现有安装包或版本号。
