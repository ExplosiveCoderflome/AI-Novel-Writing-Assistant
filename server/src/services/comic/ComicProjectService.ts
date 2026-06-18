/**
 * AI 漫画项目服务
 *
 * 低耦合：仅依赖 prisma（基础设施）和 adaptation 共享层，
 * 不 import 任何 services/novel/* 或 services/drama/* 实现
 * （由 CI 守卫 comicDecoupling.test.js 强制）。
 */
import { prisma } from "../../db/prisma";
import { adaptationSourceRegistry } from "../adaptation/source/SourceContentPort";
import { novelSourceAdapter } from "../adaptation/source/NovelSourceAdapter";
import type { AdaptationSourceType, SourceBundle, SourceRef } from "../adaptation/contracts/sourceBundle";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { comicVisualAnchorRewritePrompt, type ComicVisualAnchorRewriteOutput } from "../../prompting/prompts/comic/comic.prompts";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

adaptationSourceRegistry.register(novelSourceAdapter);

interface ComicVisualAnchorData {
  description: string;
  visualSpec?: {
    appearance?: string;
    signatureFeatures?: string;
  };
  defaultCostume?: {
    id: "default";
    description: string;
  };
  behaviorSignature?: {
    persona?: string;
  };
}

function compactVisualAnchor(text: string, maxChars = 40): string {
  return text
    .replace(/[，。；、,\.;\s]+/g, "，")
    .replace(/^，+|，+$/g, "")
    .slice(0, maxChars);
}

function buildComicVisualAnchor(character: SourceBundle["characters"][number]): string | null {
  const visualHint = character.visualHint?.trim() ?? "";
  const persona = character.persona?.trim() ?? "";
  const description = compactVisualAnchor(visualHint || persona);
  if (!description) return null;
  const data: ComicVisualAnchorData = {
    description,
    visualSpec: visualHint ? { appearance: visualHint, signatureFeatures: description } : undefined,
    defaultCostume: visualHint ? { id: "default", description: visualHint } : undefined,
    behaviorSignature: persona ? { persona } : undefined,
  };
  return JSON.stringify(data);
}

export interface CreateComicProjectInput {
  title: string;
  sourceType: AdaptationSourceType;
  /** 软引用：novel_import 时为 novelId */
  sourceRef?: string;
  trackId?: string;
  /** original / text_import 的原始输入 */
  inspiration?: string;
  rawText?: string;
  /** JSON 序列化的画风/格式预设，创建时从向导直接传入 */
  stylePreset?: string;
}

export class ComicProjectService {
  async createProject(input: CreateComicProjectInput) {
    return prisma.comicProject.create({
      data: {
        title: input.title,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? null,
        sourceInput: input.rawText ?? input.inspiration ?? null,
        trackId: input.trackId ?? null,
        status: "draft",
        stylePreset: input.stylePreset ?? null,
      },
    });
  }

