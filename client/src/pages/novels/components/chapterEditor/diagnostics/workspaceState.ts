import type {
  ChapterEditorDiagnosticCard,
  ChapterEditorRecommendedTask,
  ChapterEditorTargetRange,
  ChapterEditorWorkspaceResponse,
} from "@ai-novel/shared/types/novel";
import { countEditorWords, getParagraphIndicesForRange } from "../document";

type Range = Pick<ChapterEditorTargetRange, "from" | "to">;

export function findRecommendedDiagnostic(
  workspace: ChapterEditorWorkspaceResponse,
): ChapterEditorDiagnosticCard | null {
  const task = workspace.recommendedTask;
  if (!task) return null;
  const matches = workspace.diagnosticCards.filter((card) => matchesTask(card, task));
  return matches.length === 1 ? matches[0] : null;
}

function matchesTask(card: ChapterEditorDiagnosticCard, task: ChapterEditorRecommendedTask): boolean {
  if (card.recommendedAction !== task.recommendedAction || card.recommendedScope !== task.recommendedScope) return false;
  if (card.anchorRange && task.anchorRange) {
    return card.anchorRange.from === task.anchorRange.from && card.anchorRange.to === task.anchorRange.to;
  }
  return !card.anchorRange && !task.anchorRange && card.title === task.title;
}

export function removeCompletedDiagnostic(
  workspace: ChapterEditorWorkspaceResponse,
  card: ChapterEditorDiagnosticCard,
): ChapterEditorWorkspaceResponse {
  const isCompleted = (item: ChapterEditorDiagnosticCard) => item.id === card.id
    || Boolean(card.sourceIssueId && item.sourceIssueId === card.sourceIssueId);
  const removed = workspace.diagnosticCards.filter(isCompleted);
  if (!removed.length) return workspace;
  return {
    ...workspace,
    chapterMeta: {
      ...workspace.chapterMeta,
      openIssueCount: Math.max(0, workspace.chapterMeta.openIssueCount - (card.sourceIssueId ? 1 : 0)),
    },
    diagnosticCards: workspace.diagnosticCards.filter((item) => !isCompleted(item)),
    recommendedTask: workspace.recommendedTask && removed.some((item) => matchesTask(item, workspace.recommendedTask!))
      ? null : workspace.recommendedTask,
  };
}

function remapRange(range: Range, replacement: Range, delta: number): Range | null {
  if (range.to <= replacement.from) return range;
  if (range.from >= replacement.to) return { from: range.from + delta, to: range.to + delta };
  if (range.from <= replacement.from && range.to >= replacement.to) return { from: range.from, to: range.to + delta };
  // An overlapping subrange has no reliable position inside newly generated prose.
  return null;
}

export function applySavedRevisionToWorkspace(
  workspace: ChapterEditorWorkspaceResponse,
  input: {
    previousUpdatedAt: string;
    savedUpdatedAt: string;
    previousContent: string;
    nextContent: string;
    targetRange: Range;
    completedCard?: ChapterEditorDiagnosticCard;
  },
): ChapterEditorWorkspaceResponse {
  if (workspace.chapterMeta.updatedAt !== input.previousUpdatedAt) return workspace;
  const nextWorkspace = input.completedCard ? removeCompletedDiagnostic(workspace, input.completedCard) : workspace;
  const delta = input.nextContent.length - input.previousContent.length;
  const updateAnchor = <T extends { anchorRange?: Range | null; paragraphLabel?: string | null }>(item: T): T => {
    if (!item.anchorRange) return item;
    const anchorRange = remapRange(item.anchorRange, input.targetRange, delta);
    const paragraphs = anchorRange ? getParagraphIndicesForRange(input.nextContent, anchorRange) : null;
    const paragraphLabel = paragraphs
      ? paragraphs.startIndex === paragraphs.endIndex
        ? `P${paragraphs.startIndex + 1}` : `P${paragraphs.startIndex + 1}-P${paragraphs.endIndex + 1}`
      : null;
    return { ...item, anchorRange, paragraphLabel };
  };
  return {
    ...nextWorkspace,
    chapterMeta: {
      ...nextWorkspace.chapterMeta,
      updatedAt: input.savedUpdatedAt,
      wordCount: countEditorWords(input.nextContent),
    },
    diagnosticCards: nextWorkspace.diagnosticCards.map(updateAnchor),
    recommendedTask: nextWorkspace.recommendedTask ? updateAnchor(nextWorkspace.recommendedTask) : null,
  };
}
