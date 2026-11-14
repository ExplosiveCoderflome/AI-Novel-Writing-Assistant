# 自定义厂商默认自动探测

## Background

结构化调用在要求非思考输出时，会强制关闭模型的思考。但系统只对做过兼容探测的模型知道该发哪个关思考参数：未探测的自定义厂商在内置能力档案里思考开关为 `none`，强制关闭的决定不会变成任何线上参数，模型照常思考，可能在生成正文前耗尽输出预算（`reasoning_budget_exhausted`）。背景与保守姿态见《未探测厂商的思考开关》（`unprobed-thinking-toggle.md`）。

## Decision

新建自定义厂商时默认开启自动探测。创建成功后立即写一条按厂商的自动探测偏好（`modelCompatibility.autoProbe.<provider> = true`），随后已有的保存时探测逻辑会跑一次兼容探测，探出该模型支持的结构化格式与思考开关。

该决定只改变新建厂商的默认值：

- 已有厂商不受影响。没有偏好记录的厂商仍按 opt-in 处理，保存时不自动探测。
- 探测本身的网络 opt-in 边界不变：探测入口仍要求显式网络许可，自动探测只是把创建动作视为该厂商的一次许可。
- 不给未知厂商猜发思考参数的保守姿态不变。探测失败或未探测时，系统仍不发送未经证实的思考控制参数。

## Current Rule

- 创建自定义厂商：`POST /api/settings/custom-providers` 在建好厂商记录后写自动探测偏好为开启，再走已有的保存时探测。偏好写入失败不阻断创建（探测随之跳过）。
- 关闭：模型设置里兼容性区块的按厂商开关（「保存或切换模型时自动探测」）可关。关闭后保存与切换模型时不再自动探测，已探出的档案保留。
- 手动探测：同一区块的手动探测入口始终可用，不受自动探测开关影响。

## Failure Modes

- 探测跑在创建请求的后台，失败只记探测状态为失败，不影响厂商创建。用户在兼容性区块能看到失败状态并手动重试。
- 探测结论来自小 schema，可能过度泛化（某厂商接受小 schema 的严格结构化格式，却拒绝字段多的嵌套 schema）。失败时的格式降级见《严格结构化格式被拒时降级》（`structured-400-mode-fallback.md`）。
- 厂商被删后重建是新厂商，自动探测偏好重新默认开启。

## Related Modules

- `server/src/routes/settings/customProviderRoutes.ts`：创建时写默认偏好。
- `server/src/llm/compatibility/probe.ts`：`autoProbeEnabled` / `setAutoProbe` / `probeIfEnabled`。
- `client/src/pages/settings/components/ModelCompatibilitySection.tsx`：按厂商开关与手动探测入口。
- `docs/wiki/debugging/unprobed-thinking-toggle.md`：未探测厂商思考开关空转的背景。
- `docs/wiki/debugging/structured-400-mode-fallback.md`：探测结论过度泛化时的降级兜底。
