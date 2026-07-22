/**
 * 视频脚本生成服务
 *
 * 通过 Prompt Registry 调用 AI，将小说章节内容改编为视频脚本。
 * 支持完全离线模式下路由至本地 Ollama。
 */
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { novelToVideoScriptPrompt, novelTrailerScriptPrompt } from "../../prompting/prompts/video/video.prompts";
import { videoProjectService } from "./VideoProjectService";
import { prisma } from "../../db/prisma";

export interface VideoScriptOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  targetDurationSec?: number;
  visualStyle?: string;
}

export class VideoScriptService {
  /**
   * 为视频项目生成 AI 视频脚本。
   */
  async generateScript(projectId: string, options: VideoScriptOptions = {}) {
    const { project, chapters, characters, novelDescription } =
      await videoProjectService.getProjectSourceContent(projectId);

    // 拼接章节文本
    const chapterTexts = chapters
      .filter((ch) => ch.content)
      .map((ch) => `## ${ch.title}\n\n${ch.content}`)
      .join("\n\n---\n\n");

    // 角色摘要
    const charactersSummary = characters
      .map((c) => {
        let desc = c.name;
        if (c.personality) desc += ` — ${c.personality}`;
        if (c.appearance) desc += ` (外貌: ${c.appearance})`;
        return desc;
      })
      .join("\n");

    const isTrailer = project.sourceType === "trailer";
    const promptInput = {
      synopsis: novelDescription || "（未提供简介）",
      chapterText: chapterTexts || "（未提供章节正文）",
      charactersSummary: charactersSummary || "（未提供角色信息）",
      targetDurationSec: String(options.targetDurationSec ?? 60),
      visualStyle: options.visualStyle ?? "cinematic",
    };

    // Determine if offline mode is enabled
    const offlineModeSetting = await prisma.appSetting.findUnique({
      where: { key: "video.offlineMode" },
    });
    const isOffline = offlineModeSetting?.value === "true";

    let provider = options.provider;
    let model = options.model;

    if (isOffline) {
      provider = "ollama";
      const modelSetting = await prisma.appSetting.findUnique({
        where: { key: "video.ollamaModel" },
      });
      model = modelSetting?.value || "deepseek-r1:8b";
      console.log(`[Offline Mode] Forcing script generation through Ollama. Model: ${model}`);
    }

    const promptOptions = {
      provider,
      model,
      temperature: options.temperature ?? 0.5,
    };

    const result = isTrailer
      ? await runStructuredPrompt({
          asset: novelTrailerScriptPrompt,
          promptInput,
          options: promptOptions,
        })
      : await runStructuredPrompt({
          asset: novelToVideoScriptPrompt,
          promptInput,
          options: promptOptions,
        });

    // 更新项目状态
    const scriptJson = JSON.stringify(result.output, null, 2);
    await videoProjectService.updateProject(projectId, {
      scriptJson,
      status: "script_ready",
    });

    return result.output;
  }
}

export const videoScriptService = new VideoScriptService();
