import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessageChunk } from "@langchain/core/messages";
import { z } from "zod";
import { agentRuntime } from "../agents";
import { createLLMFromResolvedOptions, resolveLLMClientOptions } from "../llm/factory";
import { llmProviderSchema } from "../llm/providerSchema";
import {
  ThinkTagStreamFilter,
  diffAccumulatedText,
  extractMiniMaxRawStreamData,
  extractReasoningTextFromChunk,
  isMiniMaxCompatibleProvider,
} from "../llm/reasoning";
import { initSSE, writeSSEFrame } from "../llm/streaming";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { ragServices } from "../services/rag";
import type { RagOwnerType } from "../services/rag/types";

const router = Router();

const approvalResponseSchema = z.object({
  approvalId: z.string().trim().min(1),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(2000).optional(),
});

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().trim().min(1),
      }),
    )
    .min(1),
  systemPrompt: z.string().optional(),
  agentMode: z.boolean().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(16384).optional(),
  enableSearch: z.boolean().optional(),
  enableRag: z.boolean().optional(),
  chatMode: z.enum(["standard", "agent"]).optional(),
  contextMode: z.enum(["global", "novel"]).optional(),
  sessionId: z.string().trim().optional(),
  runId: z.string().trim().optional(),
  approvalResponse: approvalResponseSchema.optional(),
  contextScope: z.enum(["novel", "world", "global"]).optional(),
  novelId: z.string().trim().optional(),
  worldId: z.string().trim().optional(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).optional(),
});

router.use(authMiddleware);

