import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { classifyResponseEvidence, emptyResponseEvidence } from "./structuredEvidence";

export function describeOllamaConnectionError(provider: LLMProvider, error: unknown): string | null {
  if (provider !== "ollama") {
    return null;
  }

  const evidence = emptyResponseEvidence();
  const failureReason = classifyResponseEvidence(evidence, error);
  const fetchFailed = error instanceof TypeError && error.message === "fetch failed";
  if (evidence.httpStatus !== null || (failureReason !== "network" && !fetchFailed)) {
    return null;
  }

  return "无法连接 Ollama。请检查 Ollama 服务是否已启动，以及运行应用后端的电脑能否访问配置的 API 地址。使用本机默认 Ollama 时，API 密钥可留空。";
}
