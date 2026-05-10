const test = require("node:test");
const assert = require("node:assert/strict");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: {
    prisma: {
      chapter: { findMany: async () => [] },
      novel: { findUnique: async () => null },
      bookContract: { findUnique: async () => null },
      storyMacroPlan: { findUnique: async () => null },
      character: { count: async () => 0, findFirst: async () => null },
      volumePlan: { findMany: async () => [] },
      volumeChapterPlan: { count: async () => 0, findMany: async () => [] },
      world: { findUnique: async () => null },
      knowledgeDocument: { findUnique: async () => null },
      bookAnalysis: { findUnique: async () => null },
      qualityReport: { findMany: async () => [] },
      auditReport: { findMany: async () => [] },
      storyStateSnapshot: { findMany: async () => [] },
      payoffLedgerItem: { findMany: async () => [] },
      characterResourceLedgerItem: { findMany: async () => [] },
      generationJob: { findFirst: async () => null },
      novelWorkflowTask: { findFirst: async () => null },
      directorArtifact: { findMany: async () => [] },
    },
  },
};

const {
  DirectorWorkspaceAnalyzer,
  buildManualEditFallbackDecision,
  buildManualEditInventoryFromArtifacts,
} = require("../dist/services/novel/director/runtime/DirectorWorkspaceAnalyzer.js");
const {
  buildDirectorWorkspaceAnalysisContextBlocks,
  directorWorkspaceAnalysisPrompt,
} = require("../dist/prompting/prompts/novel/directorWorkspaceAnalysis.prompts.js");
const {
  buildDirectorManualEditImpactContextBlocks,
  directorManualEditImpactPrompt,
} = require("../dist/prompting/prompts/novel/directorManualEditImpact.prompts.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const promptContextResolution = require("../dist/prompting/context/promptContextResolution.js");

function chapterDraft(hash) {
  return {
    id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
    novelId: "novel-1",
    artifactType: "chapter_draft",
    targetType: "chapter",
    targetId: "chapter-1",
    version: 1,
    status: "active",
    source: "user_edited",
    contentRef: { table: "Chapter", id: "chapter-1" },
    contentHash: hash,
    schemaVersion: "test",
    protectedUserContent: true,
    updatedAt: "2026-04-28T01:00:00.000Z",
  };
}

test("manual edit inventory detects changed chapter draft hashes and dependent reports", () => {
  const currentDraft = chapterDraft("hash-new");
  const inventory = buildManualEditInventoryFromArtifacts({
    novelId: "novel-1",
    artifacts: [
      currentDraft,
      {
        id: "audit_report:chapter:chapter-1:AuditReport:audit-1",
        novelId: "novel-1",
        artifactType: "audit_report",
        targetType: "chapter",
        targetId: "chapter-1",
        version: 1,
        status: "active",
        source: "backfilled",
        contentRef: { table: "AuditReport", id: "audit-1" },
        schemaVersion: "test",
        dependsOn: [{ artifactId: currentDraft.id, version: 1 }],
      },
    ],
    previousArtifacts: [chapterDraft("hash-old")],
    chapterMetaById: {
      "chapter-1": {
        title: "第一章",
        order: 1,
        changedAt: "2026-04-28T01:00:00.000Z",
      },
    },
    generatedAt: "2026-04-28T01:01:00.000Z",
  });

  assert.equal(inventory.changedChapters.length, 1);
  assert.equal(inventory.changedChapters[0].chapterId, "chapter-1");
  assert.equal(inventory.changedChapters[0].contentHash, "hash-new");
  assert.equal(inventory.changedChapters[0].previousContentHash, "hash-old");
  assert.deepEqual(inventory.changedChapters[0].relatedArtifactIds.sort(), [
    "audit_report:chapter:chapter-1:AuditReport:audit-1",
    "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
  ].sort());
});

test("manual edit fallback recommends local review for changed chapters", () => {
  const inventory = buildManualEditInventoryFromArtifacts({
    novelId: "novel-1",
    artifacts: [chapterDraft("hash-new")],
    previousArtifacts: [chapterDraft("hash-old")],
    chapterMetaById: {
      "chapter-1": {
        title: "第一章",
        order: 1,
      },
    },
    generatedAt: "2026-04-28T01:01:00.000Z",
  });
  const decision = buildManualEditFallbackDecision(inventory);

  assert.equal(decision.impactLevel, "low");
  assert.equal(decision.safeToContinue, true);
  assert.equal(decision.requiresApproval, false);
  assert.equal(decision.minimalRepairPath[0].action, "review_recent_chapters");
  assert.equal(decision.affectedArtifactIds.includes("chapter_draft:chapter:chapter-1:Chapter:chapter-1"), true);
});

test("manual edit inventory stays empty when tracked hashes did not change", () => {
  const inventory = buildManualEditInventoryFromArtifacts({
    novelId: "novel-1",
    artifacts: [chapterDraft("hash-same")],
    previousArtifacts: [chapterDraft("hash-same")],
    chapterMetaById: {
      "chapter-1": {
        title: "第一章",
        order: 1,
      },
    },
  });
  const decision = buildManualEditFallbackDecision(inventory);

  assert.equal(inventory.changedChapters.length, 0);
  assert.equal(decision.impactLevel, "none");
  assert.equal(decision.safeToContinue, true);
});

test("workspace analyzer uses structured AI interpretation when requested", async (t) => {
  const originalResolve = promptContextResolution.resolvePromptContextBlocksForAsset;
  const structuredCalls = [];
  promptContextResolution.resolvePromptContextBlocksForAsset = async ({ fallbackBlocks }) => ({
    blocks: fallbackBlocks,
    brokerResolution: {},
  });
  promptRunner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    structuredCalls.push(input);
    return {
      data: {
        productionStage: "has_seed",
        missingArtifacts: ["book_contract"],
        staleArtifacts: [],
        protectedUserContent: [],
        recommendedAction: {
          action: "create_book_contract",
          reason: "AI 判断应先建立书约。",
          affectedScope: "novel",
          riskLevel: "low",
        },
        confidence: 0.82,
        evidenceRefs: ["workspace_inventory"],
        summary: "AI workspace summary",
        riskNotes: [],
      },
      repairUsed: false,
      repairAttempts: 0,
      diagnostics: {},
    };
  });
  t.after(() => {
    promptContextResolution.resolvePromptContextBlocksForAsset = originalResolve;
    promptRunner.setPromptRunnerStructuredInvokerForTests();
  });

  const recorded = [];
  const analyzer = new DirectorWorkspaceAnalyzer({
    recordWorkspaceAnalysis: async (input) => recorded.push(input),
  });
  analyzer.buildInventory = async () => ({
    novelId: "novel-1",
    novelTitle: "测试小说",
    hasBookContract: false,
    hasStoryMacro: false,
    hasCharacters: false,
    hasVolumeStrategy: false,
    hasChapterPlan: false,
    chapterCount: 0,
    draftedChapterCount: 0,
    approvedChapterCount: 0,
    pendingRepairChapterCount: 0,
    hasActivePipelineJob: false,
    hasActiveDirectorRun: false,
    hasWorldBinding: false,
    hasSourceKnowledge: true,
    hasContinuationAnalysis: false,
    missingArtifactTypes: ["book_contract"],
    staleArtifacts: [],
    protectedUserContentArtifacts: [],
    needsRepairArtifacts: [],
    artifacts: [],
  });

  const analysis = await analyzer.analyze({
    novelId: "novel-1",
    workflowTaskId: "task-1",
    includeAiInterpretation: true,
  });

  assert.equal(structuredCalls.length, 1);
  assert.equal(structuredCalls[0].label, "novel.director.workspace_analysis@v1");
  assert.equal(analysis.prompt.promptId, "novel.director.workspace_analysis");
  assert.equal(analysis.interpretation.summary, "AI workspace summary");
  assert.equal(analysis.recommendation.reason, "AI 判断应先建立书约。");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].analysis.prompt.promptId, "novel.director.workspace_analysis");
});

