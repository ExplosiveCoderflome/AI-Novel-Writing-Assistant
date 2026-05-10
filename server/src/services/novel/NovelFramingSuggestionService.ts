import {
  type BookFramingSuggestion,
  type BookFramingSuggestionInput,
} from "@ai-novel/shared/types/novelFraming";
import { SystemMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import { resolveLLMClientOptions } from "../../llm/factory";
import { parseStructuredLlmRawContentDetailed } from "../../llm/structuredInvoke";
import { extractStructuredOutputErrorCategory, resolveStructuredOutputProfile } from "../../llm/structuredOutput";
import { invokeStructuredLlmDetailed } from "../../llm/structuredInvoke";
import { preparePromptExecution } from "../../prompting/core/promptRunner";
import { novelFramingSuggestionPrompt } from "../../prompting/prompts/novel/framing.prompts";

function buildInputSummary(input: BookFramingSuggestionInput): string {
  return [
    input.title?.trim() ? `书名：${input.title.trim()}` : "",
    input.description?.trim() ? `一句话概述：${input.description.trim()}` : "",
    input.genreLabel?.trim() ? `作品类型：${input.genreLabel.trim()}` : "",
    input.styleTone?.trim() ? `当前文风关键词：${input.styleTone.trim()}` : "",
  ].filter(Boolean).join("\n");
}

export class NovelFramingSuggestionService {
  private stringifyMessageContent(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      }).join("\n");
    }
    return "";
  }

  private toOpenAIChatMessages(messages: BaseMessage[]): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    return messages
      .map((message) => {
        const content = this.stringifyMessageContent(message.content).trim();
        if (!content) {
          return null;
        }
        const role = message instanceof SystemMessage || message.type === "system"
          ? "system"
          : message instanceof AIMessage || message.type === "ai"
            ? "assistant"
            : "user";
        return { role, content };
      })
      .filter((entry): entry is { role: "system" | "user" | "assistant"; content: string } => Boolean(entry));
  }

  private async suggestViaDirectOpenAICompatibleCall(input: {
    promptMessages: BaseMessage[];
    promptMeta: ReturnType<typeof preparePromptExecution>["invocation"];
    provider?: BookFramingSuggestionInput["provider"];
    model?: string;
    temperature?: number;
    outputSchema: NonNullable<typeof novelFramingSuggestionPrompt.outputSchema>;
  }): Promise<NonNullable<typeof novelFramingSuggestionPrompt.outputSchema> extends import("zod").ZodType<infer R> ? R : never> {
    const resolved = await resolveLLMClientOptions(input.provider, {
      model: input.model,
      temperature: input.temperature,
      taskType: novelFramingSuggestionPrompt.taskType,
      promptMeta: input.promptMeta,
      executionMode: "plain",
      structuredStrategy: "prompt_json",
      requestProtocol: "openai_compatible",
    });
    const response = await fetch(`${resolved.baseURL.replace(/\/+$/u, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(resolved.apiKey ? { authorization: `Bearer ${resolved.apiKey}` } : {}),
        ...resolved.requestHeaders,
      },
      body: JSON.stringify({
        model: resolved.model,
        temperature: resolved.temperature,
        ...(typeof resolved.maxTokens === "number" ? { max_tokens: resolved.maxTokens } : {}),
        messages: this.toOpenAIChatMessages(input.promptMessages),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`书级 framing fallback 请求失败 (${response.status}): ${detail || response.statusText}`);
    }
    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ text?: string; type?: string }>;
        };
      }>;
    };
    const rawContent = typeof payload.choices?.[0]?.message?.content === "string"
      ? payload.choices[0].message.content
      : Array.isArray(payload.choices?.[0]?.message?.content)
        ? payload.choices?.[0]?.message?.content
          ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
          .join("\n") ?? ""
        : "";
    const parsed = await parseStructuredLlmRawContentDetailed({
      rawContent,
      schema: input.outputSchema,
      provider: resolved.provider,
      model: resolved.model,
      apiKey: resolved.apiKey,
      baseURL: resolved.baseURL,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      taskType: novelFramingSuggestionPrompt.taskType,
      label: `${novelFramingSuggestionPrompt.id}@${novelFramingSuggestionPrompt.version}.fallback`,
      promptMeta: input.promptMeta,
      strategy: "prompt_json",
      profile: resolveStructuredOutputProfile({
        provider: resolved.provider,
        model: resolved.model,
        baseURL: resolved.baseURL,
        requestProtocol: resolved.requestProtocol,
        executionMode: "structured",
      }),
      maxRepairAttempts: novelFramingSuggestionPrompt.repairPolicy?.maxAttempts ?? 1,
    });
    return parsed.data;
  }

  async suggest(input: BookFramingSuggestionInput): Promise<BookFramingSuggestion> {
    if (!input.title?.trim() && !input.description?.trim()) {
      throw new Error("请至少填写书名或一句话概述后再让 AI 帮你填写。");
    }

    const inputSummary = buildInputSummary(input);
    const prepared = preparePromptExecution({
      asset: novelFramingSuggestionPrompt,
      promptInput: {
        inputSummary,
      },
    });
    const outputSchema = novelFramingSuggestionPrompt.outputSchema;
    if (!outputSchema) {
      throw new Error("书级 framing 提示词未配置结构化输出 schema。");
    }
    const result = await invokeStructuredLlmDetailed({
      messages: prepared.messages,
      schema: outputSchema,
      provider: input.provider,
      model: input.model,
      temperature: Math.min(input.temperature ?? 0.5, 0.8),
      taskType: novelFramingSuggestionPrompt.taskType,
      label: `${novelFramingSuggestionPrompt.id}@${novelFramingSuggestionPrompt.version}`,
      promptMeta: prepared.invocation,
      structuredStrategy: "prompt_json",
      maxRepairAttempts: novelFramingSuggestionPrompt.repairPolicy?.maxAttempts ?? 1,
    }).catch(async (error) => {
      const category = extractStructuredOutputErrorCategory(error instanceof Error ? error.message : String(error));
      if (category !== "transport_error") {
        throw error;
      }
      return {
        data: await this.suggestViaDirectOpenAICompatibleCall({
          promptMessages: prepared.messages,
          promptMeta: prepared.invocation,
          provider: input.provider,
          model: input.model,
          temperature: Math.min(input.temperature ?? 0.5, 0.8),
          outputSchema,
        }),
        repairUsed: false,
        repairAttempts: 0,
        diagnostics: {
          strategy: "prompt_json",
          profile: resolveStructuredOutputProfile({
            provider: input.provider ?? "deepseek",
            model: input.model,
            executionMode: "structured",
            requestProtocol: "openai_compatible",
          }),
          reasoningForcedOff: false,
          fallbackAvailable: false,
          fallbackUsed: true,
          errorCategory: "transport_error",
        },
      };
    });
    return novelFramingSuggestionPrompt.postValidate
      ? novelFramingSuggestionPrompt.postValidate(result.data, { inputSummary }, prepared.context)
      : result.data;
  }
}

export const novelFramingSuggestionService = new NovelFramingSuggestionService();
