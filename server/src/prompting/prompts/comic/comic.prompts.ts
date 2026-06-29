import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

// ─── 分话规划 ───────────────────────────────────────────────────────────────

export const comicEpisodeOutlineOutputSchema = z.object({
  episodes: z.array(z.object({
    order: z.number().int().min(1),
    title: z.string().trim().min(1).max(30),
    synopsis: z.string().trim().min(10).max(300),
    hookType: z.string().trim().optional(),
    cliffhanger: z.string().trim().max(100).optional(),
    isPaywalled: z.boolean().default(false),
    sourceChapterStart: z.number().int().min(1).optional(),
    sourceChapterEnd: z.number().int().min(1).optional(),
  })).min(1).max(40),
});

export type ComicEpisodeOutlineOutput = z.infer<typeof comicEpisodeOutlineOutputSchema>;

export interface ComicEpisodeOutlinePromptInput {
  title: string;
  synopsis: string;
  beatsDigest: string;
  startOrder: number;
  endOrder: number;
  paywallOrders: number[];
  hookLibrary: string;
  stylePreset?: string;
}

export const comicEpisodeOutlinePrompt: PromptAsset<
  ComicEpisodeOutlinePromptInput,
  ComicEpisodeOutlineOutput
> = {
  id: "comic.episodeOutline",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 7000 },
  outputSchema: comicEpisodeOutlineOutputSchema,
  render(input) {
    return [
      new SystemMessage(
        `你是专业的漫画（条漫/漫剧）内容策划，擅长将小说/原创故事改编为按集发布的竖屏漫画。
每话目标：30-80 格，开场有钩子，结尾有悬念/卡点，情绪曲线完整。
画风参考：${input.stylePreset ?? "彩色韩漫"}。`,
      ),
      new HumanMessage(
        `请为漫画项目「${input.title}」规划第 ${input.startOrder}-${input.endOrder} 话的分话大纲。

## 内容梗概
${input.synopsis}

## 情节节拍摘要
${input.beatsDigest}

## 约束
- 卡点集号（isPaywalled=true）：${input.paywallOrders.length > 0 ? input.paywallOrders.join("、") : "无"}
- 开场钩子类型库（hookType 从此选取）：
${input.hookLibrary}

## 输出格式
返回 episodes 数组，每条包含：order / title / synopsis / hookType / cliffhanger / isPaywalled / sourceChapterStart / sourceChapterEnd。
按 order 升序，保持情节连贯性，悬念集中在 isPaywalled 集前后。`,
      ),
    ];
  },
};

// ─── 分格脚本生成 ──────────────────────────────────────────────────────────

const dialogueSchema = z.object({
  speaker: z.string().trim().min(1),
  text: z.string().trim().min(1).max(60),
  // round=对白圆泡 spike=呐喊刺泡 cloud=思维云泡 caption=旁白矩形
  bubbleType: z.enum(["round", "spike", "cloud", "caption"]).default("round"),
  // 九宫格 + 方向，如 top-left / bottom-center / right-center
  anchorHint: z.string().trim().optional(),
});

const characterExpressionSchema = z.enum(["neutral", "happy", "angry", "sad", "surprised", "cold"]);

const panelCharacterRefSchema = z.object({
  name: z.string().trim().min(1),
  // 服装：default 或资产库中的服装名（如"战斗套装"）
  costume: z.string().trim().max(60).default("default"),
  expression: characterExpressionSchema.default("neutral"),
  lighting: z.string().trim().max(40).optional(),
  // 该格角色持有/使用的道具/武器等资产名列表（来自角色资产库）
  props: z.array(z.string().trim().max(60)).max(4).optional(),
});

// 场景圣经：本话识别出的场景，跨格/跨话复用以锁定空间一致性
const sceneSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sceneType: z.enum(["interior", "exterior", "landscape", "abstract", "other"]).default("interior"),
  palette: z.string().trim().max(120),
  keyElements: z.string().trim().max(200),
  materials: z.string().trim().max(120).optional(),
  ambiance: z.string().trim().max(120).optional(),
  layout: z.string().trim().max(160).optional(),
});

