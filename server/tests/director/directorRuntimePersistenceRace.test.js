const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../dist/db/prisma.js");

const {
  DirectorRuntimeStore,
} = require("../../dist/services/novel/director/runtime/DirectorRuntimeStore.js");

test("director runtime persistence skips dependency edges when the target disappears after preflight", async () => {
  const store = new DirectorRuntimeStore();
  const dependencyAttempts = [];
  const dependencyUpdates = [];
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runUpsert: prisma.directorRun.upsert,
    artifactUpsert: prisma.directorArtifact.upsert,
    artifactFindMany: prisma.directorArtifact.findMany,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
    dependencyUpdate: prisma.directorArtifactDependency.update,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-race",
    novelId: "novel-race",
    seedPayloadJson: JSON.stringify({ novelId: "novel-race" }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async () => ({});
  prisma.directorArtifact.findMany = async ({ where }) => (
    (where?.id?.in ?? []).map((id) => ({ id }))
  );
  prisma.directorArtifactDependency.deleteMany = async () => ({ count: 0 });
  prisma.directorArtifactDependency.upsert = async ({ create }) => {
    dependencyAttempts.push([create.artifactId, create.dependsOnArtifactId]);
    throw { code: "P2003" };
  };
  prisma.directorArtifactDependency.update = async ({ where, data }) => {
    dependencyUpdates.push([where, data]);
    return {};
  };

  try {
    await store.mutateSnapshot("task-race", (snapshot) => ({
      ...snapshot,
      runId: "task-race",
      novelId: "novel-race",
      artifacts: [
        {
          id: "story_macro:novel:novel-race:StoryMacroPlan:macro-race",
          novelId: "novel-race",
          artifactType: "story_macro",
          targetType: "novel",
          targetId: "novel-race",
          version: 1,
          status: "active",
          source: "ai_generated",
          contentRef: { table: "StoryMacroPlan", id: "macro-race" },
          schemaVersion: "test",
        },
        {
          id: "volume_strategy:novel:novel-race:VolumePlan:volume-race",
          novelId: "novel-race",
          artifactType: "volume_strategy",
          targetType: "novel",
          targetId: "novel-race",
          version: 1,
          status: "active",
          source: "ai_generated",
          contentRef: { table: "VolumePlan", id: "volume-race" },
          schemaVersion: "test",
          dependsOn: [{
            artifactId: "story_macro:novel:novel-race:StoryMacroPlan:macro-race",
            version: 1,
          }],
        },
      ],
    }));

    assert.deepEqual(dependencyAttempts, [[
      "volume_strategy:novel:novel-race:VolumePlan:volume-race",
      "story_macro:novel:novel-race:StoryMacroPlan:macro-race",
    ]]);
    assert.deepEqual(dependencyUpdates, []);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
    prisma.directorArtifactDependency.update = originals.dependencyUpdate;
  }
});
