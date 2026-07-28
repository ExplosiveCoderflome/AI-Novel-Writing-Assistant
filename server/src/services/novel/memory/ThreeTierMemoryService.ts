import { estimateTextTokens } from "../../../prompting/core/contextBudget";
import type {
  ColdMemoryPackage,
  HotMemoryPackage,
  MemoryBudgetSplit,
  ThreeTierMemoryInput,
  WarmMemoryPackage,
} from "./threeTierMemoryTypes";

export class ThreeTierMemoryService {
  private hotMemorySignalStore = new Map<string, Array<{ type: string; payload: string; createdAt: number }>>();

  /**
   * Calculates deterministic memory budgets for Hot, Cold, and Warm memory tiers.
   * If Warm memory is absent (e.g. Chapter 1), Warm's budget is dynamically reallocated:
   * 70% to Cold (richer lore/world RAG) and 30% to Hot (session instructions).
   */
  calculateMemoryBudgets(totalBudget: number = 4000, hasWarmData: boolean = true): MemoryBudgetSplit {
    const budget = Math.max(500, totalBudget);

    if (!hasWarmData) {
      const warmBudget = Math.floor(budget * 0.50);
      const coldMax = Math.floor(budget * 0.35) + Math.floor(warmBudget * 0.70);
      const hotMax = Math.floor(budget * 0.15) + Math.floor(warmBudget * 0.30);
      return {
        hotMax,
        coldMax,
        warmMax: 0,
      };
    }

    return {
      hotMax: Math.floor(budget * 0.15),
      coldMax: Math.floor(budget * 0.35),
      warmMax: Math.floor(budget * 0.50),
    };
  }

  /**
   * Assembles a structured, block-delimited System Context string formatted across Hot, Cold, and Warm tiers.
   */
  assembleThreeTierContext(input: ThreeTierMemoryInput): string {
    const totalBudget = input.totalTokenBudget ?? 4000;
    const warmSummaries = input.warm?.rollingSummaries ?? [];
    const hasWarm = warmSummaries.length > 0 || Boolean(input.warm?.recentCharacterArcMomentum || input.warm?.plotPacingState);
    const budgets = this.calculateMemoryBudgets(totalBudget, hasWarm);

    const hotText = this.formatHotSection(input.hot);
    const coldText = this.formatColdSection(input.cold);
    const warmText = this.formatWarmSection(input.warm);

    const hotBlock = this.truncateToTokens(hotText, budgets.hotMax);
    const coldBlock = this.truncateToTokens(coldText, budgets.coldMax);
    const warmBlock = this.truncateToTokens(warmText, budgets.warmMax);

    const blocks: string[] = [];

    if (hotBlock) {
      blocks.push(`=== [HOT MEMORY - Immediate Session & Feedback] ===\n${hotBlock}`);
    }
    if (coldBlock) {
      blocks.push(`=== [COLD MEMORY - Immutable World Axioms & Character Rules] ===\n${coldBlock}`);
    }
    if (warmBlock) {
      blocks.push(`=== [WARM MEMORY - Recent 3-5 Chapter Summaries & Plot Momentum] ===\n${warmBlock}`);
    }

    return blocks.join("\n\n");
  }

  /**
   * Captures an interactive user feedback signal (inline comments, regeneration rejection, manual edits)
   * into the in-memory LRU session store for the project.
   */
  captureFeedbackSignal(novelId: string, signalType: string, payload: string): void {
    if (!this.hotMemorySignalStore.has(novelId)) {
      this.hotMemorySignalStore.set(novelId, []);
    }
    const signals = this.hotMemorySignalStore.get(novelId)!;
    signals.push({
      type: signalType,
      payload,
      createdAt: Date.now(),
    });

    // Keep only the latest 10 signals per project in memory
    if (signals.length > 10) {
      signals.shift();
    }
  }

  /**
   * Retrieves active Hot Memory signals for a novel project.
   */
  getFeedbackSignals(novelId: string): string[] {
    const signals = this.hotMemorySignalStore.get(novelId) ?? [];
    return signals.map((s) => `[${s.type}] ${s.payload}`);
  }

  private formatHotSection(hot?: HotMemoryPackage): string {
    if (!hot) return "";
    const lines: string[] = [];
    if (hot.sessionInstruction) {
      lines.push(`- 即时会话指示：${hot.sessionInstruction}`);
    }
    if (hot.inlineFeedback && hot.inlineFeedback.length > 0) {
      lines.push(`- 创作者批注：${hot.inlineFeedback.join("; ")}`);
    }
    return lines.join("\n");
  }

  private formatColdSection(cold?: ColdMemoryPackage): string {
    if (!cold) return "";
    const lines: string[] = [];
    if (cold.worldAxioms && cold.worldAxioms.length > 0) {
      lines.push(`- 世界观硬规则：\n  ${cold.worldAxioms.map((a) => `• ${a}`).join("\n  ")}`);
    }
    if (cold.characterImmutableRules && cold.characterImmutableRules.length > 0) {
      lines.push(`- 角色不可违背特征：\n  ${cold.characterImmutableRules.map((r) => `• ${r}`).join("\n  ")}`);
    }
    if (cold.masterNovelOutline) {
      lines.push(`- 终极主线大纲：${cold.masterNovelOutline}`);
    }
    if (cold.ragLoreKnowledge) {
      lines.push(`- 检索背景知识：${cold.ragLoreKnowledge}`);
    }
    return lines.join("\n");
  }

  private formatWarmSection(warm?: WarmMemoryPackage): string {
    if (!warm) return "";
    const lines: string[] = [];
    if (warm.rollingSummaries && warm.rollingSummaries.length > 0) {
      lines.push(`- 近期章节演变：`);
      for (const s of warm.rollingSummaries) {
        lines.push(`  • 第 ${s.chapterOrder} 章《${s.chapterTitle}》: ${s.summary}`);
      }
    }
    if (warm.recentCharacterArcMomentum) {
      lines.push(`- 近期角色心境：${warm.recentCharacterArcMomentum}`);
    }
    if (warm.plotPacingState) {
      lines.push(`- 剧情节奏悬念：${warm.plotPacingState}`);
    }
    return lines.join("\n");
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    if (!text || maxTokens <= 0) return "";
    const currentTokens = estimateTextTokens(text);
    if (currentTokens <= maxTokens) return text;

    const lines = text.split("\n");
    const result: string[] = [];
    let used = 0;

    for (const line of lines) {
      const lineTokens = estimateTextTokens(line);
      if (used + lineTokens > maxTokens) break;
      result.push(line);
      used += lineTokens;
    }

    return result.join("\n");
  }
}

export const threeTierMemoryService = new ThreeTierMemoryService();
