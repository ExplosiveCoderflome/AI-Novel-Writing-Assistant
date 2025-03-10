'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import MarkdownEditor from '@/components/MarkdownEditor';
import { LLMPromptInput } from '@/components/LLMPromptInput';

interface ChapterEditorProps {
  params: {
    id: string;
    chapterId: string;
  };
}

const ChapterEditorPage: React.FC<ChapterEditorProps> = ({ params }) => {
  const router = useRouter();
  const { id: novelId, chapterId } = params;
  const isNewChapter = chapterId === 'new';
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [order, setOrder] = useState(1);
  
  // 获取章节详情
  useEffect(() => {
    if (isNewChapter) {
      // 获取最后一章的顺序
      fetch(`/api/novel/${novelId}/chapters`)
        .then(res => res.json())
        .then(chapters => {
          setOrder(chapters.length > 0 ? Math.max(...chapters.map((c: any) => c.order)) + 1 : 1);
          setIsLoading(false);
        })
        .catch(error => {
          console.error('获取章节列表失败:', error);
          toast.error('获取章节信息失败');
          setIsLoading(false);
        });
    } else {
      fetch(`/api/novel/${novelId}/chapters/${chapterId}`)
        .then(res => res.json())
        .then(data => {
          setTitle(data.title);
          setContent(data.content);
          setOrder(data.order);
          setIsLoading(false);
        })
        .catch(error => {
          console.error('获取章节失败:', error);
          toast.error('获取章节信息失败');
          setIsLoading(false);
        });
    }
  }, [novelId, chapterId, isNewChapter]);
  
  // 保存章节
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('请输入章节标题');
      return;
    }
    
    setIsSaving(true);
    try {
      const method = isNewChapter ? 'POST' : 'PUT';
      const url = isNewChapter 
        ? `/api/novel/${novelId}/chapters` 
        : `/api/novel/${novelId}/chapters/${chapterId}`;
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, order }),
      });
      
      if (!response.ok) {
        throw new Error('保存章节失败');
      }
      
      const data = await response.json();
      
      toast.success('章节保存成功');
      
      if (isNewChapter) {
        // 重定向到新创建的章节
        router.push(`/novels/${novelId}/chapters/${data.id}`);
      }
    } catch (error) {
      console.error('保存章节失败:', error);
      toast.error('保存章节失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };
  
  // 使用AI生成章节内容
  const handleGenerateContent = async (llmData: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    setIsGenerating(true);
    
    try {
      // 获取小说基础信息
      const novelResponse = await fetch(`/api/novel/${novelId}`);
      const novelData = await novelResponse.json();
      
      // 获取小说章节列表（用于上下文）
      const chaptersResponse = await fetch(`/api/novel/${novelId}/chapters`);
      const chapters = await chaptersResponse.json();
      
      // 调用AI生成接口
      const response = await fetch('/api/novel/generate-chapter-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          basicInfo: {
            title: novelData.title,
            description: novelData.description,
            genre: novelData.genre?.name
          },
          chapter: {
            title,
            order
          },
          previousChapters: chapters
            .filter((c: any) => c.order < order)
            .slice(-2), // 只取前两章作为上下文
          provider: llmData.provider,
          model: llmData.model,
          prompt: llmData.prompt,
          temperature: llmData.temperature,
          maxTokens: llmData.maxTokens
        }),
      });
      
      if (!response.ok) {
        throw new Error('生成内容失败');
      }
      
      const generatedContent = await response.json();
      setContent(generatedContent.content);
      toast.success('内容生成成功');
    } catch (error) {
      console.error('生成内容失败:', error);
      toast.error('生成内容失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">正在加载章节信息...</span>
      </div>
    );
  }
  
  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => router.push(`/novels/${novelId}/edit`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回小说编辑
        </Button>
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="flex items-center gap-1"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              保存章节
            </>
          )}
        </Button>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{isNewChapter ? '创建新章节' : '编辑章节'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                章节标题
              </label>
              <Input
                id="title"
                placeholder="请输入章节标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            
            <div className="flex flex-col space-y-2">
              <label htmlFor="order" className="text-sm font-medium">
                章节顺序
              </label>
              <Input
                id="order"
                type="number"
                min="1"
                placeholder="章节顺序"
                value={order}
                onChange={(e) => setOrder(parseInt(e.target.value) || 1)}
              />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>章节内容</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              className="flex items-center gap-1"
              disabled={isGenerating || !title}
              onClick={() => document.getElementById('ai-content-generator')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Sparkles className="h-4 w-4" />
              AI生成内容
            </Button>
          </CardHeader>
          <CardContent>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="请输入章节内容..."
              minHeight="500px"
            />
          </CardContent>
        </Card>
        
        <Card id="ai-content-generator">
          <CardHeader>
            <CardTitle>AI内容生成</CardTitle>
          </CardHeader>
          <CardContent>
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin mb-4" />
                <p className="text-lg font-medium">正在生成章节内容...</p>
                <p className="text-muted-foreground">这可能需要一些时间，请耐心等待</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  使用AI帮助生成章节内容。您可以提供一些指导，如情节发展、场景描述或角色互动等。
                </p>
                <LLMPromptInput
                  inputType="textarea" 
                  buttonText="开始生成内容"
                  onSubmit={handleGenerateContent}
                  defaultPrompt={`请为小说章节"${title}"生成详细内容。内容应符合小说风格，推动情节发展。`}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChapterEditorPage; 