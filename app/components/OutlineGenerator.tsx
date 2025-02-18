/*
 * @LastEditors: biz
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { NovelOutline } from '../types/novel';
import { toast } from 'sonner';
import { LLMPromptInput } from './LLMPromptInput';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface OutlineGeneratorProps {
  novelId: string;
  developmentDirection: string;
  onOutlineGenerated?: (outline: NovelOutline) => void;
}

export const OutlineGenerator: React.FC<OutlineGeneratorProps> = ({
  novelId,
  developmentDirection,
  onOutlineGenerated
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('generate');

  const handleGenerateOutline = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (!developmentDirection) {
      toast.error('请先填写发展走向');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/novel/${novelId}/outline/structure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: params.provider,
          model: params.model,
          developmentDirection,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '生成大纲失败');
      }

      const outlineData: NovelOutline = await response.json();
      onOutlineGenerated?.(outlineData);
      toast.success('大纲生成成功');
      setActiveTab('preview'); // 生成成功后自动切换到预览标签
    } catch (error) {
      console.error('生成大纲失败:', error);
      toast.error(error instanceof Error ? error.message : '生成大纲失败');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>结构化大纲生成器</CardTitle>
        <CardDescription>
          基于发展走向智能生成完整的小说结构大纲，包含主题、人物、情节等核心要素
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">生成设置</TabsTrigger>
            <TabsTrigger value="preview">大纲预览</TabsTrigger>
          </TabsList>
          
          <TabsContent value="generate" className="space-y-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium">当前发展走向</h4>
              <ScrollArea className="h-[100px] w-full rounded-md border p-2">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {developmentDirection || '暂无发展走向内容'}
                </p>
              </ScrollArea>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">AI</Badge>
                <h4 className="font-medium">智能生成设置</h4>
              </div>
              <LLMPromptInput
                inputType="textarea"
                placeholder="可以输入额外的大纲生成要求，或直接点击生成按钮使用默认设置..."
                buttonText={isGenerating ? "正在生成..." : "生成大纲"}
                disabled={isGenerating || !developmentDirection}
                showAdvancedOptions={true}
                onSubmit={handleGenerateOutline}
              />
              <div className="text-sm text-muted-foreground">
                <p>提示：</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>可以指定特定的主题方向或写作风格</li>
                  <li>可以强调某些情节或人物关系的重要性</li>
                  <li>可以要求特定的结构或节奏安排</li>
                  <li>支持调整生成参数以获得不同的创作效果</li>
                </ul>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="preview" className="mt-4">
            <div className="text-center text-muted-foreground py-8">
              生成的大纲将在这里展示
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}; 