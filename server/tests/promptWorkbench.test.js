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
  assert.equal(planner.mode, "structured");
  assert.equal(planner.capabilities.hasOutputSchema, true);
  assert.equal(planner.capabilities.hasPostValidate, true);
  assert.ok(planner.lockedFields.includes("outputSchema"));
  assert.ok(planner.lockedFields.includes("approvalBoundary"));
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
});
