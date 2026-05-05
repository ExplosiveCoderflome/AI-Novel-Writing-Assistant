import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import { DirectorCommandService, type DirectorRunCommandRow } from "./DirectorCommandService";
import { DirectorPipelineEngine, type DirectorCommandExecutionOutcome } from "./DirectorPipelineEngine";

export type { DirectorCommandExecutionOutcome } from "./DirectorPipelineEngine";

export class DirectorExecutionService {
  private readonly workflowService = new NovelWorkflowService();
  private readonly commandService = new DirectorCommandService(this.workflowService);
  private readonly pipelineEngine = new DirectorPipelineEngine({
    workflowService: this.workflowService,
    commandService: this.commandService,
  });

  async executeCommand(command: NonNullable<DirectorRunCommandRow>): Promise<DirectorCommandExecutionOutcome> {
    const payload = this.commandService.parseCommandPayload(command);
    return this.pipelineEngine.dispatch({ command, payload });
  }
}
