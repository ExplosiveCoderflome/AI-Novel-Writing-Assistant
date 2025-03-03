'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import dynamic from 'next/dynamic';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const MarkdownEditor = dynamic(() => import('@/components/MarkdownEditor'), { ssr: false });

interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

interface PageProps {
  params: {
    id: string;
    chapterId: string;
  };
}

export default function ChapterEditPage({ params }: PageProps) {
  const router = useRouter();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const { id: novelId, chapterId } = params;

  const fetchChapter = useCallback(async () => {
    try {
      const response = await fetch(`/api/novel/${novelId}/chapter/${chapterId}`);
      if (!response.ok) {
        throw new Error('获取章节失败');
      }
      const data = await response.json();
      setChapter(data);
    } catch (error) {
      console.error('获取章节失败:', error);
      toast.error('获取章节失败');
    }
  }, [novelId, chapterId]);

  const fetchChapters = useCallback(async () => {
    try {
      const response = await fetch(`/api/novel/${novelId}/chapter`);
      if (!response.ok) {
        throw new Error('获取章节列表失败');
      }
      const data = await response.json();
      setChapters(data);
    } catch (error) {
      console.error('获取章节列表失败:', error);
      toast.error('获取章节列表失败');
    } finally {
      setIsLoading(false);
    }
  }, [novelId]);

  // 初始化数据加载
  useEffect(() => {
    if (!isInitialized && novelId && chapterId) {
      setIsInitialized(true);
      Promise.all([fetchChapter(), fetchChapters()]);
    }
  }, [isInitialized, novelId, chapterId, fetchChapter, fetchChapters]);

  // 章节切换时更新数据
  useEffect(() => {
    if (isInitialized && chapterId) {
      fetchChapter();
    }
  }, [isInitialized, chapterId, fetchChapter]);

  const handleSave = async () => {
    if (!chapter) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/novel/${novelId}/chapter/${chapterId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chapter),
      });

      if (!response.ok) {
        throw new Error('保存章节失败');
      }

      toast.success('章节已保存');
    } catch (error) {
      console.error('保存章节失败:', error);
      toast.error(error instanceof Error ? error.message : '保存章节失败');
    } finally {
      setIsSaving(false);
    }
  };

  const navigateToChapter = useCallback((targetChapterId: string) => {
    if (targetChapterId === chapterId) return;
    router.push(`/novels/${novelId}/chapters/${targetChapterId}`);
  }, [router, novelId, chapterId]);

  const currentChapterIndex = chapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-6 min-h-screen flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            第 {chapter?.order} 章：{chapter?.title || '加载中...'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {chapter?.content ? `${chapter.content.length} 字` : '暂无内容'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => prevChapter && navigateToChapter(prevChapter.id)}
              disabled={!prevChapter}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              上一章
            </Button>
            <Button
              variant="outline"
              onClick={() => nextChapter && navigateToChapter(nextChapter.id)}
              disabled={!nextChapter}
              className="flex items-center gap-1"
            >
              下一章
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
                保存
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6 flex-1">
        {/* 章节列表 */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>章节列表</CardTitle>
            <CardDescription>
              点击章节标题进行切换
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-20rem)]">
              <div className="space-y-2">
                {chapters.map((c, index) => (
                  <React.Fragment key={c.id}>
                    {index > 0 && <Separator />}
                    <button
                      onClick={() => navigateToChapter(c.id)}
                      className={`w-full px-4 py-2 text-left hover:bg-accent rounded-md transition-colors ${
                        c.id === chapterId ? 'bg-accent font-bold' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          第 {c.order} 章：{c.title}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {c.content ? `${c.content.length} 字` : '空'}
                        </span>
                      </div>
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* 编辑区域 */}
        <Card className="col-span-3">
          <CardContent className="p-6">
            <div className="space-y-4">
              <Input
                value={chapter?.title || ''}
                onChange={(e) => setChapter(prev => 
                  prev ? { ...prev, title: e.target.value } : null
                )}
                placeholder="章节标题"
                className="text-lg"
              />
              <div className="h-[calc(100vh-20rem)]">
                <MarkdownEditor
                  value={chapter?.content || ''}
                  onChange={(value: string | undefined) => setChapter(prev => 
                    prev ? { ...prev, content: value || '' } : null
                  )}
                  height={800}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 