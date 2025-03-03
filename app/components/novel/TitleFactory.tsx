'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from '../../components/ui/use-toast';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { LLMPromptInput } from '../LLMPromptInput';

interface TitleSuggestion {
  title: string;
  clickRate: number;
}

interface TitleFactoryProps {
  onSelectTitle: (title: string) => void;
  initialTitle?: string;
}

export function TitleFactory({ onSelectTitle, initialTitle = '' }: TitleFactoryProps) {
  const [activeTab, setActiveTab] = useState<string>('generate');
  const [keywords, setKeywords] = useState<string>('');
  const [originalTitle, setOriginalTitle] = useState<string>(initialTitle);
  const [loading, setLoading] = useState<boolean>(false);
  const [titles, setTitles] = useState<TitleSuggestion[]>([]);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [titleCount, setTitleCount] = useState<number>(20);
  const [llmParams, setLlmParams] = useState<{
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  } | null>(null);

  // 生成标题
  const generateTitles = async () => {
    if (activeTab === 'generate' && !keywords.trim()) {
      toast({
        title: '请输入关键词',
        description: '需要提供题材/风格/核心梗等关键词',
        variant: 'destructive',
      });
      return;
    }

    if (activeTab === 'adapt' && !originalTitle.trim()) {
      toast({
        title: '请输入原始标题',
        description: '需要提供一个经典小说标题进行改编',
        variant: 'destructive',
      });
      return;
    }

    if (advancedMode && !llmParams) {
      toast({
        title: '请选择AI模型',
        description: '在高级模式下，需要选择一个AI模型',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setTitles([]);

    try {
      const requestBody: any = {
        mode: activeTab,
        keywords: activeTab === 'generate' ? keywords : undefined,
        originalTitle: activeTab === 'adapt' ? originalTitle : undefined,
        titleCount: titleCount,
      };

      // 如果是高级模式，添加模型参数
      if (advancedMode && llmParams) {
        requestBody.provider = llmParams.provider;
        requestBody.model = llmParams.model;
        requestBody.temperature = llmParams.temperature;
        requestBody.maxTokens = llmParams.maxTokens;
      }

      const response = await fetch('/api/novels/title-generator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '生成标题失败');
      }

      const data = await response.json();
      
      if (data.success && Array.isArray(data.titles)) {
        // 按点击率排序
        const sortedTitles = [...data.titles].sort((a, b) => b.clickRate - a.clickRate);
        setTitles(sortedTitles);
      } else {
        throw new Error('返回数据格式错误');
      }
    } catch (error) {
      console.error('生成标题失败:', error);
      toast({
        title: '生成标题失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理LLM参数提交
  const handleLLMSubmit = (data: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    setLlmParams({
      provider: data.provider,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
    });
    
    toast({
      title: '已选择模型',
      description: `提供商: ${data.provider}, 模型: ${data.model}`,
    });
  };

  // 选择标题
  const handleSelectTitle = (title: string) => {
    setSelectedTitle(title);
    onSelectTitle(title);
  };

  // 获取点击率对应的颜色
  const getClickRateColor = (rate: number): string => {
    if (rate >= 85) return 'bg-red-500';
    if (rate >= 70) return 'bg-orange-500';
    if (rate >= 50) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>AI标题工厂</CardTitle>
        <CardDescription>
          智能生成吸引人的小说标题，预测点击率
        </CardDescription>
        <div className="flex items-center gap-2 mt-2">
          <Badge className="bg-blue-500">智能熔断</Badge>
          <span className="text-xs text-gray-500">防止连续生成相似标题</span>
        </div>
        <div className="flex items-center space-x-2 mt-2">
          <input
            id="advanced-mode"
            type="checkbox"
            checked={advancedMode}
            onChange={() => setAdvancedMode(!advancedMode)}
            className="h-4 w-4"
            aria-label="启用高级模式"
            title="启用高级模式"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setAdvancedMode(!advancedMode);
              }
            }}
          />
          <Label 
            htmlFor="advanced-mode" 
            className="cursor-pointer"
          >
            高级模式
          </Label>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">关键词生成</TabsTrigger>
            <TabsTrigger value="adapt">爆款改编器</TabsTrigger>
          </TabsList>
          
          <TabsContent value="generate" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="keywords">输入关键词（题材/风格/核心梗）</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="如：修真/仙侠/逆袭"
                disabled={loading}
              />
              <p className="text-sm text-gray-500">
                多个关键词用斜杠分隔，越具体效果越好
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="adapt" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="originalTitle">输入经典书名</Label>
              <Input
                id="originalTitle"
                value={originalTitle}
                onChange={(e) => setOriginalTitle(e.target.value)}
                placeholder="如：斗破苍穹"
                disabled={loading}
              />
              <p className="text-sm text-gray-500">
                输入知名小说标题，AI将生成变异版本
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="title-count">生成标题数量: {titleCount}</Label>
            <span className="text-sm text-gray-500">
              建议: 数量越多，生成时间越长
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Input
              id="title-count"
              type="range"
              min="5"
              max="50"
              step="5"
              value={titleCount}
              onChange={(e) => setTitleCount(Number(e.target.value))}
              className="flex-1"
              disabled={loading}
            />
            <Input
              type="number"
              min="5"
              max="50"
              step="5"
              value={titleCount}
              onChange={(e) => {
                const val = Number(e.target.value);
                setTitleCount(Math.min(Math.max(val, 5), 50));
              }}
              className="w-20"
              disabled={loading}
            />
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-md text-sm border border-blue-200">
          <h4 className="font-medium text-blue-700 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            智能熔断技术
          </h4>
          <p className="mt-1 text-blue-600">
            我们的AI标题生成器配备了相似度熔断机制，当连续3个标题相似度超过60%时，会自动切换创新维度，确保生成多样化的标题。
          </p>
          <ul className="mt-2 space-y-1 text-blue-600 list-disc pl-4">
            <li>自动切换创新维度（结构、主题、情感、视角）</li>
            <li>多元化标题类型（冲突型、悬疑型、世界观型等）</li>
            <li>为您提供多种风格选择，增加标题吸引力</li>
          </ul>
        </div>

        {advancedMode && (
          <div className="mt-4 border rounded-md p-4">
            <h3 className="text-sm font-medium mb-2">高级设置</h3>
            <LLMPromptInput
              inputType="input"
              buttonText="选择模型"
              disabled={loading}
              onSubmit={handleLLMSubmit}
            />
            {llmParams && (
              <div className="mt-2 text-sm">
                <p>已选择: {llmParams.provider} / {llmParams.model}</p>
                <p>温度: {llmParams.temperature}, 最大Tokens: {llmParams.maxTokens}</p>
              </div>
            )}
          </div>
        )}

        <Button 
          onClick={generateTitles} 
          className="w-full mt-4" 
          disabled={loading || (advancedMode && !llmParams)}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              生成{titleCount}个标题中...
            </>
          ) : (
            `生成${titleCount}个标题`
          )}
        </Button>

        {titles.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">标题建议（{titles.length}）</h3>
            <ScrollArea className="h-[300px] rounded-md border p-4">
              <div className="grid grid-cols-1 gap-2">
                {titles.map((item, index) => (
                  <TooltipProvider key={index}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className={`p-3 rounded-md border cursor-pointer transition-all hover:border-primary ${
                            selectedTitle === item.title ? 'border-primary bg-primary/10' : ''
                          }`}
                          onClick={() => handleSelectTitle(item.title)}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{item.title}</span>
                            <Badge className={`${getClickRateColor(item.clickRate)}`}>
                              {item.clickRate}%
                            </Badge>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>点击率预测：{item.clickRate}%</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <p className="text-sm text-gray-500">
          选择一个标题后点击确认使用
        </p>
        <Button 
          variant="outline" 
          onClick={() => selectedTitle && onSelectTitle(selectedTitle)}
          disabled={!selectedTitle}
        >
          确认使用
        </Button>
      </CardFooter>
    </Card>
  );
} 