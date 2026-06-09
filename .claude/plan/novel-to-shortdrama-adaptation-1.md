# 短剧创作平台规划 v2：独立低耦合模块 + 多内容源 + 角色资源 + 竖屏付费节奏引擎

> 状态：规划草案 v2（迭代自 novel-to-shortdrama-adaptation.md）
> 日期：2026-06-09
> 本次迭代的三个定位升级：
> 1. **独立低耦合模块**（DramaForge），后续可整体拆出独立部署/独立仓库
> 2. **多内容源**：小说导入 ✕ 独立原创 ✕ 任意文本转剧本（小说不再是唯一源）
> 3. **模块自带角色资源管理**（人设/视觉锚点/声音/角色库），不依赖小说角色系统
> 已确认：竖屏付费短剧 · 延伸到 AI 视频 · 剧本层可选

---

## 0. 定位转变（v1 → v2）

| 维度 | v1（改编模块） | v2（独立短剧创作平台） |
|------|---------------|----------------------|
| 角色 | 小说的下游派生 | **独立 bounded context**，小说是可选内容源之一 |
| 内容源 | 仅小说 | 小说导入 / 独立原创 / 文本转剧本 三选一 |
| 耦合 | 直接 import 小说 service | **防腐层(ACL)隔离**，可整体拆出 |
| 角色 | 复用小说角色 | **自带角色资源管理**，可从小说导入也可独立建 |
| 模块名 | `adaptation`（从属） | `drama`（独立领域） |

**一句话**：做一个以「竖屏付费短剧」为核心产物的独立创作平台，内容可以来自本系统小说、外部文本或从零原创；平台自带角色资源、节奏引擎和视听产线，并与小说模块通过契约层松耦合，具备未来拆分条件。

---

## 1. 低耦合架构（可拆分是第一原则）

### 1.1 独立 Bounded Context

```
server/src/modules/drama/        # HTTP 路由层（独立）
server/src/services/drama/       # 领域服务（独立，不 import novel 内部实现）
  ├─ source/                     # 内容源抽象 + 各 adapter
  ├─ character/                  # 角色资源管理（自有）
  ├─ engine/                     # 竖屏付费短剧节奏引擎（核心 know-how）
  ├─ pipeline/                   # 策略→分集→台本→分镜→视频
  ├─ quality/                    # 短剧专用质量闸
  └─ contracts/                  # 对外契约类型（DTO）
```

数据库：所有表用 `Drama*` 前缀，自成一套，**不与 novel 表外键直连**（仅存 `sourceRef` 软引用）。这是可拆分的关键——拆出去时只需替换内容源 adapter，不动核心。

### 1.2 防腐层（Anti-Corruption Layer）

drama 模块只认一个接口，不认 Novel 的内部结构：

```ts
// services/drama/source/SourceContentPort.ts
interface SourceContentPort {
  loadBundle(ref: SourceRef): Promise<SourceBundle>;
}
// 标准化的内容包（与小说内部模型解耦）
interface SourceBundle {
  synopsis: string;                 // 剧情梗概
  beats: SourceBeat[];              // 情节节拍（来源无关）
  characters: SourceCharacter[];    // 角色（名/人设/关系/可选视觉）
  worldNotes?: string;              // 设定要点
  hardFacts?: SourceFact[];         // 硬事实（一致性约束）
  rawText?: string;                 // 原始文本（文本转剧本用）
}
```

三个 adapter 实现同一 port：
- `NovelSourceAdapter`：把本系统 Novel/Fact/角色/世界 → SourceBundle（**只读快照**，唯一与 novel 模块的接触点）
- `OriginalSourceAdapter`：从灵感/题材/一句话 → 先生成 SourceBundle（原创）
- `TextImportSourceAdapter`：任意文本（外部小说/大纲/帖子）→ 解析为 SourceBundle

> 拆分时：把 `drama` 整个目录 + Drama* 表迁出，只需在新环境重新实现 `NovelSourceAdapter`（或丢弃它，只保留原创/文本源）即可。核心引擎零改动。

---

## 2. 内容源抽象（三种来源统一入口）

