import fs from "node:fs";
import path from "node:path";
import type { ToolExecutionContext } from "../types";
import { resolveServerRoot } from "../../runtime/appPaths";

export class LocalProcessSandbox {
  private static getSandboxDir(): string {
    const dir = path.join(resolveServerRoot(), ".sandbox");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  static async execute<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
    toolName: string,
    executeFn: (context: ToolExecutionContext, input: TInput) => Promise<TOutput>,
    context: ToolExecutionContext,
    input: TInput,
    timeoutMs = 15000
  ): Promise<TOutput> {
    const sandboxDir = this.getSandboxDir();
    const runId = context.runId || "default";
    const timestamp = Date.now();
    const assetPath = path.join(sandboxDir, `asset_${toolName}_${runId}_${timestamp}.json`);
    
    // 1. Pass context variables as temporary JSON assets
    const assetPayload = {
      toolName,
      input,
      context: {
        novelId: context.novelId,
        chapterId: (context as any).chapterId || undefined,
        provider: context.provider,
        model: context.model,
        agentName: context.agentName,
      },
    };
    
    fs.writeFileSync(assetPath, JSON.stringify(assetPayload, null, 2), "utf8");
    console.info(`[Sandbox] Serialized context asset to: ${assetPath}`);

    // 2. Intercept and capture console logs during execution
    const logs: string[] = [];
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    const captureLog = (level: string, ...args: unknown[]) => {
      const msg = `[${level}] ${args.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" ")}`;
      logs.push(msg);
      // Still forward to original stdout/stderr
      if (level === "ERROR") originalError(...args);
      else originalLog(...args);
    };

    console.log = (...args) => captureLog("LOG", ...args);
    console.info = (...args) => captureLog("INFO", ...args);
    console.warn = (...args) => captureLog("WARN", ...args);
    console.error = (...args) => captureLog("ERROR", ...args);

    // 3. Execute tool call with timeout boundary
    try {
      const executionPromise = executeFn(context, input);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`[Sandbox] Tool execution timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      // Save logs of the execution
      const logPath = path.join(sandboxDir, `log_${toolName}_${runId}_${timestamp}.txt`);
      fs.writeFileSync(logPath, logs.join("\n"), "utf8");
      
      return result;
    } catch (err) {
      const logPath = path.join(sandboxDir, `log_${toolName}_${runId}_${timestamp}_error.txt`);
      fs.writeFileSync(logPath, logs.join("\n") + `\nExecution Error: ${err instanceof Error ? err.stack : String(err)}`, "utf8");
      throw err;
    } finally {
      // Restore console methods
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;

      // Clean up temporary JSON asset
      try {
        if (fs.existsSync(assetPath)) {
          fs.unlinkSync(assetPath);
        }
      } catch (cleanupErr) {
        console.warn(`[Sandbox] Failed to clean up asset file ${assetPath}:`, cleanupErr);
      }
    }
  }
}
