# Prompt Registry 与结构化输出

## 背景

项目是 AI-native 小说生产系统。意图识别、任务分类、规划、路由、工具选择、质量判断和修复建议都应依赖 AI 的结构化理解，而不是关键词和硬编码分支。

历史上，产品级 prompt 容易散落在 service 里，伴随本地 `JSON.parse`、try/catch 修复和局部 normalization。这样会让结构化输出、repair、语义重试、上下文要求和治理元数据无法统一审计。

## 决策

`server/src/prompting/` 是新增产品级 prompt 的唯一治理入口。产品级 prompt 必须作为 `PromptAsset` 注册，并通过统一 runner 执行。结构化输出使用 schema、JSON repair 和 semantic retry 处理；确定性代码只做输入校验、安全边界和已结构化输出后的处理。

## 当前规则

- `director.risk.assessment` 只负责把无法由确定性安全检查直接编码的问题结构化为稳定问题码、1～8 风险分、证据与建议动作。业务服务不得根据异常消息关键词或正则猜测问题类型；已知的空正文、明确重规划、保护内容和数据完整性信号可以直接提供稳定问题码，再由统一治理服务应用策略。
- 风险评估失败不能生成虚构分类。确定性调用方提供的问题码仍然有效；只有 `runtime.unclassified` 允许 AI 改判为更具体的稳定问题码。安全锁定规则在结构化评估之后执行，AI 建议不能越过全书继续规则或数据安全底线。