const panelScriptSchema = z.object({
  order: z.number().int().min(1),
  panelType: z.enum(["establishing", "close_up", "action", "reaction", "transition"]),
  densityLevel: z.enum(["low", "medium", "high"]).default("medium"),
  focus: z.string().trim().min(1).max(120),
  action: z.string().trim().min(1).max(200),
  // 本格所属场景名，必须取自 scenes 清单
  sceneRef: z.string().trim().max(60).optional(),
  dialogues: z.array(dialogueSchema).max(3).default([]),
  characterRefs: z.array(panelCharacterRefSchema).max(5).default([]),
  // 发给图像模型的画面提示词（不含气泡文字）
  visualPrompt: z.string().trim().min(1).max(400),
  layoutData: z
    .object({
      layout: z.enum(["single", "four_koma"]).default("single"),
      subPanels: z
        .array(z.object({
          order: z.number().int().min(1).max(4),
          beat: z.enum(["起", "承", "转", "合"]),
          visualPrompt: z.string().trim().min(1).max(180),
        }))
        .max(4)
        .optional(),
    })
    .optional(),
});

export const comicPanelScriptOutputSchema = z.object({
  // 先识别本话场景（场景圣经），再分格
  scenes: z.array(sceneSchema).max(8).default([]),
  panels: z.array(panelScriptSchema).min(10).max(80),
});

export type ComicPanelScriptOutput = z.infer<typeof comicPanelScriptOutputSchema>;

export interface ComicPanelScriptPromptInput {
  projectTitle: string;
  episodeOrder: number;
  episodeTitle: string;
  episodeSynopsis: string;
  sourceText?: string;
  characters: Array<{ name: string; visualAnchor?: string | null }>;
  /** 每个角色拥有的可选视觉资产，供 LLM 在分格时按情节选用 */
  characterAssets?: Array<{
    characterName: string;
    assetType: string;
    name: string;
    description?: string;
  }>;
  /** 项目中已存在的场景（跨话复用：本话出现同一地点时直接沿用同名，不要新建） */
  existingScenes?: Array<{ name: string; sceneType: string; summary?: string }>;
  stylePreset?: string;
  /** stylePreset.promptKeywords，注入每格 visualPrompt 前缀以锁定画风 */
  stylePromptKeywords?: string;
  /** stylePreset.format，影响 visualPrompt 结构（4koma 需显式描述4子格） */
  comicFormat?: string;
  /** 跨话一致性事实 */
  factDigest?: string;
  /** 分格信息密度：relaxed=舒展，balanced=均衡，compact=紧凑 */
  densityMode?: "relaxed" | "balanced" | "compact";
  /** 用户本次补充的分格要求，只能影响表达偏好，不得覆盖结构化输出规则 */
  scriptPromptInstruction?: string;
  targetPanelCount?: number;
}

export const comicPanelScriptPrompt: PromptAsset<
  ComicPanelScriptPromptInput,
  ComicPanelScriptOutput
