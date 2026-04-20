import type { VolumePlan } from "@ai-novel/shared/types/novel";
import {
  createEmptyChapter,
  createEmptyVolume,
} from "../volumePlan.utils";

export function updateVolumeFieldDraft(
  volumes: VolumePlan[],
  volumeId: string,
  field: keyof Pick<VolumePlan, "title" | "summary" | "openingHook" | "mainPromise" | "primaryPressureSource" | "coreSellingPoint" | "escalationMode" | "protagonistChange" | "midVolumeRisk" | "climax" | "payoffType" | "nextVolumeHook" | "resetPoint">,
  value: string,
): VolumePlan[] {
  return volumes.map((volume) => (
    volume.id === volumeId ? { ...volume, [field]: value } : volume
  ));
}

export function updateVolumeOpenPayoffsDraft(
  volumes: VolumePlan[],
  volumeId: string,
  value: string,
): VolumePlan[] {
  const nextPayoffs = value
    .split(/[\n,，;；、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return volumes.map((volume) => (
    volume.id === volumeId ? { ...volume, openPayoffs: nextPayoffs } : volume
  ));
}

export function addVolumeDraft(volumes: VolumePlan[]): VolumePlan[] {
  return [...volumes, createEmptyVolume(volumes.length + 1)];
}

export function removeVolumeDraft(volumes: VolumePlan[], volumeId: string): VolumePlan[] {
  return volumes.filter((volume) => volume.id !== volumeId);
}

export function moveVolumeDraft(volumes: VolumePlan[], volumeId: string, direction: -1 | 1): VolumePlan[] {
  const list = volumes.slice();
  const index = list.findIndex((volume) => volume.id === volumeId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= list.length) {
    return volumes;
  }
  const [item] = list.splice(index, 1);
  list.splice(targetIndex, 0, item);
  return list;
}

export function updateChapterTextFieldDraft(
  volumes: VolumePlan[],
  volumeId: string,
  chapterId: string,
  field: keyof Pick<VolumePlan["chapters"][number], "title" | "summary" | "purpose" | "mustAvoid" | "taskSheet">,
  value: string,
): VolumePlan[] {
  return volumes.map((volume) => (
    volume.id !== volumeId
      ? volume
      : {
        ...volume,
        chapters: volume.chapters.map((chapter) => (
          chapter.id === chapterId ? { ...chapter, [field]: value } : chapter
        )),
      }
  ));
}

export function updateChapterNumberFieldDraft(
  volumes: VolumePlan[],
  volumeId: string,
  chapterId: string,
  field: keyof Pick<VolumePlan["chapters"][number], "conflictLevel" | "revealLevel" | "targetWordCount">,
  value: number | null,
): VolumePlan[] {
  return volumes.map((volume) => (
    volume.id !== volumeId
      ? volume
      : {
        ...volume,
        chapters: volume.chapters.map((chapter) => (
          chapter.id === chapterId ? { ...chapter, [field]: value } : chapter
        )),
      }
  ));
}

export function updateChapterPayoffRefsDraft(
  volumes: VolumePlan[],
  volumeId: string,
  chapterId: string,
  value: string,
): VolumePlan[] {
  const nextRefs = value
    .split(/[\n,，;；、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return volumes.map((volume) => (
    volume.id !== volumeId
      ? volume
      : {
        ...volume,
        chapters: volume.chapters.map((chapter) => (
          chapter.id === chapterId ? { ...chapter, payoffRefs: nextRefs } : chapter
        )),
      }
  ));
}

export function addChapterDraft(volumes: VolumePlan[], volumeId: string): VolumePlan[] {
  const nextChapterOrder = volumes.flatMap((volume) => volume.chapters).length + 1;
  return volumes.map((volume) => (
    volume.id !== volumeId
      ? volume
      : {
        ...volume,
        chapters: [...volume.chapters, createEmptyChapter(nextChapterOrder)],
      }
  ));
}

export function removeChapterDraft(volumes: VolumePlan[], volumeId: string, chapterId: string): VolumePlan[] {
  return volumes.map((volume) => (
    volume.id !== volumeId
      ? volume
      : {
        ...volume,
        chapters: volume.chapters.filter((chapter) => chapter.id !== chapterId),
      }
  ));
}

export function moveChapterDraft(
  volumes: VolumePlan[],
  volumeId: string,
  chapterId: string,
  direction: -1 | 1,
): VolumePlan[] {
  return volumes.map((volume) => {
    if (volume.id !== volumeId) {
      return volume;
    }
    const chaptersInVolume = volume.chapters.slice();
    const index = chaptersInVolume.findIndex((chapter) => chapter.id === chapterId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= chaptersInVolume.length) {
      return volume;
    }
    const [item] = chaptersInVolume.splice(index, 1);
    chaptersInVolume.splice(targetIndex, 0, item);
    return { ...volume, chapters: chaptersInVolume };
  });
}
