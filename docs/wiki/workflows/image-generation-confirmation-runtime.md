# 图片生成确认与统一运行时

## Background

图片生成通常会消耗真实模型额度，并且输入不只是一段 prompt：角色三视图、表情稿、资产图、场景设定图、首帧图等入口还会携带参考图、尺寸、provider、负面提示词和业务状态写回规则。早期各入口直接在按钮点击后调用生成接口，用户无法在扣费前确认模型实际收到的素材，开发者也容易在不同服务里重复实现状态机、落盘、历史归档和错误写回。

对新手用户来说，生图失败或角色漂移时最需要看到的是“这一次到底发了什么”。因此所有用户手动触发的单次图片生成，都必须先展示确认弹窗，让用户在生成前看见 prompt、参考素材和参数，并允许做一次性调整。

## Decision

用户手动触发的单次图片生成统一采用 `prepare -> ImageGenerationConfirmDialog -> generate(overrides)` 流程。后端入口必须先构建一份生成上下文，`prepare` 返回这份上下文的可展示快照，`generate` 使用同一类上下文并把弹窗中的一次性覆盖参数传给统一图片运行时。

图片生成服务应优先通过 `server/src/services/image/runtime/` 的 `runImageGeneration` 执行，不再在业务服务里散写 provider 校验、模型解析、生成中状态、图片下载落盘、扩展名清理、成功/失败状态和历史归档。

## Current Rule

- 用户手动点击“生成图片 / 重生成 / 重抽 / 生成首帧 / 生成角色设计稿”等单次图片操作前，必须打开 `ImageGenerationConfirmDialog`。
- 弹窗展示的 `prompt`、`negativePrompt`、`referenceImages`、`provider` 和 `size` 必须来自后端 `prepare` 接口，不允许前端自己拼接最终生图 prompt。
- 弹窗确认后只把本次临时修改作为 `ImageGenerationOverrides` 传给 `generate`，不直接改写角色、场景、项目或镜头的长期配置。
- 弹窗中的参考素材可以被用户临时移除。移除只影响本次生成实际发送给图片模型的 `refImagePaths/refImages` 和成功后记录的 `referenceImages`，不删除原始图片、不改变角色/场景/镜头素材状态。
- 弹窗中的 Prompt 解释与 Prompt 优化必须通过后端 LLM 能力完成，并使用 `server/src/prompting/` 下注册的 PromptAsset；前端只展示结果或回填当前 textarea，不在前端写固定规则解释 prompt。
- Prompt 优化只回填本次确认弹窗里的正向 prompt 草稿。用户仍需点击确认生成才会发起图片任务，优化结果不自动写回角色、场景、镜头、项目配置或其他长期状态。
- Prompt 优化入口应允许用户输入自然语言优化要求，例如希望强化的画风、氛围、镜头或保留项；后端 PromptAsset 应优先遵循这些要求，但不得覆盖角色身份、参考图用途、性别锁、无文字/无水印等关键约束。
- 后端服务应把 prompt、参考图路径、参考图展示元数据、尺寸、负面提示词和 adapter 组装在同一个 generation context 中，避免 `prepare` 和 `generate` 两套逻辑漂移。
- `runImageGeneration` 是业务表 JSON 状态机图片生成的默认执行入口。业务服务只负责提供 `ImageTargetAdapter`、prompt、参考图和额外 done 状态。
- 使用 `ImageGenerationTask` 两表模型的入口应保持 `ImageGenerationService` 作为任务创建、查询、资产管理和队列调度 facade；真实执行、取消检查、provider 调用、资产落库、任务重试和 pending 快照图片回填由 `ImageGenerationTaskExecutor` 承担，避免任务执行细节重新堆回 facade。
- 成功生成后，如果实际使用了可追溯参考素材，应把 `referenceImages` 写入业务状态字段，供前端展示“本次生图使用的参考素材”。
- 两表模型的参考素材应保存为同 owner 的 `ImageAsset` id；任务执行时解析为本地文件路径或可用 URL 发送给 provider，并在生成资产 metadata 中记录实际使用的 reference asset ids。
- 格子图这类会临时合成雪碧图的入口，状态中记录雪碧图的组成素材，不持久化临时雪碧图本身；实际 provider 请求仍可使用临时本地文件，并在请求完成后清理。
- 格子图 prompt 必须防止命名角色参考图扩散到群众人物：如果画面存在群众、路人、围观者、弟子群、士兵群或其他背景人物，应明确要求他们在年龄、脸型、发型、服饰颜色、体型和站姿上有差异，并禁止 repeated identical faces / cloned faces。
- 自动批量任务可以继续直接调用后端统一运行时，不逐项弹出前端确认。批量任务的前置确认应放在批量任务创建/成本估算/目标范围确认层，而不是阻塞每张图。

