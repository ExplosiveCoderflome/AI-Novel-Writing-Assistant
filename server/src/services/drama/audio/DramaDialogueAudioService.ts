import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { safeJsonParse } from "../utils/json";
import { ttsProviderRegistry } from "./TTSProviderPort";

export type DialogueAudioStatus = "idle" | "generating" | "done" | "error";

export interface DialogueAudioItem {
  lineIndex: number;
  speaker?: string;
  text: string;
  voiceId?: string;
  audioUrl: string;
  durationSec?: number;
  provider: string;
}

export interface DialogueAudioData {
  status: DialogueAudioStatus;
  provider?: string;
  items?: DialogueAudioItem[];
  generatedAt?: string;
  error?: string;
}

interface DialogueLine {
  lineIndex: number;
  speaker?: string;
  text: string;
}

interface CharacterVoice {
  name: string;
  voiceId?: string;
  emotion?: string;
  speed?: number;
}

const DEFAULT_TTS_PROVIDER = "mock";

function parseDialogueLines(raw: string | null | undefined): DialogueLine[] {
  return (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = /^([^:：]{1,32})[:：]\s*(.+)$/.exec(line);
      if (!match) {
        return { lineIndex: index, text: line };
      }
      return {
        lineIndex: index,
        speaker: match[1]?.trim(),
        text: match[2]?.trim() || line,
      };
    })
    .filter((line) => line.text.length > 0);
}

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function readCharacterVoice(character: {
  name: string;
  voiceProfile?: string | null;
}): CharacterVoice {
  const raw = character.voiceProfile;
  if (!raw?.trim()) {
    return { name: character.name };
  }
  const parsed = safeJsonParse<Record<string, unknown> | null>(raw, null);
  if (parsed && typeof parsed === "object") {
    const voiceId = [parsed.voiceId, parsed.voice, parsed.id]
      .find((value) => typeof value === "string" && value.trim());
    const emotion = typeof parsed.emotion === "string" ? parsed.emotion.trim() : undefined;
    const speed = Number(parsed.speed);
    return {
      name: character.name,
      voiceId: typeof voiceId === "string" ? voiceId.trim() : undefined,
      emotion,
      speed: Number.isFinite(speed) && speed > 0 ? speed : undefined,
    };
  }
  return { name: character.name };
}

function buildVoiceMap(characters: Array<{ name: string; voiceProfile?: string | null }>): Map<string, CharacterVoice> {
  const map = new Map<string, CharacterVoice>();
  for (const character of characters) {
    const key = normalizeKey(character.name);
    if (key) {
      map.set(key, readCharacterVoice(character));
    }
  }
  return map;
}

export class DramaDialogueAudioService {
  async synthesizeShotDialogue(
    shotId: string,
    provider = DEFAULT_TTS_PROVIDER,
  ): Promise<DialogueAudioData> {
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

    const lines = parseDialogueLines(shot.dialogue);
    if (!lines.length) {
      const idleData: DialogueAudioData = { status: "idle", provider, items: [] };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { dialogueAudioData: JSON.stringify(idleData) },
      });
      return idleData;
    }

    const generatingData: DialogueAudioData = { status: "generating", provider, items: [] };
    await prisma.dramaShot.update({
      where: { id: shotId },
      data: { dialogueAudioData: JSON.stringify(generatingData) },
    });

    try {
      const adapter = ttsProviderRegistry.resolve(provider);
      const voiceMap = buildVoiceMap(shot.storyboard.project.characters);
      const items: DialogueAudioItem[] = [];
      for (const line of lines) {
        const voice = line.speaker ? voiceMap.get(normalizeKey(line.speaker) ?? "") : undefined;
        const result = await adapter.synthesize({
          text: line.text,
          voiceId: voice?.voiceId,
          speed: voice?.speed,
          emotion: voice?.emotion,
        });
        items.push({
          lineIndex: line.lineIndex,
          speaker: line.speaker,
          text: line.text,
          voiceId: voice?.voiceId,
          audioUrl: result.audioUrl,
          durationSec: result.durationSec,
          provider,
        });
      }

      const doneData: DialogueAudioData = {
        status: "done",
        provider,
        items,
        generatedAt: new Date().toISOString(),
      };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { dialogueAudioData: JSON.stringify(doneData) },
      });
      return doneData;
    } catch (error) {
      const errorData: DialogueAudioData = {
        status: "error",
        provider,
        items: [],
        error: error instanceof Error ? error.message : String(error),
      };
      await prisma.dramaShot.update({
        where: { id: shotId },
        data: { dialogueAudioData: JSON.stringify(errorData) },
      });
      throw error;
    }
  }
}

export const dramaDialogueAudioService = new DramaDialogueAudioService();
