import { Readable } from "node:stream";
import { buildDefaultCharacterImageSourceDescription } from "@ai-novel/shared/imagePrompt";
import type { ImageAsset, ImageGenerationTask } from "@ai-novel/shared/types/image";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { characterLibrarySyncService } from "../../character/CharacterLibrarySyncService";
import { imageGenerationService } from "../../image/ImageGenerationService";
import { persistGeneratedImageAsset, resolveImageAssetFile } from "../../image/imageAssetStorage";

export interface BookAnalysisCharacterImagePreview {
  kind: string;
  title: string;
  prompt: string;
  negativePrompt?: string;
  referenceImages: Array<{ kind: string; label: string; url: string }>;
  provider: string;
  size: string;
}

export interface BookAnalysisCharacterImageOverrides {
  promptOverride?: string;
  providerOverride?: string;
  sizeOverride?: "512x512" | "768x768" | "1024x1024" | "1024x1536" | "1536x1024";
  negativePromptOverride?: string;
}

export interface BookAnalysisCharacterPromoteResult {
  baseCharacter: Awaited<ReturnType<typeof prisma.baseCharacter.create>>;
  clonedPrimaryImageAsset: ImageAsset | null;
}

export interface BookAnalysisCharacterAppearanceImageGenerateInput {
  provider?: LLMProvider;
  count?: number;
  stylePreset?: string;
  overrides?: BookAnalysisCharacterImageOverrides;
}

const DEFAULT_NEGATIVE_PROMPT = "低清晰度，畸形，多余肢体，文字水印";

function parseProfile(profileJson: string | null): CharacterProfile {
  if (!profileJson?.trim()) {
    return { name: "", role: "" };
  }
  try {
    const parsed = JSON.parse(profileJson) as Partial<CharacterProfile>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      role: typeof parsed.role === "string" ? parsed.role : "",
      ...parsed,
    } as CharacterProfile;
  } catch {
    return { name: "", role: "" };
  }
}

function compact(values: Array<string | null | undefined>): string {
  return values.map((item) => item?.trim()).filter((item): item is string => Boolean(item)).join("；");
}

function buildSourcePrompt(row: { name: string; role: string; profileJson: string | null }): string {
  const profile = parseProfile(row.profileJson);
  const prompt = buildDefaultCharacterImageSourceDescription({
    name: profile.name || row.name,
    role: profile.role || row.role,
    appearance: compact([
      profile.appearance,
      profile.physique,
      profile.attireStyle,
      profile.signatureDetail,
    ]),
    personality: compact([profile.personality, profile.values, profile.speakingStyle]),
  });
  const scene = profile.highlightScenes?.[0];
  return compact([
    prompt,
    profile.outerGoal ? `外在目标：${profile.outerGoal}` : "",
    profile.innerNeed ? `内在需求：${profile.innerNeed}` : "",
    scene ? `代表性高光场景：${scene.sceneLabel}，${scene.performance}` : "",
  ]).replace(/；/g, "\n");
}

