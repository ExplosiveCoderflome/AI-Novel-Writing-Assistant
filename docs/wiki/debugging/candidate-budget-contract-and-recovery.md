# 书级候选调用的预算契约与失败恢复

## Background

书级方向候选（`novel.director.candidates@v2`）是开书流程的第三步。2026 年 11 月的 issue #251 里，用户在 deepseek-flash 上撞见 `reasoning_budget_exhausted`、在 Gemini 上撞见 `output_budget_exhausted`，换模型也过不去。根因有三层：其一，该步调用结构化 runner 时不传输出上限，落到 planner 路由的 8192 默认值；其二，结构化 runner 的三个 invoker 调用点没有把 `reasoningEnabled` 传给 factory，文本 runner 早已转发的关思考意图在结构化路径上丢了（见《未探测厂商的思考开关》`unprobed-thinking-toggle.md`）；其三，两类预算耗尽都被判为终局错误，没有自动重试，手动重试只是同一个调用、同一个预算，原地打转。

## Decision

三层一起落地：事前预防让这步不再撞预算墙，失败自动兜底重试一次，失败卡上一键改设置再重试。只做事前预防不够——未探测厂商收不到关思考参数，预算墙仍在；只做兜底重试不够——每次失败都要多花一次调用；只做失败卡不够——用户每次都要手动点。事前预防、兜底重试、一键恢复分别对应「不撞墙」「撞墙后自己爬起来」「爬不起来时一条路走到底」。

## Current Rule

- 候选调用强制关闭思考：生成批次与单候选修订都走 `runCandidateStructuredCall`，调用时固定 `reasoningEnabled:false`。结构化 runner 的主调用、语义重试、空流回退三个 invoker 调用点都转发该选项，`invokeStructuredAttempt` 经 `resolveAttemptTarget` 把它带进每次 attempt 的客户端解析。
- 路由留空时使用自动预算，起点是 16,384 Tokens。书级方案按候选数量估算，卷拆章按当前节奏段的章节数估算。有明确路由值时采用路由值，已知模型输出上限只会收紧当前请求。旧任务恢复时按已保存预算执行。
- 自动候选预算耗尽后最多加额重试一次。重试额度不超过 32,768 Tokens 和已知模型上限。显式配置的预算照常生效。若端点回报 `length` 且用量低于请求额度，应优先核查上下文，不能据此调低模型上限。
- 小说的调用明细保留每次物理尝试的请求预算、来源、结束原因与结构校验状态。关闭消息历史时仍可查看这些字段。
- 失败卡一键恢复：执行失败、当前步骤属于候选准备流程、失败消息含预算耗尽分类时，失败卡出现恢复按钮。「关闭深度思考并重试」把 seed 里厂商的思考开关置为关闭；「提高输出上限并重试」只在 planner 路由预算低于 32768 时出现，把该路由的上限改到 32768 且保留原厂商、模型、温度、协议与格式；两颗按钮都在设置改完后直接触发原地重试。
- 恢复按钮只改设置不改数据：关思考走厂商设置更新接口，提上限走路由配置接口；路由不存在时按服务端默认路由建一行，不改变其他 planner 调用的解析结果。

## 其他结构化任务与额度快照

- 新执行的结构化调用默认关闭深度思考，任务可以显式要求思考。端点必须保留思考时，自动预算会另留一份思考额度；用户填写的输出上限和模型能力边界仍限制实际发送值。兼容探测只记录观察到的思考行为，继续使用探测前已知的输出上限。
- Gemini 官方兼容接口的可关闭模型使用关闭参数，必须思考的模型使用较低的思考强度。兼容转发端点使用自己的已探测能力。一次截断只影响该次失败处理，不会降低端点档案的容量。
- 新任务的默认单章有效用量是 200,000 Tokens。只有保留系统默认的运行才可为当前章自动追加一次，新上限取本章建议额度，最多升至初始值的两倍。追加后仍超额时在来源页面确认；手动设置的额度和旧任务快照照常生效。
- 生产内核记录每个厂商、模型和任务类型的实际输出额度。新运行重放保存的额度；历史阶段仍沿用原来的阶段额度及思考规则。缺少目标额度时提示对应目标，并暂停等待显式恢复。

## Failure Modes

- 未探测厂商仍发不出关思考参数：强制关闭只保证意图传到 factory，线上参数仍取决于能力档案里的思考控制；预算翻倍重试是这层兜底。
- 预算已到 32768 上限时重试不再加码：翻倍等于首轮预算，自动重试不触发；失败卡上的提上限按钮也不出现，只剩关思考一条路。
- 恢复按钮依赖 seed 里的厂商信息：seed 缺少厂商时关思考按钮不出现；提上限按钮依赖路由查询，查询失败时不出现。
- 兜底重试只认预算耗尽分类：`transport_error` 等分类不触发；预算错误被误分类时，兜底重试不会启动，见《结构化错误分类》相关记录。

## Related Modules

- `server/src/services/novel/director/phases/candidateStructuredCall.ts`：候选结构化调用的包装器，预算契约与单次兜底重试。
- `server/src/services/novel/director/phases/novelDirectorCandidateStage.ts`：生成批次与单候选修订的调用点。
- `server/src/prompting/prompts/novel/promptBudgetProfiles.ts`：候选预算的下限、每候选增量与上限。
- `server/src/prompting/core/promptRunner.ts`：结构化 runner 三个 invoker 调用点的选项转发。
- `server/src/llm/structuredInvoke.ts`：attempt 目标解析里的选项透传。
- `client/src/hooks/useDirectorBudgetRecovery.ts`：失败卡恢复按钮的设置修改与重试触发。
- `client/src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx`：失败卡与恢复按钮的渲染条件。
- `docs/wiki/debugging/unprobed-thinking-toggle.md`：未探测厂商思考开关空转的背景。
- `docs/wiki/debugging/probe-resilience-and-reasoning-default.md`：新建厂商默认关闭思考与探测韧性。