function chunkToText(content: BaseMessageChunk["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

router.post("/", validate({ body: chatSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof chatSchema>;
    const shouldUseAgentMode = body.chatMode === "agent" || body.agentMode === true;
    if (shouldUseAgentMode) {
      const disposeHeartbeat = initSSE(res);
      let fullContent = "";
      const callbacks = {
        onReasoning: (content: string) => writeSSEFrame(res, { type: "reasoning", content }),
        onToolCall: (payload: { runId: string; stepId: string; toolName: string; inputSummary: string }) =>
          writeSSEFrame(res, { type: "tool_call", ...payload }),
        onToolResult: (payload: {
          runId: string;
          stepId: string;
          toolName: string;
          outputSummary: string;
          success: boolean;
        }) => writeSSEFrame(res, { type: "tool_result", ...payload }),
        onApprovalRequired: (payload: {
          runId: string;
          approvalId: string;
          summary: string;
          targetType: string;
          targetId: string;
        }) => writeSSEFrame(res, { type: "approval_required", ...payload }),
        onApprovalResolved: (payload: { runId: string; approvalId: string; action: "approved" | "rejected"; note?: string }) =>
          writeSSEFrame(res, { type: "approval_resolved", ...payload }),
        onRunStatus: (payload: {
          runId: string;
          status: "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
          message?: string;
        }) => writeSSEFrame(res, { type: "run_status", ...payload }),
      };
      try {
        const latestUserMessage = [...body.messages].reverse().find((item) => item.role === "user")?.content?.trim();
        const contextMode = body.contextMode ?? (body.novelId ? "novel" : "global");
        if (contextMode === "novel" && !body.novelId) {
          throw new Error("novel 模式必须提供 novelId。");
        }
        if (body.approvalResponse && !body.runId) {
          throw new Error("处理审批时必须提供 runId。");
        }
        const result = body.approvalResponse && body.runId
          ? await agentRuntime.resolveApproval({
            runId: body.runId,
            approvalId: body.approvalResponse.approvalId,
            action: body.approvalResponse.action,
            note: body.approvalResponse.note,
          }, callbacks)
          : await agentRuntime.start({
            runId: body.runId,
            sessionId: body.sessionId?.trim() || `chat_session_${Date.now()}`,
            goal: latestUserMessage ?? "请根据当前上下文给出写作建议。",
            messages: body.messages.slice(-20),
            contextMode,
            novelId: contextMode === "novel" ? body.novelId : undefined,
            provider: body.provider,
            model: body.model,
            temperature: body.temperature,
            maxTokens: body.maxTokens,
          }, callbacks);
        fullContent = result.assistantOutput.trim();
        if (fullContent) {
          writeSSEFrame(res, { type: "chunk", content: fullContent });
        }
        writeSSEFrame(res, { type: "done", fullContent });
      } catch (error) {
        writeSSEFrame(res, {
          type: "error",
          error: error instanceof Error ? error.message : "Agent run failed.",
        });
      } finally {
        disposeHeartbeat();
        if (!res.writableEnded) {
          res.end();
        }
      }
      return;
    }

    const resolvedLLM = await resolveLLMClientOptions(body.provider ?? "deepseek", {
      model: body.model,
      temperature: body.temperature ?? 0.7,
      maxTokens: body.maxTokens,
    });
    const llm = createLLMFromResolvedOptions(resolvedLLM);

    const recentMessages = body.messages.slice(-20);
    const systemPrompt =
      body.systemPrompt ??
      `你是一位专业的小说创作助手，擅长帮助作者进行小说创作、世界设定、角色设计等工作。
- 使用 Markdown 格式组织回答
- 提供具体、可操作的创作建议
- 结合文学理论与商业写作实践
- 擅长领域：写作技巧/情节构思/角色设计/世界观构建/文风建议/创作瓶颈突破`;

    const finalSystemPrompt =
      body.agentMode
        ? `${systemPrompt}

作为智能创作代理，你需要：
- 主动分析用户需求背后的深层问题
- 提供多个解决方案并分析各自优劣
- 给出具体的下一步行动建议
- 在必要时主动提问以获取更多信息`
        : systemPrompt;

    const searchHint = body.enableSearch
      ? "\n提示：联网检索能力当前为预留状态，请在回答中说明基于已有上下文推断。"
      : "";

    const latestUserMessage = [...recentMessages]
      .reverse()
      .find((item) => item.role === "user")
      ?.content
      ?.trim();
    const shouldEnableRag = body.enableRag
      ?? (Array.isArray(body.knowledgeDocumentIds) && body.knowledgeDocumentIds.length > 0);
    const scope = body.contextScope ?? "global";
    const ownerTypes: RagOwnerType[] | undefined = scope === "novel"
      ? ["novel", "chapter", "bible", "chapter_summary", "consistency_fact", "character", "character_timeline"]
      : scope === "world"
        ? ["world", "world_library_item"]
        : undefined;
    let ragContext = "";
    if (shouldEnableRag && latestUserMessage) {
      try {
        ragContext = await ragServices.hybridRetrievalService.buildContextBlock(latestUserMessage, {
          novelId: scope === "novel" ? body.novelId : undefined,
          worldId: scope === "world" ? body.worldId : undefined,
          ownerTypes,
          knowledgeDocumentIds: body.knowledgeDocumentIds,
        });
      } catch {
        ragContext = "";
      }
    }
    const ragHint = ragContext
      ? `\n以下是检索到的项目知识片段（可能不完整），请优先依据这些内容回答，并在冲突时说明不确定性：\n${ragContext}\n`
      : "";

    const messages = [
      new SystemMessage(finalSystemPrompt + searchHint + ragHint),
      ...recentMessages.map((item) => {
        if (item.role === "assistant") {
          return new AIMessage(item.content);
        }
        if (item.role === "system") {
          return new SystemMessage(item.content);
        }
        return new HumanMessage(item.content);
      }),
    ];

    const stream = await llm.stream(messages);
    const disposeHeartbeat = initSSE(res);
    let fullContent = "";
    const isMiniMaxStream = isMiniMaxCompatibleProvider(
      resolvedLLM.provider,
      resolvedLLM.baseURL,
      resolvedLLM.model,
    );
    const thinkFilter = isMiniMaxStream ? new ThinkTagStreamFilter() : null;
    let miniMaxContentBuffer = "";
    let miniMaxReasoningBuffer = "";

    try {
      for await (const chunk of stream) {
        if (res.writableEnded) {
          break;
        }

        let reasoningContent = "";
        let text = chunkToText(chunk.content);

        if (isMiniMaxStream) {
          const rawResponse = (chunk.additional_kwargs as { __raw_response?: unknown } | undefined)
            ?.__raw_response;
          const rawStreamData = extractMiniMaxRawStreamData(rawResponse);

          const normalizedContent = diffAccumulatedText(miniMaxContentBuffer, rawStreamData.contentBuffer);
          miniMaxContentBuffer = normalizedContent.nextBuffer;
          if (normalizedContent.delta) {
            text = normalizedContent.delta;
          }

          const normalizedReasoning = diffAccumulatedText(miniMaxReasoningBuffer, rawStreamData.reasoningBuffer);
          miniMaxReasoningBuffer = normalizedReasoning.nextBuffer;
          reasoningContent = normalizedReasoning.delta;
        }

        if (!reasoningContent) {
          reasoningContent = extractReasoningTextFromChunk(chunk);
        }
        if (reasoningContent && resolvedLLM.reasoningEnabled) {
          writeSSEFrame(res, { type: "reasoning", content: reasoningContent });
        }

        const filteredChunk = thinkFilter ? thinkFilter.push(text) : { text, reasoning: "" };
        if (filteredChunk.reasoning && resolvedLLM.reasoningEnabled) {
          writeSSEFrame(res, { type: "reasoning", content: filteredChunk.reasoning });
        }

        if (!filteredChunk.text) {
          continue;
        }
        fullContent += filteredChunk.text;
        writeSSEFrame(res, { type: "chunk", content: filteredChunk.text });
      }

      if (thinkFilter) {
        const flushedChunk = thinkFilter.flush();
        if (flushedChunk.reasoning && resolvedLLM.reasoningEnabled) {
          writeSSEFrame(res, { type: "reasoning", content: flushedChunk.reasoning });
        }
        if (flushedChunk.text) {
          fullContent += flushedChunk.text;
          writeSSEFrame(res, { type: "chunk", content: flushedChunk.text });
        }
      }

      writeSSEFrame(res, { type: "done", fullContent });
    } catch (error) {
      writeSSEFrame(res, {
        type: "error",
        error: error instanceof Error ? error.message : "对话流式生成失败。",
      });
    } finally {
      disposeHeartbeat();
      if (!res.writableEnded) {
        res.end();
      }
    }
  } catch (error) {
    next(error);
  }
});

router.get("/history", (_req, res) => {
  res.status(200).json({
    success: true,
    data: [],
    message: "当前由前端 IndexedDB 保存历史记录，此接口暂返回空数组。",
  } satisfies ApiResponse<unknown[]>);
});

export default router;
