/**
 * Module 4: OpenRSI Evolutionary Operator Evidence Trace Logger Service
 * Manages evidence nodes, mutation lineage trees, anti-degradation rollback guards,
 * and elite mutation filtering for RAG vector feedback loops.
 */
import {
  EvolutionaryOperatorType,
  MutationEvidenceNode,
  MutationLineageTree,
} from '@ai-novel/shared';

export class EvidenceTraceLogger {
  private traceLedger: Map<string, MutationEvidenceNode[]> = new Map();

  /**
   * Records a new mutation evidence node into the trace ledger.
   */
  public recordMutation(
    novelId: string,
    chapterId: string,
    operatorType: EvolutionaryOperatorType,
    parentHashes: string[],
    childHash: string,
    beforeScore: number,
    afterScore: number,
    recombinationRationale: string
  ): MutationEvidenceNode {
    const delta = Number((afterScore - beforeScore).toFixed(4));
    const now = Date.now();
    const mutationId = `mut-${chapterId}-${operatorType.toLowerCase()}-${now}`;

    const node: MutationEvidenceNode = {
      mutationId,
      novelId,
      chapterId,
      operatorType,
      parentHashes,
      childHash,
      scoreImprovement: {
        beforeScore,
        afterScore,
        delta,
      },
      recombinationRationale,
      isPositiveMutation: delta > 0,
      timestamp: now,
    };

    const chapterKey = `${novelId}:${chapterId}`;
    const existing = this.traceLedger.get(chapterKey) || [];
    existing.push(node);
    this.traceLedger.set(chapterKey, existing);

    return node;
  }

  /**
   * Evaluates if a mutation represents a quality degradation that requires rollback.
   */
  public shouldRollbackMutation(node: MutationEvidenceNode): { rollback: boolean; reason?: string } {
    if (node.scoreImprovement.delta < 0) {
      return {
        rollback: true,
        reason: `Negative score delta (${node.scoreImprovement.delta}) detected. Rolling back to parent hash (${node.parentHashes[0] || 'unknown'}).`,
      };
    }
    return { rollback: false };
  }

  /**
   * Reconstructs the complete mutation lineage tree for a chapter.
   */
  public getChapterMutationLineage(novelId: string, chapterId: string): MutationLineageTree {
    const chapterKey = `${novelId}:${chapterId}`;
    const nodes = this.traceLedger.get(chapterKey) || [];

    const positiveMutationsCount = nodes.filter((n) => n.isPositiveMutation).length;
    const netScoreGain = Number(
      nodes.reduce((sum, n) => sum + n.scoreImprovement.delta, 0).toFixed(4)
    );

    return {
      novelId,
      chapterId,
      totalMutations: nodes.length,
      positiveMutationsCount,
      netScoreGain,
      nodes,
    };
  }

  /**
   * Filters elite mutation nodes worthy of RAG vector indexing (delta >= minDelta).
   */
  public getEliteMutationNodes(novelId: string, minDelta: number = 0.15): MutationEvidenceNode[] {
    const eliteNodes: MutationEvidenceNode[] = [];

    for (const [key, nodes] of this.traceLedger.entries()) {
      if (key.startsWith(`${novelId}:`)) {
        for (const n of nodes) {
          if (n.scoreImprovement.delta >= minDelta) {
            eliteNodes.push(n);
          }
        }
      }
    }

    return eliteNodes;
  }

  /**
   * Clears ledger memory (mainly for unit tests).
   */
  public clearLedger(novelId?: string): void {
    if (novelId) {
      for (const key of this.traceLedger.keys()) {
        if (key.startsWith(`${novelId}:`)) {
          this.traceLedger.delete(key);
        }
      }
    } else {
      this.traceLedger.clear();
    }
  }
}

export const evidenceTraceLogger = new EvidenceTraceLogger();
