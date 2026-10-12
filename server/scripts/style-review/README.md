# 写法风险真实 API 评测

这组脚本使用项目设置中已保存的模型与凭据，调用登记的检测、章节验收和局部修文能力。它用于复现输出合同与保护边界，不作为作品质量或“AI 率”鉴定。

## 使用与成本

执行前须有用户对真实 API 测试的授权；调用会消耗供应商额度。脚本读取启用的全局反 AI 规则，以 `fixtures.cjs` 中原创合成片段建立临时写法合同，不读取或保存用户章节、任务、写法绑定。现有用量记录器会追加没有小说与任务归属的调用记录。

先在仓库根目录编译，使 `dist` 与当前分支代码一致：

```powershell
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server build
node server/scripts/style-review/evaluate.cjs --phase detection --repeats 1
node server/scripts/style-review/evaluate.cjs --phase acceptance --repeats 1
node server/scripts/style-review/evaluate.cjs --phase rewrite
node server/scripts/style-review/evaluate.cjs --phase facts
```

`--phase all` 顺序执行所有阶段；`--repeats 1..3` 只影响检测和验收。可用 `--case problem-surface` 缩小样本范围，`--signals off` 做同版本的信号输入成本对照。手动修文仍使用服务内置检测与补丁设置，`--signals` 不改变该服务配置。

默认报告写入 Git 忽略的 `.logs/style-review-eval/<UTC 时间>-<阶段>.json`，可用 `--out` 指定路径。报告含合成正文、规则快照、模型原始结构化输出、正式校验结果和真实 Token 用量；不要公开包含个人规则的完整本地报告。脚本关闭请求调试日志，不输出凭据。`promptVersions`、逐次调用版本及样本来源用于防止跨版本混算。

## 判读边界

- `completed` 只表示正式结构化与来源校验通过，不等于文本质量提升。
- 事实样本先通过确定性锚点，再运行已有语义复验。只有正式 `ChapterRepairVerificationError` 才记为 `blocked`；网络错误、普通 schema 错误和检测来源错误不能冒充事实保护成功。
- `expected=block` 且 `status=blocked` 是安全用例通过。`evaluationPassed` 只统计这些合同预期；任何意外允许、意外拦截或运行失败都会使进程返回非零。
- 数字与专名保护不能证明主体、否定和事件结果一致。手动粘贴稿预览仍可能为 `semanticFacts=not_checked`，须另行核对。
- 六段约 600～700 字合成片段不代表完整长篇，也不满足真实语料误触发率验收。本脚本不启动完整导演作业，不替代章节保存、资产同步、质量债或 UI 的端到端验收。
- Token 汇总按实际调用计，包含 JSON 修复和传输重试；缺少 usage 的调用单独计数，汇总只能视为已报告下限，不推算人民币费用。

首次实测记录见 [2026-10-11 评测报告](../../../docs/evaluations/style-risk-review-2026-10-11.md)。
