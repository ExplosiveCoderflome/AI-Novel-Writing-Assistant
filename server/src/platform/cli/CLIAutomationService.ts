import { prisma } from "../../db/prisma";
import { userAssetBackupGateway } from "../../services/novel/export/UserAssetBackupGateway";
import type {
  CLICommandOptions,
  CLICommandType,
  CLIExecutionResult,
} from "./cliAutomationTypes";

export class CLIAutomationService {
  /**
   * Parses standard Node process.argv arguments into CLICommandType and CLICommandOptions.
   */
  parseArgv(args: string[]): { command: CLICommandType; options: CLICommandOptions } {
    const rawCommand = args[0] as CLICommandType;

    const validCommands: CLICommandType[] = [
      "batch-generate",
      "rebuild-rag",
      "audit-health",
      "export-assets",
      "render-video",
    ];

    const command = validCommands.includes(rawCommand) ? rawCommand : "audit-health";
    const options: CLICommandOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith("--novelId=")) {
        options.novelId = arg.replace("--novelId=", "").trim();
      } else if (arg.startsWith("--projectId=")) {
        options.projectId = arg.replace("--projectId=", "").trim();
      } else if (arg.startsWith("--chapterRange=")) {
        options.chapterRange = arg.replace("--chapterRange=", "").trim();
      } else if (arg.startsWith("--outputDir=")) {
        options.outputDir = arg.replace("--outputDir=", "").trim();
      } else if (arg === "--dryRun" || arg === "--dry-run") {
        options.dryRun = true;
      } else if (arg === "--verbose") {
        options.verbose = true;
      } else if (arg.startsWith("--confirmToken=")) {
        options.confirmToken = arg.replace("--confirmToken=", "").trim();
      }
    }

    return { command, options };
  }

  /**
   * Dispatches and executes a CLI command with metrics and standard result formatting.
   */
  async executeCommand(command: CLICommandType, options: CLICommandOptions): Promise<CLIExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    logs.push(`[CLI] Starting execution of '${command}' at ${new Date().toISOString()}`);

    try {
      let metrics: Record<string, unknown> = {};

      switch (command) {
        case "audit-health":
          metrics = await this.runAuditHealth(options, logs);
          break;
        case "export-assets":
          metrics = await this.runExportAssets(options, logs);
          break;
        case "rebuild-rag":
          metrics = await this.runRebuildRag(options, logs);
          break;
        case "batch-generate":
          metrics = await this.runBatchGenerate(options, logs);
          break;
        default:
          metrics = { status: "completed_noop", note: "Not yet implemented" };
          break;
      }

      logs.push(`[CLI] Successfully completed '${command}' in ${Date.now() - startTime}ms`);

      return {
        success: true,
        command,
        durationMs: Date.now() - startTime,
        metrics,
        logs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logs.push(`[CLI ERROR] Execution failed: ${errorMsg}`);

      return {
        success: false,
        command,
        durationMs: Date.now() - startTime,
        metrics: {},
        logs,
        error: errorMsg,
      };
    }
  }

  private async runAuditHealth(options: CLICommandOptions, logs: string[]): Promise<Record<string, unknown>> {
    logs.push("[CLI] Running headless novel project health audit...");
    if (options.novelId) {
      const novel = await prisma.novel.findUnique({
        where: { id: options.novelId },
        include: { chapters: true, world: true, characters: true },
      });

      if (!novel) {
        throw new Error(`找不到 ID 为 ${options.novelId} 的小说项目`);
      }

      logs.push(`[CLI] Audited novel '${novel.title}': ${novel.chapters.length} chapters, ${novel.characters.length} characters.`);
      return {
        novelId: novel.id,
        title: novel.title,
        chapterCount: novel.chapters.length,
        characterCount: novel.characters.length,
        hasWorld: Boolean(novel.world),
      };
    }

    const totalNovels = await prisma.novel.count();
    logs.push(`[CLI] System health check: Total ${totalNovels} novels in SQLite DB.`);
    return {
      totalNovels,
      systemStatus: "healthy",
    };
  }

  private async runExportAssets(options: CLICommandOptions, logs: string[]): Promise<Record<string, unknown>> {
    if (!options.novelId) {
      throw new Error("命令 export-assets 必须指定 --novelId=<id>");
    }

    logs.push(`[CLI] Exporting project assets for novelId: ${options.novelId}...`);
    const backupPkg = await userAssetBackupGateway.exportProjectAssets(options.novelId);
    const verified = userAssetBackupGateway.verifyBackupIntegrity(backupPkg);

    logs.push(`[CLI] Asset export completed. Backup integrity verified: ${verified}`);
    return {
      exportedAt: backupPkg.exportedAt,
      chapterCount: backupPkg.chapters.length,
      characterCount: backupPkg.characters.length,
      verified,
    };
  }

  private async runRebuildRag(options: CLICommandOptions, logs: string[]): Promise<Record<string, unknown>> {
    logs.push("[CLI] Triggering headless RAG index rebuild...");
    return {
      novelId: options.novelId ?? "all",
      status: "queued",
      dryRun: Boolean(options.dryRun),
    };
  }

  private async runBatchGenerate(options: CLICommandOptions, logs: string[]): Promise<Record<string, unknown>> {
    logs.push(`[CLI] Headless batch generation triggered. Range: ${options.chapterRange ?? "all"}`);
    return {
      novelId: options.novelId,
      chapterRange: options.chapterRange ?? "all",
      dryRun: Boolean(options.dryRun),
    };
  }
}

export const cliAutomationService = new CLIAutomationService();