```
ContentSource = novel_import | original | text_import
                     │            │           │
        NovelSourceAdapter  OriginalAdapter  TextImportAdapter
                     └──────────┬─────────────┘
                          SourceBundle（标准化）
                                 │
                     ┌───────────▼───────────┐
                     │  短剧创作核心（来源无关） │
                     └───────────────────────┘
```

- **novel_import**：选一部已生成小说 → 一键转短剧（v1 已规划，复用 Fact Ledger 保真）。
- **original**：选赛道+题材+一句话灵感 → 引擎直接生成 SourceBundle → 再进短剧产线（纯原创短剧，不需要先写小说）。
- **text_import**：粘贴/上传文本（外部网文、大纲、爆款拆解）→ 结构化为 SourceBundle。

**收益**：核心引擎只面向 SourceBundle，三种来源全部复用同一套分集/台本/质量闸/视听产线。

---

## 3. 角色资源管理（模块自有）

短剧的角色诉求与小说不同：要**脸谱化记忆点 + 视觉/声音一致性（视频刚需）**。模块自带：

```
model DramaCharacter
  id, projectId(可空，可入库复用), name, archetype(霸总/赘婿/重生复仇/马甲/扮猪吃老虎…),
  persona(人设标签), speechStyle(说话风格), 
  visualAnchor(JSON: 外形/服化/参考图 refImageAssetId), 
  voiceProfile(JSON: 声线/音色，用于配音), relations(JSON), sourceCharacterRef(软引用)

model DramaCharacterLibrary   # 跨项目角色库（复用经典人设）
```

- 从 SourceBundle.characters 一键导入，或独立创建。
- **视觉锚点**贯穿到 Shot.characterRefs → VideoPrompt，保证跨集/跨镜角色一致（视频生成成败关键）。
- 提供「角色库」：沉淀可复用的爆款人设（战神、神医、赘婿…），原创项目直接取用。

---

## 4. 竖屏付费短剧节奏引擎（核心 know-how）

> 这是整个平台的护城河。以下是顶尖短剧创作的真实规则，落成可执行的引擎配置。

### 4.1 商业结构（付费驱动）
- **免费引流区**：前 8-12 集免费，必须在前 3 集立住主爽点和钩子（决定完播/追剧）。
- **首付费点**：通常第 10-15 集，卡在第一个大反转/情绪最高点。
- **付费卡点节奏**：之后每集结尾都是 cliffhanger，关键集（反转/打脸/揭马甲）做强卡点。
- **数据代理指标**：完播率、付费转化率、ARPU —— 引擎用「钩子强度/情绪曲线/卡点强度」做离线代理评分。

### 4.2 黄金法则
- **黄金 3 秒**：每集开场 3 秒必须有冲突/悬念/反差，否则划走。
- **黄金 30 秒**：30 秒内交代「谁/要干嘛/挡路的是谁」。
- **无废镜**：竖屏几乎无环境描写，全靠对白+动作+冲突推进；信息密度极高。

### 4.3 爽感公式引擎
```
单元循环：憋屈/危机（蓄势）→ 反转/打脸（释放）→ 新钩子（再蓄势）
情绪曲线：每 1-2 集一个释放点；付费点前蓄最大憋屈，付费点给最强释放
```
- **憋屈值/爽点值**建模：引擎给每集打「情绪净值」，控制曲线不能长时间低位。

### 4.4 钩子类型库（可配置）
身份反转 · 打脸 · 扮猪吃老虎 · 马甲掉落 · 误会 · 危机降临 · 情感拉扯 · 实力碾压 · 反派挑衅 · 秘密揭露。每集大纲从库中选 1 主钩子 + 集尾选 1 cliffhanger 类型。

### 4.5 赛道/题材库
逆袭 · 重生复仇 · 战神归来 · 赘婿 · 神医 · 豪门恩怨 · 甜宠 · 马甲文 · 千金 · 系统流。每个赛道带：典型人设组合、爽点节奏模板、禁忌（赛道黑名单）。

### 4.6 每集结构模板
```
[0-3s]  钩子开场（冲突/悬念/反差）
[3-30s] 快速建立本集冲突（谁挡路）
[中段]  冲突升级（憋屈蓄势 or 反转释放）
[结尾]  cliffhanger（强钩子留人 / 付费卡点）
```

