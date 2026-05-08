export type NovelMaterialImportance = "must" | "high" | "medium" | "low";

export type NovelMaterialSourceType =
  | "novel"
  | "chapter"
  | "plan"
  | "state"
  | "character"
  | "world"
  | "style"
  | "audit"
  | "task";

export interface NovelMaterialBlock {
  id: string;
  group: string;
  title: string;
  content: string;
  required: boolean;
  importance: NovelMaterialImportance;
  source: {
    type: NovelMaterialSourceType;
    id?: string;
    updatedAt?: string;
  };
  estimatedTokens: number;
}

export interface NovelMaterialExportInput {
  novelId: string;
  chapterId?: string;
  taskId?: string;
  volumeId?: string;
  groups?: string[];
  maxTokens?: number;
}

export interface NovelMaterialExportResult {
  blocks: NovelMaterialBlock[];
  missingGroups: string[];
  missingInputs: string[];
  warnings: string[];
  generatedAt: string;
}

export interface NovelMaterialGroupDefinition {
  group: string;
  title: string;
  required: boolean;
  importance: NovelMaterialImportance;
  sourceType: NovelMaterialSourceType;
  requiresChapterId?: boolean;
  requiresTaskId?: boolean;
  aliases?: string[];
}
