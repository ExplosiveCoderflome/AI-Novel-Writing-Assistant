import { spawn } from "node:child_process";
import path from "node:path";
import { resolveDatabaseFilePath, resolveServerRoot } from "../../runtime/appPaths";
import { resolveDatabaseRuntimeConfig } from "../../config/database";

export class AegisEvolutionService {
  /**
   * Triggers the TextGrad self-healing prompt optimization asynchronously.
   * Runs the python optimizer in the background, logging outputs to console.
   */
  public static triggerEvolution(runId: string | null, chapterId: string | null, promptFileName: string): void {
    const serverRoot = resolveServerRoot();
    const optimizerScript = path.join(serverRoot, "scripts", "textgrad_prompt_optimizer.py");
    const promptPath = path.join(serverRoot, "config", "prompts", promptFileName);
    
    // Resolve DB path
    const dbConfig = resolveDatabaseRuntimeConfig({ allowDefault: true, preferSqlite: true });
    let dbPath = "";
    if (dbConfig.url.startsWith("file:")) {
      const sqliteFile = dbConfig.url.slice("file:".length);
      dbPath = path.isAbsolute(sqliteFile) ? sqliteFile : resolveDatabaseFilePath(sqliteFile);
    } else {
      console.error("[Aegis] Evolution only supports SQLite database on local MacBook environment.");
      return;
    }

    console.log(`[Aegis] Starting prompt evolution loop 1 for runId: ${runId}, chapterId: ${chapterId}, prompt file: ${promptFileName}`);
    
    try {
      const args = [
        optimizerScript,
        "--prompt_path", promptPath,
        "--db_path", dbPath
      ];
      if (runId) {
        args.push("--run_id", runId);
      }
      if (chapterId) {
        args.push("--chapter_id", chapterId);
      }

      const child = spawn("python3", args);

      child.stdout.on("data", (data) => {
        console.log(`[Aegis STDOUT] ${data.toString().trim()}`);
      });

      child.stderr.on("data", (data) => {
        console.error(`[Aegis STDERR] ${data.toString().trim()}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          console.log(`[Aegis] Prompt evolution completed successfully for runId: ${runId || "resolved"}`);
        } else {
          console.error(`[Aegis] Prompt evolution failed with exit code ${code} for runId: ${runId || "resolved"}`);
        }
      });
    } catch (err) {
      console.error(`[Aegis] Failed to spawn python evolution process:`, err);
    }
  }
}
