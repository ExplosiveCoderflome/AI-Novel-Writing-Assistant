# 短剧创作平台规划 v3：成片产线补全 —— 从「创作工具」到「生产线」

> 状态：规划草案 v3（迭代自 novel-to-shortdrama-adaptation-1.md / v2）
> 日期：2026-06-10
> 前置：v2 的 P0-P6 已基本落地（独立模块 + 三内容源 + 节奏引擎 + 台本产线 + 角色资源 + 分镜 + 视频提示词/Provider 任务 + 角色设计稿合图）。
> 本次迭代主题：**盘点「能产出可发布成片」尚缺的环节**，作为补充阶段 P8-P13 纳入路线图。

---

## 0. 当前已落地能力快照（截至 2026-06-10, feat/drama-module）

| 层 | 已有 | 备注 |
|----|------|------|
| 创作链路 | 策略 → 大纲 → 台本 → review/repair → 分镜 → 视频提示词 | 全链路打通 |
| 内容源 | novel_import / original / text_import | SourceBundle 标准化 |
| 角色资产 | DramaCharacter + 角色库 + **角色设计稿合图**（面部特写+三视图，1536×1024） | portraitData 存设计稿 URL |
| 视觉一致性 | 设计稿 URL 注入 LLM 上下文（charactersDigest 文本层） | **未达图层注入** |
| 视频生成 | VideoProviderPort + HttpVideoProvider + 异步任务/refresh | 仅 text-to-video |
| 导出 | Markdown / JSON 分集导出 | 无成片组装 |
| 解耦守卫 | dramaDecoupling.test.js CI 守卫 | 持续有效 |

## 0.1 缺口总览（按距离成片远近）

```
台本 ──→ 分镜 ──→ [缺②首帧图] ──→ [缺①refImages 图生视频] ──→ 镜头视频
                                                                │
角色设计稿 ──(已有)──┘            [缺④TTS配音] [缺⑤BGM/音效] ──→ [缺⑥时间轴粗剪+⑦字幕] ──→ 成片
横切：[缺⑧批量队列] [缺⑨成本预估] [缺⑩版本管理] [缺⑪付费卡点策划增强] [缺⑫合规预检] [缺③场景参考图]
```

---

## P8 视觉一致性闭环（最高优先级，工作量小）

### P8.1 refImages 落地（缺口①）

角色设计稿已生成并存储，但未真正传给视频 API。补最后一公里：

```ts
// VideoProviderPort.ts
interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  durationSec?: number;
  refImages?: string[];        // 新增：角色/场景参考图（公网可访问 URL 或 base64）
}
```

- `DramaVideoPromptService.createProviderTask()`：按 shot.characterRefs 找角色 → 读 portraitData.url → 组装 refImages。
- `HttpVideoProvider.createTask()`：refImages 进请求体；provider 不支持时静默忽略（能力声明字段 `supportsRefImages`）。
- 本地 URL → 可访问地址：桌面端场景下需将本地图转 base64 内联或临时上传（按 provider 能力分支）。

### P8.2 分镜首帧图（缺口②）

行业主流是「shot → 首帧静态图 → image-to-video」，可控性远高于 text-to-video，且首帧图可在烧视频额度前人工确认构图。

```prisma
model DramaShot {
  // 新增
  keyframeData  String?   // JSON: { status, url, prompt, provider, generatedAt, error }
}
```

- 新建 `DramaShotKeyframeService`：复用 `generateImagesByProvider()`（平台级，同角色设计稿路径）。
- 提示词 = shot.visualPrompt + 角色 visualAnchor + 景别/运镜 → 竖屏 1024×1536（9:16 就近尺寸）。
- 存储 `drama-shots/{shotId}/keyframe.{ext}`，专用端点服务。
- 视频生成时：有首帧图 → image-to-video（首帧作 refImage 首位）；无 → 退回 text-to-video。
- 前端：分镜卡片显示首帧缩略图 + 单镜生成/重生成按钮 + Provider 选择（复用角色设计稿的选择器模式）。

### P8.3 场景参考图（缺口③）

高复用场景（总裁办公室/医院走廊/家宅）跨集不一致与角色不一致同样毁观感。

