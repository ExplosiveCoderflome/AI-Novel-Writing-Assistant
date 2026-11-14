import type { Prisma } from "@prisma/client";

// One owned legacy model boundary for historical projection and transactional cleanup.
function instances(client: Prisma.TransactionClient) {
  return client.directorRuntimeInstance;
}

export async function readLegacyDirectorRuntime(client: Prisma.TransactionClient, taskId: string) {
  try {
    return await instances(client).findFirst({
      where: { workflowTaskId: taskId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        executions: {
          where: { status: { in: ["leased", "running"] } },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
        checkpoints: { orderBy: [{ version: "desc" }, { createdAt: "desc" }], take: 1 },
        commands: { orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 20 },
      },
    });
  } catch (error) {
    // Older installations can lack these historical tables/columns. Other errors
    // must remain visible rather than silently hiding an unavailable database.
    if (error && typeof error === "object" && "code" in error
      && (error.code === "P2021" || error.code === "P2022")) return null;
    throw error;
  }
}

export function deleteLegacyDirectorRuntime(
  tx: Prisma.TransactionClient,
  novelId: string,
  taskIds: string[],
) {
  // The caller's transaction owns the parent deletion and all child cascades.
  return instances(tx).deleteMany({
    where: { OR: [{ novelId }, { workflowTaskId: { in: taskIds } }] },
  });
}