> = {
  id: "comic.panelScript",
  version: "v1",
  taskType: "chapter_drafting",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 9000 },
  outputSchema: comicPanelScriptOutputSchema,
  render(input) {
    const panelTarget = input.targetPanelCount ?? 45;
    const characterList = input.characters
      .map((c) => `- ${c.name}：${c.visualAnchor ?? "（暂无视觉描述）"}`)
      .join("\n");

    // 角色资产清单：按角色分组，方便 LLM 理解"谁有什么"
    const assetsByChar = new Map<string, typeof input.characterAssets>();
    for (const asset of input.characterAssets ?? []) {
      if (!assetsByChar.has(asset.characterName)) assetsByChar.set(asset.characterName, []);
      assetsByChar.get(asset.characterName)!.push(asset);
    }
    const assetSection = assetsByChar.size > 0
      ? Array.from(assetsByChar.entries()).map(([charName, assets]) => {
          const lines = assets!.map((a) => {
            const desc = a.description ? `（${a.description}）` : "";
            return `  - [${a.assetType}] ${a.name}${desc}`;
          });
          return `${charName}：\n${lines.join("\n")}`;
        }).join("\n")
      : null;
    const stylePrefix = input.stylePromptKeywords
      ?? (input.stylePreset ? `${input.stylePreset} style` : "webtoon style, vibrant colors, clean lines");

    // 已有场景清单（跨话复用：同地点沿用同名）
    const existingSceneSection = (input.existingScenes?.length ?? 0) > 0
      ? input.existingScenes!
          .map((s) => `- ${s.name}（${s.sceneType}）${s.summary ? `：${s.summary}` : ""}`)
          .join("\n")
      : null;

    const is4koma = input.comicFormat === "4koma";
    const densityMode = input.densityMode ?? "balanced";
    const densityRuleMap: Record<NonNullable<ComicPanelScriptPromptInput["densityMode"]>, string> = {
      relaxed:
        "信息密度模式：舒展。优先情绪反应、单一动作和清晰留白；多数格只放 1 个视觉焦点、0-1 句对白、1-2 名角色，少用复杂背景。每 5-8 格安排一个低密度情绪缓冲。",
      balanced:
        "信息密度模式：均衡。大多数格承载 1 个动作或情绪转折、1-2 名角色、1-2 句对白；关键冲突格可提高背景和人物数量，但不要连续堆满。",
      compact:
        "信息密度模式：紧凑。允许更多剧情推进和同框信息，但每格仍只能有一个主视觉焦点；高密度格最多 3 句对白、2-4 名角色，并避免 3 个以上高密度格连续出现。",
    };
    const visualPromptRule = is4koma
      ? `9. visualPrompt 必须以风格前缀「${stylePrefix}」开头，然后按四格结构显式描述每个子格内容，格式：
   Panel1:[起] <画面内容>. Panel2:[承] <画面内容>. Panel3:[转] <画面内容>. Panel4:[合] <画面内容>.
   每格描述独立，镜头/情绪/内容必须有明显差异，不要重复相近画面。四格合计信息量 > 单格3倍以上。`
      : `9. visualPrompt 必须以固定风格前缀「${stylePrefix}」开头，然后再描述画面内容（出场角色、服装、表情、场景、构图），不含气泡文字`;

    return [
      new SystemMessage(
        `你是资深漫画分镜师，专注竖屏条漫/漫剧（webtoon 形态）。
职责：先识别本话场景（场景圣经），再将大纲拆分为 ${panelTarget} 格左右的逐格分镜脚本。

【第一步：识别场景 scenes】（最多 8 个）
- 每个场景给出：name（地点名）、sceneType(interior/exterior/landscape/abstract/other)、palette(主色板)、keyElements(标志物/家具/地形)，可选 materials(材质)/ambiance(光照氛围)/layout(空间结构)
- 连续空间（如"竹林外围→竹林深处"）尽量归为同一场景，避免每格一个场景导致碎片化
- 若提供了「项目已有场景」，本话出现同一地点时必须**沿用完全相同的 name**，不要新建近义名

【第二步：逐格分镜 panels】，每格 sceneRef 必须取自上面 scenes 清单的某个 name
规则：
1. 每格画面只聚焦一个动作/情绪，镜头语言多样（establishing/close_up/action/reaction/transition）
2. 对白每泡 ≤30 字，每格最多 3 个气泡；思维内容用 cloud 泡，旁白用 caption
2b. dialogues[].text 字段只能包含台词正文本身，绝对不要加"XX说"、"XX道"、说话人姓名、冒号、引号或任何叙述性前缀。说话人填在 speaker 字段，气泡归属由 speaker 自动决定
3. anchorHint 指定气泡位置（top-left/top-right/bottom-center 等），避开主体
4. characterRefs 必须为对象数组：{ name, costume, expression, lighting?, props? }
5. expression 只能取 neutral/happy/angry/sad/surprised/cold；根据该格对白情绪、动作和镜头目的选择，不要靠固定词替换
6. costume 默认 "default"；当剧情有明确服装切换时，填入角色资产库中对应服装的名称（如"战斗套装"）
6b. props 为该格角色持有/使用的道具/武器名数组，必须来自角色资产库；若无则省略
7. densityLevel 必须取 low/medium/high：low=情绪反应或留白，medium=常规推进，high=场景交代/冲突爆发/多人同框
8. focus 用一句话说明本格主视觉焦点，不能写空泛总结
${visualPromptRule}
10. ${densityRuleMap[densityMode]}
11. 画风：${input.stylePreset ?? "彩色韩漫"}`,
      ),
      new HumanMessage(
        `漫画项目：${input.projectTitle}
本话：第 ${input.episodeOrder} 话《${input.episodeTitle}》

## 本话情节大纲
${input.episodeSynopsis}

${input.sourceText ? `## 本话原文（对白来源）\n${input.sourceText.slice(0, 3000)}\n` : ""}
## 出场角色
${characterList}

${assetSection ? `## 角色可用资产（服装/武器/道具等）\n按剧情需要在 characterRefs 中引用：costume 填服装名，props 填道具/武器名列表\n${assetSection}\n` : ""}${existingSceneSection ? `## 项目已有场景（同地点请沿用同名，不要新建近义名）\n${existingSceneSection}\n` : ""}${input.factDigest ? `## 跨话一致性事实（请严格遵守）\n${input.factDigest}\n` : ""}
${input.scriptPromptInstruction ? `## 本次分格补充要求\n${input.scriptPromptInstruction}\n` : ""}
## 任务
先识别本话场景 scenes（≤8 个），再生成约 ${panelTarget} 格的完整分格脚本，返回 { scenes, panels }。
每格 panel 包含：order / panelType / densityLevel / focus / action / sceneRef / dialogues / characterRefs / visualPrompt / layoutData。
scenes 示例：[{ "name": "宗门大殿", "sceneType": "interior", "palette": "暗金与朱红", "keyElements": "盘龙石柱、悬空匾额、青铜香炉", "ambiance": "幽暗烛光", "layout": "纵深对称，高台居中" }]。
characterRefs 示例：[{ "name": "沈剑心", "costume": "战斗套装", "expression": "cold", "lighting": "side_lit", "props": ["月光剑"] }]。
四格模式下 layoutData 示例：{ "layout": "four_koma", "subPanels": [{ "order": 1, "beat": "起", "visualPrompt": "..." }] }。
保持情节连贯，镜头语言丰富，对白精炼，最后一格留悬念。`,
      ),
    ];
  },
};

// ─── 外貌锚点 AI 重写 ─────────────────────────────────────────────────────────
// 用于在角色 tab 由 AI 协助优化 visualAnchor：去除内部矛盾词、按用户期望微调、保留人设亮点。

export const comicVisualAnchorRewriteOutputSchema = z.object({
  /** 重写后的主外貌描述 */
  appearance: z.string().trim().min(10).max(2000),
  /** 可选：建议的"脸型强覆盖"片段（当用户要求与现有描述存在难以调和的冲突时） */
  faceShapeOverride: z.string().trim().max(500).optional(),
  /** 给用户看的、简短的修改说明（中文，1-3 句） */
  rationale: z.string().trim().min(1).max(300),
});

export type ComicVisualAnchorRewriteOutput = z.infer<typeof comicVisualAnchorRewriteOutputSchema>;

export interface ComicVisualAnchorRewriteInput {
  characterName: string;
  persona?: string | null;
  /** 当前主外貌 */
  currentAppearance: string;
  /** 当前已有的脸型强覆盖（可空） */
  currentFaceShapeOverride?: string;
  /** 用户的改写期望（可空 → 仅做矛盾去重） */
  userInstruction?: string;
}

export const comicVisualAnchorRewritePrompt: PromptAsset<
  ComicVisualAnchorRewriteInput,
  ComicVisualAnchorRewriteOutput
> = {
  id: "comic.visualAnchorRewrite",
  version: "v1",
  taskType: "chapter_drafting",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 2500 },
  outputSchema: comicVisualAnchorRewriteOutputSchema,
  render(input) {
    return [
      new SystemMessage(
        `你是一位漫画角色设定优化师。任务：重写角色"外貌锚点"文本，让它在被送入图像生成模型时更可控、更不容易出现内部矛盾。

【硬性规则】
1. 保留角色的标志性人设亮点（标志特征、伤疤、配饰、气质氛围等），只修改与用户期望冲突的具体五官/脸型描述
2. 优先用具体、可视化的骨相级词汇（脸型/眼型/眉骨/鼻型/嘴型/年龄段/体格），避免空泛氛围词
3. 关键词中英混写效果最好——重要外貌特征同时给出中文 + 英文 anatomy 词
4. 输出的 appearance 是完整可独立使用的描述，约 60-250 字，自然语句而不是关键词堆砌
5. 如果用户期望与原描述存在严重冲突（如原文"五官锐利如刀刻"vs 用户要"圆脸"），有两种处理：
   a. 优先方案：在 appearance 中**直接改写矛盾词**（推荐，最干净）
   b. 备选方案：当矛盾词构成了人设关键（如反派的凶相眼神），保留眼神/气质层面的"锐利"，但把"脸型/下颌/颧骨"改成用户期望，并在 faceShapeOverride 输出额外的脸型强压片段
6. rationale 用中文 1-3 句说明你做了什么修改、为什么；不要复述原文`,
      ),
      new HumanMessage(
        `角色：${input.characterName}${input.persona ? `（人设：${input.persona}）` : ""}

## 当前主外貌（待优化）
${input.currentAppearance || "（暂无）"}

${input.currentFaceShapeOverride ? `## 当前脸型强覆盖\n${input.currentFaceShapeOverride}\n` : ""}
## 用户期望
${input.userInstruction?.trim() || "（无具体期望，请检测并消除内部矛盾词、按上述规则优化）"}

## 任务
返回 { appearance, faceShapeOverride?, rationale }。`,
      ),
    ];
  },
};
