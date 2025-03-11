'use client';

import { useState, useRef } from 'react';
import { Message } from '../types/chat';

interface ChatApiParams {
  provider: string;
  model: string;
  prompt: string;
  contextHistory: Message[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  agentMode: boolean;
  autoWebSearch?: boolean;
  searchProvider?: 'serpapi' | 'exa';
}

export const useChatApi = (
  addMessage: (message: Message) => void,
  updateMessageContent: (messageId: string, content: string) => void,
  setIsLoading: (loading: boolean) => void
) => {
  const abortControllerRef = useRef<AbortController | null>(null);

  // 取消当前请求
  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  // 发送聊天请求
  const sendChatRequest = async (userPrompt: string, params: ChatApiParams) => {
    try {
      // 确保取消之前的请求
      cancelRequest();
      setIsLoading(true);

      // 创建新的AbortController
      abortControllerRef.current = new AbortController();

      // 设置5分钟超时
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }, 300000); // 5分钟 = 300000毫秒

      // 添加用户消息
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: userPrompt,
        timestamp: new Date(),
      };
      addMessage(userMessage);

      // 过滤上下文历史，确保不包含当前添加的消息
      const filteredContext = params.contextHistory.filter(msg => msg.id !== userMessage.id);
      
      console.log("发送聊天请求，参数:", {
        provider: params.provider,
        model: params.model,
        promptLength: userPrompt.length,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        contextHistoryLength: filteredContext.length,
        systemPromptLength: params.systemPrompt?.length || 0,
        agentMode: params.agentMode,
        autoWebSearch: params.autoWebSearch,
        searchProvider: params.searchProvider || 'serpapi'
      });

      let response: Response;
      try {
        // 发送请求到LangChain聊天API，包含上下文历史
        response = await fetch("/api/llm/langchain-chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...params,
            prompt: userPrompt,
            contextHistory: filteredContext
          }),
          signal: abortControllerRef.current.signal,
        });

        // 请求完成后清除超时定时器
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ 
            error: `请求失败，状态码: ${response.status}` 
          }));
          throw new Error(errorData.error || `请求失败，状态码: ${response.status}`);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        const errMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        
        // 处理网络错误
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('请求超时，请稍后再试');
        } else {
          throw new Error(`网络错误: ${errMessage}`);
        }
      }

      // 创建新的助手消息
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      addMessage(assistantMessage);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应数据");
      }

      const decoder = new TextDecoder();
      let lastChunkTime = Date.now();
      let streamTimeoutId: NodeJS.Timeout | null = null;
      let searchInfo: any = null;

      try {
        // 设置流式响应超时检测
        streamTimeoutId = setInterval(() => {
          const currentTime = Date.now();
          // 如果60秒内没有收到新数据，则认为流已断开
          if (currentTime - lastChunkTime > 60000) {
            console.warn('流式响应超时');
            if (streamTimeoutId) {
              clearInterval(streamTimeoutId);
              streamTimeoutId = null;
            }
            reader.cancel('流式响应超时').catch(console.error);
          }
        }, 5000); // 检测间隔也调整为5秒

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('流式响应接收完成');
            break;
          }

          // 更新最后接收数据的时间
          lastChunkTime = Date.now();

          const chunk = decoder.decode(value, { stream: true });
          // 分割多个数据行
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.trim() && line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                continue;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === "content") {
                  const contentDelta = parsed.choices[0]?.delta?.content || "";
                  // 更新消息内容
                  updateMessageContent(assistantMessage.id, contentDelta);
                } else if (parsed.type === "search_info") {
                  // 处理搜索信息
                  searchInfo = parsed.searchInfo;
                  console.log("收到搜索信息:", searchInfo);
                  
                  // 可以在这里添加搜索信息到消息中，或者单独显示
                  if (searchInfo && searchInfo.performed) {
                    // 创建搜索信息消息
                    const searchInfoMessage: Message = {
                      id: (Date.now() - 1).toString(),
                      role: "system",
                      content: `**网络搜索**: 已为您搜索 "${searchInfo.query}"`,
                      timestamp: new Date(),
                      metadata: { searchInfo }
                    };
                    addMessage(searchInfoMessage);
                  }
                } else if (parsed.type === "error") {
                  throw new Error(parsed.error);
                }
              } catch (parseError) {
                console.warn("解析数据失败:", parseError, "原始数据:", line);
              }
            }
          }
        }
      } catch (streamError) {
        if (streamError instanceof Error && streamError.name !== 'AbortError') {
          console.error("流处理错误:", streamError);
          throw streamError;
        }
      } finally {
        // 清理资源
        if (streamTimeoutId) {
          clearInterval(streamTimeoutId);
        }
        reader.releaseLock();
      }
    } catch (error) {
      console.error("生成回复失败:", error);
      
      // 添加错误消息
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: error instanceof Error ? error.message : "生成回复时发生未知错误",
        timestamp: new Date(),
      };
      
      addMessage(errorMessage);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  return {
    sendChatRequest,
    cancelRequest
  };
};

export default useChatApi; 