```prisma
model DramaScene {        // 新表（与可选剧本层 DramaScene 区分命名，可叫 DramaLocation）
  id, projectId, name, description,
  referenceData String?  // JSON: { status, url, prompt, generatedAt }
}
```

- 从分镜 shot.location 聚合去重自动建场景条目；支持手动补建。
- 生成场景参考图（横版空镜，无人物）；shot 关联场景后，其首帧图/视频生成把场景参考图并入 refImages。
- MVP 可后置：先把 location 文本标准化（同名归一），图生成放 P8 末。

---

## P9 声音层（缺口④⑤）

### P9.1 TTS 配音

`voiceProfile` 字段已有，补 TTS 产线：

- 平台级 `TTSProviderPort`（对齐 VideoProviderPort 模式）：`synthesize({ text, voiceId, speed, emotion }) → audioUrl`。首个 provider 建议接 OpenAI TTS 或硅基流动（已有 key 体系可复用 getAPIKeySettings）。
- 台词拆分：从 episode.content 解析对白行（说话人 → DramaCharacter.voiceProfile.voiceId 映射）。
- 数据：`DramaShotAudio` 或在 shot 上挂 `dialogueAudioData`（JSON 数组：每句台词一段音频）。
- 旁白/独白用项目级默认声线。
- 前端：台本页逐句试听 + 整集批量合成。

### P9.2 BGM / 音效标注（先标注后素材）

- 分镜阶段让 LLM 同步产出 `audioCue`（JSON：musicMood 情绪标签 + sfx 音效列表）—— 改 storyboard 提示词即可，成本极低。
- BGM 素材库对接（自动配乐/版权库）后置为 P9+，先保证标注信息进导出与时间轴。

---

## P10 成片组装层（缺口⑥⑦）

### P10.1 字幕导出（性价比最高，先做）

- 台词 + shot.durationSec 已有 → 生成 SRT/ASS。
- 时间轴推算：每镜头时长内按台词字数比例分配；有 TTS 后改用真实音频时长。
- 导出端点扩展：`GET /projects/:id/episodes/:order/export?format=srt`。

### P10.2 时间轴 / 粗剪导出

把散落的 shot resultUrl 变成可剪辑工程：

- **层级 1（MVP）**：ffmpeg 无转场顺序拼接 → 单集 mp4 粗剪（服务端跑 ffmpeg，桌面端可内置二进制）。
- **层级 2**：导出剪映草稿（draft_content.json）或 FCPXML —— 用户进专业工具精剪。剪映草稿对国内短剧团队价值最大，优先。
- 数据无需新表：按 episode → storyboard → shots(order) 串接，音频/字幕轨随 P9/P10.1 产物挂入。

---

## P11 生产管理层（缺口⑧⑨⑩）

### P11.1 批量生产队列（缺口⑧）

一集 30+ 镜头 × 80 集，手动单镜触发不可生产：

```prisma
model DramaBatchJob {
  id, projectId, episodeId?, type(keyframes|videos|tts|full_episode),
  status(pending|running|paused|done|failed),
  progress String,   // JSON: { total, done, failed, failedShotIds }
  createdAt, updatedAt
}
```

- 整集级操作：「生成本集全部首帧图」「生成本集全部视频」「合成本集配音」。
- 串行+限速执行（视频 provider 并发限制），失败镜头记录可单独重试。
- 复用现有异步任务模型（providerTaskId/refresh 轮询已是异步形态，补上层编排器 `DramaBatchOrchestrator`）。
- 前端：集级进度条 + 失败列表 + 一键重试失败项。

### P11.2 成本预估（缺口⑨）

- Provider 能力声明里加单价（`costPerSecond` / `costPerImage`，可在设置中配置）。
- 批量任务发起前展示预估：`Σ(shot.durationSec × costPerSecond) + 图片张数 × costPerImage`。
- 任务完成后记录实际消耗到 BatchJob.progress，项目页汇总累计成本。

### P11.3 生成版本管理（缺口⑩）

