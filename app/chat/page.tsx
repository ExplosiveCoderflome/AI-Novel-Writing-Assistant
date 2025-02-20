'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { LLMPromptInput } from '../components/LLMPromptInput';
import { Message } from '../types/chat';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  // 滚动到底部
  const scrollToBottom = () => {
    if (messagesEndRef.current && shouldAutoScroll) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // 监听消息变化，自动滚动
  useEffect(() => {
    scrollToBottom()
  }, [messages, shouldAutoScroll])

  // 监听滚动事件
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const isScrolledNearBottom = 
      element.scrollHeight - element.scrollTop - element.clientHeight < 100;
    setShouldAutoScroll(isScrolledNearBottom);
  }

  const handleSubmit = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    try {
      setIsLoading(true);
      
      // 添加用户消息
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: params.prompt,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // 发送请求
      const response = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('请求失败');
      }

      // 创建新的助手消息
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应数据');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content') {
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessage.id
                    ? { ...msg, content: msg.content + (parsed.choices[0]?.delta?.content || '') }
                    : msg
                ));
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }
            } catch (e) {
              console.warn('解析数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('生成回复失败:', error);
      // 添加错误消息
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: error instanceof Error ? error.message : '生成回复时发生未知错误',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="flex-1 container mx-auto max-w-4xl px-4">
        <Card className="h-full flex flex-col">
          <ScrollArea 
            className="flex-1 p-4"
            onScroll={handleScroll}
            ref={scrollAreaRef}
          >
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  } animate-fade-in`}
                >
                  <div
                    className={`flex items-start gap-3 max-w-[80%] ${
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <Avatar className="w-8 h-8 shrink-0">
                      {message.role === "user" ? (
                        <>
                          <AvatarImage src="/avatars/user.png" />
                          <AvatarFallback>U</AvatarFallback>
                        </>
                      ) : (
                        <>
                          <AvatarImage src="/avatars/assistant.png" />
                          <AvatarFallback>A</AvatarFallback>
                        </>
                      )}
                    </Avatar>
                    <div
                      className={`rounded-lg p-4 shadow-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                      <div className="text-xs mt-2 opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarImage src="/avatars/assistant.png" />
                      <AvatarFallback>A</AvatarFallback>
                    </Avatar>
                    <div className="rounded-lg p-4 bg-muted shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s] opacity-70" />
                        <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s] opacity-70" />
                        <div className="w-2 h-2 bg-current rounded-full animate-bounce opacity-70" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* 用于滚动定位的空白元素 */}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <div className="p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <LLMPromptInput
              onSubmit={handleSubmit}
              disabled={isLoading}
              inputType="textarea"
              buttonText={isLoading ? "生成中..." : "发送"}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}