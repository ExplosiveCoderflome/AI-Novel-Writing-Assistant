import type { NovelToVideoScriptOutput } from "../../prompting/prompts/video/video.prompts";

export interface VellumReelScene {
  id: string;
  segmentId?: string;
  startMs: number;
  endMs: number;
  image: string;
  focus: string;
  fallback: [string, string, string];
  motion: "still" | "push" | "pull" | "pan-left" | "pan-right" | "drift-up";
  intensity: number;
  transition: "crossfade" | "cut" | "dip";
  grade: "neutral" | "amber" | "noir" | "dawn" | "verdigris";
}

export interface VellumReelNarrativeProject {
  id: string;
  brand?: {
    name: string;
    nameZh: string;
    tagline: string;
    edition: string;
  };
  series: {
    title: string;
    volume: string;
    englishTitle: string;
    chapter: string;
    subtitle: string;
  };
  format: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
  };
  style: {
    accent: string;
    subtitle: string;
    overlayOpacity: number;
    grainOpacity: number;
    fontFamily: string;
    surface: string;
    muted: string;
  };
  audio: {
    narration: string;
    narrationVolume: number;
  };
  scenes: VellumReelScene[];
  narrative?: {
    eyebrow: string;
    logline?: string;
    epigraphs: Array<{ text: string; source: string }>;
    beats: Array<{
      id: string;
      startMs: number;
      endMs: number;
      index: string;
      label: string;
      title: string;
      motif?: string;
    }>;
  };
  endCard: {
    kicker: string;
    line1: string;
    line2: string;
    cta?: string;
  };
}

export interface VellumReelCaption {
  startMs: number;
  endMs: number;
  text: string;
  kind?: "narration" | "dialogue" | "quote";
  emphasis?: string[];
}

function mapMotion(direction?: string): "still" | "push" | "pull" | "pan-left" | "pan-right" | "drift-up" {
  const dir = (direction || "").toLowerCase();
  if (dir.includes("push") || dir.includes("推")) return "push";
  if (dir.includes("pull") || dir.includes("拉")) return "pull";
  if (dir.includes("left") || dir.includes("左")) return "pan-left";
  if (dir.includes("right") || dir.includes("右")) return "pan-right";
  if (dir.includes("up") || dir.includes("上") || dir.includes("升")) return "drift-up";
  return "still";
}

function mapGrade(mood?: string): "neutral" | "amber" | "noir" | "dawn" | "verdigris" {
  const md = (mood || "").toLowerCase();
  if (md.includes("amber") || md.includes("温馨") || md.includes("黄") || md.includes("暖")) return "amber";
  if (md.includes("noir") || md.includes("黑白") || md.includes("冷") || md.includes("阴暗")) return "noir";
  if (md.includes("dawn") || md.includes("黎明") || md.includes("朝霞")) return "dawn";
  if (md.includes("verdigris") || md.includes("铜绿") || md.includes("古风") || md.includes("青")) return "verdigris";
  return "neutral";
}

function mapTransition(trans?: string): "crossfade" | "cut" | "dip" {
  const tr = (trans || "").toLowerCase();
  if (tr.includes("cut") || tr.includes("切")) return "cut";
  if (tr.includes("dip") || tr.includes("淡")) return "dip";
  return "crossfade";
}

/**
 * Adapts standard VideoScript Output to VellumReel project.json schema.
 */
export function adaptToVellumReelProject(
  script: NovelToVideoScriptOutput,
  projectId: string,
): { project: VellumReelNarrativeProject; captions: VellumReelCaption[] } {
  const scenes: VellumReelScene[] = [];
  const captions: VellumReelCaption[] = [];

  let currentMs = 0;

  script.scenes.forEach((scene, index) => {
    const shotId = `shot_${scene.order || index + 1}`;
    const durationMs = (scene.durationSec || 5) * 1000;

    scenes.push({
      id: shotId,
      segmentId: shotId,
      startMs: currentMs,
      endMs: currentMs + durationMs,
      image: `assets/projects/${projectId}/images/${shotId}.png`,
      focus: "50% 50%",
      fallback: ["#08090a", "#36464b", "#141310"],
      motion: mapMotion(scene.cameraDirection),
      intensity: 0.5,
      transition: mapTransition(scene.transition),
      grade: mapGrade(scene.mood),
    });

    captions.push({
      startMs: currentMs,
      endMs: currentMs + durationMs,
      text: scene.narration,
      kind: "narration",
      emphasis: [],
    });

    currentMs += durationMs;
  });

  const project: VellumReelNarrativeProject = {
    id: projectId,
    brand: {
      name: "VellumReel",
      nameZh: "卷影",
      tagline: "Narrative video, shaped by text.",
      edition: "OPEN EDITION",
    },
    series: {
      title: script.title || "小说改编",
      volume: "小说分镜",
      englishTitle: "NOVEL ADAPTATION",
      chapter: script.openingHook || "开章",
      subtitle: "VellumReel offline narrative project",
    },
    format: {
      width: 1080,
      height: 1920,
      fps: 30,
      durationSeconds: currentMs / 1000,
    },
    style: {
      accent: "#d0ad63",
      subtitle: "#f6f1e6",
      overlayOpacity: 0.55,
      grainOpacity: 0.08,
      fontFamily: "Noto Serif CJK SC, Songti SC, STSong, serif",
      surface: "#080b0d",
      muted: "#9b978e",
    },
    audio: {
      narration: `assets/projects/${projectId}/audio/narration-assembled.mp3`,
      narrationVolume: 1.0,
    },
    scenes,
    narrative: {
      eyebrow: "A VELLUMREEL PRODUCTION",
      logline: script.openingHook,
      epigraphs: [],
      beats: [],
    },
    endCard: {
      kicker: "END OF EPISODE",
      line1: script.title || "小说改编",
      line2: script.closingCta || "文字开始成为影像",
      cta: "Powered by VellumReel & Ollama",
    },
  };

  return { project, captions };
}
