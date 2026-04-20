const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");
const { NovelChapterEditorService } = require("../dist/services/novel/chapterEditor/NovelChapterEditorService.js");
const { ChapterEditorWorkspaceService } = require("../dist/services/novel/chapterEditor/ChapterEditorWorkspaceService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function createWorkspaceContext() {
  return {
    novel: {
      id: "novel-1",
      title: "Test Novel",
      pacePreference: "balanced",
      styleTone: "restrained",
      narrativePov: "third_person",
      emotionIntensity: "medium",
      world: null,
      bookContract: {
        absoluteRedLines: ["不要改主角核心动机"],
      },
      chapters: [{
        id: "chapter-1",
        title: "Test Chapter",
        order: 7,
        content: "alpha\n\nbeta",
        expectation: "push conflict forward",
        updatedAt: new Date().toISOString(),
      }],
    },
    chapter: {
      id: "chapter-1",
      title: "Test Chapter",
      order: 7,
      content: "alpha\n\nbeta",
      expectation: "push conflict forward",
      updatedAt: new Date().toISOString(),
    },
    chapterPlan: {
      id: "plan-1",
      novelId: "novel-1",
      chapterId: "chapter-1",
      parentId: null,
      sourceStateSnapshotId: null,
      level: "chapter",
      planRole: "progress",
      phaseLabel: null,
      title: "Plan",
      objective: "push conflict forward",
      participantsJson: null,
      revealsJson: null,
      riskNotesJson: null,
      mustAdvanceJson: JSON.stringify(["把冲突往前推"]),
      mustPreserveJson: JSON.stringify(["保留主角隐忍感"]),
      sourceIssueIdsJson: null,
      replannedFromPlanId: null,
      hookTarget: "next pressure",
      status: "active",
      externalRef: null,
      rawPlanJson: null,
      scenes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    auditReports: [{
      id: "report-1",
      novelId: "novel-1",
      chapterId: "chapter-1",
      auditType: "mode_fit",
      overallScore: 80,
      summary: "needs pacing work",
      legacyScoreJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      issues: [{
        id: "issue-1",
        reportId: "report-1",
        auditType: "mode_fit",
        severity: "medium",
        code: "mode_fit_pacing_slow",
        description: "pacing is too slow",
        evidence: "The daily activity paragraph runs too long.",
        fixSuggestion: "Compress the routine details and surface pressure earlier.",
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    }],
    latestStateSnapshot: {
      id: "snapshot-1",
      novelId: "novel-1",
      sourceChapterId: "chapter-1",
      summary: null,
      rawStateJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      characterStates: [{
        id: "cs-1",
        snapshotId: "snapshot-1",
        characterId: "char-1",
        currentGoal: "stabilize the scene",
        emotion: "tense",
        stressLevel: 3,
        secretExposure: null,
        knownFactsJson: null,
        misbeliefsJson: null,
        summary: "Lin Zhou is trying to stay composed.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      relationStates: [],
      informationStates: [],
      foreshadowStates: [{
        id: "fs-1",
        snapshotId: "snapshot-1",
        title: "first crack in routine",
        summary: "Routine pressure is about to break.",
        status: "pending_payoff",
        setupChapterId: "chapter-1",
        payoffChapterId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    },
    volumes: [{
      id: "volume-1",
      novelId: "novel-1",
      sortOrder: 1,
      title: "第1卷",
      summary: "Volume summary",
      openingHook: null,
      mainPromise: "Main promise",
      primaryPressureSource: null,
      coreSellingPoint: null,
      escalationMode: null,
      protagonistChange: null,
      midVolumeRisk: null,
      climax: null,
      payoffType: null,
      nextVolumeHook: null,
      resetPoint: null,
      openPayoffs: ["身份逆转伏笔"],
      status: "active",
      sourceVersionId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chapters: [{
        id: "volume-chapter-1",
        volumeId: "volume-1",
        chapterOrder: 7,
        beatKey: null,
        title: "Test Chapter",
        summary: "Push the routine pressure toward visible conflict.",
        purpose: "让底层处境开始显出压迫感",
        exclusiveEvent: null,
        endingState: null,
        nextChapterEntryState: null,
        conflictLevel: null,
        revealLevel: null,
        targetWordCount: null,
        mustAvoid: null,
        taskSheet: null,
        sceneCards: null,
        payoffRefs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    }],
    normalizedContent: "alpha\n\nbeta",
    paragraphs: [{
      index: 1,
      text: "alpha",
      from: 0,
      to: 5,
    }, {
      index: 2,
      text: "beta",
      from: 7,
      to: 11,
    }],
    styleSummary: "restrained · 视角: third_person · 节奏: balanced · 情绪强度: medium",
    chapterSummary: "The lead braces for the next hit.",
    openAuditIssues: [{
      id: "issue-1",
      reportId: "report-1",
      auditType: "mode_fit",
      severity: "medium",
      code: "mode_fit_pacing_slow",
      description: "pacing is too slow",
      evidence: "The daily activity paragraph runs too long.",
      fixSuggestion: "Compress the routine details and surface pressure earlier.",
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    macroContext: {
      chapterRoleInVolume: "让底层处境开始显出压迫感",
      volumeTitle: "第1卷",
      volumePositionLabel: "本卷第 1 / 1 章",
      volumePhaseLabel: "开卷",
      paceDirective: "整体节奏保持均衡；优先快速立住处境、矛盾与阅读抓手，不宜过早把篇幅耗在静态解释上。",
      chapterMission: "push conflict forward",
      previousChapterBridge: "本章前没有可承接的上一章摘要。",
      nextChapterBridge: "本章后没有可参考的下一章摘要。",
      activePlotThreads: ["把冲突往前推", "身份逆转伏笔"],
      characterStateSummary: "- Lin Zhou is trying to stay composed. / stabilize the scene / tense",
      worldConstraintSummary: "暂无额外世界约束。",
      mustKeepConstraints: ["保留主角隐忍感", "不要改主角核心动机"],
    },
  };
}

test("NovelChapterEditorService previewRewrite returns compatibility payload and passes macro context into prompt input", async () => {
  let capturedPromptInput = null;
  const service = new NovelChapterEditorService(
    {
      loadContext: async () => createWorkspaceContext(),
    },
    async ({ asset, promptInput }) => {
      if (asset.id === "novel.chapter_editor.rewrite_candidates") {
        capturedPromptInput = promptInput;
        return {
          output: {
            macroAlignmentNote: "The revision keeps the chapter aligned with the opening pressure.",
            candidates: [{
              label: "More natural",
              content: "alpha revised",
              summary: "Keep the original intent and make it read more naturally.",
              rationale: "Tighten the sentence while preserving the same pressure.",
              riskNotes: ["Watch the restraint in the next paragraph."],
              semanticTags: ["polish", "voice"],
            }, {
              label: "More restrained",
              content: "alpha compressed",
              summary: "Compress modifiers and keep the scene moving.",
              rationale: "Remove excess phrasing so the paragraph lands faster.",
              semanticTags: ["compress", "retain_info"],
            }],
          },
        };
      }
      throw new Error(`Unexpected asset: ${asset.id}`);
    },
  );

  const result = await service.previewRewrite("novel-1", "chapter-1", {
    operation: "polish",
    contentSnapshot: "alpha\n\nbeta",
    targetRange: {
      from: 0,
      to: 5,
      text: "alpha",
    },
    context: {
      beforeParagraphs: [],
      afterParagraphs: ["beta"],
    },
    chapterContext: {
      goalSummary: "push conflict forward",
      chapterSummary: "the lead braces for the next hit",
      styleSummary: "tight third-person limited, restrained tone",
      characterStateSummary: "Lin Zhou is still holding steady",
      worldConstraintSummary: "do not introduce any new setting rules",
    },
    constraints: {
      keepFacts: true,
      keepPov: true,
      noUnauthorizedSetting: true,
      preserveCoreInfo: true,
    },
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.4,
  });

  assert.equal(result.operation, "polish");
  assert.equal(result.targetRange.text, "alpha");
  assert.equal(result.candidates.length, 2);
  assert.ok(result.activeCandidateId);
  assert.ok(result.candidates[0].diffChunks.some((chunk) => chunk.type !== "equal"));
  assert.equal(capturedPromptInput.selectedText, "alpha");
  assert.equal(capturedPromptInput.scope, "selection");
  assert.ok(capturedPromptInput.macroContextSummary.includes("卷内位置"));
  assert.ok(capturedPromptInput.constraintsText.includes("保留现有剧情事实"));
});

test("NovelChapterEditorService previewAiRevision supports freeform whole-chapter requests", async () => {
  const service = new NovelChapterEditorService(
    {
      loadContext: async () => createWorkspaceContext(),
    },
    async ({ asset }) => {
      if (asset.id === "novel.chapter_editor.user_intent") {
        return {
          output: {
            editGoal: "把整章改得更压抑",
            toneShift: "更克制、更压抑",
            paceAdjustment: "保持推进但压得更紧",
            conflictAdjustment: "让压迫更早浮出",
            emotionAdjustment: "强化压抑感",
            mustPreserve: ["保留当前剧情事实"],
            mustAvoid: ["不要破坏主角隐忍感"],
            strength: "medium",
            reasoningSummary: "用户希望整章更压抑，但不改变事实。",
          },
        };
      }
      if (asset.id === "novel.chapter_editor.rewrite_candidates") {
        return {
          output: {
            macroAlignmentNote: "The rewrite keeps the chapter aligned with the opening pressure.",
            candidates: [{
              label: "更压抑",
              content: "alpha revised\n\nbeta revised",
              summary: "整体压低空气感并提早压迫信号。",
              rationale: "让压抑感从第一段就更稳定地覆盖全章。",
              semanticTags: ["emotion", "pace"],
            }, {
              label: "更克制",
              content: "alpha restrained\n\nbeta restrained",
              summary: "保留信息但整体语气更克制。",
              rationale: "维持原意，只把表达往更压抑的方向推。",
              semanticTags: ["emotion", "voice"],
            }],
          },
        };
      }
      throw new Error(`Unexpected asset: ${asset.id}`);
    },
  );

  const result = await service.previewAiRevision("novel-1", "chapter-1", {
    source: "freeform",
    scope: "chapter",
    instruction: "把这一章整体改得更压抑，但别改剧情事实。",
    contentSnapshot: "alpha\n\nbeta",
    constraints: {
      keepFacts: true,
      keepPov: true,
      noUnauthorizedSetting: true,
      preserveCoreInfo: true,
    },
  });

  assert.equal(result.scope, "chapter");
  assert.equal(result.targetRange.from, 0);
  assert.equal(result.targetRange.text, "alpha\n\nbeta");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.resolvedIntent.editGoal, "把整章改得更压抑");
  assert.ok(result.macroAlignmentNote.includes("opening pressure"));
});

test("ChapterEditorWorkspaceService maps diagnosis paragraphs into anchor ranges", async () => {
  const workspaceService = new ChapterEditorWorkspaceService(
    {
      getNovelById: async () => createWorkspaceContext().novel,
      getChapterPlan: async () => createWorkspaceContext().chapterPlan,
      listChapterAuditReports: async () => createWorkspaceContext().auditReports,
      getLatestStateSnapshot: async () => createWorkspaceContext().latestStateSnapshot,
    },
    {
      getVolumes: async () => ({ volumes: createWorkspaceContext().volumes }),
    },
    async () => ({
      output: {
        cards: [{
          title: "节奏拖慢",
          problemSummary: "第一段的静态描述过长，压住了推进。",
          whyItMatters: "如果这里不收紧，读者会更晚进入压迫线。",
          recommendedAction: "compress",
          recommendedScope: "selection",
          paragraphStart: 1,
          paragraphEnd: 1,
          severity: "medium",
          sourceTags: ["节奏", "推进"],
        }],
        recommendedTask: {
          title: "先压紧第一段",
          summary: "先把第一段压紧，让压迫更早浮出来。",
          recommendedAction: "compress",
          recommendedScope: "selection",
          paragraphStart: 1,
          paragraphEnd: 1,
        },
      },
    }),
  );

  const workspace = await workspaceService.getWorkspace("novel-1", "chapter-1");

  assert.equal(workspace.diagnosticCards.length, 1);
  assert.deepEqual(workspace.diagnosticCards[0].anchorRange, { from: 0, to: 5 });
  assert.equal(workspace.recommendedTask.paragraphLabel, "P1");
  assert.ok(workspace.macroContext.paceDirective.includes("抓手"));
});

test("GET workspace and POST ai-revision-preview routes return the new editor payloads", async () => {
  const originalWorkspaceMethod = NovelService.prototype.getChapterEditorWorkspace;
  const originalRevisionMethod = NovelService.prototype.previewChapterAiRevision;
  NovelService.prototype.getChapterEditorWorkspace = async () => ({
    chapterMeta: {
      chapterId: "chapter-1",
      order: 1,
      title: "Test Chapter",
      wordCount: 1234,
      openIssueCount: 2,
      styleSummary: "restrained",
      updatedAt: new Date().toISOString(),
    },
    macroContext: {
      chapterRoleInVolume: "负责建立局面",
      volumeTitle: "第1卷",
      volumePositionLabel: "本卷第 1 / 10 章",
      volumePhaseLabel: "开卷",
      paceDirective: "优先立住冲突。",
      chapterMission: "建立压迫",
      previousChapterBridge: "无",
      nextChapterBridge: "铺向下一章的第一次反击",
      activePlotThreads: ["底层处境", "身份逆转伏笔"],
      characterStateSummary: "主角在忍",
      worldConstraintSummary: "不要新增设定",
      mustKeepConstraints: ["保持当前事实"],
    },
    diagnosticCards: [{
      id: "card-1",
      title: "节奏拖慢",
      problemSummary: "第一段略慢。",
      whyItMatters: "会拖住读者进入主冲突。",
      recommendedAction: "compress",
      recommendedScope: "selection",
      anchorRange: { from: 0, to: 5 },
      paragraphLabel: "P1",
      severity: "medium",
      sourceTags: ["节奏"],
    }],
    recommendedTask: {
      title: "先压紧第一段",
      summary: "先把第一段压紧。",
      recommendedAction: "compress",
      recommendedScope: "selection",
      anchorRange: { from: 0, to: 5 },
      paragraphLabel: "P1",
    },
    refreshReason: "已基于本章内容实时生成修文建议。",
  });
  NovelService.prototype.previewChapterAiRevision = async (_novelId, _chapterId, payload) => ({
    sessionId: "session-1",
    scope: payload.scope,
    resolvedIntent: {
      editGoal: "更压抑",
      toneShift: "更克制",
      paceAdjustment: "更紧",
      conflictAdjustment: "更早浮出",
      emotionAdjustment: "更压抑",
      mustPreserve: ["保留当前事实"],
      mustAvoid: ["不要破坏人设"],
      strength: "medium",
      reasoningSummary: "按用户要求执行。",
    },
    targetRange: payload.selection ?? { from: 0, to: 11, text: "alpha\n\nbeta" },
    macroAlignmentNote: "与本章/本卷目标保持一致。",
    candidates: [{
      id: "candidate-1",
      label: "更压抑",
      content: "alpha revised",
      summary: "让压抑感更早浮出。",
      rationale: "通过压缩和重心前移，让压迫更早可感。",
      riskNotes: ["注意下一段承接。"],
      semanticTags: ["emotion"],
      diffChunks: [
        { id: "chunk-1", type: "delete", text: "alpha" },
        { id: "chunk-2", type: "insert", text: "alpha revised" },
      ],
    }, {
      id: "candidate-2",
      label: "更克制",
      content: "alpha restrained",
      summary: "保留信息但收紧表达。",
      rationale: "把表达压得更稳，不改变事实。",
      semanticTags: ["voice"],
      diffChunks: [
        { id: "chunk-1", type: "delete", text: "alpha" },
        { id: "chunk-2", type: "insert", text: "alpha restrained" },
      ],
    }],
    activeCandidateId: "candidate-1",
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const workspaceResponse = await fetch(`http://127.0.0.1:${port}/api/novels/novel-1/chapters/chapter-1/editor/workspace`);
    assert.equal(workspaceResponse.status, 200);
    const workspacePayload = await workspaceResponse.json();
    assert.equal(workspacePayload.success, true);
    assert.equal(workspacePayload.data.diagnosticCards.length, 1);

    const revisionResponse = await fetch(`http://127.0.0.1:${port}/api/novels/novel-1/chapters/chapter-1/editor/ai-revision-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "freeform",
        scope: "chapter",
        instruction: "把这一章整体改得更压抑，但别改剧情事实。",
        contentSnapshot: "alpha\n\nbeta",
        constraints: {
          keepFacts: true,
          keepPov: true,
          noUnauthorizedSetting: true,
          preserveCoreInfo: true,
        },
      }),
    });

    assert.equal(revisionResponse.status, 200);
    const revisionPayload = await revisionResponse.json();
    assert.equal(revisionPayload.success, true);
    assert.equal(revisionPayload.data.scope, "chapter");
    assert.equal(revisionPayload.data.candidates.length, 2);
  } finally {
    NovelService.prototype.getChapterEditorWorkspace = originalWorkspaceMethod;
    NovelService.prototype.previewChapterAiRevision = originalRevisionMethod;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
