const test = require("node:test");
const assert = require("node:assert/strict");

const { PromptWorkbenchService } = require("../dist/prompting/PromptWorkbenchService.js");
const { ContextBroker } = require("../dist/prompting/context/ContextBroker.js");
const { createDefaultContextResolverRegistry } = require("../dist/prompting/context/defaultContextRegistry.js");
const {
  promptTemplateOverrideService,
} = require("../dist/prompting/templates/PromptTemplateOverrideService.js");

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
    .find((item) => item.key === "novel.chapter.writer@v6");
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

  assert.equal(catalog[0]?.id, "novel.chapter.writer");
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

test("prompt preview prefers selected novel chapter context over audit sample context", async () => {
  const service = new PromptWorkbenchService({
    novel: {
      findUnique: async () => ({
        id: "novel-real",
        title: "当代码开始杀人",
        description: "程序员发现提交记录会影响现实命案。",
        targetAudience: "喜欢技术悬疑的读者",
        bookSellingPoint: "代码提交与现实犯罪互相映照。",
        first30ChapterPromise: "查清第一起由代码触发的命案。",
      }),
    },
    chapter: {
      findFirst: async () => ({
        id: "chapter-real",
        title: "异常提交",
        order: 3,
        content: "林序看见测试分支上的提交信息变成了死亡预告，而监控里的受害者正走向同一间机房。",
        expectation: "让主角确认提交记录与现实命案存在因果联系。",
        targetWordCount: 3000,
        mustAvoid: "不得直接揭露幕后真凶。",
        taskSheet: "本章需要让主角发现异常提交，并在结尾形成新的追查压力。",
        sceneCards: JSON.stringify({
          scenes: [
            {
              entryState: "主角正在审查测试书籍的异常日志。",
              exitState: "主角确认提交记录会同步现实风险。",
              mustAdvance: ["确认代码提交与命案有关"],
              mustPreserve: ["主角仍不知道幕后真凶"],
              forbiddenExpansion: ["不得让系统直接解释全部规则"],
            },
          ],
        }),
        hook: "下一章从机房监控被篡改开始。",
      }),
    },
  });

  const preview = await service.preview({
    promptKey: "audit.chapter.full@v2",
    promptInput: {
      novelTitle: "当代码开始杀人",
      chapterTitle: "第 3 章 异常提交",
      requestedTypes: ["plot", "character", "continuity"],
      storyModeContext: "使用所选小说的章节任务、章节边界和结构义务进行本书预览。",
      content: "林序看见测试分支上的提交信息变成了死亡预告，而监控里的受害者正走向同一间机房。",
      ragContext: "无额外检索补充。",
    },
    executionContext: {
      entrypoint: "manual_test",
      novelId: "novel-real",
      chapterId: "chapter-real",
      userGoal: "preview selected novel audit prompt",
    },
    maxContextTokens: 4000,
  });

  assert.deepEqual(preview.diagnostics.missingRequiredGroups, []);
  assert.ok(preview.context.selectedBlockIds.includes("chapter_boundary"));
  assert.ok(preview.context.selectedBlockIds.includes("structure_obligations"));
  assert.ok(preview.context.blocks.some((block) => (
    block.id === "chapter_boundary"
    && block.content.includes("主角正在审查测试书籍的异常日志")
  )));
  assert.ok(preview.context.blocks.some((block) => (
    block.id === "world_rules"
    && block.content.includes("代码提交与现实犯罪互相映照")
  )));
  assert.ok(preview.messages.some((message) => message.content.includes("当代码开始杀人")));
  assert.ok(preview.diagnostics.notes.some((note) => note.includes("使用《当代码开始杀人》第 3 章")));
});

