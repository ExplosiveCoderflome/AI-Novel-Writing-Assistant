import { create } from "zustand";

export interface StructuredOutlineWorkspaceUiState {
  selectedVolumeId: string;
  selectedChapterId: string;
  selectedBeatKey: string;
  showChapterAdvanced: boolean;
  showRebalancePanel: boolean;
  showSyncPanel: boolean;
  showSyncPreview: boolean;
  showJsonPreview: boolean;
}

type StructuredOutlineWorkspacePatch = Partial<StructuredOutlineWorkspaceUiState>;

interface StructuredOutlineWorkspaceStoreState {
  workspaces: Record<string, StructuredOutlineWorkspaceUiState>;
  ensureWorkspace: (workspaceId: string, defaults?: StructuredOutlineWorkspacePatch) => void;
  patchWorkspace: (workspaceId: string, patch: StructuredOutlineWorkspacePatch) => void;
  resetWorkspace: (workspaceId: string, nextState?: StructuredOutlineWorkspacePatch) => void;
}

const defaultWorkspaceState: StructuredOutlineWorkspaceUiState = {
  selectedVolumeId: "",
  selectedChapterId: "",
  selectedBeatKey: "all",
  showChapterAdvanced: false,
  showRebalancePanel: false,
  showSyncPanel: false,
  showSyncPreview: false,
  showJsonPreview: false,
};

function buildWorkspaceState(
  patch?: StructuredOutlineWorkspacePatch,
): StructuredOutlineWorkspaceUiState {
  return {
    ...defaultWorkspaceState,
    ...patch,
  };
}

/**
 * 过滤掉 undefined 的 patch 字段。
 *
 * 对象展开会复制 undefined 值（`{...{a: 1}, ...{a: undefined}}` 得到 `{a: undefined}`），
 * 曾导致调用方无意传入 `selectedVolumeId: undefined` 时清空用户已选的卷 / 章，
 * 工作区回退到第 1 卷第 1 章（issue #172）。undefined 一律视为“不修改”。
 */
function omitUndefinedPatch(
  patch: StructuredOutlineWorkspacePatch,
): StructuredOutlineWorkspacePatch {
  const cleaned: StructuredOutlineWorkspacePatch = {};
  (Object.keys(patch) as (keyof StructuredOutlineWorkspacePatch)[]).forEach((key) => {
    const value = patch[key];
    if (value !== undefined) {
      cleaned[key] = value as never;
    }
  });
  return cleaned;
}

export function getStructuredOutlineWorkspaceDefaults(
  selectedVolumeId = "",
  selectedChapterId = "",
): StructuredOutlineWorkspaceUiState {
  return buildWorkspaceState({ selectedVolumeId, selectedChapterId });
}

export const useStructuredOutlineWorkspaceStore =
  create<StructuredOutlineWorkspaceStoreState>((set) => ({
    workspaces: {},
    ensureWorkspace: (workspaceId, defaults) =>
      set((state) => {
        if (state.workspaces[workspaceId]) {
          return state;
        }
        return {
          workspaces: {
            ...state.workspaces,
            [workspaceId]: buildWorkspaceState(defaults),
          },
        };
      }),
    patchWorkspace: (workspaceId, patch) =>
      set((state) => ({
        workspaces: {
          ...state.workspaces,
          [workspaceId]: {
            ...buildWorkspaceState(),
            ...state.workspaces[workspaceId],
            ...omitUndefinedPatch(patch),
          },
        },
      })),
    resetWorkspace: (workspaceId, nextState) =>
      set((state) => ({
        workspaces: {
          ...state.workspaces,
          [workspaceId]: buildWorkspaceState(nextState),
        },
      })),
  }));
