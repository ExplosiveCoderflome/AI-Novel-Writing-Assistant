import { prisma } from "../../db/prisma";
import { safeJsonParse } from "./utils/json";

export type DramaProjectExportFormat = "markdown" | "json";
export type DramaEpisodeExportFormat = "srt";

interface SubtitleEntry {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

interface DialogueAudioItemLite {
  lineIndex: number;
  speaker?: string;
  text: string;
  durationSec?: number;
}

interface DialogueAudioDataLite {
  status?: string;
  items?: DialogueAudioItemLite[];
}

function splitDialogueLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeDurationSec(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function formatSrtTime(totalSeconds: number): string {
  const totalMs = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":") + `,${String(ms).padStart(3, "0")}`;
}

function buildSrt(entries: SubtitleEntry[]): string {
  return entries.map((entry) => [
    String(entry.index),
    `${formatSrtTime(entry.startSec)} --> ${formatSrtTime(entry.endSec)}`,
    entry.text,
    "",
  ].join("\n")).join("\n");
}

function readDialogueAudioItems(raw: string | null | undefined): DialogueAudioItemLite[] {
  const parsed = safeJsonParse<DialogueAudioDataLite>(raw, {});
  if (parsed.status !== "done" || !Array.isArray(parsed.items)) {
    return [];
  }
  return parsed.items
    .filter((item) => item && typeof item.text === "string" && item.text.trim())
    .sort((a, b) => (a.lineIndex ?? 0) - (b.lineIndex ?? 0));
}

function formatDialogueText(item: DialogueAudioItemLite): string {
  return item.speaker?.trim() ? `${item.speaker.trim()}：${item.text}` : item.text;
}

export class DramaExportService {
  async exportProject(projectId: string, format: DramaProjectExportFormat = "markdown") {
    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: {
        episodes: { orderBy: { order: "asc" } },
        characters: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!project) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }
    if (format === "json") {
      return {
        contentType: "application/json; charset=utf-8",
        filename: `${project.title}-short-drama.json`,
        body: JSON.stringify(project, null, 2),
      };
    }
    const body = [
      `# ${project.title}`,
      "",
      `来源：${project.source}`,
      `赛道：${project.track ?? "未设置"}`,
      `目标集数：${project.targetEpisodes}`,
      "",
      "## 角色",
      ...project.characters.map((character) => `- ${character.name}${character.persona ? `：${character.persona}` : ""}`),
      "",
      "## 分集台本",
      ...project.episodes.flatMap((episode) => [
        "",
        `### 第 ${episode.order} 集 ${episode.title}`,
        "",
        `- 钩子：${episode.hookOpening ?? ""}`,
        `- 卡点：${episode.cliffhanger ?? ""}`,
        `- 付费卡点：${episode.isPaywall ? "是" : "否"}`,
        `- 情绪净值：${episode.emotionNet ?? ""}`,
        "",
        episode.content ?? "",
      ]),
      "",
    ].join("\n");
    return {
      contentType: "text/markdown; charset=utf-8",
      filename: `${project.title}-short-drama.md`,
      body,
    };
  }

  async exportEpisode(projectId: string, order: number, format: DramaEpisodeExportFormat = "srt") {
    if (format !== "srt") {
      throw new Error(`暂不支持的短剧单集导出格式：${format}`);
    }
    const episode = await prisma.dramaEpisode.findUnique({
      where: { projectId_order: { projectId, order } },
      include: {
        project: { select: { title: true } },
        storyboards: {
          orderBy: { createdAt: "desc" },
          include: { shots: { orderBy: { order: "asc" } } },
        },
      },
    });
    if (!episode) {
      throw new Error(`未找到短剧第 ${order} 集。`);
    }
    const storyboard = episode.storyboards[0];
    const entries: SubtitleEntry[] = [];
    let cursor = 0;

    if (storyboard?.shots.length) {
      const fallbackShotDuration = Math.max(1, Math.round(normalizeDurationSec(episode.durationSec, storyboard.shots.length * 5) / storyboard.shots.length));
      for (const shot of storyboard.shots) {
        const shotDuration = normalizeDurationSec(shot.durationSec, fallbackShotDuration);
        const audioItems = readDialogueAudioItems(shot.dialogueAudioData);
        if (audioItems.length) {
          const shotStart = cursor;
          let audioCursor = cursor;
          for (const item of audioItems) {
            const lineDuration = normalizeDurationSec(item.durationSec, 2);
            entries.push({
              index: entries.length + 1,
              startSec: audioCursor,
              endSec: audioCursor + lineDuration,
              text: formatDialogueText(item),
            });
            audioCursor += lineDuration;
          }
          cursor = shotStart + Math.max(shotDuration, audioCursor - shotStart);
          continue;
        }
        const lines = splitDialogueLines(shot.dialogue);
        if (!lines.length) {
          cursor += shotDuration;
          continue;
        }
        const totalWeight = lines.reduce((sum, line) => sum + Math.max(1, line.length), 0);
        let shotCursor = cursor;
        for (const line of lines) {
          const lineDuration = shotDuration * (Math.max(1, line.length) / totalWeight);
          const endSec = Math.min(cursor + shotDuration, shotCursor + lineDuration);
          entries.push({
            index: entries.length + 1,
            startSec: shotCursor,
            endSec,
            text: line,
          });
          shotCursor = endSec;
        }
        cursor += shotDuration;
      }
    }

    if (!entries.length) {
      const lines = splitDialogueLines(episode.content);
      let fallbackCursor = 0;
      for (const line of lines) {
        entries.push({
          index: entries.length + 1,
          startSec: fallbackCursor,
          endSec: fallbackCursor + 3,
          text: line,
        });
        fallbackCursor += 3;
      }
    }

    return {
      contentType: "application/x-subrip; charset=utf-8",
      filename: `${episode.project.title}-E${episode.order}.srt`,
      body: buildSrt(entries),
    };
  }
}

export const dramaExportService = new DramaExportService();
