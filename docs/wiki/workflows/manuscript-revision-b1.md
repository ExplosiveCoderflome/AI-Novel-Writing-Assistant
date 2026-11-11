# 长篇原稿修订的来源与基线合同

## 背景与边界

导入已有小说与从大纲开书不是同一流程。原稿是用户资产，不能用生成器重建，也不能覆盖已有作品。B1 只创建新的长篇修订副本；短篇导入独立验收，不伪造 Segment 或导演任务。

## 来源与分区

`ManuscriptSource.rawBytes` 保留原始文件，`sourceText` 是严格解码后的完整 UTF-16 文本；rawHash 与 sourceHash 分别校验，不自动规范化 CRLF、空行、标点和 emoji。BOM 优先于界面默认编码，无法严格解码时要求明确重选编码。20 MiB / 300万 UTF-16 单位 / 3000 正文单元是拒绝上限，不是截断长度。

分区必须从 0 连续覆盖到 sourceText.length，不能重叠、留缝或切开代理对。正文、目录、前后文和人工核对区都有明确去处。全文扫描的标题只是待核对候选，同名标题不代表同一个单元，也不能据此自动合并人物或正文。

## 维护规则

来源不可经 PUT 覆写。修改章节工作稿不改变 sourceRanges；无原稿的新章用空 ranges 明确标识。规则识别不宣称模型已理解全书，用户必须核对区间和角色；无标题可明确确认全文一章。

## 原子物化与只读对照

导入确认在单个 Prisma 事务中创建 Novel、全部 Chapter 和稳定 Unit→Chapter 映射，再确认 Session；任一写入失败都回滚。章节正文直接采用 sourceText.slice，不 trim、补标题或调用 writer/diagnose。独立 importRequestKey 与 confirmedRequestKey 分别保护来源创建与物化重放，改载荷不能沿用原请求。

工作稿 hash 使用原始正文 SHA256，不能拿派生同步中规范化空白的短 hash 代替保存 CAS。Source 下载返回原始字节；合并后对照按全部 sourceRanges 连接，不仅读第一段。初次导入不自动重放所有事实/时间线消费者。

## 原纲与工作大纲

AI 反推逐个读取正文源单元的全部片段，不复用 24k 目录前缀。每片的逐字引句必须能在对应 sourceRange 内定位；证据校验置于 PromptAsset.postValidate，复用有界 semanticRetry 修正片尾补句，不能过滤掉伪引句后假装成功；诊断引用同样校验。完整覆盖与尾章证据保存在持久提案。摘要分层归并，不把所有原稿或所有章节摘要直接塞进一次模型请求。每层 summary 必须保留全部输入组的关键事件；theme 是抽象主题，tone 是文风标签，不能把后半部剧情错放到这两个字段，导致最终梗概丢失中后段。尾章证据只校验结局，不可用于否定前中章剧情或已逐片验证的覆盖；未提供某条引句不等于全书无该事实。采用固定版本的注册 Prompt，模型配置及依赖随提案保存。

分片使用 js-tiktoken 的 cl100k_base 代理估算，单片原文最多 3500 代理 token 并保留 prompt 余量；这不是 DeepSeek 原生精确计费数字。UI 显示结构化请求上限，达到上限保留 checkpoint 并允许提高预算后继续。模型内部 repair/retry 的实际收费仍以调用台账为准。

用户确认前仅创建可校正的 A1 大纲项目与提案，不写确认指针。确认时必须校验候选修订属于本次项目，冻结 exact revision，再复制为独立工作纲。人工校正 revision 的 sourceType 可为 manual，但基线来源标签从原稿提案读取，不能丢掉作者提供/AI 反推的区别。A1 latest 后续移动不影响冻结指针，也不会产生 A2 的伪开书绑定。

## 持久任务与取消

复用 TaskDispatcher 作为唤醒信号，Prisma 提案行保存 generation、owner、过期 lease、真实分片 checkpoint 和预算计数。重启由轮询恢复过期 lease；结果写回必须 CAS 原 dependenciesJson 与 generating 状态。取消先改持久状态再 abort 本地模型请求，晚到结果不能重新成为 pending。来源不删除，成功 applied 回执不被任务重试覆盖。

## 单章修文与持久撤回

B1 以有类型的 server-authored context 调用既有 NovelChapterEditorService.previewAiRevision，并沿用 diff 和手动正文 CAS 原语。整章与选区候选都持久为完整可替换的当前章版本，选区外原始 CRLF 与字符不改变。原稿不塞进 customInstruction，全书规划明确标注“不代表本章已经发生”；最近有效工作稿前文是权威上下文。