test("workspace analyzer defaults to deterministic inventory interpretation", async (t) => {
  const structuredCalls = [];
  promptRunner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    structuredCalls.push(input);
    throw new Error("structured LLM should not be called by default");
  });
  t.after(() => {
    promptRunner.setPromptRunnerStructuredInvokerForTests();
  });

  const analyzer = new DirectorWorkspaceAnalyzer({
    recordWorkspaceAnalysis: async () => {},
  });
  analyzer.buildInventory = async () => ({
    novelId: "novel-1",
    novelTitle: "测试小说",
    hasBookContract: false,
    hasStoryMacro: false,
    hasCharacters: false,
    hasVolumeStrategy: false,
    hasChapterPlan: false,
    chapterCount: 0,
    draftedChapterCount: 0,
    approvedChapterCount: 0,
    pendingRepairChapterCount: 0,
    hasActivePipelineJob: false,
    hasActiveDirectorRun: false,
    hasWorldBinding: false,
    hasSourceKnowledge: true,
    hasContinuationAnalysis: false,
    missingArtifactTypes: ["book_contract"],
    staleArtifacts: [],
    protectedUserContentArtifacts: [],
    needsRepairArtifacts: [],
    artifacts: [],
  });

  const analysis = await analyzer.analyze({
    novelId: "novel-1",
  });

  assert.equal(structuredCalls.length, 0);
  assert.equal(analysis.prompt, null);
  assert.equal(analysis.interpretation.productionStage, "has_seed");
  assert.equal(analysis.recommendation.action, "create_book_contract");
});

