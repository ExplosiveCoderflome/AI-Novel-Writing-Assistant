# 短剧工作台流程边界

## Background

短剧模块的目标不是给小说详情页增加一个下游按钮，而是形成独立的竖屏付费短剧创作平台。用户通常不理解短剧赛道、付费卡点、分镜或视频提示词，因此前端工作台必须把后端能力组织成清晰的主流程，而不是暴露一组零散接口。

## Decision

短剧项目必须有独立工作台。项目列表只负责创建和进入项目；项目详情页负责承载“素材 -> 策略 -> 分集 -> 台本 -> 质量 -> 分镜视频 -> 导出”的连续推进。

## Current Rule

- `/drama` 是短剧入口和项目列表，不承载完整生产链。
- 新建项目必须使用低认知负担向导组织为“来源 -> 内容 -> 规格”。导入小说时不暴露内部 ID，应显示小说标题和章节数，并自动生成可读项目名。
- 新建项目的赛道选择应提供 AI 推荐入口。推荐必须基于注册 PromptAsset 和结构化输出，返回推荐赛道、适配理由、素材信号、风险和备选赛道；不得用关键词匹配替代 AI 判断。
- `/drama/projects/:id` 是项目工作台，必须展示当前项目的来源素材、策略、分集、角色、质量状态、分镜视频和导出入口。
- `GET /api/drama/projects/:id` 应返回工作台首屏需要的聚合数据，包括 `sourceBundle`、`characters`、`episodes`、`storyboards`、`shots` 和 `videoPrompts`。
- 项目详情页必须提供“下一步”主任务卡，根据当前项目产物自动引导整理素材、生成策略、生成分集、生成台本、质量检查、修复、分镜、视频提示词、视频任务或导出。主路径动作应集中在这个任务卡里，避免用户在多个同级按钮之间判断顺序。
- 前端可以提供主路径快捷按钮，但按钮必须服务于可见产物：生成后用户应能立即看到素材、策略、分集、台本或质量结果。
- 单集台本允许用户人工编辑；保存正文后必须把旧 `qualityFlags` 视为过期并清空，避免旧质量结论覆盖新内容。
- 质量检查结果必须有项目级汇总入口。`qualityFlags` 可以保留为单集结构化结果，但前端应把待修复、可继续质量债、阻断问题和未检查台本汇总到“质量问题”页，并允许用户跳转到对应集继续处理。
- 质量闸返回 `repairable` 或 `blocked` 时，单集状态必须进入 `needs_repair`。工作台的下一步引导应先处理修复，再允许该集继续进入分镜、视频提示词和 provider 任务，避免把已知质量问题带入视听生产链。
- 角色页必须按短剧角色资产组织，而不是小说人物设定表。核心字段应服务台本、分镜和视频一致性：出镜名、短剧功能、观众一眼要看懂的信息、固定造型锚点、表演和声音锚点、台词规则、冲突关系和镜头搭配。
- 角色卡是台本、分镜和视频一致性的共享输入；编辑固定造型、表演声音、台词规则和冲突关系后，后续生成应读取更新后的项目角色。
- 角色库导入是短剧工作台的一部分，导入后必须刷新项目详情，确保新角色立刻进入台本和分镜上下文。
- 来源素材页应展示最低限度的质量提示：梗概、节拍数量、角色数量和硬事实数量。提示不替代 AI 质量闸，但能避免用户在明显缺素材时继续生成。
- 来源素材不足时，工作台应提供 AI 补充建议，把缺口转成用户能回答的问题和下一步建议。补充建议属于新手引导层，不应把 `SourceBundle` 的内部字段或质量快照裸露给用户作为任务说明。
- 视频任务状态必须在项目内可刷新并可汇总查看；provider 状态、任务 id、结果链接、失败提示和重新刷新入口都属于分镜视频生产链，不应要求用户离开短剧工作台查看。
- `DramaVideoPrompt.providerResult` 只保留 provider 原始回执；工作台展示应优先读取稳定投影字段，例如 `status`、`providerTaskId`、`resultUrl` 和 `failureReason`。这样 provider 返回结构变化时，用户仍能看到一致的视频任务状态、结果链接和失败原因。
- 视频 provider 仍通过 `VideoProviderPort` 抽象接入；可用 provider 必须由后端注册表暴露给前端，前端只能让用户选择已注册 provider，不能把 provider 名称写死在按钮逻辑里。前端只能把它呈现为短剧项目内的后续生产步骤，不能把短剧工作台变成泛用视频工具。
- 通用 HTTP 视频通道只在配置 `DRAMA_VIDEO_HTTP_CREATE_URL` 后注册；可选配置包括 `DRAMA_VIDEO_HTTP_STATUS_URL`（支持 `{taskId}` 占位符）、`DRAMA_VIDEO_HTTP_API_KEY`、`DRAMA_VIDEO_HTTP_PROVIDER_ID`、`DRAMA_VIDEO_HTTP_PROVIDER_LABEL`、`DRAMA_VIDEO_HTTP_PROVIDER_DESCRIPTION`、`DRAMA_VIDEO_HTTP_TIMEOUT_MS` 和 `DRAMA_VIDEO_HTTP_SUPPORTS_REF_IMAGES`。外部接口返回的 `taskId` / `providerTaskId` / `id`、`status`、`resultUrl` / `videoUrl` 会被标准化为 `DramaVideoPrompt` 的 provider 任务状态。
- 视频 provider 是否接收角色参考图必须由后端注册表的 `supportsRefImages` 声明。镜头创建 provider 任务时，服务层只读取该镜头 `characterRefs` 指向的项目角色；当角色 `portraitData` 为 `done` 且包含 URL 时，设计稿会作为 `refImages` 传给支持参考图的 provider。未声明支持的 provider 不接收 `refImages`，避免外部接口因未知字段失败。
- 角色设计稿端点通常是 `/api/drama/character-images/...` 的相对地址。对云端视频 provider，可配置 `DRAMA_VIDEO_REF_IMAGE_BASE_URL`（或通用 `APP_BASE_URL`）把相对地址规范化为绝对 URL；若 provider 需要 base64 或临时对象存储，应在 provider 适配层扩展，不应把上传逻辑塞进前端按钮。
- `DramaShot.keyframeData` 是镜头首帧图状态字段，保存 `{ status, url, prompt, provider, generatedAt, error }`。首帧图通过项目内镜头生成入口创建，图片文件存放在 `drama-shots/{shotId}/`，公开 URL 使用 `/api/drama/shot-images/{shotId}/keyframe`。
- 镜头已有 `keyframeData.status === "done"` 时，创建视频 provider 任务必须把首帧图 URL 放在 `refImages` 首位，再追加该镜头角色的设计稿 URL。这样 provider 支持 image-to-video 时能优先锁定构图，不支持参考图时仍由能力声明降级为文本视频任务。
- 分镜视频页的首帧图生成使用图片 Provider 配置，只展示已配置、已启用且支持图片生成的 Provider；视频 Provider 选择与图片 Provider 选择是两条独立能力，不应混用。
- TTS provider 通过 `TTSProviderPort` 抽象接入，可用 provider 由 `/api/drama/tts-providers` 暴露给前端。默认 `mock` 只用于本地联调；通用 HTTP 配音通道只在配置 `DRAMA_TTS_HTTP_SYNTHESIZE_URL` 后注册，并把外部服务返回的 `audioUrl` / `url` / `resultUrl` 和 `durationSec` / `duration` / `seconds` 标准化为镜头台词音频。
- `DramaShot.dialogueAudioData` 是镜头级配音状态字段，保存 `{ status, provider, items, generatedAt, error }`。`items` 按台词行记录 `{ lineIndex, speaker, text, voiceId, audioUrl, durationSec, provider }`，其中 `voiceId` 来自说话人匹配到的 `DramaCharacter.voiceProfile`。说话人无法匹配角色时可以继续合成，但不会绑定角色声线。
- 单集 SRT 导出属于成片组装前的确定性时间轴产物，入口为 `/api/drama/projects/:id/episodes/:order/export?format=srt`。有分镜时按最新分镜的镜头顺序和 `DramaShot.durationSec` 推算字幕时间；当镜头已有 `dialogueAudioData.status === "done"` 且台词项包含音频时长，优先使用真实配音时长生成字幕区间；没有配音时在镜头内部按台词文本长度分配时间；没有可用分镜台词时，退回到单集台本正文逐行导出。
- 单集剪辑草稿导出入口为 `/api/drama/projects/:id/episodes/:order/export?format=timeline-json`。草稿使用 `ai-novel.drama.timeline.v1` 稳定 JSON 格式，按最新分镜输出镜头顺序、视频轨、配音轨和字幕轨。视频轨读取 `DramaVideoPrompt.resultUrl / status / providerTaskId`，没有可用视频结果时保留缺口 warning；配音轨读取 `DramaShot.dialogueAudioData`；字幕轨复用 SRT 时间轴规则。该格式是内部粗剪交接格式，不等同于已经完成 mp4 合成。
- `DramaBatchJob` 是短剧生产管理层的整集队列记录，入口为 `/api/drama/projects/:id/episodes/:order/batch-jobs`。当前支持 `keyframes`、`videos` 和 `tts` 三类任务，任务状态使用 `pending / running / paused / done / failed` 字符串，`progress` 保存 `{ total, done, failed, skipped, failedShotIds, provider, targetShotIds, currentShotId, errors }`。
- 批量任务成本估算入口为 `/api/drama/projects/:id/episodes/:order/batch-jobs/estimate`，使用与创建任务相同的目标镜头筛选规则。`progress.cost` 保存 `{ currency, estimated, actual, estimatedUnits, actualUnits, unit }`；创建任务时写入预计费用，运行时只把真正处理的镜头计入实际费用，跳过项不增加实际成本。
- 成本单价属于 provider 能力声明的一部分。视频和 TTS provider 可暴露 `costPerSecond / currency`，首帧图使用图片 Provider 的按图单价配置；未配置单价时仍展示 `0`，不阻塞生产任务。
- 批量首帧任务只处理最新分镜下的目标镜头；已有可用首帧图的镜头应计入跳过，失败镜头写入 `failedShotIds`，前端用同一入口携带 `failedShotIds` 发起失败项重试。
- 批量视频任务按镜头顺序串行处理：没有视频提示词时先生成提示词，再创建 provider 任务；已有非失败 provider 任务的镜头计入跳过。视频文件生成仍由 provider 侧异步完成，批量任务负责把每个镜头的视频任务创建到可轮询状态。
- 批量配音任务按镜头顺序串行处理：已有可用 `dialogueAudioData` 的镜头计入跳过；没有台词的镜头保存 `idle` 状态；provider 失败时写入镜头错误状态和批量任务失败列表，用户可只重试失败镜头。