采纳只接受本提案持久 candidateId，不接受浏览器提交候选正文。事务同时校验 sourceHash、结构版本、当前正文/单元修订、冻结基线、工作纲 exact revision 与前文 hash，提交正文、单元版本、永久 before/after 回执和事实/时间线 outbox。旧章节 CRUD 对 B1 明确拒绝，避免绕过。预览、取消或拒绝都不写正文，也不启动下一章。

Undo 是一条新的受版本保护命令；只有最新 afterHash、单元修订和结构版本仍匹配才允许，不覆盖其后手改。永久回执与 Source 不依赖自动快照的十次轮换。同步失败保留已保存正文，从修订源页重试资料对账，不重新改稿。

## 结构修订、有效章序与派生失效

结构预览保存全部单元的实际正文 hash、workingRevision 与稳定 ID，不接受浏览器提供的正文版本作为权威值。确认事务先锁项目版本，再 CAS 所有单位及原工作纲 exact revision；新增章有新身份、停用章保留负序目录行、合并按有效顺序纯拼接全文并保留所有原文 sourceRanges。恢复是独立结构命令。冻结原纲不改写，工作纲新建修订、保留人物/伏笔/固定设定引用并明确要求核对，不把计划写为已发生事实。

有效目录统一从 ManuscriptUnit.active 投影为 1..N；目录、普通编辑器相邻章、导出、前文上下文及书架已写/规划计数都排除停用章。导出仍由成熟模块处理；原稿下载始终读取 Source 的 rawBytes，与工作稿无关。普通 CRUD、续写与 V1/V2 导演 admission 对修订副本拒绝，避免绕过明确采纳。上下文组装遇到停用目标必须抛出带 409 的业务错误，不能用无类型异常把安全拒绝变成 500。

修改前文会把后续章节资料 checkpoint 标为 superseded，并使后续正文提取的时间线事件失效，保留计划/人工事实及原稿。时间线模型工作开始前捕获完整 B1 snapshot，最终事务以同一项目锁校验结构、正文、工作纲和前文；后章正文相同也不能把旧前文推导结果迟到写入。结构变化按最早影响章失效并保留历史，后章正文不自动重写。

旧正文入口必须在 `ChapterExecutionPreparationService` 的生产装配中先复用 `rejectLegacyManuscriptWrite` 拒绝原稿副本（含有效章和停用章），再执行时间线、合同和章节计划准备；只在上下文装配器拒绝太迟，未缓存计划仍可能消耗模型并写入派生产物。装配器保留二次只读校验以覆盖准备后的状态变化；两处均返回可恢复的 409，非原稿书没有 Project 时沿用原流程。

## 验证与开放边界

自动化使用真实临时 SQLite、全量迁移、mock structured prompt，不调用真实模型。长稿覆盖超 24k 目录前缀、Unicode/CRLF、字面特殊 token、重放/取消/陈旧任务、事务故障注入、永久 Undo、工作纲引用与 V2 admission。源文本分片采用 cl100k_base 的跨模型保守代理预算，并非 DeepSeek 原生计费；structured 调用预算不等同底层 JSON 修复/网络尝试次数。客户端默认功能开关关闭，移动端不挂载重功能。真实模型仍需独立复制库留证，不以 mock 或输出观感替代 sourceRange、冻结修订与正文 hash 对照，不能据此关闭 #230。

## 短篇原稿导入与 Segment 适配

短篇导入使用真实 `ManuscriptUnit → ShortStorySegment` 映射。导入分节直接来自确认的 source ranges；无标题全文可作为一个 Segment，人工边界调整在物化前完成。Segment 内容、顺序和来源映射在同一事务创建，工作区通过 ManuscriptUnit 统一投影，原生短篇继续沿用原有意图/任务上下文。

导入短篇上下文明确是 `imported`：它提供现存 Segment、原文对照和分节修订所需上下文，但没有 active intent 或 workflow task。禁止为满足旧短篇服务前置条件创建虚假意图/生成任务。短篇修订沿用持久 proposal、内容版本 CAS、采纳回执和撤回；更新 Segment 与 Unit revision 同一事务，导出按有效 Unit 顺序连接当前 Segment 正文，不插入额外分隔字符。原生短篇的生成式全篇规划不适用于 imported 项目；结构增删/合并暂时拒绝，避免破坏 Segment order 与既有原生流程。
