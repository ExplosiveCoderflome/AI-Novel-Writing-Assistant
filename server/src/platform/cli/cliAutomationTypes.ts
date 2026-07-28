export type CLICommandType =
  | "batch-generate"
  | "rebuild-rag"
  | "audit-health"
  | "export-assets"
  | "render-video";

export interface CLICommandOptions {
  novelId?: string;
  projectId?: string;
  chapterRange?: string;
  outputDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  confirmToken?: string;
}

export interface CLIExecutionResult {
  success: boolean;
  command: CLICommandType;
  durationMs: number;
  metrics: Record<string, unknown>;
  logs: string[];
  error?: string;
}
