"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { LLMPromptInput } from "../components/LLMPromptInput";
import { Message } from "../types/chat";
import { chatHistoryDB, ChatSettings, DEFAULT_SETTINGS, SystemPrompt } from "../lib/indexedDB";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import { 
    Copy, 
    XCircle, 
    Trash2, 
    Download, 
    RefreshCw, 
    Plus, 
    Settings,
    Check,
    Save,
    MoreHorizontal
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { BrainCircuit } from "lucide-react";
import { ChatSidebar } from "../components/ChatSidebar";

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAgentMode, setIsAgentMode] = useState(false);
    const [activePrompt, setActivePrompt] = useState<{ id: string; name: string; content: string } | null>(null);

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

    // 从 IndexedDB 加载设置
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const savedSettings = await chatHistoryDB.getSettings();
                setSettings(savedSettings);
            } catch (error) {
                console.error("加载设置失败:", error);
                // 使用默认设置
                setSettings(DEFAULT_SETTINGS);
            }
        };

        loadSettings();
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

    // 保存设置
    const saveSettings = async (newSettings: ChatSettings) => {
        try {
            await chatHistoryDB.saveSettings(newSettings);
            setSettings(newSettings);
            setIsSettingsOpen(false);
        } catch (error) {
            console.error("保存设置失败:", error);
        }
    };

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

    // 监听滚动事件
    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        const isScrolledNearBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            100;
        setShouldAutoScroll(isScrolledNearBottom);
    };

    // 取消当前请求
    const cancelRequest = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsLoading(false);
        }
    };

    // 组件卸载时清理
    useEffect(() => {
        return () => {
            cancelRequest();
        };
    }, []);

    // 复制消息内容
    const copyMessage = (content: string, messageId: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
        });
    };

    // 清空聊天历史
    const clearChatHistory = async () => {
        await chatHistoryDB.clearMessages();
        setMessages([]);
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

        // 移除最后一条或多条AI回复
        const newMessages = messages.slice(0, lastUserMessageIndex + 1);
        setMessages(newMessages);

        // 重新发送请求
        const lastUserMessage = messages[lastUserMessageIndex];
        const params = {
            provider: settings.provider,
            model: settings.model,
            prompt: lastUserMessage.content,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            systemPrompt: activePrompt?.content,
            agentMode: isAgentMode
        };

        await handleSubmit(params);
    };

    // 获取上下文历史
    const getContextHistory = async () => {
        return await chatHistoryDB.getContextHistory(settings.contextWindowSize);
    };

    const handleSubmit = async (params: {
        provider: string;
        model: string;
        prompt: string;
        temperature?: number;
        maxTokens?: number;
        systemPrompt?: string;
        agentMode: boolean;
    }) => {
        try {
            // 确保取消之前的请求
            cancelRequest();
            setIsLoading(true);

            // 创建新的AbortController
            abortControllerRef.current = new AbortController();

            // 设置30秒超时
            const timeoutId = setTimeout(() => {
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                }
            }, 30000);

            // 添加用户消息
            const userMessage: Message = {
                id: Date.now().toString(),
                role: "user",
                content: params.prompt,
                timestamp: new Date(),
            };
            setMessages((prevMessages) => [...prevMessages, userMessage]);

            // 获取上下文历史
            const contextHistory = await getContextHistory();
            
            // 确保不包含当前添加的消息
            const filteredContext = contextHistory.filter(msg => msg.id !== userMessage.id);
            
            console.log("发送聊天请求，参数:", {
                provider: params.provider,
                model: params.model,
                promptLength: params.prompt.length,
                temperature: params.temperature,
                maxTokens: params.maxTokens,
                contextHistoryLength: filteredContext.length,
                systemPromptLength: params.systemPrompt?.length || 0,
                agentMode: params.agentMode
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
            setMessages((prevMessages) => [...prevMessages, assistantMessage]);

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("无法读取响应数据");
            }

            const decoder = new TextDecoder();
            let lastChunkTime = Date.now();
            let streamTimeoutId: NodeJS.Timeout | null = null;

            try {
                // 设置流式响应超时检测
                streamTimeoutId = setInterval(() => {
                    const currentTime = Date.now();
                    // 如果10秒内没有收到新数据，则认为流已断开
                    if (currentTime - lastChunkTime > 10000) {
                        console.warn('流式响应超时');
                        if (streamTimeoutId) {
                            clearInterval(streamTimeoutId);
                            streamTimeoutId = null;
                        }
                        reader.cancel('流式响应超时').catch(console.error);
                    }
                }, 2000);

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

                                    // 使用函数式更新以确保基于最新状态
                                    setMessages((prevMessages) => {
                                        // 找到助手消息的索引
                                        const assistantIndex = prevMessages.findIndex(
                                            (msg) => msg.id === assistantMessage.id
                                        );

                                        if (assistantIndex === -1) {
                                            return prevMessages;
                                        }

                                        // 创建消息的副本
                                        const updatedMessages = [...prevMessages];
                                        
                                        // 更新消息内容
                                        updatedMessages[assistantIndex] = {
                                            ...updatedMessages[assistantIndex],
                                            content: updatedMessages[assistantIndex].content + contentDelta
                                        };

                                        // 使用requestAnimationFrame确保UI更新
                                        requestAnimationFrame(() => {
                                            scrollToBottom();
                                        });

                                        return updatedMessages;
                                    });
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
            
            setMessages((prevMessages) => [...prevMessages, errorMessage]);
        } finally {
            abortControllerRef.current = null;
            setIsLoading(false);
        }
    };

    // 格式化代码，用于显示代码块
    const formatMessage = (content: string) => {
        // 简单的代码块检测，实际项目中可以使用更复杂的处理
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        const formattedContent = content.replace(codeBlockRegex, (match, language, code) => {
            return `<div class="bg-muted p-4 rounded my-2 font-mono text-sm overflow-x-auto">${code}</div>`;
        });
        
        return { __html: formattedContent };
    };

    // 是否要显示代码高亮，根据消息内容判断
    const shouldUseCodeHighlight = (content: string) => {
        return content.includes("```");
    };

    // 处理提示词选择
    const handlePromptSelect = (prompt: SystemPrompt) => {
        setActivePrompt(prompt);
    };

    return (
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
                    <div className="p-4 border-b flex justify-between items-center">
                        <div className="flex items-center">
                            <h2 className="text-lg font-semibold">AI聊天助手</h2>
                            {activePrompt && (
                                <Badge variant="outline" className="ml-2">
                                    {activePrompt.name}
                                </Badge>
                            )}
                            {isAgentMode && (
                                <Badge variant="secondary" className="ml-2">
                                    <BrainCircuit className="h-3 w-3 mr-1" />
                                    智能体模式
                                </Badge>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={startNewChat}
                                        >
                                            <Plus className="h-4 w-4 mr-1" />
                                            新对话
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>开始新对话</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <Settings className="h-4 w-4 mr-1" />
                                        设置
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle>聊天设置</DialogTitle>
                                        <DialogDescription>
                                            调整AI模型和对话历史设置
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="contextWindow" className="col-span-4">
                                                历史上下文轮数: {settings.contextWindowSize}
                                            </Label>
                                            <div className="col-span-4">
                                                <Slider
                                                    id="contextWindow"
                                                    defaultValue={[settings.contextWindowSize]}
                                                    max={20}
                                                    min={1}
                                                    step={1}
                                                    onValueChange={(value: number[]) => {
                                                        setSettings({
                                                            ...settings,
                                                            contextWindowSize: value[0],
                                                        });
                                                    }}
                                                    className="mb-2"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground">
                                                    <span>较少记忆 (1轮)</span>
                                                    <span>较多记忆 (20轮)</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="temperature" className="col-span-4">
                                                温度值: {settings.temperature.toFixed(1)}
                                            </Label>
                                            <div className="col-span-4">
                                                <Slider
                                                    id="temperature"
                                                    defaultValue={[settings.temperature]}
                                                    max={1}
                                                    min={0}
                                                    step={0.1}
                                                    onValueChange={(value: number[]) => {
                                                        setSettings({
                                                            ...settings,
                                                            temperature: value[0],
                                                        });
                                                    }}
                                                    className="mb-2"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground">
                                                    <span>精确 (0.0)</span>
                                                    <span>创意 (1.0)</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="model" className="col-span-4">
                                                AI模型
                                            </Label>
                                            <Select
                                                value={settings.model}
                                                onValueChange={(value) => {
                                                    setSettings({
                                                        ...settings, 
                                                        model: value
                                                    });
                                                }}
                                            >
                                                <SelectTrigger className="col-span-4">
                                                    <SelectValue placeholder="选择模型" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="deepseek-chat">Deepseek Chat</SelectItem>
                                                    <SelectItem value="deepseek-coder">Deepseek Coder</SelectItem>
                                                    <SelectItem value="deepseek-reasoner">Deepseek Reasoner</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="maxTokens" className="col-span-4">
                                                最大Token数 (可选)
                                            </Label>
                                            <Input
                                                id="maxTokens"
                                                type="number"
                                                placeholder="不限制"
                                                className="col-span-4"
                                                value={settings.maxTokens || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                                                    setSettings({
                                                        ...settings,
                                                        maxTokens: value
                                                    });
                                                }}
                                            />
                                        </div>
                                        <div className="grid grid-cols-4 items-center gap-4">
                                            <Label htmlFor="agentMode" className="col-span-4">
                                                智能体模式
                                            </Label>
                                            <div className="flex items-center space-x-2 col-span-4">
                                                <Switch
                                                    id="agentMode"
                                                    checked={isAgentMode}
                                                    onCheckedChange={setIsAgentMode}
                                                />
                                                <Label htmlFor="agentMode">
                                                    {isAgentMode ? "已启用" : "已禁用"}
                                                </Label>
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button 
                                            type="submit" 
                                            onClick={() => saveSettings(settings)}
                                        >
                                            <Save className="h-4 w-4 mr-1" />
                                            保存设置
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <MoreHorizontal className="h-4 w-4 mr-1" />
                                        更多
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>对话管理</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={exportChatHistory}>
                                        <Download className="h-4 w-4 mr-2" />
                                        导出对话
                                    </DropdownMenuItem>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                                                <span className="text-destructive">清空历史</span>
                                            </DropdownMenuItem>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>确认清空对话历史?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    此操作将永久删除当前所有对话记录，且不可恢复。
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>取消</AlertDialogCancel>
                                                <AlertDialogAction 
                                                    onClick={clearChatHistory}
                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                    确认清空
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <ScrollArea
                        className="flex-1 p-4"
                        onScroll={handleScroll}
                        ref={scrollAreaRef}
                    >
                        <div className="space-y-6">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-[calc(100vh-300px)] text-muted-foreground">
                                    <p className="text-center mb-2">向AI助手发送消息开始对话</p>
                                    <p className="text-sm text-center">AI助手可以帮助你进行小说创作、世界设定、角色设计等工作</p>
                                </div>
                            )}
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`flex ${
                                        message.role === "user"
                                            ? "justify-end"
                                            : "justify-start"
                                    } animate-fade-in`}
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
                                                <>
                                                    <AvatarFallback className="bg-primary text-primary-foreground">
                                                        U
                                                    </AvatarFallback>
                                                </>
                                            ) : (
                                                <>
                                                    <AvatarFallback className="bg-muted text-foreground">
                                                        A
                                                    </AvatarFallback>
                                                </>
                                            )}
                                        </Avatar>
                                        <div
                                            className={`rounded-lg p-4 shadow-sm relative ${
                                                message.role === "user"
                                                    ? "bg-primary text-primary-foreground"
                                                    : "bg-muted"
                                            }`}
                                        >
                                            {shouldUseCodeHighlight(message.content) ? (
                                                <div 
                                                    className="whitespace-pre-wrap break-words"
                                                    dangerouslySetInnerHTML={formatMessage(message.content)} 
                                                />
                                            ) : (
                                            <div className="whitespace-pre-wrap break-words">
                                                {message.content}
                                            </div>
                                            )}
                                            <div className="text-xs mt-2 opacity-70 flex justify-between items-center">
                                                <span>{message.timestamp.toLocaleTimeString()}</span>
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ml-4">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-6 w-6"
                                                        onClick={() => copyMessage(message.content, message.id)}
                                                    >
                                                        {copiedMessageId === message.id ? (
                                                            <Check className="h-3 w-3" />
                                                        ) : (
                                                            <Copy className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                    {message.role === "assistant" && messages[messages.length - 1].id === message.id && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-6 w-6"
                                                            onClick={regenerateResponse}
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
                            ))}
                            {isLoading && (
                                <div className="flex justify-start animate-fade-in">
                                    <div className="flex items-start gap-3">
                                        <Avatar className="w-8 h-8 shrink-0">
                                            <AvatarFallback className="bg-muted text-foreground">A</AvatarFallback>
                                        </Avatar>
                                        <div className="rounded-lg p-4 bg-muted shadow-sm flex justify-between items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s] opacity-70" />
                                                <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s] opacity-70" />
                                                <div className="w-2 h-2 bg-current rounded-full animate-bounce opacity-70" />
                                            </div>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={cancelRequest}
                                                className="text-xs h-7 px-2"
                                            >
                                                <XCircle className="h-3 w-3 mr-1" />
                                                停止生成
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                    <div className="p-4 border-t">
                        <LLMPromptInput
                            inputType="textarea"
                            buttonText="发送"
                            disabled={isLoading}
                            systemPrompt={activePrompt?.content}
                            agentMode={isAgentMode}
                            onSubmit={(params) => handleSubmit({ 
                                ...params,
                                provider: settings.provider,
                                model: settings.model,
                                temperature: settings.temperature,
                                maxTokens: settings.maxTokens
                            })}
                        />
                    </div>
                </Card>
            </div>
        </div>
    );
}
