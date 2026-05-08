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

test("prompt workbench catalog exposes registered prompts without override execution", () => {
  const service = new PromptWorkbenchService();
  const catalog = service.listCatalog({ keyword: "planner.intent.parse" });
  const planner = catalog.find((item) => item.key === "planner.intent.parse@v1");

  assert.ok(planner);
  assert.equal(planner.overrideSupported, false);
  assert.equal(planner.addendumSupported, false);
  assert.ok(planner.description.includes("意图"));
  assert.equal(planner.outputType, "structured");
  assert.equal(planner.overrideLifecycle.runtimeOverrideEnabled, false);
  assert.ok(planner.contextRequirements.some((requirement) => requirement.group === "creative_hub.bindings"));
  assert.equal(planner.mode, "structured");
  assert.equal(planner.capabilities.hasOutputSchema, true);
  assert.equal(planner.capabilities.hasPostValidate, true);
  assert.ok(planner.lockedFields.includes("outputSchema"));
  assert.ok(planner.lockedFields.includes("approvalBoundary"));

  const chapterWriter = service.listCatalog({ keyword: "novel.chapter.writer" })
    .find((item) => item.key === "novel.chapter.writer@v5");
  assert.ok(chapterWriter);
  assert.equal(chapterWriter.addendumSupported, true);
  assert.deepEqual(chapterWriter.addendumScopeLabels, ["全局", "单本小说"]);
  assert.ok(chapterWriter.description.includes("章节正文"));
  assert.ok(chapterWriter.editableSlots.some((slot) => slot.key === "writer.antiAiRules"));
  assert.ok(chapterWriter.lockedFields.includes("contextPolicy"));
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
  assert.equal(preview.prompt.overrideSupported, false);
  assert.ok(preview.messages.length >= 2);
  assert.ok(preview.messages.some((message) => message.role === "system"));
  assert.ok(preview.messages.some((message) => message.role === "human"));
  assert.ok(preview.brokerResolution.selectedBlockIds.includes("creative_hub.bindings"));
  assert.ok(preview.context.selectedBlockIds.includes("creative_hub.bindings"));
  assert.deepEqual(preview.diagnostics.missingRequiredGroups, []);
  assert.equal(preview.diagnostics.tracePreview.promptId, "planner.intent.parse");
  assert.ok(preview.diagnostics.tracePreview.contextBlockIds.includes("creative_hub.bindings"));
  assert.deepEqual(preview.diagnostics.tracePreview.customAddendumBlockIds, []);
  assert.ok(preview.diagnostics.notes.some((note) => note.includes("read-only preview")));
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