function buildBaseCharacterData(row: { id: string; name: string; role: string; profileJson: string | null }) {
  const profile = parseProfile(row.profileJson);
  const name = profile.name?.trim() || row.name;
  const role = profile.role?.trim() || row.role;
  return {
    name,
    role,
    personality: compact([profile.personality, profile.values, profile.speakingStyle]) || "待补充性格。",
    background: compact([
      profile.outerGoal ? `外在目标：${profile.outerGoal}` : "",
      profile.innerNeed ? `内在需求：${profile.innerNeed}` : "",
      profile.wound ? `创伤：${profile.wound}` : "",
      profile.misbelief ? `错误信念：${profile.misbelief}` : "",
    ]) || "来源于拆书角色档案，背景待补充。",
    development: compact([...(profile.arcStages ?? []), profile.growthTrajectory]) || "待补充成长轨迹。",
    appearance: compact([
      profile.appearance,
      profile.physique,
      profile.attireStyle,
      profile.signatureDetail,
    ]) || null,
    weaknesses: compact([profile.fear, profile.wound, profile.misbelief]) || null,
    interests: profile.speakingStyle ?? null,
    keyEvents: profile.highlightScenes?.map((scene) => `${scene.sceneLabel}：${scene.performance}`).join("\n") || null,
    tags: "拆书角色",
    category: "拆书沉淀",
    sourceType: "from_book_analysis_character",
    sourceRefId: row.id,
  };
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function parseStringArray(value: string | null): string[] {
  const parsed = parseJsonObject(value);
  if (!parsed) {
    try {
      const array = JSON.parse(value ?? "[]") as unknown;
      return Array.isArray(array) ? array.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function renderJsonBlock(label: string, value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) {
    return "";
  }
  return `${label}：${JSON.stringify(value, null, 2)}`;
}

function buildAppearanceSnapshotPrompt(input: {
  character: { name: string; role: string; profileJson: string | null };
  snapshot: {
    chapterIndex: number;
    chapterTitle: string | null;
    appearanceJson: string | null;
    summaryCaption: string | null;
    contextSceneRefsJson: string | null;
  };
  consolidatedAppearanceJson: string | null;
}): string {
  const profile = parseProfile(input.character.profileJson);
  const stableAppearance = parseJsonObject(input.consolidatedAppearanceJson);
  const chapterAppearance = parseJsonObject(input.snapshot.appearanceJson);
  const sceneRefs = parseStringArray(input.snapshot.contextSceneRefsJson);
  return [
    `角色：${profile.name || input.character.name}`,
    `定位：${profile.role || input.character.role}`,
    `章节：第 ${input.snapshot.chapterIndex} 章${input.snapshot.chapterTitle ? `《${input.snapshot.chapterTitle}》` : ""}`,
    input.snapshot.summaryCaption ? `本章形象概括：${input.snapshot.summaryCaption}` : "",
    renderJsonBlock("稳定外观特征", stableAppearance),
    renderJsonBlock("本章外貌、服装、状态与配饰", chapterAppearance),
    sceneRefs.length > 0 ? `场景锚点：${sceneRefs.join("；")}` : "",
    compact([profile.personality, profile.values, profile.speakingStyle])
      ? `气质参考：${compact([profile.personality, profile.values, profile.speakingStyle])}`
      : "",
    "生成要求：保留稳定特征，突出本章服装、状态和情绪；输出可作为同一角色不同章节形象演变图；避免文字、水印和多余人物。",
  ].filter(Boolean).join("\n");
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class BookAnalysisCharacterMediaService {
  constructor(
    private readonly imageService = imageGenerationService,
  ) {}

  async prepareImage(
    analysisId: string,
    characterId: string,
    input: { provider?: LLMProvider },
  ): Promise<BookAnalysisCharacterImagePreview> {
    const character = await this.loadGeneratedCharacter(analysisId, characterId);
    return {
      kind: "book_analysis_character",
      title: `${character.name} 的角色形象图`,
      prompt: buildSourcePrompt(character),
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      referenceImages: [],
      provider: input.provider ?? "openai",
      size: "1024x1024",
    };
  }

  async generateImage(
    analysisId: string,
    characterId: string,
    input: {
      provider?: LLMProvider;
      count?: number;
      stylePreset?: string;
      overrides?: BookAnalysisCharacterImageOverrides;
    },
  ): Promise<ImageGenerationTask> {
    const character = await this.loadGeneratedCharacter(analysisId, characterId);
    const sourcePrompt = buildSourcePrompt(character);
    const prompt = input.overrides?.promptOverride?.trim() || sourcePrompt;
    return this.imageService.createBookAnalysisCharacterTask({
      sceneType: "book_analysis_character",
      bookAnalysisCharacterId: character.id,
      prompt,
      promptMode: input.overrides?.promptOverride?.trim() ? "direct" : "character_chain",
      negativePrompt: input.overrides?.negativePromptOverride?.trim() || DEFAULT_NEGATIVE_PROMPT,
      stylePreset: input.stylePreset?.trim() || "写实角色设定图",
      provider: (input.overrides?.providerOverride as LLMProvider | undefined) ?? input.provider,
      size: input.overrides?.sizeOverride ?? "1024x1024",
      count: input.count ?? 1,
    });
  }

  async prepareAppearanceSnapshotImage(
    analysisId: string,
    characterId: string,
    snapshotId: string,
    input: { provider?: LLMProvider },
  ): Promise<BookAnalysisCharacterImagePreview> {
    const snapshot = await this.loadAppearanceSnapshot(analysisId, characterId, snapshotId);
    return {
      kind: "book_analysis_character_appearance_snapshot",
      title: `${snapshot.character.name} 第 ${snapshot.chapterIndex} 章形象图`,
      prompt: buildAppearanceSnapshotPrompt({
        character: snapshot.character,
        snapshot,
        consolidatedAppearanceJson: snapshot.appearance.consolidatedAppearanceJson,
      }),
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      referenceImages: [],
      provider: input.provider ?? "openai",
      size: "1024x1024",
    };
  }

  async generateAppearanceSnapshotImage(
    analysisId: string,
    characterId: string,
    snapshotId: string,
    input: BookAnalysisCharacterAppearanceImageGenerateInput,
  ): Promise<ImageGenerationTask> {
    const snapshot = await this.loadAppearanceSnapshot(analysisId, characterId, snapshotId);
    const sourcePrompt = buildAppearanceSnapshotPrompt({
      character: snapshot.character,
      snapshot,
      consolidatedAppearanceJson: snapshot.appearance.consolidatedAppearanceJson,
    });
    const prompt = input.overrides?.promptOverride?.trim() || sourcePrompt;
    const count = 1;
    const task = await this.imageService.createBookAnalysisCharacterTask({
      sceneType: "book_analysis_character",
      bookAnalysisCharacterId: characterId,
      prompt,
      promptMode: "direct",
      negativePrompt: input.overrides?.negativePromptOverride?.trim() || DEFAULT_NEGATIVE_PROMPT,
      stylePreset: input.stylePreset?.trim() || "同一角色章节形象演变图",
      provider: (input.overrides?.providerOverride as LLMProvider | undefined) ?? input.provider,
      size: input.overrides?.sizeOverride ?? "1024x1024",
      count,
    });
    await prisma.bookAnalysisCharacterAppearanceImage.create({
      data: {
        snapshotId,
        generationTaskId: task.id,
        imagePromptJson: JSON.stringify({
          prompt,
          negativePrompt: input.overrides?.negativePromptOverride?.trim() || DEFAULT_NEGATIVE_PROMPT,
          stylePreset: input.stylePreset?.trim() || "同一角色章节形象演变图",
          provider: (input.overrides?.providerOverride as LLMProvider | undefined) ?? input.provider ?? "openai",
          size: input.overrides?.sizeOverride ?? "1024x1024",
          source: "appearance_snapshot",
          chapterIndex: snapshot.chapterIndex,
        }),
        referenceAssetIdsJson: JSON.stringify([]),
      },
    });
    return task;
  }

  async listImages(analysisId: string, characterId: string): Promise<ImageAsset[]> {
    const character = await this.loadGeneratedCharacter(analysisId, characterId);
    return this.imageService.listBookAnalysisCharacterAssets(character.id);
  }

  async setPrimaryImage(analysisId: string, characterId: string, assetId: string): Promise<ImageAsset> {
    await this.assertAssetOwner(analysisId, characterId, assetId);
    return this.imageService.setPrimaryAsset(assetId);
  }

  async deleteImage(analysisId: string, characterId: string, assetId: string): Promise<ImageAsset> {
    await this.assertAssetOwner(analysisId, characterId, assetId);
    return this.imageService.deleteAsset(assetId);
  }

  async promoteToBaseCharacter(
    analysisId: string,
    characterId: string,
    input: { includePrimaryImage?: boolean },
  ): Promise<BookAnalysisCharacterPromoteResult> {
    const character = await this.loadGeneratedCharacter(analysisId, characterId);
    const baseCharacter = await prisma.baseCharacter.create({
      data: buildBaseCharacterData(character),
    });
    await characterLibrarySyncService.createBaseRevision(
      baseCharacter.id,
      "从拆书角色档案加入角色库。",
      "from_book_analysis_character",
      character.id,
    );

    const clonedPrimaryImageAsset = input.includePrimaryImage === false
      ? null
      : await this.clonePrimaryImage(character.id, baseCharacter.id);
    return { baseCharacter, clonedPrimaryImageAsset };
  }

  private async loadCharacter(analysisId: string, characterId: string) {
    const character = await prisma.bookAnalysisCharacter.findFirst({
      where: {
        id: characterId,
        analysisId,
      },
    });
    if (!character) {
      throw new AppError("Book analysis character not found.", 404);
    }
    return character;
  }

  private async loadGeneratedCharacter(analysisId: string, characterId: string) {
    const character = await this.loadCharacter(analysisId, characterId);
    if (character.status !== "generated" || !character.profileJson?.trim()) {
      throw new AppError("Generate the character profile before using character images or promotion.", 400);
    }
    return character;
  }

  private async loadAppearanceSnapshot(analysisId: string, characterId: string, snapshotId: string) {
    const snapshot = await prisma.bookAnalysisCharacterAppearanceSnapshot.findFirst({
      where: {
        id: snapshotId,
        characterId,
        character: {
          analysisId,
        },
      },
      include: {
        appearance: true,
        character: true,
      },
    });
    if (!snapshot) {
      throw new AppError("Book analysis character appearance snapshot not found.", 404);
    }
    if (snapshot.character.status !== "generated" || !snapshot.character.profileJson?.trim()) {
      throw new AppError("Generate the character profile before creating appearance snapshot images.", 400);
    }
    return snapshot;
  }

  private async assertAssetOwner(analysisId: string, characterId: string, assetId: string): Promise<void> {
    await this.loadCharacter(analysisId, characterId);
    const asset = await prisma.imageAsset.findFirst({
      where: {
        id: assetId,
        sceneType: "book_analysis_character",
        bookAnalysisCharacterId: characterId,
      },
      select: { id: true },
    });
    if (!asset) {
      throw new AppError("Book analysis character image asset not found.", 404);
    }
  }

  private async clonePrimaryImage(bookAnalysisCharacterId: string, baseCharacterId: string): Promise<ImageAsset | null> {
    const sourceAsset = await prisma.imageAsset.findFirst({
      where: {
        sceneType: "book_analysis_character",
        bookAnalysisCharacterId,
        isPrimary: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!sourceAsset) {
      return null;
    }

    const task = await prisma.imageGenerationTask.create({
      data: {
        sceneType: "character",
        baseCharacterId,
        novelId: null,
        bookAnalysisCharacterId: null,
        provider: sourceAsset.provider,
        model: sourceAsset.model,
        prompt: sourceAsset.prompt ?? "",
        negativePrompt: null,
        stylePreset: null,
        size: sourceAsset.width && sourceAsset.height ? `${sourceAsset.width}x${sourceAsset.height}` : "1024x1024",
        imageCount: 1,
        status: "succeeded",
        progress: 1,
        retryCount: 0,
        maxRetries: 0,
        finishedAt: new Date(),
      },
    });

    const resolved = await resolveImageAssetFile({
      assetId: sourceAsset.id,
      url: sourceAsset.url,
      mimeType: sourceAsset.mimeType,
      metadata: sourceAsset.metadata,
    });
    const buffer = resolved.localPath
      ? await import("node:fs/promises").then((fs) => fs.readFile(resolved.localPath!))
      : resolved.stream
        ? await streamToBuffer(resolved.stream)
        : null;
    if (!buffer) {
      return null;
    }
    const mimeType = resolved.mimeType ?? sourceAsset.mimeType ?? "image/png";
    const persisted = await persistGeneratedImageAsset({
      taskId: task.id,
      sceneType: "character",
      baseCharacterId,
      sortOrder: 0,
      url: `data:${mimeType};base64,${buffer.toString("base64")}`,
      mimeType,
    });
    const cloned = await prisma.imageAsset.create({
      data: {
        taskId: task.id,
        sceneType: "character",
        baseCharacterId,
        novelId: null,
        bookAnalysisCharacterId: null,
        provider: sourceAsset.provider,
        model: sourceAsset.model,
        url: persisted.persistedUrl,
        mimeType: persisted.mimeType,
        width: sourceAsset.width,
        height: sourceAsset.height,
        seed: sourceAsset.seed,
        prompt: sourceAsset.prompt,
        isPrimary: true,
        sortOrder: 0,
        metadata: JSON.stringify({
          localPath: persisted.localPath,
          relativePath: persisted.relativePath,
          sourceUrl: persisted.sourceUrl,
          storageKey: persisted.storageKey,
          storageDriver: persisted.storageDriver,
          clonedFromImageAssetId: sourceAsset.id,
        }),
      },
    });
    return this.imageService.setPrimaryAsset(cloned.id);
  }
}

export const bookAnalysisCharacterMediaService = new BookAnalysisCharacterMediaService();
