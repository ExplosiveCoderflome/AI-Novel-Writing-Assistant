import { prisma } from "../db/prisma";
import { NovelWorkflowService } from "../services/novel/workflow/NovelWorkflowService";

type TaskIdRow = { id: string };

interface DirectorTaskHealingSweepDeps {
  taskStore?: {
    findMany(args: {
      where: { lane: "auto_director"; id?: { gt: string } };
      select: { id: true };
      orderBy: { id: "asc" };
      take: number;
    }): Promise<TaskIdRow[]>;
  };
  healTask?: (taskId: string) => Promise<boolean | void>;
}

/** Keeps all automatic task repair in the Director Worker process. */
export class DirectorTaskHealingSweep {
  private readonly taskStore: NonNullable<DirectorTaskHealingSweepDeps["taskStore"]>;
  private readonly healTask: NonNullable<DirectorTaskHealingSweepDeps["healTask"]>;
  private inFlight: Promise<void> | null = null;

  constructor(deps: DirectorTaskHealingSweepDeps = {}) {
    this.taskStore = deps.taskStore ?? {
      findMany: (args) => prisma.novelWorkflowTask.findMany(args),
    };
    const workflow = new NovelWorkflowService();
    this.healTask = deps.healTask ?? ((taskId) => workflow.healAutoDirectorTaskState(taskId));
  }

  run(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const current = this.runOnce();
    this.inFlight = current;
    void current.finally(() => {
      if (this.inFlight === current) this.inFlight = null;
    }).catch(() => undefined);
    return current;
  }

  private async runOnce(): Promise<void> {
    let cursor: string | null = null;
    while (true) {
      const rows: TaskIdRow[] = await this.taskStore.findMany({
        where: { lane: "auto_director", ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 100,
      });
      for (const row of rows) {
        try {
          await this.healTask(row.id);
        } catch (error) {
          console.error(`[director.worker] healing failed taskId=${row.id}`, error);
        }
      }
      if (rows.length < 100) return;
      cursor = rows[rows.length - 1].id;
    }
  }
}