## Failure Modes

- 只在列表页放“整理素材 / 生成策略 / 生成分集”按钮，会让用户无法理解产物在哪里，也无法继续生成台本、检查质量或导出。
- 让用户手填小说 ID 会把内部数据标识暴露给新手用户；导入小说必须使用已有小说选择器。
- 裸展示策略 JSON 或质量 JSON 可以作为早期调试状态，但后续应逐步卡片化为用户能理解的字段。
- 把 `repairable` 保存成普通已检查状态会让下一步任务跳过修复，直接进入分镜和视频任务。质量状态投影必须保持“可修复问题优先处理”的顺序。
- provider 未声明参考图能力却收到角色图字段，可能导致外部 HTTP 接口直接拒绝任务。参考图注入应以 `supportsRefImages` 为唯一开关。
- 视频任务只接收角色设计稿而忽略已生成首帧图，会让 image-to-video 失去构图锚点。首帧图和角色设计稿都存在时，首帧图必须排在 `refImages[0]`。
- SRT 时间轴不能依赖前端临时状态推算；字幕导出必须由后端读取最新分镜和单集台本生成，保证下载文件与当前项目数据一致。
- 剪辑草稿不能把缺失视频结果伪装成可用成片。没有 `resultUrl` 的镜头必须保留在时间轴中并写出 warning，方便用户知道还需要生成或刷新哪些镜头。
- 成本预估不能替代 provider 侧真实账单。没有配置单价时必须显示为未配置或 0；实际费用只代表系统按已配置单价和已处理镜头推算出的项目内生产成本。
- 批量任务不能把 provider 任务成功创建误判为视频成片完成。`videos` 批量任务的 `done` 表示镜头已进入 provider 任务队列或被跳过，最终视频结果仍以 `DramaVideoPrompt.status / resultUrl / failureReason` 为准。
- 配音任务不能把说话人文本当作固定角色 ID。声线绑定只能来自当前项目角色名与对白说话人的匹配；无法匹配时应保留台词合成能力，并把缺失 voiceId 暴露为后续角色资产补全问题。

## Related Modules

- `client/src/pages/drama/DramaWorkspacePage.tsx`
- `client/src/pages/drama/DramaProjectPage.tsx`
- `client/src/api/drama.ts`
- `server/src/modules/drama/http/dramaRoutes.ts`
- `server/src/services/drama/DramaProjectService.ts`
