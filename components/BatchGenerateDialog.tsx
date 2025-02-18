/*
 * @LastEditors: biz
 */
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { LLMPromptInput } from "@/components/LLMPromptInput";
import { Textarea } from "@/components/ui/textarea";

interface BatchGenerateDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (params: { 
    count: number; 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<void>;
  characterInfo?: any;
}

export function BatchGenerateDialog({
  open,
  onClose,
  onGenerate,
  characterInfo,
}: BatchGenerateDialogProps) {
  const [count, setCount] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [basePrompt, setBasePrompt] = useState<string>("");

  useEffect(() => {
    if (characterInfo) {
      const prompt = `作为一个专业的角色关系设计专家，请基于以下已有角色信息，生成一个与其有紧密关联的新角色。

现有角色信息：
角色名称：${characterInfo.name}
角色身份：${characterInfo.role}
性格特征：${characterInfo.personality}
背景故事：${characterInfo.background}
成长轨迹：${characterInfo.development}
外貌描述：${characterInfo.appearance}
弱点与不足：${characterInfo.weaknesses}
兴趣爱好：${characterInfo.interests}
重要事件：${characterInfo.keyEvents}
分类：${characterInfo.category}
标签：${characterInfo.tags}

关系设计要求：
1. 角色关系定位
- 明确新角色与现有角色的具体关系类型（如：亲人、朋友、对手、师徒、恋人等）
- 详细说明这段关系是如何建立和发展的
- 描述两个角色之间的情感纽带和互动方式

2. 关系发展脉络
- 关系的起点和形成原因
- 关键的转折点或重要事件
- 现阶段的关系状态
- 未来可能的发展方向

3. 性格互动设计
- 两个角色的性格如何互补或对立
- 彼此如何影响对方的成长和改变
- 在重要事件中的立场和态度差异

4. 故事推动作用
- 这段关系如何推动故事发展
- 可能产生的冲突和矛盾点
- 对整体剧情的影响和作用

5. 角色独特性
- 新角色需要具有独立的人格魅力
- 避免成为现有角色的简单映射
- 保持自己独特的成长轨迹和故事线

请基于以上要求，结合用户提供的具体关系设定，生成一个完整的新角色。生成的角色信息需要包含：
- 基本信息（姓名、身份等）
- 与现有角色的关系描述
- 性格特征
- 背景故事
- 成长轨迹
- 外貌描述
- 弱点与不足
- 兴趣爱好
- 重要事件
- 分类
- 标签`;

      setBasePrompt(prompt);
    }
  }, [characterInfo]);

  const handleGenerate = async (params: { 
    provider: string; 
    model: string; 
    prompt: string; 
    temperature?: number; 
    maxTokens?: number 
  }) => {
    try {
      setIsLoading(true);
      await onGenerate({
        count,
        ...params,
        prompt: basePrompt + "\n\n" + `新生成角色 与 当前角色 的关系设定：` + params.prompt
      });
      onClose();
    } catch (error) {
      console.error("批量生成失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-none">
          <DialogTitle>批量生成关联角色</DialogTitle>
          <DialogDescription>
            基于当前角色生成一组有关联的角色，形成角色关系网
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-6 -mr-6 pl-2">
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
              <Label htmlFor="count" className="min-w-[80px]">
                生成数量
              </Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <div className="space-y-2">
              <Label>基础规则</Label>
              <Textarea
                value={basePrompt}
                onChange={(e) => setBasePrompt(e.target.value)}
                className="h-[150px] font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>角色关系设定</Label>
              <div className="text-sm text-muted-foreground mb-2">
                <p className="mb-2">请详细描述新角色与当前角色"{characterInfo?.name}"之间的关系。重点说明：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>角色关系类型（如：亲人、朋友、对手、师徒、恋人等）</li>
                  <li>关系的形成过程和发展历程</li>
                  <li>彼此之间的态度和感情变化</li>
                  <li>重要的共同经历或冲突事件</li>
                  <li>在故事发展中的互动和影响</li>
                  <li>关系对双方性格和成长的影响</li>
                </ul>
              </div>
              <LLMPromptInput
                inputType="textarea"
                placeholder="例如：这个角色是主角的大学同学兼竞争对手。他们曾是最好的朋友，但因为对正义的理解不同而渐行渐远。在一次重大事件中，两人站在了对立面，但内心仍保持着某种惺惺相惜。这段关系让主角明白了正义并非非黑即白，也让对手在后来的事件中暗中帮助过主角..."
                buttonText={isLoading ? "生成中..." : "开始生成"}
                disabled={isLoading}
                showAdvancedOptions={true}
                onSubmit={handleGenerate}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 