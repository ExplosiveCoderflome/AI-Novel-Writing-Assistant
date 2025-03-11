'use client';

import { useState, useEffect } from 'react';
import { Message } from '../types/chat';
import { chatHistoryDB } from '../lib/indexedDB';

export const useChatHistory = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 从 IndexedDB 加载历史消息
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const historicalMessages = await chatHistoryDB.getMessages();
        if (historicalMessages.length > 0) {
          setMessages(historicalMessages);
        }
      } catch (error) {
        console.error("加载历史消息失败:", error);
      }
    };

    loadMessages();
  }, []);

  // 保存消息到 IndexedDB
  useEffect(() => {
    const saveMessages = async () => {
      try {
        await chatHistoryDB.saveMessages(messages);
      } catch (error) {
        console.error("保存消息失败:", error);
      }
    };

    if (messages.length > 0) {
      saveMessages();
    }
  }, [messages]);

  // 添加新消息
  const addMessage = (message: Message) => {
    setMessages((prevMessages) => [...prevMessages, message]);
  };

  // 清空聊天历史
  const clearChatHistory = async () => {
    try {
      await chatHistoryDB.clearMessages();
      setMessages([]);
    } catch (error) {
      console.error("清空聊天历史失败:", error);
    }
  };

  // 导出聊天记录为Markdown
  const exportChatHistory = () => {
    if (messages.length === 0) return;

    let markdown = "# 聊天记录\n\n";
    messages.forEach((message) => {
      const role = message.role === "user" ? "用户" : "AI助手";
      const time = message.timestamp.toLocaleString();
      markdown += `## ${role} (${time})\n\n${message.content}\n\n`;
    });

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `聊天记录_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 更新消息内容（用于流式响应）
  const updateMessageContent = (messageId: string, contentToAppend: string) => {
    setMessages((prevMessages) => {
      const messageIndex = prevMessages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) return prevMessages;

      const updatedMessages = [...prevMessages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: updatedMessages[messageIndex].content + contentToAppend
      };

      return updatedMessages;
    });
  };

  // 获取上下文历史
  const getContextHistory = async (contextWindowSize: number) => {
    return await chatHistoryDB.getContextHistory(contextWindowSize);
  };

  return {
    messages,
    isLoading,
    setIsLoading,
    addMessage,
    clearChatHistory,
    exportChatHistory,
    updateMessageContent,
    getContextHistory
  };
};

export default useChatHistory; 