test("prompt preview assembles selected novel chapter write context for chapter writer", async () => {
  const service = new PromptWorkbenchService({
    novel: {
      findUnique: async () => ({
        id: "novel-real",
        title: "当代码开始杀人",
        description: "程序员发现提交记录会影响现实命案。",
        targetAudience: "喜欢技术悬疑的读者",
        bookSellingPoint: "代码提交与现实犯罪互相映照。",
        first30ChapterPromise: "查清第一起由代码触发的命案。",
        narrativePov: "第三人称有限视角",
        pacePreference: "中快节奏",
        emotionIntensity: "高压克制",
        styleTone: "冷峻、紧凑、画面感强",
        estimatedChapterCount: 80,
        characters: [
          {
            id: "char-linxu",
            name: "林序",
            role: "主角",
            personality: "谨慎但愿意冒险",
            background: "安全工程师",
            development: "从旁观者转为主动追查者",
            identityLabel: "程序员",
            factionLabel: "调查方",
            stanceLabel: "追查真相",
            powerLevel: "普通人",
            realm: null,
            currentLocation: "机房外",
            availability: "可出场",
            prohibitionsJson: JSON.stringify(["不得突然掌握幕后真凶身份"]),
            currentState: "刚确认提交记录与现实风险有关",
            currentGoal: "阻止下一次命案",
            appearance: "熬夜后的疲惫神情",
            physique: null,
            attireStyle: "深色连帽衫",
            signatureDetail: "随身带着旧键盘钥匙扣",
            voiceTexture: "短句、克制",
            presenceImpression: "紧张但清醒",
          },
        ],
      }),
    },
    chapter: {
      findFirst: async () => ({
        id: "chapter-real",
        title: "异常提交",
        order: 3,
        content: "",
        expectation: "让主角确认提交记录与现实命案存在因果联系。",
        targetWordCount: 3000,
        conflictLevel: 4,
        revealLevel: 2,
        mustAvoid: "不得直接揭露幕后真凶。",
        taskSheet: "本章需要让主角发现异常提交，并在结尾形成新的追查压力。",
        sceneCards: JSON.stringify({
          scenes: [
            {
              title: "机房外的异常日志",
              purpose: "让主角把提交记录和现实监控对上。",
              entryState: "主角正在审查测试书籍的异常日志。",
              exitState: "主角确认提交记录会同步现实风险。",
              mustAdvance: ["确认代码提交与命案有关"],
              mustPreserve: ["主角仍不知道幕后真凶"],
              forbiddenExpansion: ["不得让系统直接解释全部规则"],
            },
          ],
        }),
        hook: "下一章从机房监控被篡改开始。",
      }),
    },
  });

  const preview = await service.preview({
    promptKey: "novel.chapter.writer@v6",
    promptInput: {
      novelTitle: "当代码开始杀人",
      chapterOrder: 3,
      chapterTitle: "异常提交",
      mode: "draft",
      targetWordCount: 3000,
      minWordCount: 2600,
      maxWordCount: 3400,
    },
    executionContext: {
      entrypoint: "manual_test",
      novelId: "novel-real",
      chapterId: "chapter-real",
      userGoal: "preview selected novel writer prompt",
    },
    maxContextTokens: 8000,
  });

  assert.deepEqual(preview.diagnostics.missingRequiredGroups, []);
  for (const group of [
    "book_contract",
    "chapter_mission",
    "reader_experience",
    "character_hard_facts",
    "obligation_contract",
    "volume_window",
    "participant_subset",
    "local_state",
    "style_contract",
  ]) {
    assert.ok(
      preview.context.blocks.some((block) => block.group === group),
      `expected preview context group ${group}`,
    );
  }
  assert.ok(preview.context.blocks.some((block) => (
    block.group === "book_contract"
    && block.content.includes("当代码开始杀人")
  )));
  assert.ok(preview.context.blocks.some((block) => (
    block.group === "character_hard_facts"
    && block.content.includes("林序")
    && block.content.includes("不得突然掌握幕后真凶身份")
  )));
  assert.ok(preview.context.blocks.some((block) => (
    block.group === "chapter_mission"
    && block.content.includes("确认代码提交与命案有关")
  )));
  assert.ok(preview.diagnostics.notes.some((note) => note.includes("正文写作预览上下文")));
});

