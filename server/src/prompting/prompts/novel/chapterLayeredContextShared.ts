import type {
  BookContractContext,
  ChapterWriteContext,
  GenerationContextPackage,
  MacroConstraintContext,
} from "@ai-novel/shared/types/chapterRuntime";
import { resolveLengthBudgetContract } from "@ai-novel/shared/types/chapterLengthControl";
import { buildPlannerStyleContractSummaryText } from "../../../services/styleEngine/styleContractText";

export function compactText(value: string | null | undefined, fallback = ""): string {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

export function takeUnique(items: Array<string | null | undefined>, limit = items.length): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of items) {
    const normalized = compactText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    results.push(normalized);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

export function splitLines(value: string | null | undefined, limit = 4): string[] {
  return takeUnique(
    (value ?? "")
      .split(/\r?\n+/g)
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim()),
    limit,
  );
}

export function toListBlock(title: string, values: string[], emptyLabel = "none"): string {
  if (values.length === 0) {
    return `${title}: ${emptyLabel}`;
  }
  return [title, ...values.map((value) => `- ${value}`)].join("\n");
}

function displayPromptValue(value: string | null | undefined, fallback = "未指定"): string {
  const normalized = compactText(value);
  const labels: Record<string, string> = {
    unknown: fallback,
    "not specified": fallback,
    none: "无",
    first_person: "第一人称",
    third_person: "第三人称",
    omniscient: "全知视角",
    fast: "快节奏",
    balanced: "均衡节奏",
    slow: "慢节奏",
    low: "低",
    medium: "中",
    high: "高",
  };
  return labels[normalized] ?? (normalized || fallback);
}

