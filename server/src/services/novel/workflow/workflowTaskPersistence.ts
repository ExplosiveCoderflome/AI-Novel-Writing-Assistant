import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";

export type NovelWorkflowTaskUpdateArgs = Parameters<typeof prisma.novelWorkflowTask.update>[0];
export type NovelWorkflowTaskUpdateManyArgs = Parameters<typeof prisma.novelWorkflowTask.updateMany>[0];

export function updateWorkflowTaskWithRetry(args: NovelWorkflowTaskUpdateArgs) {
  return withSqliteRetry(
    () => prisma.novelWorkflowTask.update(args),
    { label: "novelWorkflowTask.update" },
  );
}

export function updateWorkflowTaskManyWithRetry(args: NovelWorkflowTaskUpdateManyArgs) {
  return withSqliteRetry(
    () => prisma.novelWorkflowTask.updateMany(args),
    { label: "novelWorkflowTask.updateMany" },
  );
}
