# Creative Hub 边界

## 背景

Creative Hub 已经从普通聊天页演进为创作中枢，承载对话、追问、规划、工具调用、执行状态和回合总结。它的价值是帮助新手把模糊创作意图转成可执行的小说生产动作，而不是成为另一个泛聊天入口。

如果 Creative Hub 绕过自动导演、Prompt Registry、Runtime API 或任务状态投影直接调用旧 service，会重新制造多套入口、多套状态和多套恢复语义。

## 决策

Creative Hub 是创作中枢和控制入口，不是小说生产事实源。它应通过已治理的工具、workflow、runtime API 和 projection 解释并推进自动导演或章节链路。

AI 判断仍是意图识别、规划、路由和下一步推荐的主实现；确定性代码只做输入校验、安全边界、权限、幂等和结构化输出后的处理。

## 当前规则

- Creative Hub 可以理解用户意图、解释当前小说进度、推荐下一步、发起受控命令。
- Creative Hub 不直接承担自动导演长任务、章节生产、质量修复或 RAG 索引的重型执行。
- 当用户目标属于开书、接管、继续、恢复、章节执行或批量生产时，应交给自动导演 runtime、章节 runtime 或任务中心。
- 工具调用应绑定明确资源和可审计记录，不用自由文本分支替代 AI-first 结构化理解。
- 面向新手时，Creative Hub 应给出单一推荐下一步、原因和影响范围，不要求用户自己判断复杂工程或小说结构状态。
- 不新增基于关键词、正则或硬编码分支的产品级意图路由。

## 示例

推荐做法：

- 用户问“这本书现在到哪了”，Creative Hub 读取真实产物进展和 runtime projection，先回答已产出事实，再补充后台任务状态。
- 用户要求继续自动生成，Creative Hub 创建受控 command 或引导到自动导演继续入口。
- 用户手动改了章节后，Creative Hub 发起影响分析，让自动导演判断局部修复、继续或暂停确认。

禁止做法：

- 在聊天 route 里直接拼 prompt 调 LLM 决定并执行重型小说生产。
- 用关键词判断“继续”“恢复”“重试”并绕过 command、policy 和 projection。
- 把 Creative Hub 扩展为通用聊天，而新增能力不服务整本小说完成。

## 失败模式

- 对话能回答但任务中心状态不变：检查是否只做了聊天层响应，没有发起受控命令。
- 对话里显示可以继续，但自动导演面板不同步：检查是否绕过 runtime projection。
- 意图识别失败后加了关键词兜底：应修 Prompt schema、上下文或工具合同，而不是隐藏 AI 能力问题。

## 相关模块

- `server/src/creativeHub/`
- `server/src/agents/`
- `server/src/graphs/`
- `server/src/services/novel/director/`
- `server/src/services/novel/runtime/`
- `client/src/pages/chat/ChatPage.tsx`
- `client/src/pages/tasks/TaskCenterPage.tsx`

## 来源文档

- [提示词工作台、上下文装配与统一步骤运行时方案](../../plans/prompt-workbench-context-and-step-runtime-plan.md)
- [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md)
- [README 项目定位](../../../README.md)