test("prompt preview renders unsaved advanced template draft without reading active template", async () => {
  const originalGetActiveCustomTemplate = promptTemplateOverrideService.getActiveCustomTemplate;
  promptTemplateOverrideService.getActiveCustomTemplate = async () => {
    throw new Error("active template should not be read for draft preview");
  };
  const service = new PromptWorkbenchService({
    novel: {
      findUnique: async () => ({
        id: "novel-draft",
        title: "模板测试书",
        description: "测试高级模板预览。",
        targetAudience: "测试读者",
        bookSellingPoint: "模板可控。",
        first30ChapterPromise: "完成正文写作链路。",
        narrativePov: "第三人称有限视角",
        pacePreference: "中快节奏",
        emotionIntensity: "高压克制",
        styleTone: "自然、紧凑",
        estimatedChapterCount: 60,
        characters: [{
          id: "char-1",
          name: "林序",
          role: "主角",
          personality: "谨慎",
          background: "工程师",
          development: "主动追查",
          identityLabel: "程序员",
          factionLabel: "调查方",
          stanceLabel: "追查真相",
          powerLevel: "普通人",
          realm: null,
          currentLocation: "机房外",
          availability: "可出场",
          prohibitionsJson: JSON.stringify(["不得知道幕后真凶"]),
          currentState: "发现异常日志",
          currentGoal: "确认风险来源",
          appearance: "",
          physique: null,
          attireStyle: "",
          signatureDetail: "",
          voiceTexture: "",
          presenceImpression: "",
        }],
      }),
    },
    chapter: {
      findFirst: async () => ({
        id: "chapter-draft",
        title: "异常日志",
        order: 2,
        content: "",
        expectation: "让主角确认日志和现实风险有关。",
        targetWordCount: 3000,
        conflictLevel: 4,
        revealLevel: 2,
        mustAvoid: "不得直接揭露幕后真凶。",
        taskSheet: "发现异常日志，并在结尾形成追查压力。",
        sceneCards: JSON.stringify({
          scenes: [{
            title: "机房外",
            purpose: "确认异常日志。",
            mustAdvance: ["确认日志与现实风险有关"],
            mustPreserve: ["主角不知道幕后真凶"],
          }],
        }),
        hook: "下一章从监控被篡改开始。",
      }),
    },
  });

  try {
    const preview = await service.preview({
      promptKey: "novel.chapter.writer@v6",
      promptInput: {
        novelTitle: "模板测试书",
        chapterOrder: 2,
        chapterTitle: "异常日志",
        mode: "draft",
        targetWordCount: 3000,
        minWordCount: 2600,
        maxWordCount: 3400,
      },
      executionContext: {
        entrypoint: "manual_test",
        novelId: "novel-draft",
        chapterId: "chapter-draft",
      },
      maxContextTokens: 8000,
      templateDraft: {
        kind: "chat",
        messages: [
          { role: "system", content: "DRAFT SYSTEM {{slot.writer.tonePreference}}" },
          { role: "human", content: "DRAFT HUMAN {{input.chapterTitle}}\n{{context.chapter_mission}}" },
        ],
      },
    });

    assert.ok(preview.messages.some((message) => message.content.includes("DRAFT SYSTEM")));
    assert.ok(preview.messages.some((message) => message.content.includes("DRAFT HUMAN 异常日志")));
    assert.ok(preview.diagnostics.template);
    assert.equal(preview.diagnostics.template.mode, "draft");
    assert.ok(preview.diagnostics.template.diagnostics.fallbackRequiredGroups.includes("book_contract"));
  } finally {
    promptTemplateOverrideService.getActiveCustomTemplate = originalGetActiveCustomTemplate;
  }
});
