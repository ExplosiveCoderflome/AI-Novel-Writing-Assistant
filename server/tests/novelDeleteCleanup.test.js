const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelCoreCrudService } = require("../dist/services/novel/novelCoreCrudService.js");
const { prisma } = require("../dist/db/prisma.js");
const { ragServices } = require("../dist/services/rag/index.js");

test("deleteNovel removes novel tasks in every status and their archive markers before deleting the novel", async () => {
  const originalTransaction = prisma.$transaction;
  const originalEnqueueDelete = ragServices.ragIndexService.enqueueDelete;
  const calls = [];

  const transaction = {
    shortStoryRevisionJob: { deleteMany: async query => { calls.push(["deleteRevisions", query]); } },
    shortStoryPlan: { deleteMany: async query => { calls.push(["deletePlan", query]); } },
    novelWorkflowTask: {
      findMany: async (query) => {
        calls.push(["findTasks", query]);
        return [{ id: "workflow_1" }, { id: "workflow_2" }];
      },
      deleteMany: async (query) => {
        calls.push(["deleteTasks", query]);
        return { count: 2 };
      },
    },
    agentRun: {
      findMany: async (query) => {
        calls.push(["findAgentRuns", query]);
        return [{ id: "task_agent_1" }];
      },
      deleteMany: async (query) => {
        calls.push(["deleteAgentRuns", query]);
        return { count: 1 };
      },
    },
    generationJob: {
      findMany: async (query) => {
        calls.push(["findPipelineJobs", query]);
        return [{ id: "task_pipeline_1" }];
      },
    },
    imageGenerationTask: {
      findMany: async (query) => {
        calls.push(["findImageTasks", query]);
        return [{ id: "task_image_1" }];
      },
    },
    taskCenterArchive: {
      deleteMany: async (query) => {
        calls.push(["deleteArchiveMarkers", query]);
        return { count: 1 };
      },
    },
    novel: {
      delete: async (query) => {
        calls.push(["deleteNovel", query]);
        return { id: "novel_1" };
      },
    },
  };

  prisma.$transaction = async (callback) => callback(transaction);
  ragServices.ragIndexService.enqueueDelete = async (ownerType, ownerId) => {
    calls.push(["queueRagDelete", { ownerType, ownerId }]);
  };

  try {
    await new NovelCoreCrudService().deleteNovel("novel_1");

    assert.deepEqual(calls, [
      ["deleteRevisions", { where: { novelId: "novel_1" } }],
      ["deletePlan", { where: { novelId: "novel_1" } }],
      ["findTasks", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findAgentRuns", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findPipelineJobs", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findImageTasks", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["deleteArchiveMarkers", {
        where: {
          OR: [
            { taskKind: "novel_workflow", taskId: { in: ["workflow_1", "workflow_2"] } },
            { taskKind: "agent_run", taskId: { in: ["task_agent_1"] } },
            { taskKind: "novel_pipeline", taskId: { in: ["task_pipeline_1"] } },
            { taskKind: "image_generation", taskId: { in: ["task_image_1"] } },
          ],
        },
      }],
      ["deleteTasks", {
        where: { id: { in: ["workflow_1", "workflow_2"] } },
      }],
      ["deleteAgentRuns", {
        where: { id: { in: ["task_agent_1"] } },
      }],
      ["deleteNovel", { where: { id: "novel_1" } }],
      ["queueRagDelete", { ownerType: "novel", ownerId: "novel_1" }],
      ["queueRagDelete", { ownerType: "bible", ownerId: "novel_1" }],
    ]);
  } finally {
    prisma.$transaction = originalTransaction;
    ragServices.ragIndexService.enqueueDelete = originalEnqueueDelete;
  }
});

