import type { NarrativeForm } from "./creationStudio";

export type WritingPlatform = "fanqie_free" | "qidian_male" | "jinjiang_female" | "zhihu_story";
export type WritingPlatformPreference = "ai_recommend" | WritingPlatform;

export interface WritingPlatformGuidance {
  positioning: string;
  planning: string;
  drafting: string;
  auditing: string;
  repairing: string;
}

export interface WritingPlatformProfileDefinition {
  platform: WritingPlatform;
  label: string;
  summary: string;
  supportedNarrativeForms: NarrativeForm[];
  guidance: Partial<Record<NarrativeForm, WritingPlatformGuidance>>;
  officialVersion: number;
}

export interface WritingPlatformRecommendation {
  platform: WritingPlatform;
  confidence: number;
  reason: string;
}

export interface WritingPlatformSnapshot {
  platform: WritingPlatform;
  label: string;
  narrativeForm: NarrativeForm;
  profileVersion: number;
  source: "official" | "custom";
  guidance: WritingPlatformGuidance;
}

export interface WritingPlatformProfileVersionView {
  id: string;
  platform: WritingPlatform;
  versionNo: number;
  profile: WritingPlatformProfileDefinition;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

