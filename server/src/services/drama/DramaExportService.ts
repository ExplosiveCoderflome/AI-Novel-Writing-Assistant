import { prisma } from "../../db/prisma";
import { safeJsonParse } from "./utils/json";

export type DramaProjectExportFormat = "markdown" | "json";
export type DramaEpisodeExportFormat = "srt" | "timeline-json";

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
  voiceId?: string;
  audioUrl?: string;
  durationSec?: number;
  provider?: string;
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

function readKeyframeUrl(raw: string | null | undefined): string | null {
  const parsed = safeJsonParse<{ status?: string; url?: string }>(raw, {});
  return parsed.status === "done" && typeof parsed.url === "string" && parsed.url.trim()
    ? parsed.url.trim()
    : null;
}

function buildSubtitleEntriesFromShot(
  shot: { dialogue: string | null; dialogueAudioData?: string | null },
  cursor: number,
  shotDuration: number,
): { entries: SubtitleEntry[]; audioItems: Array<DialogueAudioItemLite & { startSec: number; endSec: number }>; effectiveDurationSec: number } {
  const audioItems = readDialogueAudioItems(shot.dialogueAudioData);
  if (audioItems.length) {
    let audioCursor = cursor;
    const entries: SubtitleEntry[] = [];
    const timelineAudioItems: Array<DialogueAudioItemLite & { startSec: number; endSec: number }> = [];
    for (const item of audioItems) {
      const lineDuration = normalizeDurationSec(item.durationSec, 2);
      const startSec = audioCursor;
      const endSec = audioCursor + lineDuration;
      entries.push({
        index: 0,
        startSec,
        endSec,
        text: formatDialogueText(item),
      });
      timelineAudioItems.push({ ...item, startSec, endSec, durationSec: lineDuration });
      audioCursor = endSec;
    }
    return {
      entries,
      audioItems: timelineAudioItems,
      effectiveDurationSec: Math.max(shotDuration, audioCursor - cursor),
    };
  }

  const lines = splitDialogueLines(shot.dialogue);
  if (!lines.length) {
    return { entries: [], audioItems: [], effectiveDurationSec: shotDuration };
  }
  const totalWeight = lines.reduce((sum, line) => sum + Math.max(1, line.length), 0);
  let shotCursor = cursor;
  const entries: SubtitleEntry[] = [];
  for (const line of lines) {
    const lineDuration = shotDuration * (Math.max(1, line.length) / totalWeight);
    const endSec = Math.min(cursor + shotDuration, shotCursor + lineDuration);
    entries.push({
      index: 0,
      startSec: shotCursor,
      endSec,
      text: line,
    });
    shotCursor = endSec;
  }
  return { entries, audioItems: [], effectiveDurationSec: shotDuration };
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
    if (!["srt", "timeline-json"].includes(format)) {
      throw new Error(`暂不支持的短剧单集导出格式：${format}`);
    }
    const episode = await prisma.dramaEpisode.findUnique({
      where: { projectId_order: { projectId, order } },
      include: {
        project: { select: { title: true } },
        videoPrompts: { orderBy: [{ version: "desc" }, { createdAt: "desc" }] },
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
    const videoPromptsByShot = new Map<string, typeof episode.videoPrompts[number]>();
    for (const prompt of episode.videoPrompts) {
      if (prompt.status !== "superseded" && prompt.shotId && !videoPromptsByShot.has(prompt.shotId)) {
        videoPromptsByShot.set(prompt.shotId, prompt);
      }
    }
    const timelineShots: Array<Record<string, unknown>> = [];
    const videoTrack: Array<Record<string, unknown>> = [];
    const audioTrack: Array<Record<string, unknown>> = [];

    if (storyboard?.shots.length) {
      const fallbackShotDuration = Math.max(1, Math.round(normalizeDurationSec(episode.durationSec, storyboard.shots.length * 5) / storyboard.shots.length));
      for (const shot of storyboard.shots) {
        const shotDuration = normalizeDurationSec(shot.durationSec, fallbackShotDuration);
        const shotStart = cursor;
        const shotEntries = buildSubtitleEntriesFromShot(shot, cursor, shotDuration);
        for (const entry of shotEntries.entries) {
          entries.push({ ...entry, index: entries.length + 1 });
        }
        const shotEnd = shotStart + shotEntries.effectiveDurationSec;
        const prompt = videoPromptsByShot.get(shot.id);
        const videoClip = {
          shotId: shot.id,
          shotOrder: shot.order,
          startSec: shotStart,
          endSec: shotEnd,
          durationSec: shotEntries.effectiveDurationSec,
          sourceUrl: prompt?.resultUrl ?? null,
          status: prompt?.status ?? "missing",
          provider: prompt?.provider ?? null,
          version: prompt?.version ?? null,
          providerTaskId: prompt?.providerTaskId ?? null,
          posterUrl: readKeyframeUrl(shot.keyframeData),
        };
        videoTrack.push(videoClip);
        for (const item of shotEntries.audioItems) {
          audioTrack.push({
            shotId: shot.id,
            shotOrder: shot.order,
            lineIndex: item.lineIndex,
            speaker: item.speaker ?? null,
            text: item.text,
            voiceId: item.voiceId ?? null,
            provider: item.provider ?? null,
            audioUrl: item.audioUrl ?? null,
            startSec: item.startSec,
            endSec: item.endSec,
            durationSec: item.durationSec,
          });
        }
        timelineShots.push({
          id: shot.id,
          order: shot.order,
          startSec: shotStart,
          endSec: shotEnd,
          durationSec: shotEntries.effectiveDurationSec,
          shotSize: shot.shotSize,
          cameraMove: shot.cameraMove,
          location: shot.location,
          action: shot.action,
          dialogue: shot.dialogue,
          characterRefs: safeJsonParse<unknown[]>(shot.characterRefs, []),
          visualPrompt: shot.visualPrompt,
          video: videoClip,
        });
        cursor = shotEnd;
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

    if (format === "timeline-json") {
      const timeline = {
        format: "ai-novel.drama.timeline.v1",
        exportType: "rough_cut_timeline",
        projectTitle: episode.project.title,
        episode: {
          id: episode.id,
          order: episode.order,
          title: episode.title,
          durationSec: cursor || normalizeDurationSec(episode.durationSec, entries.length * 3 || 1),
        },
        canvas: {
          aspectRatio: "9:16",
          fps: 30,
        },
        tracks: {
          video: videoTrack,
          audio: audioTrack,
          subtitles: entries,
        },
        shots: timelineShots,
        warnings: videoTrack
          .filter((clip) => clip.sourceUrl == null)
          .map((clip) => `镜头 ${clip.shotOrder} 还没有可用视频结果。`),
      };
      return {
        contentType: "application/json; charset=utf-8",
        filename: `${episode.project.title}-E${episode.order}-timeline.json`,
        body: JSON.stringify(timeline, null, 2),
      };
    }

    return {
      contentType: "application/x-subrip; charset=utf-8",
      filename: `${episode.project.title}-E${episode.order}.srt`,
      body: buildSrt(entries),
    };
  }
}

export const dramaExportService = new DramaExportService();
