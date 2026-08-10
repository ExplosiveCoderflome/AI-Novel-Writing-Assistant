import { create } from "zustand";

/**
 * 跨页面共享当前小说相关的自动导演任务快照，便于在侧栏或其它壳层展示「是否在跑」，
 * 而无需让每个页面各自解析 query。（实时细节仍以 React Query 为准，本 store 只做轻量同步。）
 */
export interface DirectorRealtimeSnapshot {
  novelId: string | null;
  workflowTaskId: string | null;
  taskStatus: string | null;
  /** 最近一次由编辑页写入的时间戳（ms）。 */
  updatedAt: number;
}

interface DirectorRealtimeStore extends DirectorRealtimeSnapshot {
  setFromAutoDirectorTask: (
    novelId: string,
    task: { id: string; status: string } | null | undefined,
  ) => void;
  reset: () => void;
}

const initial: DirectorRealtimeSnapshot = {
  novelId: null,
  workflowTaskId: null,
  taskStatus: null,
  updatedAt: 0,
};

export const useDirectorRealtimeStore = create<DirectorRealtimeStore>((set) => ({
  ...initial,
  setFromAutoDirectorTask: (novelId, task) =>
    set({
      novelId,
      workflowTaskId: task?.id ?? null,
      taskStatus: task?.status ?? null,
      updatedAt: Date.now(),
    }),
  reset: () => set({ ...initial, updatedAt: Date.now() }),
}));