- 新增产品级 prompt 必须放在 `server/src/prompting/prompts/<family>/`。
- 新增产品级 prompt 必须在 `server/src/prompting/registry.ts` 注册。
- 新增产品级 prompt 还必须进入提示词管理目录，能够被检索、查看版本、预览实际上下文并执行受控测试；只完成 Registry 注册不等于完成提示词管理纳管。
- Prompt 工程完善的最高优先级是正文写作提示词，尤其是 `novel.chapter.writer` 及其直接依赖的章节写作上下文。规划、审校、修复、Workbench 和可视化工具的改动都应服务“能稳定产出可用正文”这一主目标；如果资源有限，优先保证正文写作 prompt 的上下文完整、角色硬事实准确、章节任务清晰、风格约束可控、章末钩子可执行。
- `PromptAsset` 必须提供 `id`、`version`、`taskType`、`mode`、`language`、`contextPolicy`、`render()`，结构化 prompt 还必须有 `outputSchema` 或等价校验。
- 创作语义判断必须 AI-first。角色身份承接、隐藏身份、题材理解、故事职责、质量风险、下一步动作、修复建议等产品语义，不得用正则、关键词表、固定字符串片段、字符比例或手写分支来判断或阻断流程；这类能力应进入 PromptAsset、结构化输出 schema、semantic retry 或 AI 评估链路。
- 确定性代码只允许处理结构契约和安全边界，例如必填字段、枚举归一、ID 是否存在、数组长度、权限和数据保护。确定性质量闸门可以指出“缺少 protagonist / gender / 必填字段”这类结构问题，但不能判断“是否承接了某个题材身份”“名字是否像功能位”“语言是否像英文残留”等创作语义。
- 结构化输出使用 `runStructuredPrompt`，纯文本使用 `runTextPrompt`，流式能力使用对应 stream runner。
- JSON 解析、schema 校验失败由 repair policy 处理；JSON 合法但业务语义不合格由 semantic retry 处理。
- 自动导演关键路径优先使用职责单一的小型结构化合同。开篇世界切片、路线窗口和下一章执行合同应分别约束，不要为了减少代码步骤把整本世界、全角色、整卷章节和执行细节塞进一个巨型 JSON。拆分的目标是降低 repair 面积和首章前耗时，不是复制生产链。
- 自定义高级模板或业务上下文只能影响提示词正文。运行时必须在模板编译后强制追加 JSON skeleton、完整 Schema 和 repair 合同，用户模板不能覆盖这些结构安全边界。
- 所有通过 registry runner 执行的 PromptAsset 都必须产生 prompt quality telemetry，用于观察 repair 率、semantic retry 率、空输出率、上下文 token 预算、输出长度和耗时。业务服务不得绕过 runner 自行吞掉 postValidate 失败；语义失败应通过 `semanticRetryPolicy` 重试，或通过明确的 `postValidateFailureRecovery` 降级。
- 章节列表、卷级拆章这类规划 prompt 可以在结构化输出后增加轻量业务质量闸门，用于拦截空泛摘要、连续被动推进、第一人称长句章名、缺少主角主动行动或缺少阶段兑现 / 钩子的章节段。质量闸门只负责指出结构化结果的问题并触发重试，不能替代 AI 做章节规划，也不能用关键词分支生成章节内容。
- Prompt 中展示给模型的状态名、枚举名和示例必须与 schema 可接受值一致。上下文里如果存在历史别名或业务口语值，例如 `active` 表示已推进但未兑现，应在 prompt 明确转换规则，并在 schema preprocess 中做确定性归一，不能把同一类别名反复交给 LLM repair。
- 高频评估类结构化 prompt 必须同时具备完整 JSON skeleton、受限枚举表、非空示例和 schema preprocess。章节接收闸门、章节任务单质量门禁这类 prompt 不能只在自然语言里描述“可用 / 可修 / 阻断”，必须把 `status`、`verdict`、`issues.target`、`confidence` 等字段的合法值写入 system prompt，并在 schema 边界归一常见别名，例如 `acceptable -> accepted`、`pacing -> semantic`、`85 -> 0.85`。
- 抽取类 schema 如果用字符串承载“可读状态值”，必须在 PromptAsset 中明示数值也要按字符串输出，并在 schema 层对已经结构化的数值 / 布尔标量做确定性字符串化。典型场景是时间线 `stateChanges.before/after`：差评值、评分、倒计时等是剧情状态，不是计算字段，进入连续性账本时应保存为 `"19"`、`"5"` 这类可读文本，避免每次抽取都把合理数值输出推给 JSON repair。
- 聚合型结构化 prompt 必须列出所有受限 enum 字段，不能只列最容易出错的字段。章节资产抽取这类一次性输出多个子账本的 prompt，应同时约束 `updateType`、`resourceType`、`narrativeFunction`、`scopeType`、`syncPlan` 等字段；否则模型会用语义合理但不被 schema 接受的自然分类词，导致后台任务被 Zod 校验失败卡住。
- 结构化输出后的确定性归一只用于字段别名、枚举别名和兼容旧形状，例如把 `pacing` 映射为接收闸门的 `plot`、把 payoff `active` 映射为 `pending_payoff`、把字符串风险转成 `{ code, severity, summary }` 对象。不能用这种归一替代 AI 对剧情事实、风险等级或下一步动作的判断。
- 章节接收闸门、时间线抽取和章节资产抽取都属于高频后台结构化 prompt，示例必须覆盖非空对象数组。`missingObligations`、`hooks/possibleHooks`、资源变化等字段不能只给空数组示例，否则模型在发现真实问题时容易自造字段或把对象压成字符串。
- 事实抽取类 prompt 不继承创作温度。时间线、章节资产 delta、接收闸门等用于审校或账本写入的调用应在 service 层钳制低温，避免自动导演高创造温度放大 schema drift。
- JSON repair 日志应保留 `promptId`、`schemaPaths`、`repairAttempt` 和 `validationError`。诊断 repair 率时先按 `promptId + schemaPath` 聚合，判断是 prompt 示例、枚举合同、上下文污染还是模型路由问题。
- JSON repair 必须接收目标 JSON Schema，不能只依赖原始校验错误推测字段结构。尤其在原始文本无法解析、`schemaPaths` 为空时，完整 schema 是修复模型恢复必填字段、嵌套对象和枚举合同的唯一可靠依据。
- repair 不应无限量回放损坏输出。遇到超长重复、乱码或退化内容时，应保留足够的前缀与尾部用于恢复语义，同时压缩中间异常内容，避免损坏文本继续污染修复上下文。
- 开书灵感、短方向候选这类“小结构、强创作上下文”的任务，通用 JSON repair 可能只恢复字段结构，却丢失用户已选题材、推进方式和方向差异。此类 PromptAsset 应限制采样温度与输出预算、给出完整非空数组示例；原始输出退化或结构损坏时，优先携带原始业务上下文重新执行已注册 Prompt，而不是让无业务上下文的 repair 补造一组新内容。传输错误仍直接返回，不能用内容重试掩盖模型连接问题。
- 长列表与多层对象类 PromptAsset 必须同时控制字段长度、数组规模和调用级输出预算。仅声明“严格 JSON”不能防止模型把说明文字塞进字段或在闭合括号前持续生成；可以按卷、节拍或片段拆分的结果，应优先分段生成并持久化。
- 空模型响应不属于 JSON 或 schema 修复问题。结构化运行时必须在进入 repair 前识别空响应，将其归为模型传输 / 输出失败，并优先交给模型路由、备用模型或当前生产项重试；repair 没有原始语义可保留，禁止用空对象补造必填业务内容。
- 支持开关思考模式的模型执行结构化任务时，应由 provider capability profile 显式关闭思考模式，避免推理预算耗尽后没有最终 JSON。新模型别名接入时必须同步验证其思考开关、结构化 profile 和实际请求参数，不能只把模型名加入下拉列表。
- Semantic retry 必须把原始业务失败原因传回重试 prompt，并指明需要整体重排还是局部修正。章节列表、卷级拆章这类结果如果因为标题同构、章节功能重复、摘要空泛或结尾牵引不足被拒绝，重试指令应要求重排整组标题骨架和章节功能分配，而不是只替换被点名的一章。
- editable slots 只能开放低风险表达层内容，不能覆盖 schema、postValidate、taskType、mode、contextPolicy、工具目录、审批边界或 required context。
- Prompt Workbench 的可视化编辑器只能把 `PromptAsset.slots` 呈现为可编辑项。`replace`、`token`、`append`、`choice` 和 `toggle` 可以映射成不同控件，但保存仍必须走 slot override；不得把整段 system prompt、contextPolicy 或 schema 暴露为自由编辑文本。
- Prompt Workbench 的上下文注入面板只读消费 `preview.context.blocks`、`selectedBlockIds`、`droppedBlockIds` 和 `summarizedBlockIds`。`chapter_mission`、`character_hard_facts`、`obligation_contract`、`style_contract` 等 required 或关键生成上下文必须显示锁定状态，不能在前端提供关闭 required context 的入口。
- Prompt Workbench 在“本书”范围下如果同时选择了小说和章节，预览必须优先使用该小说章节的只读上下文；只有没有真实章节或无法装配真实上下文时，才允许通过 `executionContext.metadata.extraContextBlocks` 提供示例资料块。示例块只服务预览，不保存为用户覆盖，也不能替代正式运行时的 Context Broker / resolver。
- `novel.chapter.writer` 的 Workbench 预览必须注入只读 `chapterWriteContext`，并通过默认 Context Broker 解析出 `book_contract`、`chapter_mission`、`timeline_context`、`previous_chapter_hook`、`character_hard_facts`、`obligation_contract`、`volume_window`、`participant_subset`、`local_state` 和 `style_contract`。预览按钮不得调用会补写章节计划、推进自动导演或修改小说数据的生成装配器；如果只能使用降级上下文，诊断信息必须说明来源边界。
- Prompt Workbench 的测试产出是预览之后的受控执行入口。它可以用当前未保存的 slot 草稿或高级模板草稿调用 LLM，并允许用户为这次测试选择 provider、model、temperature 和输出上限；但它仍必须先走注册 `PromptAsset`、Context Broker、slot/template 编译、结构化 schema 和 repair 策略。测试产出不得接受任意自由 system prompt，不得改写 `contextPolicy`、schema、postValidate、semantic retry 或 required context。
- `PromptAsset.contextRequirements` 中声明的每个 required group 都必须能被默认 Context Broker 解析，或在真实调用路径中通过 fallback blocks 明确补齐。像 `chapter_boundary`、`structure_obligations` 这类审校必需上下文，不能只写在 prompt 文案或前端示例里，必须有后端 resolver / context block 产出路径。
- Prompt Workbench 的官方版本库以代码注册的 `PromptAsset.slots` 为可信来源。官方当前版只能读取槽位默认值、hash、版本号和 changelog；不得把数据库里的自由编辑文本当作“官方 prompt”，也不得开放 schema、contextPolicy、required context、postValidate 或审批边界给用户覆盖。
- 正文写作高级模板是受控专家能力，允许正式正文生成 Prompt 在明确的作品范围覆盖 `system` / `human` 模板。它服务成熟用户对正文写作表达和上下文摆放的精细控制，不改变 `PromptAsset.id/version/taskType/mode`、schema、postValidate、contextPolicy 或正文输出形态。
- 正文写作高级模板的目标范围包括所有正式正文生成 Prompt，而不是永久限定在 `novel.chapter.writer`。长篇章节、短篇片段及后续新增的叙事正文 Prompt 都必须支持安全槽位编辑和高级 System / Human 模板编辑；尚未接入的 Prompt 属于能力缺口，应通过 PromptAsset 能力声明统一接入，不能继续在前端累加 Prompt ID 特判。
- 正文 Prompt 必须把平台写法作为正式可观察上下文。平台写法控制节奏、段落、冲突与回报密度、关系线权重和结尾牵引，不得覆盖人物硬事实、世界规则、当前任务或已确认情节。完整规则见《平台写法配置与正文 Prompt 可编辑合同》。
- 高级模板只能通过稳定 token 引用上下文、运行变量和槽位，例如 `{{context.chapter_mission}}`、`{{input.chapterTitle}}`、`{{slot.writer.tonePreference}}`。未知 token、未注册 context group 或非法 slot key 必须在预览或保存前被拦截，不能进入可启用版本。
- `novel.chapter.writer` 的 required context 在高级模板中仍是最低安全边界。用户可以决定 `book_contract`、`chapter_mission`、`timeline_context`、`previous_chapter_hook`、`character_hard_facts`、`obligation_contract`、`volume_window`、`participant_subset`、`local_state`、`style_contract` 的摆放位置；如果模板没有显式引用某个 required group，运行时必须在 human message 末尾追加必需上下文保底区块。optional group 只有被模板显式引用时才注入。
- `novel.chapter.writer` 最终发送给模型的上下文正文必须面向写作任务可读。`{{context.xxx}}` 和保底 required context 可以在模板、诊断和结构字段中保留原始 group key，但渲染到 human message 时，区块标题和主要字段应使用中文标签，例如 `timeline_context` 显示为 `时间线`、`Title` 显示为 `标题`、角色状态显示为 `目标 / 状态 / 情绪`。内部数据库 ID、风格规则 id 和 `effective_style_profile_id` 这类调试字段不得进入 writer-facing 正文上下文；如需排查，应保留在 diagnostics、日志或专用 meta 文本中。
- 高级模板版本历史属于本书覆盖数据，不是官方版本库。每次保存创建不可变版本并设为 active；回滚只切换 activeVersionId；恢复官方模板只把 mode 切回 `official` 并保留历史版本，真实生成随即回到 `PromptAsset.render()`。
- Slot override 的解析优先级固定为：本书覆盖或本书 `official_default` 标记 > 全局覆盖 > `PromptAsset.slots` 官方默认。旧数据中只有 `{ value, baseHash }` 的槽位视为 `custom`，保持兼容。
- `official_default` 只表示“当前作用域明确采用官方默认值”。全局层保存官方默认值应删除该槽位覆盖；本书层保存官方默认值时，如果全局层存在自定义覆盖，必须写入 `official_default` 标记来遮蔽全局值；如果没有全局覆盖，则删除本书覆盖即可。
- “恢复官方当前版”必须通过官方恢复动作处理，而不是简单删除本书覆盖。删除本书覆盖的含义是回到继承链；在有全局覆盖时，这会重新继承全局值，不等于恢复官方默认。
- “保留我的设置”只能更新当前槽位的 `baseHash/baseVersion`，用于确认用户接受自己的覆盖与当前官方版本的差异；不能顺手改写官方默认值、schema 或上下文策略。
- 旧未纳管 prompt 路径被触碰时，默认先迁入 registry，再扩展能力。
- 推进模式库的“扩展”属于正式产品 AI 能力：它必须由注册 PromptAsset 同时读取选定根模式、现有同级模式和整库摘要，再输出可直接落库的完整 profile 候选。不能在前端按名称相似度或固定类别补齐，更不能把“扩展”退化为只换名称的子类生成。候选保存仍必须通过既有两级树、重复名称与 profile 校验。

