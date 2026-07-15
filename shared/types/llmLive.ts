export const LLM_LIVE_PHASES = [
  "requesting",
  "streaming",
  "assembling",
  "validating",
  "repairing",
  "applying",
  "persisting",
  "completed",
  "failed",
  "cancelled",
] as const;

export type LlmLivePhase = (typeof LLM_LIVE_PHASES)[number];

export interface LlmLiveContext {
  interactionId: string;
  promptId?: string | null;
  promptVersion?: string | null;
  label: string;
  mode: "text" | "structured";
  taskId?: string | null;
  novelId?: string | null;
  chapterId?: string | null;
  volumeId?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  provider?: string | null;
  model?: string | null;
}

export type LlmLiveEvent =
  | {
    type: "session_started";
    seq: number;
    at: string;
    context: LlmLiveContext;
  }
  | {
    type: "output_delta";
    seq: number;
    at: string;
    interactionId: string;
    content: string;
    totalChars: number;
  }
  | {
    type: "phase_changed";
    seq: number;
    at: string;
    interactionId: string;
    phase: LlmLivePhase;
    message: string;
  }
  | {
    type: "session_completed";
    seq: number;
    at: string;
    interactionId: string;
    totalChars: number;
    durationMs: number;
  }
  | {
    type: "session_failed";
    seq: number;
    at: string;
    interactionId: string;
    message: string;
  };

export interface LlmLiveSessionSnapshot {
  context: LlmLiveContext;
  seq: number;
  phase: LlmLivePhase;
  phaseMessage: string;
  preview: string;
  totalChars: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export type LlmLiveStreamFrame =
  | { type: "snapshot"; sessions: LlmLiveSessionSnapshot[] }
  | { type: "event"; event: LlmLiveEvent }
  | { type: "ping" };