> 引擎实现：把 4.1-4.6 做成**可配置规则集**（赛道模板库 + 钩子库 + 卡点策略 + 情绪曲线目标），而非硬编码。这样能随市场迭代，也支持「短剧反推」——导入爆款拆解出模板回灌库。

---

## 5. 数据建模（独立 Drama* 表）

```
model DramaProject        // 短剧项目
  id, title, source(novel_import|original|text_import), sourceRef(软引用),
  track(赛道), theme, orientation(竖屏付费), targetEpisodes,
  strategy(JSON: 主爽点线/付费卡点分布/情绪曲线目标/改编偏离声明), status
model DramaSourceBundle   // 标准化内容包（任一来源产出后落库，供产线消费）
  id, projectId, synopsis, beats(JSON), worldNotes, hardFacts(JSON), rawText
model DramaCharacter / DramaCharacterLibrary   // §3
model DramaScreenplay / DramaScene             // 可选剧本保真层
model DramaEpisode        // 分集
  id, projectId, order, title, content(台本),
  hookOpening, cliffhanger, hookType, isPaywall, emotionNet(情绪净值),
  beatSheet(JSON), durationSec, sourceMap(JSON: ←源节拍), status, qualityFlags
model DramaStoryboard / DramaShot              // 分镜/镜头
model DramaVideoPrompt    // 视频提示词 + 生成任务
model DramaFact           // 自有事实账本（来源无关的硬事实，保证跨集一致）
```

> 关键：`DramaFact` 自有，从 SourceBundle.hardFacts 初始化（小说源时由 NovelSourceAdapter 灌入）。这样脱离小说也能维持一致性 —— 又一个可拆分保证。

---

## 6. Pipeline（来源分流 → 统一核心）

```
入口（按 source 分流）
  novel_import →  NovelSourceAdapter ─┐
  original     →  原创策划生成 Bundle ─┼→ DramaSourceBundle
  text_import  →  文本解析生成 Bundle ─┘
                                        │
统一短剧核心（来源无关）
  阶段1 策略规划   选赛道/题材 → 主爽点线/集数/付费卡点/情绪曲线目标
  阶段2 角色资源   从 Bundle 导入 or 库中取 or 新建（含视觉锚点）
  阶段3 分集大纲   每集{钩子开场+主钩子类型+冲突+cliffhanger+情绪净值+源映射}
  阶段4 逐集台本   JIT 即时生成；注入 DramaFact+角色+前序集摘要+本集大纲
  阶段5 质量闸     钩子3s/信息密度/卡点强度/情绪曲线/时长/事实一致 → 不过则修
视听产线
  阶段6 分镜       台本→镜头序列（景别/运镜/时长/角色视觉锚点）
  阶段7 视频提示词  镜头→视频提示词（角色一致性锚点）
  阶段8 视频生成    VideoProvider 抽象接口 + 首个 provider
```

---

## 7. 复用 vs 自有（低耦合取舍）

| 能力 | 策略 | 说明 |
|------|------|------|
| `runStructuredPrompt`/PromptAsset | **复用**（基础设施，非业务耦合） | 提示词框架是平台级，可接受依赖 |
| LLM 路由 / 任务队列 / ImageAsset | **复用** | 平台级基础设施 |
| Director workflow 框架 | **借鉴/轻复用** | 分阶段思想平移，drama 自建 DramaDirector |
| JIT / Quality Gate / Patch Repair | **借鉴自建** | 复制模式到 drama，避免直连 novel 实现 |
| 事实账本 NovelFactService | **不直连**，自建 DramaFact | 仅 NovelSourceAdapter 内部读 novel fact 灌入 |
| 角色系统 | **自建** DramaCharacter | §3 |
| 上下文装配 | **自建** DramaContextAssembler | 面向 SourceBundle，非 novel 模型 |

> 原则：**基础设施可依赖，业务领域不互相 import**。drama 与 novel 的唯一接触点是 `NovelSourceAdapter`。

---

## 8. 分期实施路线

