import { WorkingContract } from '../contract/workingContract';
import { FalsifiedRoute, falsifiedRouteLedgerService } from '../state/falsifiedRouteLedger';

export interface PlannerTaskSpec {
  taskId: string;
  stage: string;
  title: string;
  description: string;
  chapterIndex?: number;
  negativeConstraints: string[];
  dependencies: string[];
}

export class PlannerRole {
  /**
   * Decompose operational contract into bounded tasks, injecting negative constraints from dead branches.
   */
  public async planTasksForStage(
    contract: WorkingContract,
    activeFalsifiedRoutes: FalsifiedRoute[]
  ): Promise<PlannerTaskSpec[]> {
    const negativeConstraints =
      falsifiedRouteLedgerService.formatNegativeConstraintsForPrompt(activeFalsifiedRoutes);

    const { targetChapterRange, dramaticGoal, stage } = contract.operationalObjective;
    const tasks: PlannerTaskSpec[] = [];

    if (stage === 'chapter_production') {
      const start = targetChapterRange?.start || 1;
      const end = targetChapterRange?.end || 5;

      for (let ch = start; ch <= end; ch++) {
        tasks.push({
          taskId: `task-chapter-${ch}`,
          stage: 'chapter_production',
          title: `写作第 ${ch} 章正文`,
          description: `围绕核心故事目标: ${dramaticGoal}`,
          chapterIndex: ch,
          negativeConstraints,
          dependencies: ch > start ? [`task-chapter-${ch - 1}`] : [],
        });
      }
    } else {
      tasks.push({
        taskId: `task-stage-${stage}`,
        stage,
        title: `执行阶段规划: ${stage}`,
        description: dramaticGoal,
        negativeConstraints,
        dependencies: [],
      });
    }

    return tasks;
  }
}

export const plannerRole = new PlannerRole();
