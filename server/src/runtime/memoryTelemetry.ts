type MemoryTelemetryValue = string | number | boolean | null | undefined;

export interface MemoryTelemetryContext {
  event: string;
  component: string;
  taskId?: string | null;
  novelId?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  scope?: string | null;
  volumeId?: string | null;
  chapterId?: string | null;
  entrypoint?: string | null;
  promptId?: string | null;
  promptVersion?: string | null;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  renderedPromptChars?: number | null;
  rawChars?: number | null;
  volumeCount?: number | null;
  chapterCount?: number | null;
  beatSheetCount?: number | null;
}

function mb(value: number): number {
  return Math.round((value / 1024 / 1024) * 10) / 10;
}

function safeLogValue(value: MemoryTelemetryValue): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return JSON.stringify(trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed);
}

function appendField(parts: string[], key: string, value: MemoryTelemetryValue): void {
  const normalized = safeLogValue(value);
  if (normalized) {
    parts.push(`${key}=${normalized}`);
  }
}

export function logMemoryUsage(context: MemoryTelemetryContext): void {
  const memory = process.memoryUsage();
  const parts = [
    "[memory]",
    `event=${context.event}`,
    `component=${context.component}`,
    `rssMb=${mb(memory.rss)}`,
    `heapUsedMb=${mb(memory.heapUsed)}`,
    `heapTotalMb=${mb(memory.heapTotal)}`,
    `externalMb=${mb(memory.external)}`,
    `arrayBuffersMb=${mb(memory.arrayBuffers)}`,
  ];
  appendField(parts, "taskId", context.taskId);
  appendField(parts, "novelId", context.novelId);
  appendField(parts, "stage", context.stage);
  appendField(parts, "itemKey", context.itemKey);
  appendField(parts, "scope", context.scope);
  appendField(parts, "volumeId", context.volumeId);
  appendField(parts, "chapterId", context.chapterId);
  appendField(parts, "entrypoint", context.entrypoint);
  appendField(parts, "promptId", context.promptId);
  appendField(parts, "promptVersion", context.promptVersion);
  appendField(parts, "provider", context.provider);
  appendField(parts, "model", context.model);
  appendField(parts, "latencyMs", context.latencyMs);
  appendField(parts, "renderedPromptChars", context.renderedPromptChars);
  appendField(parts, "rawChars", context.rawChars);
  appendField(parts, "volumeCount", context.volumeCount);
  appendField(parts, "chapterCount", context.chapterCount);
  appendField(parts, "beatSheetCount", context.beatSheetCount);
  console.info(parts.join(" "));
}
