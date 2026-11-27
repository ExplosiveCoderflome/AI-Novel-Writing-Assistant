import { createStyleSignalPolicy } from "@ai-novel/shared/types/styleEngine";
import { scanStyleSignals } from "../../../styleEngine/signals";

export interface RollingExpressionChapterInput {
  order: number;
  title: string;
  content: string | null | undefined;
}

const CLOSING_SLICE_LENGTH = 64;

const SIGNAL_LABELS: Record<string, string> = {
  "template.transition": "模板过渡词聚集",
  "surface.repeated-softeners": "模糊程度/柔化修饰词聚集",
  "surface.action-adverb-stack": "动作副词堆叠",
  "rhythm.comma-density": "长句高逗号密度",
};

function extractChapterClosingSample(content: string, maxLength = CLOSING_SLICE_LENGTH): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `…${normalized.slice(normalized.length - maxLength)}`;
}

/**
 * Summarize cross-chapter statistical expression echoes and recent chapter endings.
 * This produces advisory cues only for the writer model; it never decides violations or blocks runs.
 */
export function buildRollingExpressionEchoHint(
  recentChapters: RollingExpressionChapterInput[],
): string {
  const validChapters = recentChapters
    .filter((chapter) => typeof chapter.content === "string" && chapter.content.trim().length > 0)
    .slice(0, 3);
  if (validChapters.length === 0) {
    return "";
  }

  const policy = createStyleSignalPolicy();
  const termChapterCount = new Map<string, number>();
  const signalChapterCount = new Map<string, number>();
  const closingSamples: string[] = [];

  for (const chapter of validChapters) {
    const content = chapter.content ?? "";
    const closing = extractChapterClosingSample(content);
    if (closing) {
      closingSamples.push(`- 第 ${chapter.order} 章《${chapter.title}》收尾：${closing}`);
    }

    const scan = scanStyleSignals(content, policy);
    const seenSignals = new Set<string>();
    const seenTerms = new Set<string>();
    for (const finding of scan.findings) {
      if (!seenSignals.has(finding.ruleId)) {
        seenSignals.add(finding.ruleId);
        signalChapterCount.set(finding.ruleId, (signalChapterCount.get(finding.ruleId) ?? 0) + 1);
      }
      for (const term of finding.matchedTerms) {
        if (!seenTerms.has(term)) {
          seenTerms.add(term);
          termChapterCount.set(term, (termChapterCount.get(term) ?? 0) + 1);
        }
      }
    }
  }

  const recurringSignals = Array.from(signalChapterCount.entries())
    .filter(([, count]) => count >= 2)
    .map(([ruleId, count]) => `${SIGNAL_LABELS[ruleId] ?? ruleId}（近 ${count} 章反复出现）`);

  const recurringTerms = Array.from(termChapterCount.entries())
    .filter(([, count]) => count >= 2)
    .map(([term]) => `「${term}」`)
    .slice(0, 6);

  if (closingSamples.length === 0 && recurringSignals.length === 0 && recurringTerms.length === 0) {
    return "";
  }

  const lines: string[] = [
    "【近章表达惯性线索（主动错开句式与收尾节奏，不作硬禁词表）】",
    ...closingSamples,
  ];
  if (recurringSignals.length > 0) {
    lines.push(`- 近期重复节奏信号：${recurringSignals.join("、")}`);
  }
  if (recurringTerms.length > 0) {
    lines.push(`- 近期高频重复连接/修饰词：${recurringTerms.join("、")}（本章尽量换用动作、停顿或直接推进替代）`);
  }
  return lines.join("\n");
}