export function renderBookContractText(contract: BookContractContext): string {
  return [
    `标题：${displayPromptValue(contract.title)}`,
    `题材：${displayPromptValue(contract.genre)}`,
    `目标读者：${displayPromptValue(contract.targetAudience)}`,
    `核心卖点：${displayPromptValue(contract.sellingPoint)}`,
    `前 30 章承诺：${displayPromptValue(contract.first30ChapterPromise)}`,
    `叙事视角：${displayPromptValue(contract.narrativePov)}`,
    `节奏偏好：${displayPromptValue(contract.pacePreference)}`,
    `情绪强度：${displayPromptValue(contract.emotionIntensity)}`,
    contract.toneGuardrails.length > 0 ? `语气护栏：${contract.toneGuardrails.join(" | ")}` : "",
    contract.hardConstraints.length > 0 ? `硬性约束：${contract.hardConstraints.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}

export function renderStoryMacroText(macro: MacroConstraintContext): string {
  return [
    `核心卖点：${displayPromptValue(macro.sellingPoint)}`,
    `核心冲突：${displayPromptValue(macro.coreConflict)}`,
    `主钩子：${displayPromptValue(macro.mainHook)}`,
    `推进循环：${displayPromptValue(macro.progressionLoop)}`,
    `成长路径：${displayPromptValue(macro.growthPath)}`,
    `结局味道：${displayPromptValue(macro.endingFlavor)}`,
    macro.hardConstraints.length > 0 ? `硬性约束：${macro.hardConstraints.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
}

export function resolveTargetWordRange(targetWordCount: number | null | undefined): {
  targetWordCount: number | null;
  minWordCount: number | null;
  maxWordCount: number | null;
} {
  const budget = resolveLengthBudgetContract(targetWordCount);
  if (!budget) {
    return {
      targetWordCount: null,
      minWordCount: null,
      maxWordCount: null,
    };
  }
  return {
    targetWordCount: budget.targetWordCount,
    minWordCount: budget.softMinWordCount,
    maxWordCount: budget.softMaxWordCount,
  };
}

export function summarizeStateSnapshot(contextPackage: GenerationContextPackage): string {
  if (contextPackage.canonicalState) {
    const snapshot = contextPackage.canonicalState;
    const fragments = takeUnique([
      snapshot.narrative.currentChapterGoal,
      ...snapshot.characters
        .slice(0, 3)
        .map((state) => {
          const parts = takeUnique([
            state.currentGoal ? `目标：${state.currentGoal}` : "",
            state.currentState ? `状态：${state.currentState}` : "",
            state.emotion ? `情绪：${state.emotion}` : "",
            state.summary,
          ]);
          if (parts.length === 0) {
            return "";
          }
          return `${state.name}: ${parts.join(" | ")}`;
        }),
      ...snapshot.narrative.publicKnowledge
        .slice(0, 2)
        .map((fact) => `${fact}（读者已知）`),
    ], 6);
    return fragments.join("\n") || "暂无上一轮权威状态快照。";
  }

  const characterNameById = new Map(
    contextPackage.characterRoster.map((character) => [character.id, character.name.trim() || "未命名角色"]),
  );
  const fragments = takeUnique([
    contextPackage.stateSnapshot?.summary,
    ...contextPackage.stateSnapshot?.characterStates
      .slice(0, 3)
      .map((state) => {
        const parts = takeUnique([
          state.currentGoal ? `目标：${state.currentGoal}` : "",
          state.emotion ? `情绪：${state.emotion}` : "",
          state.summary ? `状态：${state.summary}` : "",
        ]);
        if (parts.length === 0) {
          return "";
        }
        const characterName = characterNameById.get(state.characterId) ?? "未命名角色";
        return `${characterName}：${parts.join(" | ")}`;
      }) ?? [],
    ...contextPackage.stateSnapshot?.informationStates
      .slice(0, 2)
      .map((info) => `${info.fact}（状态：${info.status}）`) ?? [],
  ], 6);
  return fragments.join("\n") || "暂无上一轮状态快照。";
}

export function summarizeOpenConflicts(contextPackage: GenerationContextPackage): string[] {
  if (contextPackage.canonicalState) {
    return contextPackage.canonicalState.narrative.openConflicts
      .slice(0, 4)
      .map((conflict) => {
        const parts = takeUnique([
          conflict.title,
          conflict.summary,
          conflict.resolutionHint ? `resolution hint: ${conflict.resolutionHint}` : "",
        ], 3);
        return parts.join(" | ");
      })
      .filter(Boolean);
  }

  return contextPackage.openConflicts
    .slice(0, 4)
    .map((conflict) => {
      const parts = takeUnique([
        conflict.title,
        conflict.summary,
        conflict.resolutionHint ? `resolution hint: ${conflict.resolutionHint}` : "",
      ], 3);
      return parts.join(" | ");
    })
    .filter(Boolean);
}

export function summarizeWorldRules(contextPackage: GenerationContextPackage): string[] {
  const worldSlice = contextPackage.storyWorldSlice;
  if (worldSlice) {
    return takeUnique([
      worldSlice.coreWorldFrame,
      ...worldSlice.appliedRules.slice(0, 3).map((rule) => `${rule.name}: ${rule.summary}`),
      ...worldSlice.forbiddenCombinations.slice(0, 2),
      worldSlice.storyScopeBoundary,
    ], 6);
  }

  if (!contextPackage.canonicalState?.worldState) {
    return [];
  }
  const world = contextPackage.canonicalState.worldState;
  return takeUnique([
    world.summary ? `连续性记录：${world.summary}` : "",
    ...world.rules.slice(0, 3).map((rule) => `连续性规则记录：${rule}`),
    ...world.tabooRules.slice(0, 2).map((rule) => `连续性禁忌记录：${rule}`),
    world.currentSituation ? `当前世界状态记录：${world.currentSituation}` : "",
  ], 6);
}

export function summarizeHistoricalIssues(contextPackage: GenerationContextPackage): string[] {
  return contextPackage.openAuditIssues
    .slice(0, 4)
    .map((issue) => `${issue.severity}/${issue.auditType}: ${issue.description}`)
    .filter(Boolean);
}

export function summarizeStyleConstraints(contextPackage: GenerationContextPackage): string[] {
  const contract = contextPackage.styleContext?.compiledBlocks?.contract;
  if (!contract) {
    return [];
  }
  return takeUnique(
    buildPlannerStyleContractSummaryText(contract)
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean),
    8,
  );
}

export function summarizeContinuationConstraints(contextPackage: GenerationContextPackage): string[] {
  if (!contextPackage.continuation.enabled) {
    return [];
  }
  const humanBlock = contextPackage.continuation.humanBlock ?? "";
  const sourceLine = takeUnique([
    findInlineValue(humanBlock, "续写来源"),
    findInlineValue(humanBlock, "前作标题"),
    findInlineValue(humanBlock, "知识库文档标题"),
    findInlineValue(humanBlock, "拆书分析"),
  ], 4);
  const sectionLines = [
    ...extractContinuationSectionLines(humanBlock, "前作核心角色状态", 3),
    ...extractContinuationSectionLines(humanBlock, "前作终局章节摘要", 3),
    ...extractContinuationSectionLines(humanBlock, "前作关键事实", 3),
    ...extractContinuationSectionLines(humanBlock, "前作未完线索", 3),
    ...extractContinuationSectionLines(humanBlock, "可承接信息摘要", 4),
  ];
  return takeUnique([
    compactText(contextPackage.continuation.systemRule),
    sourceLine.length > 0 ? `续写来源约束：${sourceLine.join(" / ")}` : "",
    ...sectionLines,
  ], 12);
}

function findInlineValue(source: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^${escaped}[：:]\\s*(.+)$`, "m"));
  return compactText(match?.[1]);
}

function extractContinuationSectionLines(source: string, sectionLabel: string, limit: number): string[] {
  const normalizedLabel = sectionLabel.replace(/[（(].*$/, "");
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const results: string[] = [];
  let collecting = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (collecting && results.length > 0) {
        break;
      }
      continue;
    }
    if (line.startsWith(sectionLabel) || line.startsWith(normalizedLabel)) {
      collecting = true;
      const inlineValue = line.replace(/^.*?[：:]\s*/, "").trim();
      if (inlineValue && inlineValue !== line) {
        results.push(`${normalizedLabel}：${inlineValue}`);
      }
      continue;
    }
    if (collecting && /^[^：:\n]{2,32}[：:]$/.test(line)) {
      break;
    }
    if (!collecting) {
      continue;
    }
    const cleaned = compactText(line.replace(/^[-*•\d.、\s]+/, ""));
    if (cleaned) {
      results.push(`${normalizedLabel}：${cleaned}`);
    }
    if (results.length >= limit) {
      break;
    }
  }
  return takeUnique(results, limit);
}

function formatLedgerWindow(start?: number | null, end?: number | null): string {
  if (typeof start === "number" && typeof end === "number") {
    return `目标窗口=${start}-${end}`;
  }
  if (typeof end === "number") {
    return `目标窗口截止第${end}章`;
  }
  if (typeof start === "number") {
    return `目标窗口起于第${start}章`;
  }
  return "";
}

export function buildLedgerItemLine(
  item: GenerationContextPackage["ledgerPendingItems"][number],
  label: string,
): string {
  return takeUnique([
    `${label}: ${item.title}`,
    item.summary,
    formatLedgerWindow(item.targetStartChapterOrder, item.targetEndChapterOrder),
    item.statusReason ?? "",
  ], 4).join(" | ");
}

export function buildParticipantText(writeContext: ChapterWriteContext): string {
  if (writeContext.participants.length === 0) {
    return "出场角色：无";
  }
  const guideByCharacterId = new Map(
    writeContext.characterBehaviorGuides.map((guide) => [guide.characterId, guide]),
  );
  return [
    "出场角色：",
    ...writeContext.participants.map((character) => {
      const guide = guideByCharacterId.get(character.id);
      const visibleProfile = takeUnique([
        character.appearance || character.physique
          ? `外观：${compactText([character.appearance, character.physique].filter(Boolean).join("；"))}`
          : "",
        character.signatureDetail ? `标志细节：${compactText(character.signatureDetail)}` : "",
        character.voiceTexture ? `声音：${compactText(character.voiceTexture)}` : "",
      ], 3).join(" | ");
      const parts = takeUnique([
        character.role,
        visibleProfile,
        guide?.volumeRoleLabel ? `卷内定位：${guide.volumeRoleLabel}` : "",
        guide?.volumeResponsibility ? `卷内职责：${guide.volumeResponsibility}` : "",
        character.personality,
        character.currentState ? `状态：${character.currentState}` : "",
        character.currentGoal ? `目标：${character.currentGoal}` : "",
        guide?.relationStageLabels.length ? `关系阶段：${guide.relationStageLabels.join(" / ")}` : "",
        guide?.mindGuidance ? `主观倾向：${guide.mindGuidance}` : "",
        guide?.authorInfluenceGuidance ? `作者选择的行动倾向（非客观事实）：${guide.authorInfluenceGuidance}` : "",
        guide?.absenceRisk && guide.absenceRisk !== "none"
          ? `缺席风险：${guide.absenceRisk}（跨度 ${guide.absenceSpan}）`
          : "",
      ], 4);
      return `- ${character.name}：${parts.join(" | ")}`;
    }),
  ].join("\n");
}

export function buildCharacterGuidanceText(writeContext: ChapterWriteContext): string {
  if (writeContext.characterBehaviorGuides.length === 0) {
    return "角色行为指导：无";
  }
  return [
    "角色行为指导：",
    ...writeContext.characterBehaviorGuides.map((guide) => {
      const parts = takeUnique([
        guide.isCoreInVolume ? "本卷核心角色" : "本卷辅助角色",
        guide.mindGuidance ? `主观倾向（非客观事实）：${guide.mindGuidance}` : "",
        guide.authorInfluenceGuidance ? `作者选择的行动倾向（非客观事实）：${guide.authorInfluenceGuidance}` : "",
        guide.visibleProfileSummary ? `可见表现：${guide.visibleProfileSummary}` : "",
        guide.volumeRoleLabel ? `卷内定位：${guide.volumeRoleLabel}` : "",
        guide.volumeResponsibility ? `职责：${guide.volumeResponsibility}` : "",
        guide.currentGoal ? `目标：${guide.currentGoal}` : "",
        guide.currentState ? `状态：${guide.currentState}` : "",
        guide.relationStageLabels.length ? `关系阶段：${guide.relationStageLabels.join(" / ")}` : "",
        guide.absenceRisk !== "none" ? `缺席风险：${guide.absenceRisk}（跨度 ${guide.absenceSpan}）` : "",
        guide.factionLabel ? `阵营：${guide.factionLabel}` : "",
        guide.stanceLabel ? `立场：${guide.stanceLabel}` : "",
        guide.shouldPreferAppearance ? "本章优先使用外观细节" : "",
      ], 6);
      return `- ${guide.name}：${parts.join(" | ")}`;
    }),
  ].join("\n");
}

export function buildRelationStageText(writeContext: ChapterWriteContext): string {
  if (writeContext.activeRelationStages.length === 0) {
    return "活跃关系阶段：无";
  }
  return [
    "活跃关系阶段：",
    ...writeContext.activeRelationStages.map((relation) => (
      `- ${relation.sourceCharacterName} -> ${relation.targetCharacterName}：${relation.stageLabel} | ${relation.stageSummary}${relation.nextTurnPoint ? ` | 下一转折：${relation.nextTurnPoint}` : ""}`
    )),
  ].join("\n");
}

export function buildPendingCandidateGuardText(writeContext: ChapterWriteContext): string {
  if (writeContext.pendingCandidateGuards.length === 0) {
    return "候选角色护栏：无";
  }
  return [
    "候选角色护栏（只读，不要直接写入正文）：",
    ...writeContext.pendingCandidateGuards.map((candidate) => {
      const parts = takeUnique([
        candidate.proposedRole ? `定位：${candidate.proposedRole}` : "",
        candidate.summary ?? "",
        candidate.sourceChapterOrder != null ? `来源章节：第 ${candidate.sourceChapterOrder} 章` : "",
        ...candidate.evidence.slice(0, 2),
      ], 4);
      return `- ${candidate.proposedName}：${parts.join(" | ")}`;
    }),
  ].join("\n");
}
