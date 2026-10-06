import { getNovelWorkflowLaneDescriptor } from "@ai-novel/shared/types/novelWorkflow";
import type { BootstrapWorkflowInput } from "../novelWorkflow.helpers";
import { defaultProgressForStage, stageLabel } from "../novelWorkflow.helpers";
import { defaultWorkflowTitle } from "../novelWorkflow.shared";

export type WorkflowTaskCreationInput = Pick<
  BootstrapWorkflowInput,
  "lane" | "novelId" | "title" | "seedPayload" | "initialState"
>;

export function buildWorkflowTaskInitialData(
  input: WorkflowTaskCreationInput,
  novelTitle?: string | null,
) {
  const initialState = input.initialState;
  const laneDescriptor = getNovelWorkflowLaneDescriptor(input.lane);
  const initialStage = initialState?.stage ?? laneDescriptor.initialStage;

  return {
    initialStage,
    data: {
      novelId: input.novelId ?? null,
      ...(input.lane === "auto_director" && ["v1", "v2"].includes(String(input.seedPayload?.directorVersion))
        ? {directorVersion: input.seedPayload!.directorVersion as string} : {}),
      lane: input.lane,
      title: defaultWorkflowTitle({
        lane: input.lane,
        title: input.title,
        novelTitle,
      }),
      status: "queued" as const,
      progress: initialState?.progress ?? (input.novelId ? defaultProgressForStage(initialStage) : 0),
      currentStage: stageLabel(initialStage),
      currentItemKey: initialState?.itemKey ?? laneDescriptor.initialItemKey,
      currentItemLabel: initialState?.itemLabel ?? laneDescriptor.initialItemLabel,
      seedPayloadJson: input.seedPayload ? JSON.stringify(input.seedPayload) : null,
    },
  };
}
