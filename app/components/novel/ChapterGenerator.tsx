'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LLMPromptInput } from '@/components/LLMPromptInput';
import { toast } from 'sonner';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useFormStatus } from 'react-dom';
import { Chapter as APIChapter, Character as APICharacter } from '@/api/novel/types';

interface NovelInfo {
  title: string;
  description: string;
  genre: string;
}

interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
}

interface OutlineNode {
  id: string;
  type: string;
  content: string;
  children?: OutlineNode[];
}

interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

interface ChapterGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  id: string;
  basicInfo?: NovelInfo;
  characters?: APICharacter[];
  outline?: OutlineNode[];
  developmentDirection?: string;
  existingChapters?: APIChapter[];
  onChaptersGenerated: (chapters: APIChapter[]) => void;
}

const ChapterGenerator: React.FC<ChapterGeneratorProps> = ({
  open,
  onOpenChange,
  id,
  basicInfo,
  characters,
  outline,
  developmentDirection,
  existingChapters = [],
  onChaptersGenerated
}) => {
  const [activeTab, setActiveTab] = useState('settings');
  const [loading, setLoading] = useState(false);
  const [generatedChapters, setGeneratedChapters] = useState<APIChapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 配置选项
  const [chapterCount, setChapterCount] = useState(5);
  const [useCharacters, setUseCharacters] = useState(true);
  const [useOutline, setUseOutline] = useState(true);
  const [useDevelopmentDirection, setUseDevelopmentDirection] = useState(true);
  const [generateContent, setGenerateContent] = useState(false);
  const [detailedContentGeneration, setDetailedContentGeneration] = useState(false);
  
  // 重置状态
  useEffect(() => {
    if (open) {
      setGeneratedChapters([]);
      setSelectedChapters([]);
      setActiveTab('settings');
    }
  }, [open]);

  // 选择/取消选择所有章节
  const toggleAllChapters = () => {
    if (selectedChapters.length === generatedChapters.length) {
      setSelectedChapters([]);
    } else {
      setSelectedChapters(generatedChapters.map(chapter => chapter.id));
    }
  };

  // 切换单个章节选择
  const toggleChapter = (chapterId: string) => {
    if (selectedChapters.includes(chapterId)) {
      setSelectedChapters(selectedChapters.filter(id => id !== chapterId));
    } else {
      setSelectedChapters([...selectedChapters, chapterId]);
    }
  };

  // 生成章节
  const handleGenerateChapters = async (llmData: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    setLoading(true);
    setActiveTab('preview');
    
    try {
      const startChapterNumber = existingChapters.length > 0 
        ? Math.max(...existingChapters.map(c => c.order)) + 1 
        : 1;
        
      // 构建提示词
      const data = {
        id,
        basicInfo,
        characters: useCharacters ? characters : [],
        outline: useOutline ? outline : [],
        developmentDirection: useDevelopmentDirection ? developmentDirection : "",
        chapterCount,
        startChapterNumber,
        generateContent,
        detailedContentGeneration,
        prompt: llmData.prompt,
        provider: llmData.provider,
        model: llmData.model,
        temperature: llmData.temperature,
        maxTokens: llmData.maxTokens
      };

      const response = await fetch('/api/novel/generate-chapters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('章节生成失败');
      }

      const chapters = await response.json();
      setGeneratedChapters(chapters);
      setSelectedChapters(chapters.map(chapter => chapter.id));
    } catch (error) {
      console.error('生成章节失败:', error);
      toast.error('生成章节失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 保存选中的章节
  const handleSaveChapters = async () => {
    if (selectedChapters.length === 0) {
      toast.warning('请至少选择一个章节');
      return;
    }

    setIsSubmitting(true);
    try {
      const chaptersToSave = generatedChapters.filter(chapter => 
        selectedChapters.includes(chapter.id)
      );

      const response = await fetch(`/api/novel/${id}/chapters/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chaptersToSave),
      });

      if (!response.ok) {
        throw new Error('保存章节失败');
      }

      toast.success('章节保存成功');
      onChaptersGenerated(chaptersToSave);
      onOpenChange(false);
    } catch (error) {
      console.error('保存章节失败:', error);
      toast.error('保存章节失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>智能章节生成</DialogTitle>
          <DialogDescription>
            根据小说设定和大纲自动生成章节列表
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="mb-4">
            <TabsTrigger value="settings">配置</TabsTrigger>
            <TabsTrigger value="preview">章节预览</TabsTrigger>
          </TabsList>
          
          <TabsContent value="settings" className="flex-1 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 基本设置 */}
              <Card>
                <CardHeader>
                  <CardTitle>基础设置</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="chapter-count">生成章节数量 (1-20)</Label>
                      <input 
                        id="chapter-count"
                        type="range" 
                        min="1" 
                        max="20" 
                        value={chapterCount} 
                        onChange={(e) => setChapterCount(parseInt(e.target.value))}
                        className="w-full" 
                      />
                      <span className="text-center font-medium">{chapterCount} 章</span>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="use-characters">使用角色信息</Label>
                        <Switch 
                          id="use-characters" 
                          checked={useCharacters} 
                          onCheckedChange={setUseCharacters}
                          disabled={!characters || characters.length === 0}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor="use-outline">使用大纲信息</Label>
                        <Switch 
                          id="use-outline" 
                          checked={useOutline} 
                          onCheckedChange={setUseOutline}
                          disabled={!outline || outline.length === 0}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Label htmlFor="use-direction">使用发展方向</Label>
                        <Switch 
                          id="use-direction" 
                          checked={useDevelopmentDirection} 
                          onCheckedChange={setUseDevelopmentDirection}
                          disabled={!developmentDirection}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* 内容生成设置 */}
              <Card>
                <CardHeader>
                  <CardTitle>内容生成设置</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="generate-content" className="block">同时生成章节内容</Label>
                        <p className="text-sm text-muted-foreground">除了章节标题，还会生成章节内容</p>
                      </div>
                      <Switch 
                        id="generate-content" 
                        checked={generateContent} 
                        onCheckedChange={setGenerateContent}
                      />
                    </div>
                    
                    {generateContent && (
                      <div className="flex items-center justify-between pt-2">
                        <div>
                          <Label htmlFor="detailed-content" className="block">详细内容生成</Label>
                          <p className="text-sm text-muted-foreground">生成更详细的章节内容（消耗更多token）</p>
                        </div>
                        <Switch 
                          id="detailed-content" 
                          checked={detailedContentGeneration} 
                          onCheckedChange={setDetailedContentGeneration}
                        />
                      </div>
                    )}
                    
                    <Separator />
                    
                    <div>
                      <Label className="block mb-2">AI生成设置</Label>
                      <div className="border rounded-md p-4">
                        <LLMPromptInput 
                          inputType="textarea"
                          buttonText="开始生成章节"
                          onSubmit={handleGenerateChapters}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="preview" className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-lg font-medium">正在生成章节...</p>
                  <p className="text-muted-foreground">请耐心等待，这可能需要一些时间</p>
                </div>
              </div>
            ) : generatedChapters.length > 0 ? (
              <div className="space-y-4 flex flex-col h-full">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="select-all" 
                      checked={selectedChapters.length === generatedChapters.length && generatedChapters.length > 0}
                      onCheckedChange={toggleAllChapters}
                    />
                    <Label htmlFor="select-all">
                      {selectedChapters.length === generatedChapters.length 
                        ? '取消全选' 
                        : '选择全部'}
                      （已选 {selectedChapters.length}/{generatedChapters.length}）
                    </Label>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab('settings')}
                  >
                    返回修改配置
                  </Button>
                </div>
                
                <Separator />
                
                <ScrollArea className="flex-1">
                  <div className="space-y-4 pr-4">
                    {generatedChapters.map((chapter) => (
                      <Card key={chapter.id} className={`border-l-4 ${
                        selectedChapters.includes(chapter.id) ? 'border-l-primary' : 'border-l-muted'
                      }`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox 
                              id={`chapter-${chapter.id}`}
                              checked={selectedChapters.includes(chapter.id)}
                              onCheckedChange={() => toggleChapter(chapter.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-2">
                              <div className="flex justify-between items-center">
                                <h3 className="font-medium text-lg">
                                  第 {chapter.order} 章：{chapter.title}
                                </h3>
                                <span className="text-sm text-muted-foreground">
                                  {chapter.content ? `${chapter.content.length} 字` : '无内容'}
                                </span>
                              </div>
                              
                              {chapter.content && (
                                <div className="text-sm text-muted-foreground line-clamp-3 border-l-2 border-muted pl-3">
                                  {chapter.content.substring(0, 200)}...
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Sparkles className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium">尚未生成章节</p>
                  <p className="text-muted-foreground">请先在配置选项卡中设置参数并开始生成</p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSaveChapters}
            disabled={
              selectedChapters.length === 0 || 
              isSubmitting || 
              loading || 
              generatedChapters.length === 0
            }
            className="flex items-center gap-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                保存所选章节
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChapterGenerator; 