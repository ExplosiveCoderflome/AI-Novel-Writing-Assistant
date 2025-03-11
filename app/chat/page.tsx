"use client";

import { useState, useEffect } from "react";
import { Card } from "../components/ui/card";
import { LLMPromptInput } from "../components/LLMPromptInput";
import ChatHeader from "../components/chat/ChatHeader";
import MessageList from "../components/chat/MessageList";
import { ChatSidebar } from "../components/chat/ChatSidebar";
import { ChatToolbar } from "../components/chat/ChatToolbar";
import useChatHistory from "../hooks/useChatHistory";
import useChatSettings from "../hooks/useChatSettings";
import useChatApi from "../hooks/useChatApi";
import DebugInfo from "../components/DebugInfo";
import { SystemPrompt } from "../lib/indexedDB";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";

export default function ChatPage() {
    // 使用自定义钩子
    const {
        messages,
        isLoading,
        setIsLoading,
        addMessage,
        clearChatHistory,
        exportChatHistory,
        updateMessageContent,
        getContextHistory
    } = useChatHistory();
    
    const {
        settings,
        isSettingsOpen,
        setIsSettingsOpen,
        isAgentMode,
        setIsAgentMode,
        activePrompt,
        saveSettings,
        handlePromptSelect
    } = useChatSettings();

    const {
        sendChatRequest,
        cancelRequest
    } = useChatApi(addMessage, updateMessageContent, setIsLoading);

    // 管理工具栏插入的内容
    const [insertedContent, setInsertedContent] = useState<string | undefined>(undefined);
    
    // 自动联网搜索开关
    const [autoWebSearch, setAutoWebSearch] = useState<boolean>(true);
    
    // 搜索提供商选择
    const [searchProvider, setSearchProvider] = useState<'serpapi' | 'exa'>('serpapi');

    // 监听滚动事件
    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        const isScrolledNearBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        // 这个值会在MessageList组件内部使用
    };

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            cancelRequest();
        };
    }, []);

    // 创建新对话
    const startNewChat = async () => {
        await clearChatHistory();
    };

    // 重新生成上一条回复
    const regenerateResponse = async () => {
        if (isLoading || messages.length < 2) return;

        // 获取最后一条用户消息
        let lastUserMessageIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
                lastUserMessageIndex = i;
                break;
            }
        }

        if (lastUserMessageIndex === -1) return;

        // 重新发送请求
        const lastUserMessage = messages[lastUserMessageIndex];
        
        // 获取上下文历史
        const contextHistory = await getContextHistory(settings.contextWindowSize);
        
        await sendChatRequest(lastUserMessage.content, {
            provider: settings.provider,
            model: settings.model,
            prompt: lastUserMessage.content,
            contextHistory,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            systemPrompt: activePrompt?.content,
            agentMode: isAgentMode,
            autoWebSearch: autoWebSearch,
            searchProvider: searchProvider
        });
    };

    // 处理提交
    const handleSubmit = async (data: {
        provider: string;
        model: string;
        prompt: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        agentMode?: boolean;
    }) => {
        // 获取上下文历史
        const contextHistory = await getContextHistory(settings.contextWindowSize);
        
        await sendChatRequest(data.prompt, {
            ...data,
            agentMode: data.agentMode || false, // 确保agentMode为boolean
            autoWebSearch: autoWebSearch, // 添加自动联网搜索参数
            searchProvider: searchProvider, // 添加搜索提供商参数
            contextHistory,
            provider: settings.provider,
            model: settings.model,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens
        });

        // 清除插入的内容
        setInsertedContent(undefined);
    };

    // 处理工具栏内容插入
    const handleInsertContent = (content: string) => {
        // 设置插入的内容，这将传递给LLMPromptInput组件
        setInsertedContent(content);
    };

    return (
        <>
            <DebugInfo />
            <div className="flex h-[calc(100vh-64px)]">
                <div className="w-80 hidden md:block">
                    <ChatSidebar 
                        onPromptSelect={handlePromptSelect}
                        activePromptId={activePrompt?.id}
                        isAgentMode={isAgentMode}
                        onAgentModeChange={setIsAgentMode}
                    />
                </div>
                <div className="flex-1 container mx-auto max-w-4xl px-4">
                    <Card className="flex flex-col h-[calc(100vh-64px)]">
                        <ChatHeader 
                            activePrompt={activePrompt}
                            isAgentMode={isAgentMode}
                            isSettingsOpen={isSettingsOpen}
                            setIsSettingsOpen={setIsSettingsOpen}
                            settings={settings}
                            saveSettings={saveSettings}
                            startNewChat={startNewChat}
                            clearChatHistory={clearChatHistory}
                            exportChatHistory={exportChatHistory}
                        />
                        
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <MessageList 
                                messages={messages}
                                isLoading={isLoading}
                                onRegenerateResponse={regenerateResponse}
                                onScroll={handleScroll}
                            />
                        </div>
                        
                        <div className="border-t py-1 px-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="auto-web-search"
                                            checked={autoWebSearch}
                                            onCheckedChange={setAutoWebSearch}
                                        />
                                        <Label htmlFor="auto-web-search" className="text-sm">自动联网搜索</Label>
                                    </div>
                                    
                                    {autoWebSearch && (
                                        <div className="flex items-center space-x-2">
                                            <Label htmlFor="search-provider" className="text-sm">搜索引擎:</Label>
                                            <select
                                                id="search-provider"
                                                value={searchProvider}
                                                onChange={(e) => setSearchProvider(e.target.value as 'serpapi' | 'exa')}
                                                className="h-7 rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background"
                                            >
                                                <option value="serpapi">SerpAPI (默认)</option>
                                                <option value="exa">Exa搜索 (实时网络数据)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <ChatToolbar onInsertContent={handleInsertContent} />
                        
                        <div className="px-4 py-2 border-t">
                            <LLMPromptInput
                                inputType="textarea"
                                buttonText="发送"
                                disabled={isLoading}
                                systemPrompt={activePrompt?.content}
                                agentMode={isAgentMode}
                                onSubmit={handleSubmit}
                                insertedContent={insertedContent}
                            />
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
}
