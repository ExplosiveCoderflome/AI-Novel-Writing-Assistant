import { prisma } from "../../../db/prisma";

/** Persisted cancellation also reaches a provider request owned by another worker. */
export function watchImageCancellation(taskId: string): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setInterval(() => {
    void prisma.imageGenerationTask.findUnique({
      where: { id: taskId }, select: { status: true, cancelRequestedAt: true },
    }).then(task => {
      if (!task || task.status === "cancelled" || task.cancelRequestedAt) controller.abort();
    }).catch(() => undefined);
  }, 500);
  timer.unref?.();
  return { signal: controller.signal, dispose: () => clearInterval(timer) };
}
