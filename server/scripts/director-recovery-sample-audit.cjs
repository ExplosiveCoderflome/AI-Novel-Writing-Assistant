const path = require("node:path");

function loadDistModule(modulePath) {
  try {
    return require(modulePath);
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      throw new Error("Build the server first: pnpm --filter @ai-novel/server build");
    }
    throw error;
  }
}

async function main() {
  const serverRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(serverRoot, "..");
  const { prisma } = loadDistModule(path.join(repoRoot, "server", "dist", "db", "prisma.js"));
  const {
    buildDirectorRecoverySampleAudit,
  } = loadDistModule(path.join(
    repoRoot,
    "server",
    "dist",
    "services",
    "novel",
    "director",
    "directorRecoverySampleAudit.js",
  ));
  const { readDirectorTaskState } = loadDistModule(path.join(
    repoRoot,
    "server",
    "dist",
    "services",
    "novel",
    "director",
    "state",
    "DirectorStateReader.js",
  ));

  const take = Number.parseInt(process.env.DIRECTOR_SAMPLE_TAKE ?? "40", 10);
  const rowLimit = Number.isFinite(take) && take > 0 ? take : 40;
  const [tasks, commands, jobs, artifacts, draftBaselineArtifacts, draftChapters] = await Promise.all([
    prisma.novelWorkflowTask.findMany({
      where: { lane: "auto_director" },
      orderBy: [{ updatedAt: "desc" }],
      take: rowLimit,
    select: {
        id: true,
        novelId: true,
        status: true,
        pendingManualRecovery: true,
        checkpointType: true,
        currentStage: true,
        currentItemKey: true,
        currentItemLabel: true,
        resumeTargetJson: true,
        seedPayloadJson: true,
        lastError: true,
        updatedAt: true,
      },
    }),
    prisma.directorRunCommand.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: rowLimit,
      select: {
        id: true,
        taskId: true,
        novelId: true,
        commandType: true,
        status: true,
        payloadJson: true,
        updatedAt: true,
      },
    }),
    prisma.generationJob.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: rowLimit,
      select: {
        id: true,
        novelId: true,
        status: true,
        currentStage: true,
        currentItemLabel: true,
        startOrder: true,
        endOrder: true,
        completedCount: true,
        totalCount: true,
        updatedAt: true,
      },
    }),
    prisma.directorArtifact.findMany({
      where: {
        OR: [
          { source: "user_edited" },
          { protectedUserContent: true },
          { status: "stale" },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: rowLimit * 2,
      select: {
        id: true,
        novelId: true,
        artifactType: true,
        targetType: true,
        targetId: true,
        version: true,
        status: true,
        source: true,
        contentTable: true,
        contentId: true,
        contentHash: true,
        protectedUserContent: true,
        updatedAt: true,
      },
    }),
    prisma.directorArtifact.findMany({
      where: {
        artifactType: "chapter_draft",
        contentTable: "Chapter",
      },
      orderBy: [{ updatedAt: "desc" }],
      take: rowLimit * 4,
      select: {
        id: true,
        novelId: true,
        artifactType: true,
        targetType: true,
        targetId: true,
        version: true,
        status: true,
        source: true,
        contentTable: true,
        contentId: true,
        contentHash: true,
        protectedUserContent: true,
        updatedAt: true,
      },
    }),
    prisma.chapter.findMany({
      where: {
        content: { not: null },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: rowLimit * 2,
      select: {
        id: true,
        novelId: true,
        order: true,
        title: true,
        content: true,
        updatedAt: true,
      },
    }),
  ]);

  const chapterIds = Array.from(new Set(
    artifacts
      .filter((artifact) => artifact.contentTable === "Chapter" && artifact.contentId)
      .map((artifact) => artifact.contentId),
  ));
  const chapters = chapterIds.length > 0
    ? await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
      select: {
        id: true,
        novelId: true,
        order: true,
        title: true,
        content: true,
        updatedAt: true,
      },
    })
    : [];

  const audit = buildDirectorRecoverySampleAudit({
    tasks: tasks.map((task) => ({
      id: task.id,
      novelId: task.novelId,
      status: task.status,
      pendingManualRecovery: task.pendingManualRecovery,
      checkpointType: task.checkpointType,
      currentStage: task.currentStage,
      currentItemKey: task.currentItemKey,
      currentItemLabel: task.currentItemLabel,
      lastError: task.lastError,
      updatedAt: task.updatedAt,
      directorTaskState: readDirectorTaskState(task),
    })),
    commands,
    jobs,
    artifacts,
    chapters,
    draftBaselineArtifacts,
    draftChapters,
  });
  console.log(JSON.stringify(audit, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
