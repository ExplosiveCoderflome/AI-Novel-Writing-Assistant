import type { VolumePlan } from "@ai-novel/shared/types/novel";

/**
 * 导演目标跟随决策（纯函数，可单测）。
 *
 * 背景（issue #172）：节奏 / 拆章工作区的选中卷 / 章由用户手动控制，但自动导演
 * 运行时 NovelEdit 会把工作区选中同步到导演当前 chapter_detail_bundle 的目标章节。
 * 原 effect 的依赖包含 normalizedVolumeDraft——用户每敲一次键盘（改目标字数、
 * 冲突等级等）都会让 effect 重跑；只要守卫的三元组不精确匹配，就会把用户正在
 * 编辑的章节抢回导演目标，表现为“丢失焦点并定位到第 1 章”。
 *
 * 规则：只有当“导演目标章节”本身发生变化时才跟随一次；目标不变时，即使用户
 * 修改草稿导致 effect 重跑，也不再重复抢回，把选择权留给用户。
 */

export interface StructuredOutlineWorkspaceSelection {
  selectedVolumeId?: string;
  selectedChapterId?: string;
  selectedBeatKey?: string;
}

export interface DirectorFollowMemory {
  novelId: string;
  chapterId: string;
}

export const EMPTY_DIRECTOR_FOLLOW_MEMORY: DirectorFollowMemory = {
  novelId: "",
  chapterId: "",
};

export interface DirectorFollowPatch {
  selectedVolumeId: string;
  selectedChapterId: string;
  selectedBeatKey: "all";
}

export function resolveStructuredOutlineDirectorFollow(params: {
  novelId: string;
  activeTab: string;
  directorChapterId: string;
  volumes: VolumePlan[];
  workspace: StructuredOutlineWorkspaceSelection | undefined;
  memory: DirectorFollowMemory;
}): { patch: DirectorFollowPatch | null; memory: DirectorFollowMemory } {
  const { novelId, activeTab, directorChapterId, volumes, workspace, memory } = params;
  if (!novelId || activeTab !== "structured" || !directorChapterId) {
    return {
      patch: null,
      memory: memory.chapterId ? { ...EMPTY_DIRECTOR_FOLLOW_MEMORY } : memory,
    };
  }
  if (memory.novelId === novelId && memory.chapterId === directorChapterId) {
    // 已经跟随过该目标：草稿变更导致 effect 重跑时不再重复抢回。
    return { patch: null, memory };
  }
  const targetVolume = volumes.find((volume) =>
    volume.chapters.some(
      (chapter) =>
        chapter.id === directorChapterId || chapter.chapterId === directorChapterId,
    ),
  );
  if (!targetVolume) {
    // 草稿尚未加载出目标卷：保持 memory 不变，下次草稿就绪时再试。
    return { patch: null, memory };
  }
  const nextMemory: DirectorFollowMemory = { novelId, chapterId: directorChapterId };
  if (
    workspace?.selectedChapterId === directorChapterId &&
    workspace.selectedVolumeId === targetVolume.id &&
    workspace.selectedBeatKey === "all"
  ) {
    return { patch: null, memory: nextMemory };
  }
  return {
    patch: {
      selectedVolumeId: targetVolume.id,
      selectedChapterId: directorChapterId,
      selectedBeatKey: "all",
    },
    memory: nextMemory,
  };
}
