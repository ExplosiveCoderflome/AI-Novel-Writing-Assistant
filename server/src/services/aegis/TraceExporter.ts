import { prisma } from "../../db/prisma";

export interface TrajectoryStep {
  stepId: string;
  runId: string;
  seq: number;
  agentName: string;
  stepType: string;
  status: string;
  input: any;
  output: any;
  error?: string | null;
  errorCode?: string | null;
  provider?: string | null;
  model?: string | null;
  createdAt: string;
}

export class TraceExporter {
  /**
   * Export all steps of a given runId as a JSONL formatted string.
   */
  public static async exportRun(runId: string): Promise<string> {
    const steps = await prisma.agentStep.findMany({
      where: { runId },
      orderBy: { seq: "asc" },
    });

    const lines: string[] = [];
    for (const step of steps) {
      let parsedInput: any = null;
      let parsedOutput: any = null;
      try {
        parsedInput = step.inputJson ? JSON.parse(step.inputJson) : null;
      } catch (e) {
        parsedInput = step.inputJson;
      }
      try {
        parsedOutput = step.outputJson ? JSON.parse(step.outputJson) : null;
      } catch (e) {
        parsedOutput = step.outputJson;
      }

      const trajectoryStep: TrajectoryStep = {
        stepId: step.id,
        runId: step.runId,
        seq: step.seq,
        agentName: step.agentName,
        stepType: step.stepType,
        status: step.status,
        input: parsedInput,
        output: parsedOutput,
        error: step.error,
        errorCode: step.errorCode,
        provider: step.provider,
        model: step.model,
        createdAt: step.createdAt.toISOString(),
      };
      lines.push(JSON.stringify(trajectoryStep));
    }

    return lines.join("\n");
  }
}
