import fs from "fs/promises";
import path from "path";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import { filterImageGenerationReferences, runImageGeneration, type ImageTargetAdapter } from "../../image/runtime";
import { safeJsonParse } from "../utils/json";

export type ShotKeyframeStatus = "idle" | "generating" | "done" | "error";

export interface ShotKeyframeHistoryItem {
  version: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

export interface ShotKeyframeData {
  status: ShotKeyframeStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: ShotKeyframeHistoryItem[];
}

interface CharacterLite {
  id: string;
  name: string;
  archetype?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
  portraitData?: string | null;
}

interface ShotKeyframeSource {
  id: string;
  order: number;
  shotSize?: string | null;
  cameraMove?: string | null;
  location?: string | null;
  action: string;
  dialogue?: string | null;
  characterRefs?: string | null;
  visualPrompt?: string | null;
  storyboard: {
    project: {
      id: string;
      characters: CharacterLite[];
    };
  };
}

const DRAMA_SHOT_IMAGES_DIR = "drama-shots";
const DEFAULT_PROVIDER: LLMProvider = "openai";
const KEYFRAME_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

function dramaShotDir(shotId: string): string {
  return path.join(resolveGeneratedImagesRoot(), DRAMA_SHOT_IMAGES_DIR, shotId);
}

function currentKeyframeUrl(shotId: string): string {
  return `/api/drama/shot-images/${shotId}/keyframe`;
}

function archivedKeyframeUrl(shotId: string, version: number): string {
  return `/api/drama/shot-images/${shotId}/keyframe/v${version}`;
}


function normalizePositiveVersion(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function readKeyframeVersion(data: ShotKeyframeData): number {
  const explicit = normalizePositiveVersion(data.version);
  if (explicit) {
    return explicit;
  }
  return data.status === "done" ? 1 : 0;
}

function normalizeHistoryItem(input: unknown): ShotKeyframeHistoryItem | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const version = normalizePositiveVersion(record.version);
  if (!version) {
    return null;
  }
  return {
    version,
    url: typeof record.url === "string" && record.url.trim() ? record.url.trim() : undefined,
    prompt: typeof record.prompt === "string" ? record.prompt : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
  };
}

function readKeyframeHistory(data: ShotKeyframeData): ShotKeyframeHistoryItem[] {
  return Array.isArray(data.history)
    ? data.history.map(normalizeHistoryItem).filter((item): item is ShotKeyframeHistoryItem => Boolean(item))
    : [];
}

async function removeCurrentKeyframeVariants(shotId: string, keepExt: string): Promise<void> {
  await Promise.all(KEYFRAME_EXTS
    .filter(([ext]) => ext !== keepExt)
    .map(async ([ext]) => {
      try {
        await fs.unlink(path.join(dramaShotDir(shotId), `keyframe.${ext}`));
      } catch {
        // Missing alternate formats are expected.
      }
    }));
}

function normalizeReferenceKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function parseCharacterRefs(raw: string | null | undefined): string[] {
  const parsed = safeJsonParse<unknown>(raw, raw ?? []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  if (typeof parsed === "string" && parsed.trim()) {
    return [parsed.trim()];
  }
  return [];
}

function extractVisualDesc(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) {
    return "";
  }
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
    if (typeof parsed.visualAnchor === "string") return parsed.visualAnchor;
    return JSON.stringify(parsed);
  } catch {
    return visualAnchor;
  }
}

function selectReferencedCharacters(shot: ShotKeyframeSource): CharacterLite[] {
  const refs = parseCharacterRefs(shot.characterRefs);
  if (!refs.length) {
    return [];
  }
  const refKeys = new Set(refs.map(normalizeReferenceKey).filter((key): key is string => Boolean(key)));
  return shot.storyboard.project.characters.filter((character) => {
    const idKey = normalizeReferenceKey(character.id);
    const nameKey = normalizeReferenceKey(character.name);
    return Boolean((idKey && refKeys.has(idKey)) || (nameKey && refKeys.has(nameKey)));
  });
}

function resolveCharacterRefImageUrl(character: CharacterLite): string | null {
  if (!character.portraitData) return null;
  try {
    const pd = JSON.parse(character.portraitData) as { status?: string; url?: string };
    return pd.status === "done" && pd.url ? pd.url : null;
  } catch {
    return null;
  }
}

function buildCharacterPromptLine(character: CharacterLite): string {
  return [
    character.name,
    character.archetype ? `role: ${character.archetype}` : "",
    character.persona ? `persona: ${character.persona}` : "",
    extractVisualDesc(character.visualAnchor) ? `appearance: ${extractVisualDesc(character.visualAnchor)}` : "",
  ].filter(Boolean).join("; ");
}

function buildShotKeyframePrompt(shot: ShotKeyframeSource): string {
  const characters = selectReferencedCharacters(shot).map(buildCharacterPromptLine);
  const lines = [
    "vertical 9:16 short drama keyframe, photorealistic cinematic still frame",
    "single decisive first frame for image-to-video generation",
    "clean composition, strong subject focus, commercial Chinese vertical micro-drama style",
    shot.location ? `location: ${shot.location}` : "",
    shot.shotSize ? `shot size: ${shot.shotSize}` : "",
    shot.cameraMove ? `camera movement intention: ${shot.cameraMove}` : "",
    `screen action: ${shot.action}`,
    shot.dialogue ? `dialogue context, do not render subtitles: ${shot.dialogue}` : "",
    shot.visualPrompt ? `visual prompt: ${shot.visualPrompt}` : "",
    characters.length ? `characters: ${characters.join(" | ")}` : "",
    "preserve consistent costume, hairstyle, face, age, and mood for all recurring characters",
    "no text, no watermark, no subtitles, no logo",
  ];
  return lines.filter(Boolean).join(", ");
}

