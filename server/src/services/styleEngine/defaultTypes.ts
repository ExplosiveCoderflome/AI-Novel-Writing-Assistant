import type {
  AntiAiRuleType,
  AntiAiSeverity,
  CharacterRules,
  LanguageRules,
  NarrativeRules,
  RhythmRules,
} from "@ai-novel/shared/types/styleEngine";

export interface DefaultTemplateDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  applicableGenres: string[];
  analysisMarkdown: string;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  defaultAntiAiRuleKeys: string[];
}

export interface DefaultAntiAiRuleDefinition {
  key: string;
  name: string;
  type: AntiAiRuleType;
  severity: AntiAiSeverity;
  description: string;
  detectPatterns: string[];
  rewriteSuggestion: string;
  promptInstruction: string;
  autoRewrite: boolean;
  enabled: boolean;
  globalBaselineEnabled: boolean;
}

export interface DefaultStarterStyleProfileDefinition {
  key: string;
  templateKey: string;
  name: string;
  description: string;
}
