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
      count: input.count ?? 2,
    });
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
