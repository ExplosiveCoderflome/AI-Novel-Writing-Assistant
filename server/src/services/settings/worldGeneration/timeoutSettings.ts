import { prisma } from "../../../db/prisma";
import { isMissingTableError } from "../ragLegacyCompatibility";

export const WORLD_GENERATION_TIMEOUT_MS_KEY = "world.generationTimeoutMs";
export const DEFAULT_WORLD_GENERATION_TIMEOUT_MS = 120_000;
export const MIN_WORLD_GENERATION_TIMEOUT_MS = 120_000;
export const MAX_WORLD_GENERATION_TIMEOUT_MS = 600_000;

const TIMEOUT_RANGE_MESSAGE = "请输入 2 到 10 分钟之间的整数。";
const TIMEOUT_HINT = "可以在「模型与厂商」里调高单次生成等待后重试。";

export interface WorldGenerationTimeoutSettings {
  timeoutMs: number;
  defaultTimeoutMs: number;
  minTimeoutMs: number;
  maxTimeoutMs: number;
}

let timeoutMsForTests: number | undefined;

export function setWorldGenerationTimeoutForTests(timeoutMs?: number): void {
  timeoutMsForTests = timeoutMs;
}

function clampTimeoutMs(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(
    MIN_WORLD_GENERATION_TIMEOUT_MS,
    Math.min(MAX_WORLD_GENERATION_TIMEOUT_MS, Math.floor(value)),
  );
}

function assertTimeoutMs(value: number): number {
  if (
    !Number.isInteger(value)
    || value < MIN_WORLD_GENERATION_TIMEOUT_MS
    || value > MAX_WORLD_GENERATION_TIMEOUT_MS
  ) {
    throw new Error(TIMEOUT_RANGE_MESSAGE);
  }
  return value;
}

function buildSettings(timeoutMs: number): WorldGenerationTimeoutSettings {
  return {
    timeoutMs,
    defaultTimeoutMs: DEFAULT_WORLD_GENERATION_TIMEOUT_MS,
    minTimeoutMs: MIN_WORLD_GENERATION_TIMEOUT_MS,
    maxTimeoutMs: MAX_WORLD_GENERATION_TIMEOUT_MS,
  };
}

export async function getWorldGenerationTimeoutSettings(): Promise<WorldGenerationTimeoutSettings> {
  if (timeoutMsForTests !== undefined) {
    return buildSettings(clampTimeoutMs(timeoutMsForTests, DEFAULT_WORLD_GENERATION_TIMEOUT_MS));
  }
  try {
    const record = await prisma.appSetting.findUnique({
      where: { key: WORLD_GENERATION_TIMEOUT_MS_KEY },
    });
    return buildSettings(clampTimeoutMs(Number(record?.value ?? ""), DEFAULT_WORLD_GENERATION_TIMEOUT_MS));
  } catch (error) {
    if (isMissingTableError(error)) {
      return buildSettings(DEFAULT_WORLD_GENERATION_TIMEOUT_MS);
    }
    throw error;
  }
}

export async function getWorldGenerationTimeoutMs(): Promise<number> {
  return (await getWorldGenerationTimeoutSettings()).timeoutMs;
}

export async function saveWorldGenerationTimeoutSettings(input: {
  timeoutMs: number;
}): Promise<WorldGenerationTimeoutSettings> {
  const timeoutMs = assertTimeoutMs(input.timeoutMs);
  try {
    await prisma.appSetting.upsert({
      where: { key: WORLD_GENERATION_TIMEOUT_MS_KEY },
      update: { value: String(timeoutMs) },
      create: {
        key: WORLD_GENERATION_TIMEOUT_MS_KEY,
        value: String(timeoutMs),
      },
    });
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }
  return buildSettings(timeoutMs);
}

export function rethrowWithWorldGenerationTimeoutHint(error: unknown): never {
  const message = error instanceof Error ? error.message : "世界观生成失败。";
  if (message.includes("Request timed out") && !message.includes(TIMEOUT_HINT)) {
    const wrapped = new Error(`${message} ${TIMEOUT_HINT}`);
    wrapped.cause = error;
    throw wrapped;
  }
  throw error;
}
