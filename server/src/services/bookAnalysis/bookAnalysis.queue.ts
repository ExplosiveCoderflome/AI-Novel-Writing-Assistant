import type { AnalysisTask } from "./bookAnalysis.types";

function toTaskKey(task: AnalysisTask): string {
  return task.kind === "full" ? `${task.analysisId}:full` : `${task.analysisId}:section:${task.sectionKey}`;
}

interface BookAnalysisTaskQueueOptions {
  getMaxConcurrentTasks: () => number;
  onRunTask: (task: AnalysisTask) => Promise<void>;
}

export class BookAnalysisTaskQueue {
  private readonly taskQueue: AnalysisTask[] = [];
  private readonly queuedTaskKeys = new Set<string>();
  private readonly activeTasksByAnalysisId = new Map<string, AnalysisTask>();
  private activeWorkerCount = 0;

  constructor(private readonly options: BookAnalysisTaskQueueOptions) {}

  enqueue(task: AnalysisTask): void {
    if (task.kind === "full") {
      this.removeQueuedSectionTasks(task.analysisId);
      if (this.hasQueuedOrActiveFullTask(task.analysisId)) {
        return;
      }
    } else if (this.hasQueuedOrActiveFullTask(task.analysisId)) {
      return;
    }

    const taskKey = toTaskKey(task);
    if (this.queuedTaskKeys.has(taskKey)) {
      return;
    }

    this.taskQueue.push(task);
    this.queuedTaskKeys.add(taskKey);
    this.schedule();
  }

  removeAnalysisTasks(analysisId: string): void {
    const retained = this.taskQueue.filter((task) => task.analysisId !== analysisId);
    this.taskQueue.length = 0;
    this.taskQueue.push(...retained);
    this.rebuildQueuedTaskKeys();
  }

  private hasQueuedOrActiveFullTask(analysisId: string): boolean {
    if (this.activeTasksByAnalysisId.get(analysisId)?.kind === "full") {
      return true;
    }
    return this.taskQueue.some((task) => task.analysisId === analysisId && task.kind === "full");
  }

  private removeQueuedSectionTasks(analysisId: string): void {
    const retained = this.taskQueue.filter((task) => !(task.analysisId === analysisId && task.kind === "section"));
    this.taskQueue.length = 0;
    this.taskQueue.push(...retained);
    this.rebuildQueuedTaskKeys();
  }

  private rebuildQueuedTaskKeys(): void {
    this.queuedTaskKeys.clear();
    for (const task of this.taskQueue) {
      this.queuedTaskKeys.add(toTaskKey(task));
    }
  }

  private schedule(): void {
    while (this.activeWorkerCount < this.options.getMaxConcurrentTasks()) {
      const nextTask = this.takeNextRunnableTask();
      if (!nextTask) {
        return;
      }
      this.activeWorkerCount += 1;
      this.activeTasksByAnalysisId.set(nextTask.analysisId, nextTask);
      void this.options.onRunTask(nextTask).finally(() => {
        this.activeWorkerCount = Math.max(0, this.activeWorkerCount - 1);
        this.activeTasksByAnalysisId.delete(nextTask.analysisId);
        this.schedule();
      });
    }
  }

  private takeNextRunnableTask(): AnalysisTask | null {
    for (let index = 0; index < this.taskQueue.length; index += 1) {
      const task = this.taskQueue[index];
      if (this.activeTasksByAnalysisId.has(task.analysisId)) {
        continue;
      }
      this.taskQueue.splice(index, 1);
      this.queuedTaskKeys.delete(toTaskKey(task));
      return task;
    }
    return null;
  }
}
