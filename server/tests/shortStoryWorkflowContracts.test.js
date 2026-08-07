const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildTxtContent,
} = require("../dist/modules/export/novelExport.formatting.js");
const {
  resumeTargetToRoute,
} = require("../dist/services/novel/workflow/novelWorkflow.shared.js");
const {
  listRegisteredPromptAssets,
} = require("../dist/prompting/registry.js");

const SERVER_ROOT = path.join(__dirname, "..");
const PRISMA_ROOT = path.join(SERVER_ROOT, "src", "prisma");

test("short story TXT export stays continuous and omits internal segment headings", () => {
  const content = buildTxtContent({
    title: "夜航",
    description: null,
    narrativeForm: "short_story",
    shortStoryContent: "第一段正文。\n\n第二段正文。",
    chapters: [
      { order: 1, title: "内部片段一", content: "不应导出" },
    ],
  });

  assert.match(content, /第一段正文。\n\n第二段正文。/);
  assert.doesNotMatch(content, /第1章|内部片段一|={8,}|-{8,}/);
});

test("creation studio resume routes preserve pre-creation tasks and short story studios", () => {
  assert.equal(resumeTargetToRoute({
    route: "/create",
    taskId: "task with spaces",
    novelId: null,
    lane: "creation_studio",
    stage: "creation_intent",
  }), "/create?taskId=task%20with%20spaces");

  assert.equal(resumeTargetToRoute({
    route: "/novels/:id/story",
    taskId: "task-2",
    novelId: "novel-2",
    lane: "creation_studio",
    stage: "short_story_draft",
  }), "/novels/novel-2/story");
});

test("all creation and short story prompts are registered structured assets", () => {
  const assets = new Map(listRegisteredPromptAssets().map((asset) => [`${asset.id}@${asset.version}`, asset]));
  const keys = [
    "creation.intent.interpret@v2",
    "novel.short_story.plan@v2",
    "novel.short_story.segment.write@v2",
    "novel.short_story.full.audit@v2",
    "novel.short_story.patch.repair@v2",
    "novel.short_story.revision.impact@v2",
  ];

  for (const key of keys) {
    const asset = assets.get(key);
    assert.ok(asset, `${key} must be registered`);
    assert.equal(asset.mode, "structured");
    assert.ok(asset.outputSchema, `${key} must declare outputSchema`);
  }
  const writer = assets.get("novel.short_story.segment.write@v2");
  assert.equal(writer.management?.proseGeneration, true);
  assert.ok(writer.management?.editModes.includes("advanced_template"));
  assert.ok(writer.slots?.length >= 7);
});

test("short story prompt contract targets completed Chinese web fiction instead of literary miniatures", () => {
  const promptSource = fs.readFileSync(
    path.join(SERVER_ROOT, "src", "prompting", "prompts", "shortStory", "shortStory.prompts.ts"),
    "utf8",
  );

  assert.match(promptSource, /篇幅更短、能一次读完并完整收束的网络小说/);
  assert.match(promptSource, /前 300～500 字必须进入压力、异常、冲突或决定点/);
  assert.match(promptSource, /progressionBeats/);
  assert.match(promptSource, /题材匹配的 payoff/);
  assert.match(promptSource, /causalContract/);
  assert.match(promptSource, /不得在危机发生时突然新增万能道具/);
  assert.match(promptSource, /关键因果\/事实矛盾不得降级为普通建议/);
  assert.match(promptSource, /手机阅读组织中文段落/);
  assert.match(promptSource, /不得写成散文、纯文学小品或剧情梗概/);
  assert.match(promptSource, /productionFoundation/);
  assert.match(promptSource, /【创作底座】/);
});

test("short story planning, prose, audit and repair share the resolved production foundation", () => {
  const contextSource = fs.readFileSync(
    path.join(SERVER_ROOT, "src", "modules", "novel", "short-story", "application", "shortStoryPromptContext.ts"),
    "utf8",
  );
  const productionSource = fs.readFileSync(
    path.join(SERVER_ROOT, "src", "modules", "novel", "short-story", "application", "ShortStoryProductionService.ts"),
    "utf8",
  );
  const studioSource = fs.readFileSync(
    path.join(SERVER_ROOT, "src", "modules", "novel", "short-story", "application", "ShortStoryStudioService.ts"),
    "utf8",
  );

  assert.match(contextSource, /shortStoryProductionFoundationText/);
  assert.match(contextSource, /"short-story:production-foundation", "production_foundation"/);
  assert.match(contextSource, /required: true/);
  assert.match(productionSource, /productionFoundation: context\.productionFoundation/);
  assert.match(studioSource, /productionFoundation: context\.productionFoundation/);
});

test("short story audit cannot accept a draft with critical causal contradictions", () => {
  const audit = listRegisteredPromptAssets()
    .find((asset) => asset.id === "novel.short_story.full.audit");
  assert.ok(audit?.postValidate);
  assert.throws(() => audit.postValidate({
    decision: "accepted",
    summary: "可直接交付。",
    issues: [{
      code: "causal_contradiction",
      severity: "critical",
      description: "关键道具的身份前后矛盾。",
      affectedSegmentOrders: [2, 4],
    }],
  }, {
    originalIdea: "末日囤粮",
    understanding: "末日中的物资选择。",
    direction: {},
    plan: { targetWordCount: 3000 },
    content: "正文".repeat(2500),
  }), /关键因果或事实问题/);
});

test("PostgreSQL and SQLite keep the short story persistence contract aligned", () => {
  const schemas = [
    path.join(PRISMA_ROOT, "schema.prisma"),
    path.join(PRISMA_ROOT, "schema.sqlite.prisma"),
  ].map((filePath) => fs.readFileSync(filePath, "utf8"));

  for (const schema of schemas) {
    assert.match(schema, /narrativeForm\s+NarrativeForm\s+@default\(long_novel\)/);
    assert.match(schema, /model NovelIntentVersion/);
    assert.match(schema, /model ShortStoryPlan/);
    assert.match(schema, /model ShortStorySegment/);
    assert.match(schema, /model CreationStudioConfirmation/);
  }
});

test("short story migrations exist for both database providers", () => {
  const migrationNames = [
    "20260730120000_creation_studio_short_story",
    "20260730121000_creation_studio_confirmation",
  ];
  for (const migrationName of migrationNames) {
    assert.ok(fs.existsSync(path.join(PRISMA_ROOT, "migrations", migrationName, "migration.sql")));
    assert.ok(fs.existsSync(path.join(PRISMA_ROOT, "migrations.sqlite", migrationName, "migration.sql")));
  }
});
