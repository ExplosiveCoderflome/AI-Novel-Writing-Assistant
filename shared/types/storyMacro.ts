export type StoryMacroField =
  | "selling_point"
  | "core_conflict"
  | "main_hook"
  | "growth_path"
  | "major_payoffs"
  | "ending_flavor";

export interface StoryDecomposition {
  selling_point: string;
  core_conflict: string;
  main_hook: string;
  growth_path: string;
  major_payoffs: string[];
  ending_flavor: string;
}

export interface StoryExpansion {
  expanded_premise: string;
  protagonist_core: string;
  conflict_layers: string[];
  emotional_line: string;
  setpiece_seeds: string[];
  tone_reference: string;
}

export interface StoryMacroIssue {
  type: "conflict" | "missing_info";
  field: StoryMacroField | "global";
  message: string;
}

export type StoryMacroLocks = Partial<Record<StoryMacroField, boolean>>;

export interface StoryMacroPhase {
  name: string;
  goal: string;
}

export interface StoryMacroTurningPoint {
  title: string;
  summary: string;
  phase: string;
}

export interface StoryConstraintEngine {
  premise: string;
  conflict_axis: string;
  growth_path: string[];
  phase_model: StoryMacroPhase[];
  constraints: {
    tone: string;
    forbidden: string[];
    required_trends: string[];
  };
  turning_points: StoryMacroTurningPoint[];
  ending_constraints: {
    must_have: string[];
    must_not_have: string[];
  };
}

export interface StoryMacroState {
  currentPhase: number;
  progress: number;
  protagonistState: string;
}

export interface StoryMacroPlan {
  id: string;
  novelId: string;
  storyInput?: string | null;
  expansion?: StoryExpansion | null;
  decomposition?: StoryDecomposition | null;
  issues: StoryMacroIssue[];
  lockedFields: StoryMacroLocks;
  constraintEngine?: StoryConstraintEngine | null;
  state: StoryMacroState;
  createdAt: string;
  updatedAt: string;
}
