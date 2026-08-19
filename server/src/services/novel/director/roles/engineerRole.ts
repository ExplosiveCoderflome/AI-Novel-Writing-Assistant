import { PlannerTaskSpec } from './plannerRole';

export interface EngineerExecutionResult {
  taskId: string;
  artifactType: 'chapter_draft' | 'outline_plan' | 'patch_repair';
  artifactContent: string;
  selfReviewVerdict?: 'skip' | 'required';
  executionMetrics: {
    tokensUsed: number;
    durationMs: number;
  };
}

export class EngineerRole {
  /**
   * Execute a bounded mission (Draft generation or Patch repair).
   */
  public async executeTask(
    task: PlannerTaskSpec,
    patchInstructions?: string
  ): Promise<EngineerExecutionResult> {
    const startTime = Date.now();

    let artifactContent = `[Draft Artifact for ${task.title}]\nGoal: ${task.description}\n`;

    if (task.negativeConstraints.length > 0) {
      artifactContent += `\nApplied Negative Constraints:\n` + task.negativeConstraints.join('\n');
    }

    if (patchInstructions) {
      artifactContent += `\n\n[Applied Patch Repair Instruction]: ${patchInstructions}`;
    }

    const durationMs = Date.now() - startTime;

    return {
      taskId: task.taskId,
      artifactType: patchInstructions ? 'patch_repair' : 'chapter_draft',
      artifactContent,
      selfReviewVerdict: 'required', // Always require independent Reviewer for safety
      executionMetrics: {
        tokensUsed: 1200,
        durationMs,
      },
    };
  }
}

export const engineerRole = new EngineerRole();
