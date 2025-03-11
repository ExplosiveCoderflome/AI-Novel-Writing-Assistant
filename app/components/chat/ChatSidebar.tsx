"use client";

import { useState, useEffect } from "react";
import { SystemPrompt, chatHistoryDB } from "../../lib/indexedDB";
import { SystemPromptManager } from "./SystemPromptManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import { MessageSquare, Settings2, BrainCircuit } from "lucide-react";

interface ChatSidebarProps {
  onPromptSelect: (prompt: SystemPrompt) => void;
  activePromptId?: string;
  isAgentMode: boolean;
  onAgentModeChange: (isAgent: boolean) => void;
}

export function ChatSidebar({ 
  onPromptSelect, 
  activePromptId,
  isAgentMode,
  onAgentModeChange
}: ChatSidebarProps) {
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  
  // 加载活跃的系统提示词
  useEffect(() => {
    const loadActivePrompt = async () => {
      try {
        const prompt = await chatHistoryDB.getActiveSystemPrompt();
        if (prompt) {
          setActivePrompt(prompt);
          
          // 只有当activePromptId不存在或与当前加载的提示词ID不同时，才调用onPromptSelect
          if (!activePromptId || activePromptId !== prompt.id) {
            onPromptSelect(prompt);
          }
          
          // 如果提示词是智能体类型，自动启用智能体模式
          if (prompt.type === 'agent' && !isAgentMode) {
            onAgentModeChange(true);
          }
        }
      } catch (error) {
        console.error("加载活跃系统提示词失败:", error);
      }
    };
    
    loadActivePrompt();
  }, [onPromptSelect, isAgentMode, onAgentModeChange, activePromptId]);
  
  // 处理提示词选择
  const handlePromptSelect = (prompt: SystemPrompt) => {
    setActivePrompt(prompt);
    onPromptSelect(prompt);
    
    // 如果选择了智能体类型的提示词，自动启用智能体模式
    if (prompt.type === 'agent' && !isAgentMode) {
      onAgentModeChange(true);
    }
  };
  
  return (
    <div className="h-full border-r flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold">AI聊天助手</h2>
        <p className="text-sm text-muted-foreground">管理系统提示词和智能体设置</p>
      </div>
      
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <BrainCircuit className={`h-5 w-5 mr-2 ${isAgentMode ? 'text-blue-500' : 'text-muted-foreground'}`} />
            <span className="font-medium">智能体模式</span>
          </div>
          <Button
            variant={isAgentMode ? "default" : "outline"}
            size="sm"
            onClick={() => onAgentModeChange(!isAgentMode)}
          >
            {isAgentMode ? "已启用" : "已禁用"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {isAgentMode 
            ? "智能体模式已启用，AI将主动提供建议和拓展思路。" 
            : "智能体模式已禁用，AI将只回答您的问题。"}
        </p>
      </div>
      
      <Tabs defaultValue="prompts" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-2 mx-4 mt-2">
          <TabsTrigger value="prompts">
            <MessageSquare className="h-4 w-4 mr-2" />
            提示词
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="h-4 w-4 mr-2" />
            设置
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="prompts" className="flex-1 p-4 pt-2">
          <SystemPromptManager 
            onPromptSelect={handlePromptSelect}
            activePromptId={activePromptId || activePrompt?.id}
          />
        </TabsContent>
        
        <TabsContent value="settings" className="flex-1 p-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">关于智能体模式</h3>
              <p className="text-sm text-muted-foreground">
                智能体模式让AI更加主动，不仅回答您的问题，还会：
              </p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 mt-2 space-y-1">
                <li>主动思考您可能遇到的问题</li>
                <li>提供额外的相关信息</li>
                <li>推荐具体的实践步骤</li>
                <li>提供多个可能的解决方案</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">关于系统提示词</h3>
              <p className="text-sm text-muted-foreground">
                系统提示词决定了AI助手的行为和专业领域。您可以创建多个提示词，并在不同场景下切换使用。
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">提示词类型</h3>
              <div className="space-y-2">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                  <span className="text-sm font-medium">助手型提示词</span>
                </div>
                <p className="text-xs text-muted-foreground pl-5">
                  定义AI的专业领域和回答风格，适合特定主题的问答。
                </p>
                
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                  <span className="text-sm font-medium">智能体型提示词</span>
                </div>
                <p className="text-xs text-muted-foreground pl-5">
                  让AI更加主动，提供更全面的帮助和建议。
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 