export class DramaShotKeyframeService {
  private async buildKeyframeGenerationContext(
    shotId: string,
    useCharacterRefImages = false,
  ) {
    const shot = await prisma.dramaShot.findUnique({
      where: { id: shotId },
      include: {
        storyboard: {
          include: {
            project: { include: { characters: true } },
          },
        },
      },
    });
    if (!shot) {
      throw new AppError(`未找到短剧镜头：${shotId}`, 404);
    }

    const prompt = buildShotKeyframePrompt(shot);
    const refImages: string[] = [];
    const referenceImages: import("../../image/runtime").GeneratedReferenceImageMeta[] = [];
    if (useCharacterRefImages) {
      const referencedChars = selectReferencedCharacters(shot);
      for (const char of referencedChars) {
        const url = resolveCharacterRefImageUrl(char);
        if (url) {
          refImages.push(url);
          referenceImages.push({
            kind: "character_sheet",
            label: `${char.name} · 角色设计稿`,
            url,
          });
        }
      }
    }

    const adapter: ImageTargetAdapter<ShotKeyframeData> = {
      kind: `drama.shot.keyframe:${shotId}`,
      loadState: async () => safeJsonParse<ShotKeyframeData>(shot.keyframeData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.dramaShot.update({ where: { id: shotId }, data: { keyframeData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(dramaShotDir(shotId), `keyframe.${ext}`),
      publicUrl: () => currentKeyframeUrl(shotId),
      cleanupOtherExts: (keepExt) => removeCurrentKeyframeVariants(shotId, keepExt),
      versioning: {
        enabled: true,
        maxHistory: 5,
        archiveCurrent: (current) => this.archiveCurrentKeyframe(shotId, current),
      },
    };

    return {
      adapter,
      prompt,
      refImages,
      referenceImages,
      size: "1024x1536" as const,
      negativePrompt: "low quality, blurry, distorted face, extra fingers, duplicate body, text, watermark, subtitles",
      title: `生成镜头 ${shot.order} 首帧图`,
    };
  }

  async prepareKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = false,
  ): Promise<import("../../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildKeyframeGenerationContext(shotId, useCharacterRefImages);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      negativePrompt: ctx.negativePrompt,
      referenceImages: ctx.referenceImages,
      provider,
      size: ctx.size,
    };
  }

  async generateKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = false,
    overrides?: import("../../image/runtime").ImageGenerationOverrides,
  ): Promise<ShotKeyframeData> {
    const ctx = await this.buildKeyframeGenerationContext(shotId, useCharacterRefImages);
    const refs = filterImageGenerationReferences({
      refImages: ctx.refImages,
      referenceImages: ctx.referenceImages,
      excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls,
    });
    return runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
      negativePrompt: overrides?.negativePromptOverride ?? ctx.negativePrompt,
      ...(refs.refImages && refs.refImages.length > 0 ? { refImages: refs.refImages } : {}),
      referenceImages: refs.referenceImages && refs.referenceImages.length > 0 ? refs.referenceImages : undefined,
    });
  }

  private async archiveCurrentKeyframe(shotId: string, data: ShotKeyframeData): Promise<ShotKeyframeHistoryItem | null> {
    if (data.status !== "done") {
      return null;
    }
    const version = readKeyframeVersion(data);
    if (!version) {
      return null;
    }
    const resolved = await this.resolveExistingKeyframePath(shotId);
    const historyItem: ShotKeyframeHistoryItem = {
      version,
      prompt: data.prompt,
      provider: data.provider,
      generatedAt: data.generatedAt,
    };
    if (!resolved) {
      return historyItem;
    }
    const ext = path.extname(resolved.filePath).replace(".", "").toLowerCase() || "png";
    const archivePath = path.join(dramaShotDir(shotId), `keyframe.v${version}.${ext}`);
    await fs.copyFile(resolved.filePath, archivePath);
    return {
      ...historyItem,
      url: archivedKeyframeUrl(shotId, version),
    };
  }

  async resolveExistingKeyframePath(shotId: string): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaShotDir(shotId);
    for (const [ext, mimeType] of KEYFRAME_EXTS) {
      const filePath = path.join(dir, `keyframe.${ext}`);
      try {
        await fs.access(filePath);
        return { filePath, mimeType };
      } catch {
        // Try the next supported extension.
      }
    }
    return null;
  }

  async resolveArchivedKeyframePath(shotId: string, version: number): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaShotDir(shotId);
    for (const [ext, mimeType] of KEYFRAME_EXTS) {
      const filePath = path.join(dir, `keyframe.v${version}.${ext}`);
      try {
        await fs.access(filePath);
        return { filePath, mimeType };
      } catch {
        // Try the next supported extension.
      }
    }
    return null;
  }
}

export const dramaShotKeyframeService = new DramaShotKeyframeService();
