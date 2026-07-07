const test = require("node:test");
const assert = require("node:assert/strict");

const { PromptWorkbenchService } = require("../dist/prompting/PromptWorkbenchService.js");
const { ContextBroker } = require("../dist/prompting/context/ContextBroker.js");
const { createDefaultContextResolverRegistry } = require("../dist/prompting/context/defaultContextRegistry.js");

function buildPlannerPromptInput() {
  return {
    goal: "show the current automatic director status",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
    currentRunStatus: "running",
    currentStep: "planning",
  };
}

function buildAuditWorkbenchSampleContextBlocks() {
  return [
    {
      id: "chapter_mission",
      group: "chapter_mission",
      priority: 100,
      content: [
        "Chapter mission: 示例章节",
        "Objective: 让主角发现旧仓库暗号，并确认有人正在逼近。",
        "Must advance",
        "- 主角发现墙上暗号并判断它指向旧城档案站。",
      ].join("\n"),
    },
    {
      id: "chapter_boundary",
      group: "chapter_boundary",
      priority: 99,
      required: true,
      content: [
        "Chapter boundary:",
        "Entry state: 主角独自进入旧仓库，尚未确认暗号含义。",
        "Ending state: 主角确认暗号指向旧城档案站，同时意识到追踪者已经到门外。",
        "Do not cross",
        "- 不得在本章直接揭开旧城组织的真实首领。",
      ].join("\n"),
    },
    {
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: [
        "Structure obligations",
        "- 必须检查本章是否完成线索发现、压力逼近和章末选择点。",
        "- 必须检查结尾是否形成新的悬念或追踪压力。",
      ].join("\n"),
    },
  ];
}

test("prompt workbench catalog exposes registered prompts without override execution", () => {
  const service = new PromptWorkbenchService();
  const catalog = service.listCatalog({ keyword: "planner.intent.parse" });
  const planner = catalog.find((item) => item.key === "planner.intent.parse@v1");

  assert.ok(planner);
  assert.equal(planner.slotSupported, false);
  assert.equal(planner.managementStatus, "missing_slots");
  assert.deepEqual(planner.slots, []);
  assert.ok(planner.description.includes("意图"));
  assert.equal(planner.outputType, "structured");
  assert.ok(planner.contextRequirements.some((requirement) => requirement.group === "creative_hub.bindings"));
  assert.equal(planner.mode, "structured");
  assert.equal(planner.capabilities.hasOutputSchema, true);
  assert.equal(planner.capabilities.hasPostValidate, true);
  assert.ok(planner.lockedFields.includes("outputSchema"));
  assert.ok(planner.lockedFields.includes("approvalBoundary"));

  const chapterWriter = service.listCatalog({ keyword: "novel.chapter.writer" })
    .find((item) => item.key === "novel.chapter.writer@v5");
  assert.ok(chapterWriter);
  assert.equal(chapterWriter.slotSupported, true);
  assert.equal(chapterWriter.managementStatus, "complete");
  assert.ok(chapterWriter.description.includes("章节正文"));
  assert.ok(chapterWriter.slots.some((slot) => slot.key === "writer.antiAiRules"));
  assert.ok(chapterWriter.lockedFields.includes("contextPolicy"));
});

test("prompt workbench catalog lists slot-supported prompts first", () => {
  const service = new PromptWorkbenchService();
  const catalog = service.listCatalog();
  const firstUnsupportedIndex = catalog.findIndex((item) => !item.slotSupported);
  const lastSupportedIndex = catalog.findLastIndex((item) => item.slotSupported);

  assert.ok(firstUnsupportedIndex > 0);
  assert.ok(lastSupportedIndex >= 0);
  assert.ok(lastSupportedIndex < firstUnsupportedIndex);
  assert.ok(catalog.slice(0, lastSupportedIndex + 1).every((item) => item.slotSupported));
});

test("context broker resolves creative hub bindings and supplied recent messages", async () => {
  const broker = new ContextBroker(createDefaultContextResolverRegistry());
  const result = await broker.resolve({
    executionContext: {
      entrypoint: "creative_hub",
      novelId: "novel-1",
      userGoal: "continue the next chapter",
      resourceBindings: {
        novelId: "novel-1",
        chapterId: "chapter-3",
      },
      recentMessages: [
        { role: "user", content: "Prepare the next chapter." },
        { role: "assistant", content: "The director is checking continuity." },
      ],
    },
    requirements: [
      { group: "creative_hub.bindings", required: true, priority: 100 },
      { group: "creative_hub.recent_messages", required: false, priority: 80 },
    ],
    maxTokensBudget: 2000,
  });

  assert.deepEqual(result.missingRequiredGroups, []);
  assert.ok(result.selectedBlockIds.includes("creative_hub.bindings"));
  assert.ok(result.selectedBlockIds.includes("creative_hub.recent_messages"));
  assert.ok(result.blocks.some((block) => block.content.includes("\"novelId\": \"novel-1\"")));
  assert.ok(result.blocks.some((block) => block.content.includes("Prepare the next chapter.")));
});

