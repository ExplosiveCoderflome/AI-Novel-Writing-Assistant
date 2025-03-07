'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Save, Wand2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LLMPromptInput } from '@/components/LLMPromptInput';

// 使用dynamic import动态加载MarkdownEditor组件
const MarkdownEditor = dynamic(() => import('@/components/MarkdownEditor'), { ssr: false });

interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

interface ChapterEditorProps {
  novelId: string;
  chapter: Chapter | null;
  onSave: (chapter: Chapter) => Promise<void>;
  isLoading?: boolean;
}

const ChapterEditor: React.FC<ChapterEditorProps> = ({
  novelId,
  chapter,
  onSave,
  isLoading = false
}) => {
  const [editedChapter, setEditedChapter] = useState<Chapter | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('content');

  // 当chapter更新时，更新编辑状态
  useEffect(() => {
    setEditedChapter(chapter);
  }, [chapter]);

  const handleSave = async () => {
    if (!editedChapter) return;
    
    setSaving(true);
    try {
      await onSave(editedChapter);
      toast.success('章节已保存');
    } catch (error) {
      console.error('保存章节失败:', error);
      toast.error('保存章节失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editedChapter) return;
    setEditedChapter({
      ...editedChapter,
      title: e.target.value
    });
  };

  const handleContentChange = (value?: string) => {
    if (!editedChapter) return;
    setEditedChapter({
      ...editedChapter,
      content: value || ''
    });
  };

  const handleAIGenerate = async (llmData: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (!editedChapter) return;
    
    setAiGenerating(true);
    try {
      const response = await fetch('/api/novel/generate-chapter-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          novelId,
          chapterId: editedChapter.id,
          chapterTitle: editedChapter.title,
          chapterOrder: editedChapter.order,
          currentContent: editedChapter.content,
          ...llmData
        }),
      });

      if (!response.ok) {
        throw new Error('生成内容失败');
      }

      const data = await response.json();
      
      if (data.content) {
        setEditedChapter({
          ...editedChapter,
          content: data.content
        });
        toast.success('内容生成成功');
      }
    } catch (error) {
      console.error('AI生成内容失败:', error);
      toast.error('AI生成内容失败');
    } finally {
      setAiGenerating(false);
    }
  };

  if (isLoading || !chapter) {
    return (
      <Card className="w-full h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  if (!editedChapter) {
    return (
      <Card className="w-full h-full">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">请选择一个章节进行编辑</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>章节编辑</CardTitle>
          <CardDescription>
            编辑 第 {editedChapter.order} 章
          </CardDescription>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              保存
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="flex-1 p-6 flex flex-col space-y-4 overflow-hidden">
        <Input
          value={editedChapter.title}
          onChange={handleTitleChange}
          placeholder="章节标题"
          className="text-lg"
        />
        
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col"
        >
          <TabsList className="mb-2">
            <TabsTrigger value="content">内容编辑</TabsTrigger>
            <TabsTrigger value="ai-assist">AI辅助</TabsTrigger>
          </TabsList>
          
          <TabsContent value="content" className="flex-1 h-[calc(100%-3rem)]">
            <MarkdownEditor
              value={editedChapter.content}
              onChange={handleContentChange}
              height={800}
            />
          </TabsContent>
          
          <TabsContent value="ai-assist" className="flex-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>AI内容生成</CardTitle>
                <CardDescription>
                  使用AI帮助生成或优化章节内容
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">当前章节信息</h3>
                    <div className="bg-muted rounded-md p-3 text-sm">
                      <p><strong>标题:</strong> {editedChapter.title}</p>
                      <p><strong>章节序号:</strong> 第 {editedChapter.order} 章</p>
                      <p><strong>当前字数:</strong> {editedChapter.content.length} 字</p>
                    </div>
                  </div>
                  
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium mb-2">AI生成选项</h3>
                    <div className="space-y-4">
                      {aiGenerating ? (
                        <div className="flex items-center justify-center p-4">
                          <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                            <p>AI正在生成内容，请稍候...</p>
                          </div>
                        </div>
                      ) : (
                        <LLMPromptInput 
                          inputType="textarea"
                          buttonText="生成内容"
                          onSubmit={handleAIGenerate}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ChapterEditor; 