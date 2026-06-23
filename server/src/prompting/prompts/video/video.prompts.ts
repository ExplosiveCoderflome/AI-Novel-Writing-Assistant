/**
 * 视频改编 Prompt 资产
 *
 * 注册在 Prompt Registry 中，提供小说→视频脚本的 AI 改编能力。
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

// ── 章节改编视频脚本 ──────────────────────────────────────

const videoSceneSchema = z.object({
  order: z.number().int().min(1),
  durationSec: z.number().int().min(2).max(60),
  narration: z.string().trim().min(1).describe("画外旁白或字幕文本"),
  visualDescription: z.string().trim().min(1).describe("画面描述：场景、人物、动作、构图"),
  cameraDirection: z.string().trim().optional().describe("镜头运动：推拉摇移、特写等"),
  mood: z.string().trim().optional().describe("情绪氛围：紧张/温馨/悲壮/热血等"),
  musicCue: z.string().trim().optional().describe("音乐提示"),
  transition: z.string().trim().optional().describe("与下一场的转场方式"),
});

export const novelToVideoScriptOutputSchema = z.object({
  title: z.string().trim().min(1),
  totalDurationSec: z.number().int().min(15).max(300),
  aspectRatio: z.string().trim().default("16:9"),
  visualStyle: z.string().trim().min(1),
  openingHook: z.string().trim().min(1).describe("前3秒抓眼球的视觉/文案钩子"),
  scenes: z.array(videoSceneSchema).min(3).max(30),
  closingCta: z.string().trim().optional().describe("片尾引导语，如「关注获取下一章」"),
  musicStyle: z.string().trim().optional().describe("整体音乐风格建议"),
});

export type NovelToVideoScriptOutput = z.infer<typeof novelToVideoScriptOutputSchema>;

export interface NovelToVideoScriptPromptInput {
  synopsis: string;
  chapterText: string;
  charactersSummary: string;
  targetDurationSec: string;
  visualStyle: string;
}

export const novelToVideoScriptPrompt: PromptAsset<
  NovelToVideoScriptPromptInput,
  NovelToVideoScriptOutput
> = {
  id: "video.novel_to_script",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 12000 },
  outputSchema: novelToVideoScriptOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是专业的短视频内容导演，擅长将小说文字改编为视觉叙事。",
      "你的任务是将小说章节改编为适合社交媒体短视频的结构化脚本。",
      "改编原则：",
      "1. 保留故事核心冲突和情感高潮",
      "2. 开头3秒必须有强钩子（悬念/冲突/视觉冲击）",
      "3. 每个场景必须有明确的视觉指令，适合 AI 图像/视频生成",
      "4. 旁白简洁有力，配合画面节奏",
      "5. 角色描述要包含视觉特征以便 AI 生成一致形象",
      "只输出符合 schema 的 JSON，不要 Markdown。",
    ].join("\n")),
    new HumanMessage([
      `【小说简介】\n${input.synopsis}`,
      "",
      `【角色档案】\n${input.charactersSummary}`,
      "",
      `【章节正文】\n${input.chapterText.slice(0, 20000)}`,
      "",
      `【目标时长】${input.targetDurationSec} 秒`,
      `【视觉风格】${input.visualStyle}`,
      "",
      "请将上述章节改编为短视频脚本 JSON。",
      "每个场景的 visualDescription 必须足够详细，能直接用于 AI 图像生成。",
    ].join("\n")),
  ],
};

// ── 小说预告片脚本 ────────────────────────────────────────

export const novelTrailerScriptOutputSchema = z.object({
  title: z.string().trim().min(1),
  totalDurationSec: z.number().int().min(15).max(90),
  aspectRatio: z.string().trim().default("16:9"),
  visualStyle: z.string().trim().min(1),
  tagline: z.string().trim().min(1).describe("一句话宣传语"),
  openingHook: z.string().trim().min(1),
  scenes: z.array(videoSceneSchema).min(3).max(15),
  closingCta: z.string().trim().optional(),
  musicStyle: z.string().trim().optional(),
});

export type NovelTrailerScriptOutput = z.infer<typeof novelTrailerScriptOutputSchema>;

export interface NovelTrailerScriptPromptInput {
  synopsis: string;
  chapterText: string;
  charactersSummary: string;
  targetDurationSec: string;
  visualStyle: string;
}

export const novelTrailerScriptPrompt: PromptAsset<
  NovelTrailerScriptPromptInput,
  NovelTrailerScriptOutput
> = {
  id: "video.novel_trailer",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 8000 },
  outputSchema: novelTrailerScriptOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是电影级预告片导演，擅长用30-60秒传达一部长篇小说的核心魅力。",
      "预告片原则：",
      "1. 用最少画面传达最大信息密度",
      "2. 制造悬念和期待感，不要剧透关键反转",
      "3. 突出核心冲突、主角困境和情感张力",
      "4. 节奏由慢到快，结尾留悬念",
      "5. 每个画面都要有视觉冲击力",
      "只输出符合 schema 的 JSON，不要 Markdown。",
    ].join("\n")),
    new HumanMessage([
      `【小说简介】\n${input.synopsis}`,
      "",
      `【角色档案】\n${input.charactersSummary}`,
      "",
      `【精华章节片段】\n${input.chapterText.slice(0, 12000)}`,
      "",
      `【目标时长】${input.targetDurationSec} 秒`,
      `【视觉风格】${input.visualStyle}`,
      "",
      "请生成这部小说的预告片脚本 JSON。",
      "tagline 是一句话高概念宣传语。",
      "要传达「这本书值得读」的强烈感觉，但不要剧透核心反转。",
    ].join("\n")),
  ],
};