## Examples

- 漫画角色三视图、表情稿、角色资产、场景设定图和单格图，均应有对应的 `prepare*` API，前端通过 `useImageGenerationFlow` 打开统一弹窗。
- 短剧角色设计稿和镜头首帧图也属于图片生成入口，必须展示即将发送的图片参数；镜头首帧如启用角色参考图，应在弹窗中列出这些角色设计稿。
- 小说封面等使用任务表模型的图片生成入口，如果后续迁入统一业务表状态机，应同步补上 prepare 快照；在迁移前也不得新增绕过确认的手动生图入口。
- 用户看不懂当前 prompt 时，可以在确认弹窗中触发解释；用户希望降低跑偏概率时，可以触发优化。两者都属于生图前辅助决策，不替代最终确认。
- 用户对优化方向有自己的判断时，应把自然语言要求传给优化动作，而不是让前端拼接固定片段；LLM 负责把用户要求融入可执行 prompt。
- 用户想排查某张参考图是否导致跑偏时，可以在确认弹窗中临时移除该素材后再生成；后端必须同时过滤真实发送的本地文件/URL 和写回状态的参考素材元数据。
- 格子图中如果群众角色长相过度一致，优先检查 prompt 中是否把命名角色参考图限定到对应角色，并确认群众人物已有差异化约束；后续若仍不稳定，再把群众升级为结构化 extras。

## Failure Modes

- 只在前端展示“推荐 prompt”，但后端生成时重新拼接另一份 prompt，会让用户确认的信息与实际发送内容不一致。
- `prepare` 使用数据库状态判断有参考图，而 `generate` 使用磁盘文件判断，可能出现弹窗显示有图但实际未发送。关键入口应尽量在 prepare 阶段用与 generate 相同的解析方式确认素材可用性。
- 生成成功后不写入 `referenceImages`，前端只能看到图片和 prompt，无法回溯角色、资产或场景参考素材。
- 只在前端隐藏参考素材但后端仍发送原图，会让确认弹窗失去可信度；临时移除必须通过 overrides 传到后端，并在统一运行时调用前完成过滤。
- 在前端用固定文案或关键词规则解释 prompt，会让用户误以为系统理解了图片约束；解释和优化必须交给 LLM PromptAsset，并接受结构化输出校验。
- Prompt 优化如果自动保存到角色或场景配置，会把一次性试验误写成长设定；除非另有明确保存入口，确认弹窗只能修改本次生成参数。
- 格子图只给命名角色做外貌锚定时，图片模型可能把主角参考脸复制给群众人物；群众差异化约束是格子图 prompt 的基础保护，不应由用户每次手写。
- 在业务服务里直接调用 `generateImagesByProvider`，容易漏掉 generating/error 状态、历史归档、旧扩展名清理或 provider 支持校验。
- 在 `ImageGenerationService` facade 里继续堆任务执行逻辑，会让创建任务、队列调度、取消恢复、provider 调用和资产写入混在一个文件；新增执行规则应优先进入 `ImageGenerationTaskExecutor`。
- 批量任务如果逐图等待前端弹窗，会破坏自动化生产链；批量确认和单次确认是不同层级，不能混用。

## Related Modules

- `client/src/components/image/ImageGenerationConfirmDialog.tsx`
- `client/src/components/image/useImageGenerationFlow.ts`
- `server/src/services/image/runtime/`
- `server/src/services/image/ImageGenerationService.ts`
- `server/src/services/image/ImageGenerationTaskExecutor.ts`
- `server/src/services/comic/ComicCharacterImageService.ts`
- `server/src/services/comic/ComicCharacterAssetService.ts`
- `server/src/services/comic/ComicPanelImageService.ts`
- `server/src/services/comic/ComicSceneService.ts`
- `server/src/services/drama/DramaCharacterImageService.ts`
- `server/src/services/drama/visual/DramaShotKeyframeService.ts`
