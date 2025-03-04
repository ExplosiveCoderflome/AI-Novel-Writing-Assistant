'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import { Loader2, BookmarkPlus, Save } from 'lucide-react';
import { toast } from '../../components/ui/use-toast';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { LLMPromptInput } from '../LLMPromptInput';
import { GenreSelector } from '../GenreSelector';
import { NovelGenre } from '../../api/novel/types';
import { TitleLibrary } from './TitleLibrary';

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
  const [genres, setGenres] = useState<NovelGenre[]>([]);
  const [genreId, setGenreId] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<NovelGenre | null>(null);
  const [llmParams, setLlmParams] = useState<{
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  } | null>(null);
  const [savingTitle, setSavingTitle] = useState<string | null>(null);

  // 获取小说类型列表
  useEffect(() => {
    fetchGenres();
  }, []);

  const fetchGenres = async () => {
    try {
      const response = await fetch('/api/genres');
      if (!response.ok) throw new Error('获取类型列表失败');
      const data = await response.json();
      setGenres(data);
    } catch (error) {
      console.error('获取类型列表失败:', error);
      toast({
        title: '获取类型列表失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  // 根据ID查找类型名称
  const findGenreById = (id: string): NovelGenre | null => {
    // 由于NovelGenre类型不包含children属性，改为在平面数组中查找
    if (!genres || genres.length === 0) return null;
    
    return genres.find(genre => genre.id === id) || null;
  };

  // 当类型ID变化时，更新选中的类型
  useEffect(() => {
    if (genreId) {
      const genre = findGenreById(genreId);
      setSelectedGenre(genre);
    } else {
      setSelectedGenre(null);
    }
  }, [genreId, genres]);

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

      // 添加类型信息到请求中
      if (selectedGenre) {
        requestBody.genre = {
          id: selectedGenre.id,
          name: selectedGenre.name,
          description: selectedGenre.description
        };
      }

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

  // 保存标题到标题库
  const saveToLibrary = async (title: TitleSuggestion) => {
    setSavingTitle(title.title);
    
    try {
      const response = await fetch('/api/title-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.title,
          clickRate: title.clickRate,
          genreId: selectedGenre?.id,
          keywords: activeTab === 'generate' ? keywords : undefined,
          description: activeTab === 'adapt' ? `改编自: ${originalTitle}` : undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '保存标题失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: '保存成功',
          description: '标题已添加到您的标题库',
        });
      } else {
        throw new Error(data.error || '保存标题失败');
      }
    } catch (error) {
      console.error('保存标题失败:', error);
      toast({
        title: '保存标题失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setSavingTitle(null);
    }
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate">关键词生成</TabsTrigger>
            <TabsTrigger value="adapt">爆款改编器</TabsTrigger>
            <TabsTrigger value="library">我的标题库</TabsTrigger>
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
          
          <TabsContent value="library" className="mt-4">
            <TitleLibrary onSelectTitle={handleSelectTitle} />
          </TabsContent>
        </Tabs>

        {activeTab !== 'library' && (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="genre-selector">选择小说类型（可选）</Label>
              <GenreSelector
                value={genreId}
                onChange={setGenreId}
                genres={genres}
                placeholder="选择小说类型以提高标题精准度"
                disabled={loading}
              />
              <p className="text-sm text-gray-500">
                选择特定类型可以让AI更好地理解你需要的标题风格
              </p>
            </div>

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
                disabled={loading}
              />
              <span className="w-8 text-center">{titleCount}</span>
            </div>

            {advancedMode && (
              <div className="mt-6 p-4 border rounded-md">
                <h3 className="text-sm font-medium mb-2">高级AI设置</h3>
                <LLMPromptInput onSubmit={handleLLMSubmit} />
              </div>
            )}

            <div className="flex justify-center mt-6">
              <Button 
                onClick={generateTitles} 
                disabled={loading}
                size="lg"
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>生成{titleCount}个标题</>
                )}
              </Button>
            </div>

            {titles.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">生成结果</h3>
                <ScrollArea className="h-[300px] rounded-md border p-4">
                  <div className="space-y-3">
                    {titles.map((title, index) => (
                      <div 
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-md hover:bg-accent ${selectedTitle === title.title ? 'bg-accent' : ''}`}
                      >
                        <div className="flex items-center gap-2 flex-1" onClick={() => handleSelectTitle(title.title)}>
                          <Badge className={getClickRateColor(title.clickRate)}>
                            {title.clickRate}%
                          </Badge>
                          <span className="font-medium cursor-pointer">{title.title}</span>
                          {selectedTitle === title.title && (
                            <Badge variant="outline" className="ml-1">已选择</Badge>
                          )}
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => saveToLibrary(title)}
                                disabled={savingTitle === title.title}
                              >
                                {savingTitle === title.title ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <BookmarkPlus className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>保存到标题库</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 