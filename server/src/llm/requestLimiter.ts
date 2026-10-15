import type { ChatOpenAI } from "@langchain/openai";
import { IterableReadableStream } from "@langchain/core/utils/stream";
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

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (this.concurrencyLimit === 0 && this.requestIntervalMs === 0) {
      return Promise.resolve(() => {});
    }

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const index = this.queue.indexOf(start);
        if (index >= 0) this.queue.splice(index, 1);
        reject(signal?.reason);
        this.processQueue();
      };
      const start = () => {
        signal?.removeEventListener("abort", onAbort);
        this.activeCount += 1;
        if (this.requestIntervalMs > 0) {
          this.nextStartAt = Date.now() + this.requestIntervalMs;
        }
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.activeCount -= 1;
          this.processQueue();
        });
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.queue.push(start);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
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

/**
 * 当 provider 配置变更时调用，淘汰该 provider 下所有旧限速器实例。
 * 持有旧实例引用的 LLM 客户端仍可完成在途请求，新请求将使用新配置创建的实例。
 */
export function evictSharedLimiters(provider: string): void {
  const prefix = `${provider}:`;
  for (const key of sharedLimiters.keys()) {
    if (key.startsWith(prefix)) {
      sharedLimiters.delete(key);
    }
  }
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

  patchable.invoke = (async (...args: Parameters<ChatOpenAI["invoke"]>) =>
    limiter.run(() => originalInvoke(...args))) as ChatOpenAI["invoke"];

  patchable.stream = (async (...args: Parameters<ChatOpenAI["stream"]>) => {
    const signal = args[1]?.signal;
    const release = await limiter.acquire(signal);
    const controller = new AbortController();
    let iterator: AsyncIterator<unknown> | undefined;
    let outputController: ReadableStreamDefaultController<unknown> | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      release();
    };
    const close = async (reason?: unknown) => {
      controller.abort(reason);
      try {
        await iterator?.return?.();
      } finally {
        finish();
      }
    };
    const onAbort = () => {
      controller.abort(signal?.reason);
      outputController?.error(controller.signal.reason);
      if (iterator) void close(signal?.reason).catch(() => undefined);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      signal?.throwIfAborted();
      const source = await originalStream(args[0], { ...args[1], signal: controller.signal });
      iterator = source[Symbol.asyncIterator]();
      if (controller.signal.aborted) {
        await close(controller.signal.reason);
        controller.signal.throwIfAborted();
      }
      return new IterableReadableStream<unknown>({
        start(output) { outputController = output; },
        async pull(output) {
          try {
            const result = await iterator!.next();
            if (finished) return;
            if (result.done) {
              finish();
              output.close();
            } else {
              output.enqueue(result.value);
            }
          } catch (error) {
            await close(error).catch(() => undefined);
            output.error(error);
          }
        },
        cancel: close,
      }, { highWaterMark: 0 });
    } catch (error) {
      finish();
      throw error;
    }
  }) as ChatOpenAI["stream"];

  // batch delegates to this.invoke: an outer permit would deadlock at limit 1.

  Object.defineProperty(patchable, LLM_REQUEST_LIMITER_PATCHED, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return llm;
}
