import { AppError } from "../../../../middleware/errorHandler";
import type { DirectorRunCommandRow } from "./DirectorCommandService";
import type { DirectorCommandPayload } from "./DirectorCommandServiceHelpers";
import type { DirectorTakeoverRequest } from "@ai-novel/shared/types/novelDirector";

export type DirectorPipelineCommandIntent =
  | "generate_candidates"
  | "refine_candidates"
  | "patch_candidate"
  | "refine_titles"
  | "confirm_candidate"
  | "continue"
  | "resume_from_checkpoint"
  | "retry"
  | "takeover"
  | "approve_gate"
  | "policy_update"
  | "workspace_analysis"
  | "manual_edit_impact"
  | "calibrate_step"
  | "accept_manual_changes_and_continue"
  | "repair_chapter_titles"
  | "cancel";

export interface DirectorPipelineCommand {
  id: string;
  taskId: string;
  novelId?: string | null;
  intent: DirectorPipelineCommandIntent;
  payload: DirectorCommandPayload;
  takeoverRequest?: DirectorTakeoverRequest | null;
  forceResume: boolean;
  isControlOnly: boolean;
}

const SUPPORTED_COMMANDS = new Set<DirectorPipelineCommandIntent>([
  "generate_candidates",
  "refine_candidates",
  "patch_candidate",
  "refine_titles",
  "confirm_candidate",
  "continue",
  "resume_from_checkpoint",
  "retry",
  "takeover",
  "approve_gate",
  "policy_update",
  "workspace_analysis",
  "manual_edit_impact",
  "calibrate_step",
  "accept_manual_changes_and_continue",
  "repair_chapter_titles",
  "cancel",
]);

export class DirectorCommandInterpreter {
  interpret(
    command: NonNullable<DirectorRunCommandRow>,
    payload: DirectorCommandPayload,
  ): DirectorPipelineCommand {
    if (!SUPPORTED_COMMANDS.has(command.commandType as DirectorPipelineCommandIntent)) {
      throw new AppError(`Unsupported director command type: ${command.commandType}`, 400);
    }
    const intent = command.commandType as DirectorPipelineCommandIntent;
    return {
      id: command.id,
      taskId: command.taskId,
      novelId: command.novelId,
      intent,
      payload,
      takeoverRequest: payload.takeoverRequest ?? null,
      forceResume: intent === "continue" || intent === "resume_from_checkpoint" || intent === "retry" || intent === "approve_gate" || intent === "accept_manual_changes_and_continue"
        ? true
        : Boolean(payload.forceResume),
      isControlOnly: intent === "cancel" || intent === "policy_update",
    };
  }
}
