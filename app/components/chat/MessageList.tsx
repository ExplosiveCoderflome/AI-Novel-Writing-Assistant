/*
 * @LastEditors: biz
 */
'use client';

import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from "../ui/scroll-area";
import MessageItem from './MessageItem';
import LoadingMessage from './LoadingMessage';
import { Message } from "../../types/chat";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onRegenerateResponse: () => void;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}

const MessageList = ({ 
  messages, 
  isLoading, 
  onRegenerateResponse,
  onScroll
}: MessageListProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // 滚动到底部
  const scrollToBottom = () => {
    if (messagesEndRef.current && shouldAutoScroll) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // 监听消息变化，自动滚动
  useEffect(() => {
    scrollToBottom();
  }, [messages, shouldAutoScroll]);

  // 空消息列表的提示
  const EmptyMessagePrompt = () => (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-250px)] text-muted-foreground">
      <p className="text-center mb-2">向AI助手发送消息开始对话</p>
      <p className="text-sm text-center">AI助手可以帮助你进行小说创作、世界设定、角色设计等工作</p>
    </div>
  );

  return (
    <ScrollArea
      className="flex-1 p-3 overflow-y-auto h-full"
      onScroll={onScroll}
      ref={scrollAreaRef}
    >
      <div className="space-y-4 w-full max-w-full">
        {messages.length === 0 && <EmptyMessagePrompt />}
        
        {messages.map((message, index) => {
          // 检查是否是最后一条AI消息
          const isLastAIMessage = message.role === "assistant" && 
            messages.findIndex(m => m.role === "assistant") === index;
          
          return (
            <MessageItem 
              key={message.id}
              message={message}
              isLastAIMessage={isLastAIMessage}
              isLoading={isLoading}
              onRegenerateResponse={onRegenerateResponse}
            />
          );
        })}
        
        {isLoading && <LoadingMessage />}
        
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
};

export default MessageList; 