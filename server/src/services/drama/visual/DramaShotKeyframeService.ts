import fs from "fs/promises";
import path from "path";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../../runtime/appPaths";
import {
  generateImagesByProvider,
  isImageProviderSupported,
  resolveImageModel,
} from "../../image/provider";
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

async function saveImageToDisk(imageUrl: string, destPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  if (imageUrl.startsWith("data:")) {
    const [, base64Payload = ""] = imageUrl.split(",", 2);
    await fs.writeFile(destPath, Buffer.from(base64Payload, "base64"));
    return;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated keyframe (${response.status}): ${imageUrl}`);
  }
  await fs.writeFile(destPath, Buffer.from(await response.arrayBuffer()));
}

function inferExtension(imageUrl: string): string {
  if (imageUrl.startsWith("data:image/jpeg")) return "jpg";
  if (imageUrl.startsWith("data:image/webp")) return "webp";
  try {
    const ext = path.extname(new URL(imageUrl).pathname).replace(".", "").toLowerCase();
    return ext || "png";
  } catch {
    return "png";
  }
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
  async generateKeyframe(
    shotId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    useCharacterRefImages = false,
  ): Promise<ShotKeyframeData> {
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
    if (!isImageProviderSupported(provider)) {
      throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
    }

    const existingData = safeJsonParse<ShotKeyframeData>(shot.keyframeData, { status: "idle" });
    const history = readKeyframeHistory(existingData);
    const archivedCurrent = await this.archiveCurrentKeyframe(shotId, existingData);
    const nextHistory = archivedCurrent ? history.concat(archivedCurrent) : history;
    const nextVersion = existingData.status === "done"
      ? readKeyframeVersion(existingData) + 1
      : Math.max(1, readKeyframeVersion(existingData) || 1);
    const generatingData: ShotKeyframeData = {
      status: "generating",
      provider,
      version: nextVersion,
      history: nextHistory,
    };
    await prisma.dramaShot.update({
      where: { id: shotId },
      data: { keyframeData: JSON.stringify(generatingData) },
    });

    try {
      const model = await resolveImageModel(provider);
      const prompt = buildShotKeyframePrompt(shot);

      // 开关开启时：取 shot 关联角色的设计稿 URL 作为参考图
      const refImages: string[] = [];
      if (useCharacterRefImages) {
        const referencedChars = selectReferencedCharacters(shot);
        for (const char of referencedChars) {
          const url = resolveCharacterRefImageUrl(char);
          if (url) refImages.push(url);
        }
      }

      const result = await generateImagesByProvider({
        sceneType: "chapter_illustration",
        provider,
        model,
        prompt,
        negativePrompt: "low quality, blurry, distorted face, extra fingers, duplicate body, text, watermark, subtitles",
        size: "1024x1536",
        count: 1,
        ...(refImages.length > 0 ? { refImages } : {}),
      });
      const imageUrl = result.images[0]?.url;
      if (!imageUrl) {
        throw new Error("图片生成结果为空。");
      }

      const ext = inferExtension(imageUrl);
      const localPath = path.join(dramaShotDir(shotId), `keyframe.${ext}`);
      await saveImageToDisk(imageUrl, localPath);
      await removeCurrentKeyframeVariants(shotId, ext);

      const doneData: ShotKeyframeData = {
        status: "done",
        version: nextVersion,
        url: currentKeyframeUrl(shotId),
        prompt,
        provider,
        generatedAt: new Date().toISOString(),
        history: nextHistory,
      };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { keyframeData: JSON.stringify(doneData) },
      });
      return doneData;
    } catch (error) {
      const errorData: ShotKeyframeData = {
        status: "error",
        provider,
        version: nextVersion,
        error: error instanceof Error ? error.message : String(error),
        history: nextHistory,
      };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { keyframeData: JSON.stringify(errorData) },
      });
      throw error;
    }
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