批准例外：

- `server/src/llm/structuredInvoke.ts` 内部 JSON repair。
- `server/src/llm/connectivity.ts` 这类连通性探针。
- 阶段性保留的 stream bridge，例如 `graphs/*`、`routes/chat.ts`、`services/novel/runtime/*`。

这些例外不是新增 prompt 的默认入口。触碰例外文件时，优先评估能否迁入 PromptAsset + runner；暂时不能迁入时，应补齐等价的 prompt telemetry bridge，避免形成不可观测的第二套 prompt 执行路径。

## 示例

推荐做法：

- 新增章节接收闸门时，先定义结构化输出 schema，再注册 `PromptAsset`，最后由服务消费结构化结果。
- 新增意图识别能力时，扩展 AI schema 和工具合同，不加关键词 fallback。
- 角色阵容质量不足时，修角色准备 PromptAsset、结构化 schema、postValidate / semantic retry 或上下文块，不在 service 中新增关键词、正则或字符比例判断。
- Prompt Workbench 预览只读返回 messages、上下文块、缺失 required groups 和 trace preview，不保存运行时 override。
- Prompt Workbench 测试产出用于保存前验证当前草稿。结构化 prompt 应返回 schema 校验后的 JSON、repair 次数和诊断；文本 prompt 应返回模型文本。测试结果可以帮助判断提示词调整是否有效，但不能写入小说正文、推进自动导演或替代正式章节执行链。
- 某本书需要摆脱被改坏的全局“章末钩子”时，应在本书层写入 `mode: "official_default"`。这样预览、运行时渲染和后续生成都会使用 `PromptAsset.slots` 的官方默认章末钩子，而不是全局覆盖。
- 用户只想撤销本书自己的改动、继续继承团队/全局设置时，应清除本书覆盖；如果全局设置本身被改坏，则应使用“恢复官方当前版”。
- 成熟用户要把“角色硬事实”提前放到 human message 开头时，应在正文写作高级模板中插入 `{{context.character_hard_facts}}`；如果同时没有插入 `{{context.style_contract}}`，系统会在 human message 末尾追加风格合约保底块。
- 某本书试验过激写法后想回到官方正文 prompt，应使用“恢复官方模板”。这不会删除历史版本，后续仍可回滚查看，但真实生成会重新使用 `PromptAsset.render()`。

