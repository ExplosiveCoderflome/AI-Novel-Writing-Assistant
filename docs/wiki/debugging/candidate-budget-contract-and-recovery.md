# 书级候选调用的预算契约与失败恢复

## Background

书级方向候选（`novel.director.candidates@v2`）是开书流程的第三步。2026 年 11 月的 issue #251 里，用户在 deepseek-flash 上撞见 `reasoning_budget_exhausted`、在 Gemini 上撞见 `output_budget_exhausted`，换模型也过不去。根因有三层：其一，该步调用结构化 runner 时不传输出上限，落到 planner 路由的 8192 默认值；其二，结构化 runner 的三个 invoker 调用点没有把 `reasoningEnabled` 传给 factory，文本 runner 早已转发的关思考意图在结构化路径上丢了（见《未探测厂商的思考开关》`unprobed-thinking-toggle.md`）；其三，两类预算耗尽都被判为终局错误，没有自动重试，手动重试只是同一个调用、同一个预算，原地打转。

## Decision

三层一起落地：事前预防让这步不再撞预算墙，失败自动兜底重试一次，失败卡上一键改设置再重试。只做事前预防不够——未探测厂商收不到关思考参数，预算墙仍在；只做兜底重试不够——每次失败都要多花一次调用；只做失败卡不够——用户每次都要手动点。事前预防、兜底重试、一键恢复分别对应「不撞墙」「撞墙后自己爬起来」「爬不起来时一条路走到底」。

## Current Rule

- 候选调用强制关闭思考：生成批次与单候选修订都走 `runCandidateStructuredCall`，调用时固定 `reasoningEnabled:false`。结构化 runner 的主调用、语义重试、空流回退三个 invoker 调用点都转发该选项，`invokeStructuredAttempt` 经 `resolveAttemptTarget` 把它带进每次 attempt 的客户端解析。
- 预算随候选数走：`resolveDirectorCandidatesOutputTokenBudget(count)` 下限 8192、每候选 4096、上限 32768；实际预算取路由预算与该下限的较大者，路由上已配更高预算时不压低。
- 预算耗尽自动重试一次：捕获到 `reasoning_budget_exhausted` 或 `output_budget_exhausted`（`StructuredOutputError` 的分类或错误消息里的分类前缀）时，把预算翻倍（上限 32768）再调一次；翻倍后不再高于首轮预算时不重试；其他分类的错误原样抛出，不重试。
- 失败卡一键恢复：执行失败、当前步骤属于候选准备流程、失败消息含预算耗尽分类时，失败卡出现恢复按钮。「关闭深度思考并重试」把 seed 里厂商的思考开关置为关闭；「提高输出上限并重试」只在 planner 路由预算低于 32768 时出现，把该路由的上限改到 32768 且保留原厂商、模型、温度、协议与格式；两颗按钮都在设置改完后直接触发原地重试。
- 恢复按钮只改设置不改数据：关思考走厂商设置更新接口，提上限走路由配置接口；路由不存在时按服务端默认路由建一行，不改变其他 planner 调用的解析结果。

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