test("workspace analyzer deterministic interpretation tolerates legacy inventory snapshots missing array fields", () => {
  const { computeWorkspaceInterpretation } = require("../dist/services/novel/director/runtime/DirectorWorkspaceAnalyzer.js");

  const legacyInventory = {
    novelId: "novel-1",
    novelTitle: "测试小说",
    hasBookContract: false,
    hasStoryMacro: false,
    hasCharacters: false,
    hasVolumeStrategy: false,
    hasChapterPlan: false,
    chapterCount: 1,
    draftedChapterCount: 1,
    approvedChapterCount: 0,
    pendingRepairChapterCount: 0,
    hasActivePipelineJob: false,
    hasActiveDirectorRun: false,
    hasWorldBinding: false,
    hasSourceKnowledge: false,
    hasContinuationAnalysis: false,
    missingArtifactTypes: ["book_contract"],
  };

  assert.doesNotThrow(() => computeWorkspaceInterpretation(legacyInventory));

  const interpretation = computeWorkspaceInterpretation(legacyInventory);
  assert.deepEqual(interpretation.staleArtifacts, []);
  assert.deepEqual(interpretation.protectedUserContent, ["已有章节正文"]);
});

test("director workspace prompt tolerates legacy inventory snapshots missing array fields", () => {
  const legacyInventory = {
    novelId: "novel-1",
    novelTitle: "测试小说",
    hasBookContract: false,
    hasStoryMacro: false,
    hasCharacters: false,
    hasVolumeStrategy: false,
    hasChapterPlan: false,
    chapterCount: 1,
    draftedChapterCount: 1,
    approvedChapterCount: 0,
    pendingRepairChapterCount: 0,
    hasActivePipelineJob: false,
    hasActiveDirectorRun: false,
    hasWorldBinding: false,
    hasSourceKnowledge: false,
    hasContinuationAnalysis: false,
  };

  assert.doesNotThrow(() => buildDirectorWorkspaceAnalysisContextBlocks({ inventory: legacyInventory }));

  const example = directorWorkspaceAnalysisPrompt.structuredOutputHint.example({
    inventory: legacyInventory,
  });

  assert.deepEqual(example.missingArtifacts, ["book_contract"]);
  assert.deepEqual(example.staleArtifacts, []);
  assert.deepEqual(example.protectedUserContent, ["已有章节正文"]);
});

test("director manual edit prompt tolerates legacy inventories missing artifact arrays", () => {
  const legacyInventory = {
    novelId: "novel-1",
    novelTitle: "测试小说",
    hasBookContract: true,
    hasStoryMacro: true,
    hasCharacters: true,
    hasVolumeStrategy: true,
    hasChapterPlan: true,
    chapterCount: 1,
    draftedChapterCount: 1,
    approvedChapterCount: 0,
    pendingRepairChapterCount: 0,
    hasActivePipelineJob: false,
    hasActiveDirectorRun: false,
    hasWorldBinding: false,
    hasSourceKnowledge: false,
    hasContinuationAnalysis: false,
  };
  const editInventory = {
    novelId: "novel-1",
    generatedAt: "2026-04-28T01:01:00.000Z",
    changedChapters: [
      {
        chapterId: "chapter-1",
        title: "第一章",
        order: 1,
        relatedArtifactIds: ["chapter_draft:chapter:chapter-1:Chapter:chapter-1"],
      },
    ],
  };

  assert.doesNotThrow(() => buildDirectorManualEditImpactContextBlocks({
    inventory: legacyInventory,
    editInventory,
  }));

  const example = directorManualEditImpactPrompt.structuredOutputHint.example({
    inventory: legacyInventory,
    editInventory,
  });

  assert.equal(example.impactLevel, "low");
  assert.deepEqual(example.affectedArtifactIds, ["chapter_draft:chapter:chapter-1:Chapter:chapter-1"]);
});
