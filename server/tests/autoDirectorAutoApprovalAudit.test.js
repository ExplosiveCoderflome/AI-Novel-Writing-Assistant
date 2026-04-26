const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const {
  loadRecentAutoDirectorAutoApprovalRecords,
  recordAutoDirectorAutoApproval,
} = require("../dist/services/task/autoDirectorFollowUps/autoDirectorAutoApprovalAudit.js");
const { prisma } = require("../dist/db/prisma.js");

test("auto director auto-approval audit records the event, appends a milestone, and prunes older rows", async () => {
  const originals = {
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    taskUpdate: prisma.novelWorkflowTask.update,
    upsert: prisma.autoDirectorAutoApprovalRecord.upsert,
    findMany: prisma.autoDirectorAutoApprovalRecord.findMany,
    deleteMany: prisma.autoDirectorAutoApprovalRecord.deleteMany,
    appSettingFindMany: prisma.appSetting.findMany,
  };
  const taskUpdates = [];
  const deletedRows = [];
  const previousEnv = {
    AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL: process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL,
    AUTO_DIRECTOR_WECOM_WEBHOOK_URL: process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL,
  };
  delete process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
  delete process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_auto_approval",
    milestonesJson: JSON.stringify([
      {
        checkpointType: "character_setup_required",
        summary: "角色准备已生成。",
        createdAt: "2026-04-22T08:00:00.000Z",
      },
    ]),
  });
  prisma.novelWorkflowTask.update = async ({ data }) => {
    taskUpdates.push(data);
    return { id: "task_auto_approval", ...data };
  };
  prisma.autoDirectorAutoApprovalRecord.upsert = async ({ create }) => ({
    id: "auto_approval_new",
    ...create,
  });
  prisma.autoDirectorAutoApprovalRecord.findMany = async ({ skip, select }) => {
    assert.equal(skip, 10);
    assert.deepEqual(select, { id: true });
    return [{ id: "auto_approval_old" }];
  };
  prisma.autoDirectorAutoApprovalRecord.deleteMany = async ({ where }) => {
    deletedRows.push(where);
    return { count: 1 };
  };
  prisma.appSetting.findMany = async () => [];

  try {
    const record = await recordAutoDirectorAutoApproval({
      taskId: "task_auto_approval",
      novelId: "novel_auto_approval",
      novelTitle: "《雾港巡夜人》",
      checkpointType: "character_setup_required",
      checkpointSummary: "角色准备已生成并应用。",
      stage: "character_setup",
      occurredAt: new Date("2026-04-22T09:00:00.000Z"),
    });

    assert.equal(record.id, "auto_approval_new");
    assert.equal(record.approvalPointCode, "character_setup_ready");
    assert.equal(record.approvalPointLabel, "角色准备通过后继续");
    assert.match(record.summary, /AI 已自动通过「角色准备通过后继续」/);
    assert.equal(deletedRows.length, 1);
    assert.deepEqual(deletedRows[0], {
      id: {
        in: ["auto_approval_old"],
      },
    });
    const milestones = JSON.parse(taskUpdates[0].milestonesJson);
    assert.equal(milestones.length, 1);
    assert.equal(milestones[0].checkpointType, "character_setup_required");
    assert.match(milestones[0].summary, /AI 已自动通过「角色准备通过后继续」/);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    prisma.novelWorkflowTask.update = originals.taskUpdate;
    prisma.autoDirectorAutoApprovalRecord.upsert = originals.upsert;
    prisma.autoDirectorAutoApprovalRecord.findMany = originals.findMany;
    prisma.autoDirectorAutoApprovalRecord.deleteMany = originals.deleteMany;
    prisma.appSetting.findMany = originals.appSettingFindMany;
    process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL;
    process.env.AUTO_DIRECTOR_WECOM_WEBHOOK_URL = previousEnv.AUTO_DIRECTOR_WECOM_WEBHOOK_URL;
  }
});

test("auto director auto-approval audit loads the latest 10 records per novel", async () => {
  const originalFindMany = prisma.autoDirectorAutoApprovalRecord.findMany;
  const calls = [];
  prisma.autoDirectorAutoApprovalRecord.findMany = async ({ where, orderBy, take }) => {
    calls.push({ where, orderBy, take });
    const novelId = where.novelId;
    const count = novelId === "novel_a" ? 12 : 2;
    return Array.from({ length: Math.min(count, take) }, (_, index) => ({
      id: `${novelId}_${index}`,
      taskId: `task_${novelId}`,
      novelId,
      approvalPointCode: "structured_outline_ready",
      approvalPointLabel: "节奏拆章完成后继续",
      checkpointType: "front10_ready",
      checkpointSummary: null,
      summary: `${novelId} 自动通过 ${index}`,
      stage: "structured_outline",
      scopeLabel: "全书",
      eventId: `${novelId}:event:${index}`,
      createdAt: new Date(`2026-04-22T10:${String(30 - index).padStart(2, "0")}:00.000Z`),
    }));
  };

  try {
    const rows = await loadRecentAutoDirectorAutoApprovalRecords(["novel_a", "novel_b", "novel_a"]);

    assert.deepEqual(calls.map((call) => [call.where, call.take]), [
      [{ novelId: "novel_a" }, 10],
      [{ novelId: "novel_b" }, 10],
    ]);
    assert.deepEqual(calls[0].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.equal(rows.filter((row) => row.novelId === "novel_a").length, 10);
    assert.equal(rows.filter((row) => row.novelId === "novel_b").length, 2);
    assert.deepEqual(rows.slice(0, 2).map((row) => row.id), ["novel_b_0", "novel_a_0"]);
  } finally {
    prisma.autoDirectorAutoApprovalRecord.findMany = originalFindMany;
  }
});