test("unfinished short stories delete with Restrict dependents and non-failed workflow tasks", async (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const Database = require("better-sqlite3");
  for (const status of ["failed", "running", "waiting_approval", "succeeded"]) {
    await t.test(status, async () => {
      const db = new Database(":memory:");
      const migrations = path.join(__dirname, "../src/prisma/migrations.sqlite");
      for (const name of fs.readdirSync(migrations).sort()) {
        const file = path.join(migrations, name, "migration.sql");
        if (fs.existsSync(file)) db.exec(fs.readFileSync(file, "utf8"));
      }
      db.pragma("foreign_keys = ON");
      db.exec(`
        INSERT INTO Novel(id, title, narrativeForm, updatedAt) VALUES ('story', 'Unfinished story', 'short_story', CURRENT_TIMESTAMP);
        INSERT INTO Novel(id, title, updatedAt) VALUES ('other', 'Keep this novel', CURRENT_TIMESTAMP);
        INSERT INTO NovelWorkflowTask(id, novelId, lane, title, updatedAt) VALUES ('workflow', 'story', 'short_story', 'Story task', CURRENT_TIMESTAMP);
        INSERT INTO NovelIntentVersion(id, novelId, workflowTaskId, version, originalExpression, structuredIntentJson, updatedAt)
          VALUES ('intent', 'story', 'workflow', 1, 'Story idea', '{}', CURRENT_TIMESTAMP);
        INSERT INTO ShortStoryPlan(id, novelId, intentVersionId, targetWordCount, endingPromise, structureJson, updatedAt)
          VALUES ('plan', 'story', 'intent', 3000, 'An ending', '{}', CURRENT_TIMESTAMP);
        INSERT INTO ShortStorySegment(id, novelId, planId, "order", targetWordCount, updatedAt)
          VALUES ('segment', 'story', 'plan', 1, 1000, CURRENT_TIMESTAMP);
        INSERT INTO ShortStoryRevisionJob(id, novelId, workflowTaskId, intentVersionId, strategy, baselineJson, updatedAt)
          VALUES ('revision', 'story', 'workflow', 'intent', 'revise', '{}', CURRENT_TIMESTAMP);
        INSERT INTO TaskCenterArchive(id, taskKind, taskId) VALUES ('archive', 'novel_workflow', 'workflow');
      `);
      db.prepare("UPDATE NovelWorkflowTask SET status = ? WHERE id = 'workflow'").run(status);
      // The old failed-task pre-cleanup cascades intent versions while the plan
      // still references them. Deleting the novel directly can use another cascade order.
      assert.throws(() => db.prepare("DELETE FROM NovelWorkflowTask WHERE id = 'workflow'").run(), /FOREIGN KEY constraint failed/);

      const byNovel = (table) => ({
        findMany: async ({ where }) => db.prepare(`SELECT id FROM "${table}" WHERE novelId = ?${where.status ? " AND status = ?" : ""}`)
          .all(...(where.status ? [where.novelId, where.status] : [where.novelId])),
        deleteMany: async ({ where }) => where.novelId
          ? db.prepare(`DELETE FROM "${table}" WHERE novelId = ?`).run(where.novelId)
          : db.prepare(`DELETE FROM "${table}" WHERE id IN (${where.id.in.map(() => "?").join(",")})`).run(...where.id.in),
      });
      const transaction = {
        shortStoryRevisionJob: byNovel("ShortStoryRevisionJob"),
        shortStoryPlan: byNovel("ShortStoryPlan"),
        novelWorkflowTask: byNovel("NovelWorkflowTask"),
        agentRun: byNovel("AgentRun"),
        generationJob: byNovel("GenerationJob"),
        imageGenerationTask: byNovel("ImageGenerationTask"),
        taskCenterArchive: { deleteMany: async ({ where }) => {
          for (const clause of where.OR) {
            for (const id of clause.taskId.in) db.prepare("DELETE FROM TaskCenterArchive WHERE taskKind = ? AND taskId = ?").run(clause.taskKind, id);
          }
        } },
        novel: { delete: async ({ where }) => db.prepare("DELETE FROM Novel WHERE id = ?").run(where.id) },
      };
      const originalTransaction = prisma.$transaction;
      const originalEnqueueDelete = ragServices.ragIndexService.enqueueDelete;
      prisma.$transaction = async callback => callback(transaction);
      ragServices.ragIndexService.enqueueDelete = async () => {};
      try {
        await new NovelCoreCrudService().deleteNovel("story");
        for (const table of ["NovelWorkflowTask", "NovelIntentVersion", "ShortStoryPlan", "ShortStorySegment", "ShortStoryRevisionJob", "TaskCenterArchive"]) {
          assert.equal(db.prepare(`SELECT count(*) AS count FROM "${table}"`).get().count, 0, table);
        }
        assert.deepEqual(db.prepare("SELECT id FROM Novel").all(), [{ id: "other" }]);
      } finally {
        prisma.$transaction = originalTransaction;
        ragServices.ragIndexService.enqueueDelete = originalEnqueueDelete;
        db.close();
      }
    });
  }
});