- `DramaVideoPrompt` 改为不覆盖：重新生成时旧记录标 `superseded`，新建记录（已有 status 字段，加 `version` + `supersededById` 即可）。
- 首帧图/设计稿重生成时旧文件改名归档（`keyframe.v1.png`），keyframeData 存历史数组或仅存当前+保留磁盘历史。
- 前端：镜头卡片「历史版本」抽屉，可回滚选用旧版。

---

## P12 内容质量增强（缺口⑪⑫）

### P12.1 付费卡点策划增强

- 策略阶段产出 `paywallPlan`（JSON：首付费集位置 8-15 可调、卡点强度目标曲线）。
- 质量闸新增规则：付费集前一集情绪净值必须为全剧阶段低谷（蓄憋屈）、付费集 cliffhanger 强度必须 ≥ 阈值。
- 大纲生成提示词注入 paywallPlan，让卡点是「策划出来的」而非「标出来的」。

### P12.2 平台合规预检

- 新增 `DramaComplianceService`：台本级 LLM 预检（暴力血腥/医疗误导/封建迷信/低俗/广告法用语等短剧平台高频驳回项）。
- 输出结构化报告：`{ level: pass|warn|block, items: [{ rule, excerpt, suggestion }] }`，写入 episode.qualityFlags。
- 挂入质量闸（warn 不拦截、block 触发修复），也提供独立「合规检查」按钮全剧批量跑。

---

## 实施路线（补充阶段）

| 阶段 | 内容 | 工作量 | 依赖 |
|------|------|--------|------|
| **P8.1** | refImages 落地 | 小（方案已设计） | 无 |
| **P8.2** | 分镜首帧图 | 中（复用图片基础设施） | 无 |
| **P10.1** | 字幕 SRT 导出 | 小 | 无 |
| **P11.1** | 批量队列（先首帧+视频） | 中 | P8.2 |
| **P9.1** | TTS 配音 | 中大（新 ProviderPort） | 无 |
| **P10.2** | 粗剪拼接 + 剪映草稿 | 中 | P8/P9 产物 |
| **P11.2/3** | 成本预估 + 版本管理 | 小中 | P11.1 |
| **P12** | 卡点增强 + 合规预检 | 中 | 无 |
| **P8.3** | 场景参考图 | 中 | P8.2 模式复用 |
| **P9.2** | BGM 素材对接 | 后置 | P9.1 |

> 建议执行顺序：**P8.1 → P8.2 → P10.1 → P11.1 → P9.1 → P10.2**。
> P8.1+P8.2 完成即视觉一致性闭环成立；P11.1+P9.1+P10.2 完成即「生产线」成立。

---

## 验收标准（v3 补充）

- [ ] P8.1：创建视频任务时，shot 关联角色的设计稿作为 refImages 进入请求体；不支持的 provider 静默降级，CI 解耦守卫仍通过。
- [ ] P8.2：任一 shot 可生成 9:16 首帧图并展示；有首帧图的 shot 走 image-to-video。
- [ ] P10.1：任一集可导出 SRT，时间轴与镜头时长一致。
- [ ] P11.1：「整集生成」一键触发，进度可见，失败镜头可单独重试。
- [ ] P9.1：任一集台词可批量合成配音，角色声线与 voiceProfile 一致。
- [ ] P10.2：任一集可导出粗剪 mp4 或剪映草稿，镜头顺序/时长正确。
- [ ] P11.2：批量任务发起前显示成本预估，完成后显示实际消耗。
- [ ] P12.2：合规预检能对样例违规台本输出 block 级报告并定位原文。

---

## 待定决策

1. **TTS 首个 provider**：OpenAI TTS / 硅基流动（CosyVoice 等）/ 火山引擎 —— 国内声线丰富度建议硅基流动或火山。
2. **粗剪形态优先级**：ffmpeg 直出 mp4 vs 剪映草稿 —— 面向「直接发布」选前者，面向「团队精剪」选后者（建议两者都做，草稿优先）。
3. **本地图片如何喂给云端视频 API**：base64 内联 / 临时对象存储上传 / 桌面端起本地隧道 —— 按首个支持 refImages 的 provider 能力定。
4. **场景参考图（P8.3）是否提前**：若实测视频跨集场景跳变严重，提到 P8.2 之后立即做。
