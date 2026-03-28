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
            ...patch,
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
