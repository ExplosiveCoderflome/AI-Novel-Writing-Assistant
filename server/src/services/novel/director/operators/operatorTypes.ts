/**
 * 演化算子类型
 * - draft: 初稿生成算子
 * - improve: 增量润色与质量提升算子
 * - debug: 缺陷/冲突/幻觉定向修复算子
 * - crossover: 两个父代候选的基因熔炼交叉算子
 */
export type OperatorType = 'draft' | 'improve' | 'debug' | 'crossover';

/**
 * 交叉基因抽取策略维度
 */
export interface CrossoverGeneStrategy {
  extractPlotBeats: boolean;        // 提取剧情节奏/事件线
  extractCharacterArc: boolean;     // 提取角色心理/成长弧线
  extractAtmosphereStyle: boolean;  // 提取环境渲染/文风笔触
  extractClimaxPayoff: boolean;     // 提取高潮爆点与爽点兑现
}

/**
 * 候选对象评分与适应度指标
 */
export interface CandidateFitnessMetrics {
  overallScore: number;       // 综合适应度得分 [0 - 100]
  coherenceScore: number;     // 上下文连贯度得分
  characterVoiceScore: number;// 角色台词/性格一致性得分
  pacingScore: number;        // 剧情节奏分
  conflictResolution: number; // 冲突解决/伏笔兑现分
}

/**
 * 通用候选 Payload
 */
export interface CandidatePayload {
  id: string;
  title: string;
  content: string;
  summary?: string;
  outlineId?: string;
  chapterId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 审计/诊断点信息
 */
export interface AuditDiagnosticItem {
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  fixSuggestion: string;
  code?: string;
}

/**
 * 算子统一输入契约
 */
export interface OperatorInput<T = CandidatePayload> {
  operatorType: OperatorType;
  novelId: string;
  chapterId?: string;
  
  // 核心候选输入（Draft 需 0 个父代，Improve/Debug 需 1 个父代，Crossover 需 2 个父代）
  primaryCandidate?: T;
  secondaryCandidate?: T;
  
  // 上下文与约束配置
  contextBlock?: {
    novelTitle: string;
    chapterTitle: string;
    storyModeContext?: string;
    ragContext?: string;
    characterProfiles?: Array<{ name: string; traits: string; boundaryNotes?: string }>;
    bibleRules?: string[];
  };

  // Diagnostic / Audit 输入 (用于 Improve & Debug)
  auditDiagnostics?: {
    issues: AuditDiagnosticItem[];
    triggerReasons?: string[];
  };

  // Crossover 交叉配置 (仅在 operatorType === 'crossover' 时生效)
  crossoverStrategy?: CrossoverGeneStrategy;
  
  // LLM 执行参数
  llmOptions?: {
    provider?: string;
    model?: string;
    temperature?: number;
  };
}

/**
 * 变异追踪节点
 */
export interface MutationTraceNode {
  timestamp: string;
  operatorType: OperatorType;
  description: string;
  parentCandidateIds: string[];
  deltaSummary: string;
}

/**
 * 算子统一输出契约
 */
export interface OperatorResult<T = CandidatePayload> {
  success: boolean;
  operatorType: OperatorType;
  candidate: T;
  fitness: CandidateFitnessMetrics;
  mutationTrace: MutationTraceNode;
  
  // 辅助诊断信息
  executionTimeMs: number;
  appliedFixes?: string[];
  crossoverAnalysis?: {
    primaryGeneContributionRatio: number;   // 父代 A 贡献率 (如 0.55)
    secondaryGeneContributionRatio: number; // 父代 B 贡献率 (如 0.45)
    synthesizedGenes: string[];             // 成功融合的基因特征点
  };
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}
