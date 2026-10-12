export interface PromptCacheBoundary {
    messageIndex: number;
    contentBlockIndex: number | null;
}
export interface CacheCapability {
    protocol: "openai-compatible" | "anthropic";
    mode: "automatic" | "explicit" | "unverified";
    model: string;
}
const claude = new Set(["claude-sonnet-4-5", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-5", "claude-opus-4-6"]);
const qwen = new Set(["qwen-plus", "qwen3-max", "qwen-flash", "qwen3.5-plus", "qwen3.6-plus", "qwen3.7-plus"]);
const qwenEndpoints = new Set(["dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"]);
export function resolveCacheCapability(input: {
    model: string;
    protocol: CacheCapability["protocol"];
    baseURL: string;
}): CacheCapability {
    let endpoint: URL;
    try {
        endpoint = new URL(input.baseURL);
    }
    catch {
        return { ...input, mode: "unverified" };
    }
    const secure = endpoint.protocol === "https:" && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash;
    const native = secure && input.protocol === "anthropic" && endpoint.hostname === "api.anthropic.com" && ["", "/", "/v1", "/v1/"].includes(endpoint.pathname) && claude.has(input.model);
    const compatible = secure && input.protocol === "openai-compatible" && qwenEndpoints.has(endpoint.hostname) && ["/compatible-mode/v1", "/compatible-mode/v1/"].includes(endpoint.pathname) && qwen.has(input.model);
    const automatic = secure && input.protocol === "openai-compatible" && ["api.deepseek.com", "api.openai.com"].includes(endpoint.hostname);
    return { model: input.model, protocol: input.protocol, mode: native || compatible ? "explicit" : automatic ? "automatic" : "unverified" };
}
