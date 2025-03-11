'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { Copy, Check, RefreshCw, Search, Info } from "lucide-react";
import { Message } from "../../types/chat";
import { MarkdownRenderer } from "../ui/markdown-renderer";
import { containsMarkdown } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

interface MessageItemProps {
  message: Message;
  isLastAIMessage: boolean;
  isLoading: boolean;
  onRegenerateResponse: () => void;
}

export const MessageItem = ({ 
  message, 
  isLastAIMessage, 
  isLoading, 
  onRegenerateResponse 
}: MessageItemProps) => {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showSearchInfo, setShowSearchInfo] = useState<boolean>(false);

  // 复制消息内容
  const copyMessage = (content: string, messageId: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  // 检查消息是否包含Markdown格式
  const hasMarkdown = message.role === "assistant" && containsMarkdown(message.content);
  
  // 检查是否为系统消息
  const isSystemMessage = message.role === "system";
  
  // 检查是否有搜索信息
  const hasSearchInfo = isSystemMessage && message.metadata?.searchInfo;

  // 如果是系统消息，使用不同的样式
  if (isSystemMessage) {
    return (
      <div className="flex justify-center w-full my-2">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs 
          ${hasSearchInfo ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-700 border border-gray-200"}`}>
          {hasSearchInfo ? (
            <>
              <Search className="h-3 w-3" />
              <span>{message.content}</span>
              {message.metadata?.searchInfo?.result && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 ml-1"
                        onClick={() => setShowSearchInfo(!showSearchInfo)}
                      >
                        <Info className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>查看搜索详情</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          ) : (
            <>
              <Info className="h-3 w-3" />
              <span>{message.content}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 显示搜索信息详情 */}
      {hasSearchInfo && showSearchInfo && (
        <div className="w-full px-4 py-2 mb-2">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <h4 className="font-medium text-blue-700 mb-1">搜索详情</h4>
            <p className="text-blue-600 mb-2">查询: {message.metadata?.searchInfo?.query}</p>
            <div className="bg-white p-2 rounded border border-blue-100 max-h-[200px] overflow-y-auto text-gray-700">
              <pre className="whitespace-pre-wrap text-xs">{message.metadata?.searchInfo?.result}</pre>
            </div>
          </div>
        </div>
      )}
      
      <div
        className={`flex ${
          message.role === "user"
            ? "justify-end"
            : "justify-start"
        } animate-fade-in w-full`}
      >
        <div
          className={`flex items-start gap-3 max-w-[85%] group ${
            message.role === "user"
              ? "flex-row-reverse"
              : "flex-row"
          }`}
        >
          <Avatar className="w-8 h-8 shrink-0">
            {message.role === "user" ? (
              <AvatarFallback className="bg-primary text-primary-foreground">
                U
              </AvatarFallback>
            ) : (
              <AvatarFallback className="bg-muted text-foreground">
                A
              </AvatarFallback>
            )}
          </Avatar>
          <div
            className={`rounded-lg p-3 shadow-sm relative ${
              message.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            } overflow-hidden`}
          >
            <div className="break-words overflow-x-auto max-w-full text-sm">
              {hasMarkdown ? (
                <MarkdownRenderer 
                  content={message.content} 
                  className={message.role === "user" ? "text-primary-foreground" : ""}
                />
              ) : (
                <div className="whitespace-pre-wrap break-words">
                  {message.content}
                </div>
              )}
            </div>
            <div className="text-xs mt-1 opacity-70 flex justify-between items-center">
              <span>{message.timestamp.toLocaleTimeString()}</span>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ml-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-5 w-5"
                  onClick={() => copyMessage(message.content, message.id)}
                >
                  {copiedMessageId === message.id ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                {message.role === "assistant" && isLastAIMessage && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5"
                    onClick={onRegenerateResponse}
                    disabled={isLoading}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MessageItem; 