import type { TaskStatus } from "@ai-novel/shared/types/task";
import {
  DIRECTOR_CANDIDATE_SETUP_STEPS,
} from "@ai-novel/shared/types/novelDirector";

export const ACTIVE_DIRECTOR_TASK_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);

export const DIRECTOR_CANDIDATE_SETUP_STEP_KEYS = new Set<string>(
  DIRECTOR_CANDIDATE_SETUP_STEPS.map((step) => step.key),
);
