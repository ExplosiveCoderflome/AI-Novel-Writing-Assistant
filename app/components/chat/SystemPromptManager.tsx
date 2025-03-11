"use client";

import { useState, useEffect } from "react";
import { SystemPrompt, chatHistoryDB } from "../../lib/indexedDB";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { PlusCircle, Edit, Trash2, Save, Bot, Brain, Sparkles } from "lucide-react";
import { Switch } from "../ui/switch";

interface SystemPromptManagerProps {
  onPromptSelect: (prompt: SystemPrompt) => void;
  activePromptId?: string;
}

export function SystemPromptManager({ onPromptSelect, activePromptId }: SystemPromptManagerProps) {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<SystemPrompt | null>(null);
  const [newPrompt, setNewPrompt] = useState<Partial<SystemPrompt>>({
    name: "",
    content: "",
    type: "assistant"
  });
  const [activeTab, setActiveTab] = useState<string>("all");

  // 加载所有系统提示词
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        console.log("开始加载系统提示词列表...");
        const allPrompts = await chatHistoryDB.getAllSystemPrompts();
        console.log("成功加载系统提示词列表:", allPrompts);
        setPrompts(allPrompts);
      } catch (error) {
        console.error("加载系统提示词失败:", error);
      }
    };

    loadPrompts();
  }, []);

  // 根据类型过滤提示词
  const filteredPrompts = activeTab === "all" 
    ? prompts 
    : prompts.filter(prompt => prompt.type === activeTab);

  // 添加新提示词
  const handleAddPrompt = async () => {
    try {
      if (!newPrompt.name || !newPrompt.content) return;

      const prompt: SystemPrompt = {
        id: `prompt-${Date.now()}`,
        name: newPrompt.name,
        content: newPrompt.content,
        type: newPrompt.type as 'assistant' | 'agent',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await chatHistoryDB.saveSystemPrompt(prompt);
      
      // 更新本地状态
      setPrompts(prev => [...prev, prompt]);
      
      // 重置表单
      setNewPrompt({
        name: "",
        content: "",
        type: "assistant"
      });
      
      // 关闭对话框
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("添加系统提示词失败:", error);
    }
  };

  // 更新提示词
  const handleUpdatePrompt = async () => {
    try {
      if (!currentPrompt) return;

      await chatHistoryDB.saveSystemPrompt(currentPrompt);
      
      // 更新本地状态
      setPrompts(prev => 
        prev.map(p => p.id === currentPrompt.id ? currentPrompt : p)
      );
      
      // 关闭对话框
      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("更新系统提示词失败:", error);
    }
  };

  // 删除提示词
  const handleDeletePrompt = async () => {
    try {
      if (!currentPrompt) return;

      await chatHistoryDB.deleteSystemPrompt(currentPrompt.id);
      
      // 更新本地状态
      setPrompts(prev => prev.filter(p => p.id !== currentPrompt.id));
      
      // 关闭对话框
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error("删除系统提示词失败:", error);
    }
  };

  // 选择提示词
  const handleSelectPrompt = async (prompt: SystemPrompt) => {
    // 如果已经是活跃的提示词，则不需要再次设置
    if (prompt.id === activePromptId) {
      return;
    }
    
    try {
      await chatHistoryDB.setActiveSystemPrompt(prompt.id);
      onPromptSelect(prompt);
    } catch (error) {
      console.error("设置活跃系统提示词失败:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">系统提示词</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <PlusCircle className="h-4 w-4 mr-1" />
              新建提示词
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新的系统提示词</DialogTitle>
              <DialogDescription>
                系统提示词决定了AI助手的行为和专业领域。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="promptName" className="text-right">
                  名称
                </Label>
                <Input
                  id="promptName"
                  value={newPrompt.name}
                  onChange={(e) => setNewPrompt({ ...newPrompt, name: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="promptType" className="text-right">
                  类型
                </Label>
                <div className="flex items-center space-x-2 col-span-3">
                  <Switch
                    id="promptType"
                    checked={newPrompt.type === "agent"}
                    onCheckedChange={(checked) => 
                      setNewPrompt({ ...newPrompt, type: checked ? "agent" : "assistant" })
                    }
                  />
                  <Label htmlFor="promptType">
                    {newPrompt.type === "agent" ? "智能体模式" : "普通助手模式"}
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="promptContent" className="text-right">
                  内容
                </Label>
                <Textarea
                  id="promptContent"
                  value={newPrompt.content}
                  onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
                  className="col-span-3"
                  rows={10}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" onClick={handleAddPrompt}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="assistant">助手</TabsTrigger>
          <TabsTrigger value="agent">智能体</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-2">
          <ScrollArea className="h-[calc(100vh-440px)]">
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isActive={prompt.id === activePromptId}
                  onSelect={() => handleSelectPrompt(prompt)}
                  onEdit={() => {
                    setCurrentPrompt(prompt);
                    setIsEditDialogOpen(true);
                  }}
                  onDelete={() => {
                    setCurrentPrompt(prompt);
                    setIsDeleteDialogOpen(true);
                  }}
                />
              ))}
              {filteredPrompts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  没有找到系统提示词
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="assistant" className="mt-2">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isActive={prompt.id === activePromptId}
                  onSelect={() => handleSelectPrompt(prompt)}
                  onEdit={() => {
                    setCurrentPrompt(prompt);
                    setIsEditDialogOpen(true);
                  }}
                  onDelete={() => {
                    setCurrentPrompt(prompt);
                    setIsDeleteDialogOpen(true);
                  }}
                />
              ))}
              {filteredPrompts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  没有找到助手类型的系统提示词
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="agent" className="mt-2">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isActive={prompt.id === activePromptId}
                  onSelect={() => handleSelectPrompt(prompt)}
                  onEdit={() => {
                    setCurrentPrompt(prompt);
                    setIsEditDialogOpen(true);
                  }}
                  onDelete={() => {
                    setCurrentPrompt(prompt);
                    setIsDeleteDialogOpen(true);
                  }}
                />
              ))}
              {filteredPrompts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  没有找到智能体类型的系统提示词
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑系统提示词</DialogTitle>
            <DialogDescription>
              修改系统提示词的内容和设置。
            </DialogDescription>
          </DialogHeader>
          {currentPrompt && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editPromptName" className="text-right">
                  名称
                </Label>
                <Input
                  id="editPromptName"
                  value={currentPrompt.name}
                  onChange={(e) => setCurrentPrompt({ ...currentPrompt, name: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editPromptType" className="text-right">
                  类型
                </Label>
                <div className="flex items-center space-x-2 col-span-3">
                  <Switch
                    id="editPromptType"
                    checked={currentPrompt.type === "agent"}
                    onCheckedChange={(checked) => 
                      setCurrentPrompt({ 
                        ...currentPrompt, 
                        type: checked ? "agent" : "assistant",
                        updatedAt: new Date()
                      })
                    }
                  />
                  <Label htmlFor="editPromptType">
                    {currentPrompt.type === "agent" ? "智能体模式" : "普通助手模式"}
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="editPromptContent" className="text-right">
                  内容
                </Label>
                <Textarea
                  id="editPromptContent"
                  value={currentPrompt.content}
                  onChange={(e) => setCurrentPrompt({ ...currentPrompt, content: e.target.value })}
                  className="col-span-3"
                  rows={10}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" onClick={handleUpdatePrompt}>更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              您确定要删除这个系统提示词吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeletePrompt}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 提示词卡片组件
interface PromptCardProps {
  prompt: SystemPrompt;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PromptCard({ prompt, isActive, onSelect, onEdit, onDelete }: PromptCardProps) {
  return (
    <Card className={`${isActive ? 'border-primary' : ''}`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-base flex items-center">
              {prompt.type === 'agent' ? (
                <Brain className="h-4 w-4 mr-1 text-blue-500" />
              ) : (
                <Bot className="h-4 w-4 mr-1 text-green-500" />
              )}
              {prompt.name}
            </CardTitle>
            <CardDescription className="text-xs">
              {new Date(prompt.updatedAt).toLocaleString()}
            </CardDescription>
          </div>
          <Badge variant={prompt.type === 'agent' ? 'secondary' : 'outline'}>
            {prompt.type === 'agent' ? '智能体' : '助手'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-sm line-clamp-2 text-muted-foreground">
          {prompt.content.substring(0, 100)}...
        </p>
      </CardContent>
      <CardFooter className="p-2 flex justify-between">
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-3 w-3 mr-1" />
            编辑
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" />
            删除
          </Button>
        </div>
        <Button 
          variant={isActive ? "default" : "outline"} 
          size="sm" 
          onClick={onSelect}
          className={isActive ? "bg-primary text-primary-foreground" : ""}
        >
          {isActive ? (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              当前使用
            </>
          ) : "使用"}
        </Button>
      </CardFooter>
    </Card>
  );
}
