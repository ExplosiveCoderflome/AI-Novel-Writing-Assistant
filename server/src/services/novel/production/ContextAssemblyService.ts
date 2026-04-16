import type {
  CanonicalCharacterRuntimeState,
  CanonicalOpenConflictState,
  CanonicalPayoffState,
  CanonicalTimelineEventState,
  ChapterStateGoal,
  GenerationNextAction,
  NovelControlPolicy,
} from "@ai-novel/shared/types/canonicalState";
import { canonicalStateService, type CanonicalStateScope } from "../state/CanonicalStateService";
import { generationDecisionEngine } from "./GenerationDecisionEngine";

export interface BuildStateDrivenContextInput extends CanonicalStateScope {
  novelId: string;
  policy?: Partial<NovelControlPolicy> | null;
  pendingReviewProposalCount?: number;
  openAuditIssueCount?: number;
  hasRepairableDraft?: boolean;
}

export interface StateDrivenContextBundle {
  snapshot: Awaited<ReturnType<typeof canonicalStateService.getSnapshot>>;
  nextAction: GenerationNextAction;
  chapterStateGoal: ChapterStateGoal | null;
  localCharacters: CanonicalCharacterRuntimeState[];
  localConflicts: CanonicalOpenConflictState[];
  localPayoffs: CanonicalPayoffState[];
  recentTimeline: CanonicalTimelineEventState[];
  protectedSecrets: string[];
}

function takeTop<T>(items: T[], limit: number): T[] {
  return items.slice(0, Math.max(0, limit));
}

function buildChapterStateGoal(
  snapshot: Awaited<ReturnType<typeof canonicalStateService.getSnapshot>>,
): ChapterStateGoal | null {
  if (
    !snapshot.narrative.currentChapterId
    || typeof snapshot.narrative.currentChapterOrder !== "number"
  ) {
    return null;
  }
  return {
    chapterId: snapshot.narrative.currentChapterId,
    chapterOrder: snapshot.narrative.currentChapterOrder,
    summary: snapshot.narrative.currentChapterGoal ?? "advance the current narrative state",
    targetConflicts: takeTop(snapshot.narrative.openConflicts.map((item) => item.title), 3),
    targetRelationships: takeTop(
      snapshot.characters.flatMap((item) => item.relationStageLabels.map((label) => `${item.name}: ${label}`)),
      3,
    ),
    targetPayoffs: takeTop(
      [
        ...snapshot.narrative.overduePayoffs.map((item) => item.title),
        ...snapshot.narrative.urgentPayoffs.map((item) => item.title),
        ...snapshot.narrative.pendingPayoffs.map((item) => item.title),
      ],
      3,
    ),
    protectedSecrets: takeTop(snapshot.narrative.hiddenKnowledge, 4),
  };
}

export class ContextAssemblyService {
  async build(input: BuildStateDrivenContextInput): Promise<StateDrivenContextBundle> {
    const snapshot = await canonicalStateService.getSnapshot(input.novelId, {
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder,
      includeCurrentChapterState: input.includeCurrentChapterState,
      timelineWindow: input.timelineWindow,
    });
    const nextAction = generationDecisionEngine.decideNextAction({
      snapshot,
      policy: input.policy,
      pendingReviewProposalCount: input.pendingReviewProposalCount,
      openAuditIssueCount: input.openAuditIssueCount,
      hasRepairableDraft: input.hasRepairableDraft,
    });
    return {
      snapshot,
      nextAction,
      chapterStateGoal: buildChapterStateGoal(snapshot),
      localCharacters: takeTop(snapshot.characters, 6),
      localConflicts: takeTop(snapshot.narrative.openConflicts, 4),
      localPayoffs: takeTop([
        ...snapshot.narrative.overduePayoffs,
        ...snapshot.narrative.urgentPayoffs,
        ...snapshot.narrative.pendingPayoffs,
      ], 6),
      recentTimeline: takeTop(snapshot.timeline, 4),
      protectedSecrets: takeTop(snapshot.narrative.hiddenKnowledge, 4),
    };
  }
}

export const contextAssemblyService = new ContextAssemblyService();
