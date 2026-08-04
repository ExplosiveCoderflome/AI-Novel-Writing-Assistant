/**
 * Module 4: OpenRSI Evolutionary Operator Evidence Logs & Mutation Trace Types
 */

export type EvolutionaryOperatorType = 'DRAFT' | 'IMPROVE' | 'DEBUG' | 'CROSSOVER';

export interface ScoreImprovementMetrics {
  beforeScore: number;
  afterScore: number;
  delta: number;
}

export interface MutationEvidenceNode {
  mutationId: string;
  novelId: string;
  chapterId: string;
  operatorType: EvolutionaryOperatorType;
  parentHashes: string[];
  childHash: string;
  scoreImprovement: ScoreImprovementMetrics;
  recombinationRationale: string;
  isPositiveMutation: boolean;
  timestamp: number;
}

export interface MutationLineageTree {
  novelId: string;
  chapterId: string;
  totalMutations: number;
  positiveMutationsCount: number;
  netScoreGain: number;
  nodes: MutationEvidenceNode[];
}
