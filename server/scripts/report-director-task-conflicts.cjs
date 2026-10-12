const path = require("node:path");

const { prisma } = require(path.resolve(__dirname, "../dist/db/prisma.js"));

const ACTIVE_STATUSES = ["queued", "running", "waiting_approval"];

async function main() {
  const activeTasks = await prisma.novelWorkflowTask.findMany({
    where: {
      lane: "auto_director",
      novelId: { not: null },
      status: { in: ACTIVE_STATUSES },
    },
    orderBy: [{ novelId: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      novelId: true,
      status: true,
      createdAt: true,
    },
  });

  const grouped = new Map();
  for (const task of activeTasks) {
    if (!task.novelId) {
      continue;
    }
    const tasks = grouped.get(task.novelId) ?? [];
    tasks.push(task);
    grouped.set(task.novelId, tasks);
  }

  const conflicts = Array.from(grouped.entries())
    .filter(([, tasks]) => tasks.length > 1)
    .map(([novelId, tasks]) => ({ novelId, tasks }));
  const novels = conflicts.length > 0
    ? await prisma.novel.findMany({
      where: { id: { in: conflicts.map((conflict) => conflict.novelId) } },
      select: { id: true, title: true },
    })
    : [];
  const titleByNovelId = new Map(novels.map((novel) => [novel.id, novel.title]));

  console.log(JSON.stringify({
    conflictNovelCount: conflicts.length,
    conflicts: conflicts.map((conflict) => ({
      novelId: conflict.novelId,
      novelTitle: titleByNovelId.get(conflict.novelId) ?? null,
      tasks: conflict.tasks.map((task) => ({
        id: task.id,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
      })),
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