  async listProjects() {
    return prisma.comicProject.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sourceBundle: { select: { id: true, importedAt: true } },
        _count: { select: { episodes: true, characters: true } },
      },
    });
  }

  async getProject(projectId: string) {
    return prisma.comicProject.findUnique({
      where: { id: projectId },
      include: {
        sourceBundle: true,
        characters: { orderBy: { createdAt: "asc" } },
        scenes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        episodes: {
          orderBy: { order: "asc" },
          include: { panels: { orderBy: { order: "asc" } } },
        },
        batchJobs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  }

  async deleteProject(projectId: string) {
    return prisma.comicProject.delete({ where: { id: projectId } });
  }

  /**
   * 更新角色"外貌锚点"。
   * - appearance：主外貌描述（生图链路的主源头）
   * - faceShapeOverride：脸型强覆盖（可选）。当与 appearance 中的描述冲突时（如 appearance 写"五官锐利"
   *   但用户希望脸型圆），此字段在生图 prompt 里以 FINAL OVERRIDE 形式出现，权重高于 appearance，
   *   并显式告诉模型"忽略前述与脸型冲突的词"。仅传入字段会被更新；其他字段保持。
   */
  async updateCharacterVisualAnchor(
    charId: string,
    patch: { appearance?: string; faceShapeOverride?: string },
  ) {
    const character = await prisma.comicCharacter.findUnique({ where: { id: charId } });
    if (!character) throw new Error(`角色不存在：${charId}`);

    let existing: Record<string, unknown> = {};
    if (character.visualAnchor) {
      try { existing = JSON.parse(character.visualAnchor) as Record<string, unknown>; } catch { /* ignore */ }
    }
    const visualSpec = (existing.visualSpec as Record<string, unknown> | undefined) ?? {};

    const nextSpec: Record<string, unknown> = { ...visualSpec };
    let nextDescription = existing.description as string | undefined;

    if (patch.appearance !== undefined) {
      const trimmed = patch.appearance.trim();
      nextSpec.appearance = trimmed;
      // description 兼容字段（旧版/部分链路读它）
      nextDescription = trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
    }
    if (patch.faceShapeOverride !== undefined) {
      const trimmed = patch.faceShapeOverride.trim();
      if (trimmed) nextSpec.faceShapeOverride = trimmed;
      else delete nextSpec.faceShapeOverride; // 空串视为清除
    }

    const next: Record<string, unknown> = {
      ...existing,
      ...(nextDescription !== undefined && { description: nextDescription }),
      visualSpec: nextSpec,
    };

    return prisma.comicCharacter.update({
      where: { id: charId },
      data: { visualAnchor: JSON.stringify(next) },
    });
  }

  /**
   * AI 协助重写"外貌锚点"。
   * 不直接落库，返回 { appearance, faceShapeOverride?, rationale } 给前端审阅，
   * 用户确认后再调用 updateCharacterVisualAnchor 保存。
   */
  async rewriteCharacterVisualAnchor(
    charId: string,
    input: { userInstruction?: string; provider?: LLMProvider },
  ): Promise<ComicVisualAnchorRewriteOutput> {
    const character = await prisma.comicCharacter.findUnique({ where: { id: charId } });
    if (!character) throw new Error(`角色不存在：${charId}`);

    let currentAppearance = "";
    let currentFaceShapeOverride: string | undefined;
    if (character.visualAnchor) {
      try {
        const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
        const spec = parsed.visualSpec as Record<string, unknown> | undefined;
        if (spec && typeof spec.appearance === "string") currentAppearance = spec.appearance;
        else if (typeof parsed.description === "string") currentAppearance = parsed.description;
        if (spec && typeof spec.faceShapeOverride === "string" && spec.faceShapeOverride.trim()) {
          currentFaceShapeOverride = spec.faceShapeOverride.trim();
        }
      } catch { /* ignore */ }
    }

    const result = await runStructuredPrompt({
      asset: comicVisualAnchorRewritePrompt,
      promptInput: {
        characterName: character.name,
        persona: character.persona,
        currentAppearance,
        currentFaceShapeOverride,
        userInstruction: input.userInstruction?.trim() || undefined,
      },
      options: { temperature: 0.5, provider: input.provider },
    });
    return result.output;
  }

  async updateProjectStyle(projectId: string, stylePreset: string) {
    return prisma.comicProject.update({
      where: { id: projectId },
      data: { stylePreset },
    });
  }

  async updateProjectPreset(
    projectId: string,
    patch: { format?: string; style?: string; promptKeywords?: string; imageSize?: string },
  ) {
    const project = await prisma.comicProject.findUnique({ where: { id: projectId }, select: { stylePreset: true } });
    if (!project) throw new Error(`漫画项目不存在：${projectId}`);
    let current: Record<string, unknown> = {};
    try { if (project.stylePreset) current = JSON.parse(project.stylePreset); } catch { /* ignore */ }
    const merged = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    return prisma.comicProject.update({
      where: { id: projectId },
      data: { stylePreset: JSON.stringify(merged) },
    });
  }

  async updateProjectStatus(projectId: string, status: string) {
    return prisma.comicProject.update({
      where: { id: projectId },
      data: { status },
    });
  }

  /**
   * 通过防腐层把内容源装配为标准化内容包并落库（导入即快照）：
   * 1) ComicSourceBundle（梗概/节拍/角色/硬事实）
   * 2) ComicCharacter（角色资源导入）
   */
  async importSourceBundle(projectId: string) {
    const project = await prisma.comicProject.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`未找到漫画项目：${projectId}`);

    const sourceRef: SourceRef = {
      type: project.sourceType as AdaptationSourceType,
      ref: project.sourceRef ?? undefined,
      inspiration: project.sourceInput ?? undefined,
      rawText: project.sourceInput ?? undefined,
    };

    const adapter = adaptationSourceRegistry.resolve(sourceRef.type);
    const bundle: SourceBundle = await adapter.loadBundle(sourceRef);

    // 事务：落库 sourceBundle + characters
    await prisma.$transaction(async (tx) => {
      // 幂等：已存在则替换
      await tx.comicSourceBundle.upsert({
        where: { projectId },
        create: { projectId, bundleJson: JSON.stringify(bundle) },
        update: { bundleJson: JSON.stringify(bundle), importedAt: new Date() },
      });

      // 删除旧角色资源再重建（保证与源同步）
      await tx.comicCharacter.deleteMany({ where: { projectId } });
      if (bundle.characters.length > 0) {
        await tx.comicCharacter.createMany({
          data: bundle.characters.map((character) => ({
            projectId,
            name: character.name,
            persona: character.persona ?? null,
            visualAnchor: buildComicVisualAnchor(character),
            sourceCharacterRef: character.sourceCharacterRef ?? null,
          })),
        });
      }

      await tx.comicProject.update({
        where: { id: projectId },
        data: { status: "outlined" },
      });
    });

    return prisma.comicProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true, characters: true },
    });
  }
}