禁止做法：

- 在 service 内直接拼 `systemPrompt/userPrompt` 后调用裸 LLM。
- 在业务文件里新增一套本地 JSON 修复和 schema 分支。
- 让 Prompt Override 直接替换整段系统提示词或结构化输出 schema。
- 让测试产出接口接受任意 messages 或自由 prompt，绕过注册提示词、Context Broker、slot/template 编译和结构化输出治理。
- 把高级模板扩展到审校、规划、修复或全局范围，或让高级模板编辑 contextPolicy、schema、postValidate、模型参数和返回结构。
- 在高级模板中通过空模板、未知 token 或删除 required context 的方式绕开正文写作安全上下文。
- 在角色准备、章节规划、意图识别、质量检查、RAG 选择或自动导演路由中，用固定词表、正则、字符比例或特殊字符串分支替代 AI 结构化理解。
- 用删除本书覆盖来实现“恢复官方默认”，因为这会在存在全局覆盖时错误继承全局值。
- 把“官方版本库”做成用户可编辑的数据库 prompt 后台，绕开 `PromptAsset.slots` 的代码注册边界。

## 失败模式

- 模型返回 JSON 不稳定：先检查 schema、provider JSON 能力和 repair policy，不在业务 service 里补局部解析。
- 模型请求耗时较长但最终 `content` 为空：先看 LLM 会话日志中的响应长度、模型名和思考模式参数。若原始响应为空，不要根据后续 `{}` repair 错误误判为字段缺失；应检查该模型是否需要关闭思考模式，并确认空响应被归入模型调用失败而不是 JSON repair。
- 同一 prompt 频繁进入 JSON repair：检查日志里的原始字段值是否来自上下文或示例中的非 schema 值。如果模型只是复用了 prompt 中出现的别名，应先修 prompt/schema 合同；如果输出语义完整但字段名是常见别名，应在 PromptAsset schema 层归一，而不是让后台任务无限重试。
- 关键路径 repair 率升高时，还要检查合同是否同时承担了远期规划和当前执行。若大量失败集中在深层数组、跨卷章节或非开篇角色字段，应缩小当前 PromptAsset 的职责和输出窗口；不能靠增加 repair 次数掩盖过大的结构合同。
- 原始输出很长、尾部出现重复字串或乱码，并伴随“未检测到完整 JSON 值”、控制字符或缺少闭合括号：优先判断为输出预算失控或模型退化。应收紧字段与数组边界、压缩输入上下文、设置与任务规模匹配的输出上限，而不是增加更多 repair 轮次。
- 短创意候选经过 repair 后格式正确但突然偏离用户题材或推进方式：检查 repair 是否只拿到了损坏输出和 JSON Schema。若原始任务依赖强业务上下文，应禁用该 PromptAsset 的通用内容修复，改为用原始上下文、受控温度和同一输出合同重新生成一次。
- 合法 JSON 总是在同一 `schemaPath` 失败：优先检查 Prompt 示例、枚举说明和 schema 是否互相矛盾；如果错误值直接来自上下文，应修复上下文合同污染。
- 原始 JSON 无法解析，repair 后又集中缺少必填字段：检查 repair 请求是否携带完整目标 schema。只把解析错误和损坏文本交给模型，会让修复退化成猜测返回结构。
- `expected string, received number` 如果集中出现在状态抽取字段，通常不是模型理解偏差，而是 schema 将“可读状态文本”和“可计算数值”混在同一个字段里。处理顺序应是：明确 prompt 输出合同，给结构化示例，在 schema preprocess 中保留语义并转成字符串；不要要求 LLM 为每一个数值字段单独 repair。
- Prompt Catalog 缺上下文预览：补 `contextRequirements`，不要让预览临时查数据库。
- Prompt Workbench 预览提示缺少 required context：先检查该 group 是否注册在默认 Context Broker，以及 Workbench 样本是否通过 `extraContextBlocks` 提供了手动预览所需的示例块；不要通过放宽 required context 或让用户手动关闭缺失项来掩盖契约缺口。
- Prompt Workbench 测试产出失败：先判断是模型配置不可用、上下文缺失、结构化 schema 校验失败，还是草稿模板编译失败。不要因为测试入口报错就退回直接调用裸 LLM；修复方向应仍然落在模型路由、Context Broker、PromptAsset schema、slot/template 草稿或 repair/semantic retry 合同上。
- `novel.chapter.writer` 预览缺少 `book_contract`、`chapter_mission`、`timeline_context`、`previous_chapter_hook`、`character_hard_facts`、`obligation_contract`、`volume_window`、`participant_subset`、`local_state` 或 `style_contract`：优先检查 Workbench 是否为所选小说章节装配了 `metadata.chapterWriteContext`，而不是删 required group、改前端标签或用示例 `promptInput` 冒充运行时上下文。
- Prompt Workbench 恢复官方默认后仍使用全局坏值：检查本书层是否写入了 `official_default`，以及运行时解析是否仍按“本书 > 全局 > 官方默认”的顺序合并。
- Reconcile 面板一直提示同一个槽位漂移：检查用户是否选择了“保留我的设置”并更新 `baseHash`，或选择了“恢复官方当前版”并清除了旧覆盖 / 写入了 `official_default`。
- 正文写作高级模板预览失败并提示未知 token：检查模板中是否存在未通过 `@` 菜单插入的 `{{...}}`，尤其是拼错的 context group、运行变量或 slot key。修复模板 token，而不是在后端新增别名绕过校验。
- 启用高级模板后真实生成缺少关键上下文：先看预览 diagnostics 中“显式上下文”和“保底追加”列表；如果 required group 没有出现，检查 Context Broker / Workbench `chapterWriteContext` 装配，而不是让用户手写上下文正文。
- 意图识别漏判：修 PromptAsset、输入上下文、schema 或工具目录，不加关键词路由。
- 角色阵容看起来没有承接身份、题材或隐藏真相：先查角色准备 PromptAsset、上下文块和结构化输出，不加本地正则抽取身份，不用关键词判断候选能否自动应用。
- 单个 PromptAsset 的 repair 或 semantic retry 频率异常升高：先查看 prompt quality telemetry 中的 promptId/version、上下文块、输出空率和失败分类，再判断是 schema 合同、上下文污染、模型路由还是 prompt 文案问题。