test("prompt preview renders base prompt messages with resolved context but does not call the LLM", async () => {
  const service = new PromptWorkbenchService();
  const preview = await service.preview({
    promptKey: "planner.intent.parse@v1",
    promptInput: buildPlannerPromptInput(),
    executionContext: {
      entrypoint: "creative_hub",
      novelId: "novel-1",
      userGoal: "show the current automatic director status",
      resourceBindings: {
        novelId: "novel-1",
      },
    },
    contextRequirements: [
      { group: "creative_hub.bindings", required: true, priority: 100 },
    ],
    maxContextTokens: 2000,
  });

  assert.equal(preview.prompt.key, "planner.intent.parse@v1");
  assert.equal(preview.prompt.slotSupported, false);
  assert.ok(preview.messages.length >= 2);
  assert.ok(preview.messages.some((message) => message.role === "system"));
  assert.ok(preview.messages.some((message) => message.role === "human"));
  assert.ok(preview.brokerResolution.selectedBlockIds.includes("creative_hub.bindings"));
  assert.ok(preview.context.selectedBlockIds.includes("creative_hub.bindings"));
  assert.deepEqual(preview.diagnostics.missingRequiredGroups, []);
  assert.equal(preview.diagnostics.tracePreview.promptId, "planner.intent.parse");
  assert.ok(preview.diagnostics.tracePreview.contextBlockIds.includes("creative_hub.bindings"));
  assert.deepEqual(preview.diagnostics.tracePreview.customAddendumBlockIds, []);
  assert.ok(preview.diagnostics.notes.some((note) => note.includes("没有声明可编辑槽位")));
});

test("prompt preview reports missing required context for manager diagnosis", async () => {
  const service = new PromptWorkbenchService();
  const preview = await service.preview({
    promptKey: "novel.chapter_editor.workspace_diagnosis@v1",
    promptInput: {
      chapterTitle: "第 3 章",
      chapterMission: "让主角发现关键线索。",
      volumePositionLabel: "第一卷中段",
      volumePhaseLabel: "冲突展开",
      paceDirective: "加快推进",
      previousChapterBridge: "上一章留下追踪线索。",
      nextChapterBridge: "下一章进入正面对抗。",
      activePlotThreads: ["追踪档案站"],
      paragraphs: [{ index: 1, text: "主角走进旧仓库。" }],
      openIssues: [],
    },
    executionContext: {
      entrypoint: "manual_test",
      novelId: "novel-1",
      chapterId: "chapter-3",
      userGoal: "preview chapter editor diagnosis",
    },
    maxContextTokens: 2000,
  });

  assert.ok(preview.messages.length >= 2);
  assert.ok(preview.diagnostics.missingRequiredGroups.includes("chapter_mission"));
  assert.ok(preview.brokerResolution.missingRequiredGroups.includes("chapter_mission"));
  assert.equal(preview.diagnostics.tracePreview.entrypoint, "manual_test");
});

test("prompt preview renders audit prompts with complete workbench sample input", async () => {
  const service = new PromptWorkbenchService();
  const preview = await service.preview({
    promptKey: "audit.chapter.full@v2",
    promptInput: {
      novelTitle: "示例小说",
      chapterTitle: "示例章节",
      requestedTypes: ["plot", "character", "continuity"],
      storyModeContext: "本书偏连载网文节奏，章节需要持续推进冲突并保留章末钩子。",
      content: "主角走进旧仓库，发现墙上残留着上一任调查员留下的暗号。",
      ragContext: "无额外检索补充。",
    },
    executionContext: {
      entrypoint: "manual_test",
      novelId: "novel-1",
      chapterId: "chapter-1",
      userGoal: "preview audit prompt",
      metadata: {
        extraContextBlocks: buildAuditWorkbenchSampleContextBlocks(),
      },
    },
    maxContextTokens: 2000,
  });

  assert.equal(preview.prompt.key, "audit.chapter.full@v2");
  assert.ok(preview.messages.some((message) => message.content.includes("审校范围：plot, character, continuity")));
  assert.deepEqual(preview.diagnostics.missingRequiredGroups, []);
  assert.ok(preview.context.selectedBlockIds.includes("chapter_boundary"));
  assert.ok(preview.context.selectedBlockIds.includes("structure_obligations"));
});
