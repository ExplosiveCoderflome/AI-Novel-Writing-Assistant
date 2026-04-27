import type { ChatOpenAI } from "@langchain/openai";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

const LLM_REQUEST_LIMITER_PATCHED = Symbol("LLM_REQUEST_LIMITER_PATCHED");

export interface ProviderModelLimitOptions {
  provider: LLMProvider;
  model: string;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
}

type PatchableChatOpenAI = ChatOpenAI & {
  [LLM_REQUEST_LIMITER_PATCHED]?: boolean;
};

function normalizeNonNegativeInteger(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

class ProviderModelRequestLimiter {
  private readonly concurrencyLimit: number;
  private readonly requestIntervalMs: number;
  private readonly queue: Array<() => void> = [];
  private activeCount = 0;
  private nextStartAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: ProviderModelLimitOptions) {
    this.concurrencyLimit = normalizeNonNegativeInteger(options.concurrencyLimit);
    this.requestIntervalMs = normalizeNonNegativeInteger(options.requestIntervalMs);
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.concurrencyLimit === 0 && this.requestIntervalMs === 0) {
      return operation();
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.activeCount += 1;
        if (this.requestIntervalMs > 0) {
          this.nextStartAt = Date.now() + this.requestIntervalMs;
        }
        operation()
          .then(resolve, reject)
          .finally(() => {
            this.activeCount = Math.max(0, this.activeCount - 1);
            this.processQueue();
          });
      });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }
    if (this.concurrencyLimit > 0 && this.activeCount >= this.concurrencyLimit) {
      return;
    }

    const waitMs = this.requestIntervalMs > 0 ? this.nextStartAt - Date.now() : 0;
    if (waitMs > 0) {
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.processQueue();
        }, waitMs);
      }
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }
    next();
    this.processQueue();
  }
}

const sharedLimiters = new Map<string, ProviderModelRequestLimiter>();

function getLimiterKey(options: ProviderModelLimitOptions): string {
  return [
    options.provider,
    options.model,
    normalizeNonNegativeInteger(options.concurrencyLimit),
    normalizeNonNegativeInteger(options.requestIntervalMs),
  ].join(":");
}

export function createProviderModelLimiter(options: ProviderModelLimitOptions): ProviderModelRequestLimiter {
  return new ProviderModelRequestLimiter(options);
}

function getSharedProviderModelLimiter(options: ProviderModelLimitOptions): ProviderModelRequestLimiter {
  const key = getLimiterKey(options);
  const existing = sharedLimiters.get(key);
  if (existing) {
    return existing;
  }
  const created = createProviderModelLimiter(options);
  sharedLimiters.set(key, created);
  return created;
}

export function attachLLMRequestLimiter(llm: ChatOpenAI, options: ProviderModelLimitOptions): ChatOpenAI {
  const concurrencyLimit = normalizeNonNegativeInteger(options.concurrencyLimit);
  const requestIntervalMs = normalizeNonNegativeInteger(options.requestIntervalMs);
  if (concurrencyLimit === 0 && requestIntervalMs === 0) {
    return llm;
  }

  const patchable = llm as PatchableChatOpenAI;
  if (patchable[LLM_REQUEST_LIMITER_PATCHED]) {
    return llm;
  }

  const limiter = getSharedProviderModelLimiter({
    ...options,
    concurrencyLimit,
    requestIntervalMs,
  });
  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream.bind(llm);
  const originalBatch = llm.batch.bind(llm);

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) =>
    limiter.run(() => originalInvoke(...args))) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) =>
    limiter.run(() => originalStream(...args))) as ChatOpenAI["stream"];

  patchable.batch = (async (...args: Parameters<ChatOpenAI["batch"]>) =>
    limiter.run(() => originalBatch(...args))) as ChatOpenAI["batch"];

  Object.defineProperty(patchable, LLM_REQUEST_LIMITER_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