## 相关模块

- `server/src/prompting/`
- `server/src/prompting/core/promptRunner.ts`
- `server/src/prompting/registry.ts`
- `server/src/llm/structuredInvoke.ts`
- `server/src/llm/capabilities.ts`
- `server/src/agents/`
- `server/src/creativeHub/`

## 来源文档

- [Prompting Registry](../../../server/src/prompting/README.md)
- [平台写法配置与正文 Prompt 可编辑合同](./platform-writing-profiles.md)
- [Prompt Governance Audit 2026-05-08](../../checkpoints/prompt-governance-audit-2026-05-08.md)
- [提示词工作台、上下文装配与统一步骤运行时方案](../../plans/prompt-workbench-context-and-step-runtime-plan.md)
- [LLM Schema Refactor Checkpoint](../../checkpoints/llm-schema-refactor-checkpoint.md)

## 紧凑篇幅与结局 Prompt

`novel.compact_book.structure@v1` 负责三段式结构和结局合同，`novel.compact_book.ending_audit@v1` 负责判断结局合同是否完成。两者都必须注册在 Prompt Registry，并使用结构化 Schema；运行时只用数值章节预算做确定性边界，不用关键词推断结局。

终章正文继续复用 `novel.chapter.writer`，由章节上下文携带终章合同；结构化章节列表在全书终章场景下禁止创建下一主线。结局审校把“可追加收尾”和“必须重规划”区分开，普通文风质量债不得升级成全局失败。

## 自动导演风险评估 Prompt

`director.risk.assessment@v1` 是自动导演异常评分的唯一产品级入口。它接收已结构化的问题、审校结果、重规划建议和任务上下文，返回 1–10 分、类别、影响范围、证据、建议和 `canPause`。评分必须同时覆盖正文可用性、邻章/全书影响、数据与状态风险、可恢复性、用户内容保护和继续生成风险。

运行时只负责确定性安全后处理：运行时安全、数据完整性和明确的全局停止条件统一升为 10 分；章节局部质量债强制禁止暂停。不要在服务层以关键词或正则解释异常、推断风险等级或增加旁路 Prompt；需要改变语义时，应修改该 PromptAsset 的 schema、上下文或指令并保持 Registry 注册。
