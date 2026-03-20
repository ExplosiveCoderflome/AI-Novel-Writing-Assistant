import type { LLMProvider } from "./llm";

export type StyleSourceType = "manual" | "from_text" | "from_book_analysis" | "from_current_work";
export type StyleProfileStatus = "active" | "archived";
export type StyleBindingTargetType = "novel" | "chapter" | "task";
export type AntiAiRuleType = "forbidden" | "risk" | "encourage";
export type AntiAiSeverity = "low" | "medium" | "high";

export interface NarrativeRules {
  progressionMode?: string | null;
  sceneUnitPattern?: string[];
  multiPov?: boolean | null;
  looping?: boolean | null;
  endingStyle?: string | null;
  povSwitchStyle?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface CharacterRules {
  allowSelfReflection?: boolean | null;
  emotionExpression?: string | null;
  defenseMechanisms?: string[];
  facePriority?: boolean | null;
  dialogueStyle?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface LanguageRules {
  register?: string | null;
  roughness?: number | null;
  allowIncompleteSentences?: boolean | null;
  allowSwearing?: boolean | null;
  sentenceVariation?: string | null;
  allowUselessDetails?: boolean | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface RhythmRules {
  pace?: string | null;
  paragraphDensity?: string | null;
  allowFragmentedFlow?: boolean | null;
  actionOverExplanation?: boolean | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface StyleRuleSet {
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
}

export interface AntiAiRule {
  id: string;
  key: string;
  name: string;
  type: AntiAiRuleType;
  severity: AntiAiSeverity;
  description: string;
  detectPatterns: string[];
  rewriteSuggestion?: string | null;
  promptInstruction?: string | null;
  autoRewrite: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StyleProfile {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  applicableGenres: string[];
  sourceType: StyleSourceType;
  sourceRefId?: string | null;
  sourceContent?: string | null;
  analysisMarkdown?: string | null;
  status: StyleProfileStatus;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  antiAiRules: AntiAiRule[];
  createdAt: string;
  updatedAt: string;
}

export interface StyleTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  applicableGenres: string[];
  analysisMarkdown?: string | null;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  defaultAntiAiRuleKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StyleBinding {
  id: string;
  styleProfileId: string;
  targetType: StyleBindingTargetType;
  targetId: string;
  priority: number;
  weight: number;
  enabled: boolean;
  styleProfile?: StyleProfile;
  createdAt: string;
  updatedAt: string;
}

export interface CompiledStylePromptBlocks {
  context: string;
  style: string;
  character: string;
  antiAi: string;
  output: string;
  selfCheck: string;
  mergedRules: StyleRuleSet;
  appliedRuleIds: string[];
}

export interface StyleDetectionViolation {
  ruleId: string;
  ruleName: string;
  ruleType: AntiAiRuleType;
  severity: AntiAiSeverity;
  excerpt: string;
  reason: string;
  suggestion: string;
  canAutoRewrite: boolean;
}

export interface StyleDetectionReport {
  riskScore: number;
  summary: string;
  violations: StyleDetectionViolation[];
  canAutoRewrite: boolean;
  appliedRuleIds: string[];
}

export interface StyleGenerationLlmConfig {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ResolvedStyleContext {
  matchedBindings: StyleBinding[];
  compiledBlocks: CompiledStylePromptBlocks | null;
}