| Phase | 目标 | 交付 |
|-------|------|------|
| **P0 骨架+契约** | 独立模块 + 防腐层 | `modules/drama`/`services/drama` 骨架、`SourceContentPort`、Drama* schema、`NovelSourceAdapter`(只读) |
| **P1 节奏引擎** | 核心 know-how | 赛道/钩子/爽感公式/卡点策略 规则集 + 策略规划 + 分集大纲 |
| **P2 台本产线** | 能出短剧 | 逐集台本(JIT) + 短剧质量闸 + 单集重生成 + DramaFact 一致性 |
| **P3 多内容源** | 不止小说 | OriginalAdapter（原创）+ TextImportAdapter（文本转） |
| **P4 角色资源** | 角色管理+库 | DramaCharacter + 视觉锚点 + 角色库复用 |
| **P5 分镜层** | 视听化 | Storyboard/Shot |
| **P6 视频层** | 视频对接 | VideoPrompt + VideoProvider + 首个 provider |
| **P7 剧本保真层（可选）** | 通用剧本 | Screenplay/Scene + 导出 |

> MVP 建议：**P0+P1+P2 以 novel_import 为首个内容源跑通**，验证「能生成一部合格的竖屏付费短剧分集台本」；P3 立刻补原创+文本源（这是独立模块价值的体现）；P4 角色资源支撑视频一致性。

---

## 9. 前端规划

- **独立入口** `/drama`（短剧工作台），不挂在 novel 下，体现独立性。
- 新建项目：选内容源（导入小说 / 原创 / 粘贴文本）→ 选赛道题材 → 策略确认。
- 项目工作台：分集列表（钩子/卡点/情绪净值徽标）+ 单集台本编辑 + 源映射回溯 + 单集重生成。
- 角色资源页：人设卡 + 视觉锚点 + 角色库。
- 分镜/视频视图：镜头卡片 + 视频任务状态。
- 编辑器复用 chapterEditor 交互（台本编辑可平移）。

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 低耦合 vs 复用的平衡（过度抽象拖慢 MVP） | 只在「内容源」「事实」「角色」三处做防腐；基础设施大胆复用 |
| 原创/文本源的内容质量参差 | Bundle 标准化阶段加质量闸；不合格不进产线 |
| 钩子/卡点质量难自动评估 | 情绪净值 + 钩子强度 + 卡点强度 离线代理评分；阈值不过走单集修复 |
| 跨集/跨镜角色视觉一致（视频） | DramaCharacter.visualAnchor 贯穿 Shot→VideoPrompt |
| 视频 provider 多变 | VideoProvider 抽象，首期接 1 家 |
| 拆分诉求落空（仍偷偷耦合） | CI 加依赖检查：`services/drama` 禁止 import `services/novel/*`（仅允许 adapter 内） |

---

## 11. 待定决策（实施前确认）

1. **首个视频 provider**：可灵 / 即梦 / Runway / 本地 —— 影响 P6。
2. **节奏引擎规则集的初始内容**：先内置几条赛道模板（如逆袭/重生/战神）还是做成完全可编辑库 + 种子数据。
3. **是否做「爆款短剧反推」**：导入爆款拆解出节奏模板回灌库（强化原创能力，建议 P3+）。
4. **拆分边界确认**：将来拆出时，是否保留 NovelSourceAdapter（与本系统共生）还是做成纯独立短剧 SaaS（丢弃小说源）。这影响 ACL 的严格程度。
5. **配音/音乐是否纳入**：竖屏短剧成片含配音+BGM，是否在视听层一并规划（可 P6+）。

---

## 12. 验收标准（MVP / P0-P2）

- [ ] `services/drama` 不直接 import `services/novel/*`（仅 NovelSourceAdapter 例外），CI 守卫通过。
- [ ] 选一部小说 → 经防腐层产出标准 SourceBundle。
- [ ] 引擎按赛道/钩子库产出策略 + 分集大纲（每集含主钩子类型、cliffhanger、情绪净值、源映射）。
- [ ] 逐集生成台本：黄金 3 秒钩子成立、付费卡点集正确标注、单集时长达标。
- [ ] 质量闸能拦「无钩子/卡点弱/情绪曲线塌陷/时长超标/硬事实冲突」并触发单集修复。
- [ ] 任一集可独立重生成，DramaFact 保证跨集一致。
- [ ] 短剧台本可导出分集文档。
