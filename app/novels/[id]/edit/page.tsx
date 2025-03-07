'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Novel, Chapter, NovelGenre } from '../../../api/novel/types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import MarkdownEditor from '../../../components/MarkdownEditor';
import { PromptInput } from '../../../components/PromptInput';
import { useSession } from 'next-auth/react';
import { Textarea } from '../../../components/ui/textarea';
import { GenreSelector } from '../../../components/GenreSelector';
import { LLMPromptInput } from '../../../components/LLMPromptInput';
import { OutlineGenerator } from '@/components/OutlineGenerator';
import { NovelOutline } from '@/types/novel';
import { Toaster } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import ChapterGenerator from '@/components/novel/ChapterGenerator';

// 定义组件的 Props 类型
interface BasicInfoProps {
  title: string;
  description: string;
  genreId: string;
  loading: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onGenreChange: (value: string) => void;
}

interface DevelopmentDirectionProps {
  novelId: string;
  outline: string;
  onOutlineChange: (value: string) => void;
  onSave: () => void;
}

interface StructuredOutlineProps {
  novelId: string;
  developmentDirection: string;
  onOutlineGenerated: (outline: NovelOutline) => void;
}

interface ChapterManagerProps {
  novelId: string;
  chapters: Chapter[];
  onChapterSelect: (chapterId: string) => void;
  onChapterAdd: () => void;
  onChapterGenerate?: () => void;
  selectedChapterId?: string;
}

// 动态导入组件
const BasicInfo = dynamic(() => import('@/components/novel/BasicInfo'), { ssr: false });
const DevelopmentDirection = dynamic(() => import('@/components/novel/DevelopmentDirection'), { ssr: false });
const StructuredOutline = dynamic(() => import('@/components/novel/StructuredOutline'), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
});
const ChapterManager = dynamic(() => import('@/components/novel/ChapterManager'), { ssr: false });

// 添加 ResizeHandle 组件
const ResizeHandle = ({ onResize }: { onResize: (width: number) => void }) => {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    const rightPanel = handleRef.current?.nextElementSibling as HTMLElement;
    startWidth.current = rightPanel?.offsetWidth || 0;
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(Math.max(startWidth.current + delta, 300), 800);
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onResize]);

  return (
    <div
      ref={handleRef}
      className="w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize transition-colors"
      onMouseDown={handleMouseDown}
    />
  );
};

interface PageParams {
  params: Promise<{ id: string }>;
}

interface GenerateOutlineParams {
  provider: string;
  model: string;
  prompt: string;
}

interface GenerateResponse {
  content?: string;
  error?: string;
}

export default function EditNovelPage({ params }: PageParams) {
  const { id } = React.use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [novel, setNovel] = useState<Novel & { genre?: NovelGenre } | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [promptContent, setPromptContent] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [outlineData, setOutlineData] = useState<any>(null);
  const [isSavingOutline, setIsSavingOutline] = useState(false);
  const [genres, setGenres] = useState<NovelGenre[]>([]);
  const [useExistingOutline, setUseExistingOutline] = useState(false);
  const [developmentDirection, setDevelopmentDirection] = useState('');
  const [structuredOutline, setStructuredOutline] = useState<NovelOutline | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>();
  const [tabValue, setTabValue] = useState('basic');
  const [showChapterGenerator, setShowChapterGenerator] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  useEffect(() => {
    if (id) {
      fetchNovel();
      fetchGenres();
    }
  }, [id]);

  // 确保大纲数据更新后进行日志记录
  useEffect(() => {
    if (structuredOutline) {
      console.log('页面组件中的大纲数据已更新:', structuredOutline);
    }
  }, [structuredOutline]);

  const fetchNovel = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/novel/${id}`);
      if (!response.ok) {
        throw new Error('获取小说失败');
      }

      const data = await response.json();
      console.log('加载小说数据:', {
        id: data.id,
        title: data.title,
        hasOutline: !!data.outline,
        hasStructuredOutline: !!data.structuredOutline
      });
      
      setNovel(data);
      setTitle(data.title);
      setDescription(data.description);
      setGenre(data.genre?.id || '');

      // 尝试解析结构化大纲数据
      if (data.structuredOutline) {
        try {
          console.log('结构化大纲原始数据类型:', typeof data.structuredOutline);
          const parsedOutline = JSON.parse(data.structuredOutline);
          console.log('加载已保存的结构化大纲:', parsedOutline);
          setStructuredOutline(parsedOutline);
        } catch (e) {
          console.error('解析结构化大纲失败:', e);
        }
      } else {
        console.log('小说没有保存的结构化大纲数据');
        // 尝试从专门的API获取结构化大纲
        fetchStructuredOutline();
      }
    } catch (error) {
      console.error('获取小说失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 从专门的API获取结构化大纲
  const fetchStructuredOutline = async () => {
    try {
      console.log('从专门API获取结构化大纲');
      const response = await fetch(`/api/novel/${id}/structured-outline`);
      if (!response.ok) {
        throw new Error('获取结构化大纲失败');
      }

      const result = await response.json();
      if (result.success && result.data) {
        console.log('从API获取到结构化大纲:', result.data);
        setStructuredOutline(result.data);
      } else {
        console.log('API返回成功但没有大纲数据');
      }
    } catch (error) {
      console.error('获取结构化大纲失败:', error);
    }
  };

  const fetchGenres = async () => {
    try {
      const response = await fetch('/api/genres');
      if (!response.ok) throw new Error('获取类型列表失败');
      const data = await response.json();
      setGenres(data);
    } catch (error) {
      console.error('获取类型列表失败:', error);
    }
  };

  const handleSaveBasicInfo = async () => {
    if (!novel) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/novel/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          genreId: genre,
        }),
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      toast.success('基本信息已保存');
    } catch (error) {
      console.error('保存基本信息失败:', error);
      toast.error('保存基本信息失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChapter = async () => {
    if (!novel || !currentChapter) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/novel/${novel.id}/chapter/${currentChapter.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentChapter),
      });

      if (!response.ok) {
        throw new Error('Failed to update chapter');
      }

      toast.success('章节内容已更新');

      // 更新本地数据
      setNovel(prev => {
        if (!prev) return null;
        return {
          ...prev,
          chapters: prev.chapters?.map(ch =>
            ch.id === currentChapter.id ? currentChapter : ch
          ) || [],
        };
      });
    } catch (error) {
      console.error('保存章节失败:', error);
      toast.error('无法更新章节内容');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAIAssist = async (type: 'plot' | 'character' | 'style' | 'optimization') => {
    if (!currentChapter) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/novel/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          content: currentChapter.content,
          context: novel?.description,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI suggestions');
      }

      const data = await response.json();
      toast.success('AI 建议已生成');

      // TODO: 显示 AI 建议
    } catch (error) {
      console.error('获取 AI 建议失败:', error);
      toast.error('无法获取 AI 建议');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddChapter = async () => {
    if (!novel) return;

    try {
      const response = await fetch(`/api/novel/${novel.id}/chapter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: '新章节',
          content: '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create chapter');
      }

      const newChapter = await response.json();
      setNovel(prev => {
        if (!prev) return null;
        return {
          ...prev,
          chapters: [...(prev.chapters || []), newChapter],
        };
      });
      setCurrentChapter(newChapter);

      toast.success('新章节已添加');
    } catch (error) {
      console.error('创建章节失败:', error);
      toast.error('无法创建新章节');
    }
  };

  const handleAIGenerateOutline = async (params: GenerateOutlineParams) => {
    if (!title || !genre) {
      toast.error('请先设置小说标题和类型');
      return;
    }

    const selectedGenre = genres.find(g => g.id === genre);
    if (!selectedGenre) {
      toast.error('请选择有效的小说类型');
      return;
    }

    setLoading(true);
    let accumulatedContent = '';
    let accumulatedReasoningContent = '';
    try {
      // 构建提示词，根据开关状态决定是否包含现有大纲
      const existingOutlineContext = useExistingOutline && novel?.outline 
        ? `现有发展走向内容：\n${novel.outline}\n\n请基于以上现有发展走向进行优化和完善，保持原有的优秀内容，补充或修正不足之处。\n\n` 
        : '';

      const fullPrompt = `请根据以下信息梳理一个完整的小说发展走向：

标题：${title}
类型：${selectedGenre.name}
${description ? `简介：${description}\n` : ''}
${existingOutlineContext}用户需求：${params.prompt}

要求：
1. 明确故事的核心主题和情感基调
2. 描述主要人物的成长与改变轨迹
3. 规划主要矛盾冲突的递进与升级
4. 设计关键转折点和高潮情节
5. 符合${selectedGenre.name}类型的特点
6. 注重情节的合理性和因果关系
7. 保持故事节奏的张弛有度
${useExistingOutline ? '8. 在现有发展走向的基础上进行优化，保留合理的部分\n9. 对不合理或不完善的部分进行修正和补充' : ''}

请从以下几个方面详细描述故事发展走向：

1. 核心主题
- 故事要表达的核心思想
- 情感基调的变化走向

2. 人物发展
- 主要人物的性格转变
- 重要关系的演变

3. 矛盾冲突
- 核心矛盾的递进过程
- 次要矛盾的交织影响

4. 关键节点
- 重要转折点的设置
- 高潮情节的铺垫

5. 情节走向
- 主线剧情的发展脉络
- 重要支线的切入时机`;
      console.log('小说发展走向提示词：', fullPrompt);
      const response = await fetch(`/api/novel/${id}/outline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: params.provider,
          model: params.model,
          prompt: fullPrompt
        })
      });

      if (!response.ok) {
        const errorData: GenerateResponse = await response.json();
        throw new Error(errorData.error || '生成失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法创建响应流读取器');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          buffer += decoder.decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              
              if (jsonStr === '[DONE]') {
                continue;
              }

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                const reasoningContent = parsed.choices?.[0]?.delta?.reasoning_content;
                
                if (content) {
                  accumulatedContent += content;
                  setNovel(prev => prev ? { ...prev, outline: accumulatedContent } : null);
                }

                if (reasoningContent) {
                  accumulatedReasoningContent += reasoningContent;
                  setNovel(prev => prev ? { 
                    ...prev, 
                    outline: prev.outline,
                    reasoningContent: accumulatedReasoningContent 
                  } : null);
                }
              } catch (e) {
                console.warn('解析数据块失败:', e, jsonStr);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      toast.success('大纲生成成功');
    } catch (error) {
      console.error('生成大纲时出错:', error);
      toast.error('生成大纲失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOutline = async () => {
    if (!novel) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/novel/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outline,
        }),
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      toast.success('大纲已保存');
    } catch (error) {
      console.error('保存大纲失败:', error);
      toast.error('保存大纲失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStructuredOutline = async (outline: NovelOutline) => {
    if (!novel) return;
    
    try {
      console.log('保存结构化大纲:', outline);
      
      const response = await fetch(`/api/novel/${id}/structured-outline`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          structuredOutline: outline
        }),
      });

      if (!response.ok) {
        throw new Error('保存结构化大纲失败');
      }

      setStructuredOutline(outline);
      
      toast.success('结构化大纲已更新');
    } catch (error) {
      console.error('保存结构化大纲失败:', error);
      throw error; // 将错误传递给组件处理
    }
  };

  const handleOutlineGenerated = (outline: NovelOutline) => {
    console.log('接收到大纲数据:', outline);
    setStructuredOutline(outline);
    // 保持在当前标签，不跳转到chapters
    // setTabValue('chapters');
  };

  const handleChapterSelect = (chapterId: string) => {
    setSelectedChapterId(chapterId);
  };

  const handleGenerateChapters = () => {
    setShowChapterGenerator(true);
  };

  const handleChaptersGenerated = async (newChapters: Chapter[]) => {
    await fetchChapters();
    toast.success(`成功添加 ${newChapters.length} 个章节`);
  };

  const fetchChapters = async () => {
    try {
      const response = await fetch(`/api/novel/${id}/chapters`);
      if (!response.ok) throw new Error('获取章节列表失败');
      const data = await response.json();
      setChapters(data);
    } catch (error) {
      console.error('获取章节列表失败:', error);
      toast.error('获取章节列表失败');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">未找到小说</h1>
          <Button onClick={() => router.push('/novels')}>返回列表</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6" suppressHydrationWarning>
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{novel.title}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/novels/${novel.id}/characters`)}
          >
            角色管理
          </Button>
        </div>
      </div>

      <Tabs value={tabValue} onValueChange={setTabValue}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">基本信息</TabsTrigger>
          <TabsTrigger value="development">发展走向</TabsTrigger>
          <TabsTrigger value="outline">结构大纲</TabsTrigger>
          <TabsTrigger value="chapters">章节管理</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <BasicInfo
            title={novel.title || ''}
            description={novel.description || ''}
            genreId={novel.genre?.id || ''}
            loading={loading}
            onTitleChange={(value) => setTitle(value)}
            onDescriptionChange={(value) => setDescription(value)}
            onGenreChange={(value) => setGenre(value)}
          />
        </TabsContent>

        <TabsContent value="development">
          <DevelopmentDirection
            novelId={novel.id}
            outline={novel.outline || ''}
            onOutlineChange={(value) => setNovel(prev => prev ? { ...prev, outline: value } : null)}
            onSave={handleSaveOutline}
          />
        </TabsContent>

        <TabsContent value="outline">
          <div className="space-y-4">
            {structuredOutline && (
              <div className="bg-green-50 p-3 rounded-md mb-4">
                <p className="font-medium text-green-800">✅ 大纲已成功生成！</p>
                <p className="text-sm text-green-700">
                  您可以在下方继续生成新的大纲，或切换到"章节管理"标签查看和使用生成的大纲。
                </p>
                <div className="text-xs mt-2 text-gray-500">
                  调试信息: 大纲数据已加载，包含核心设定: {structuredOutline.core ? '✅' : '❌'}
                </div>
              </div>
            )}
            <StructuredOutline
              novelId={novel.id}
              developmentDirection={novel.outline || ''}
              onOutlineGenerated={handleOutlineGenerated}
              onSave={handleSaveStructuredOutline}
              savedOutline={structuredOutline}
              onDevelopmentDirectionChange={(value) => {
                setNovel(prev => prev ? { ...prev, outline: value } : null);
                setDevelopmentDirection(value);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="chapters" className="flex-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <ChapterManager
                novelId={id}
                chapters={novel.chapters || []}
                onChapterSelect={handleChapterSelect}
                onChapterAdd={handleAddChapter}
                onChapterGenerate={handleGenerateChapters}
                selectedChapterId={selectedChapterId}
              />
            </div>
            <div className="md:col-span-2">
              {/* 章节编辑器 */}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ChapterGenerator
        open={showChapterGenerator}
        onOpenChange={setShowChapterGenerator}
        id={id}
        basicInfo={novel ? { 
          title: novel.title, 
          description: novel.description || '',
          genre: genres.find(g => g.id === genre)?.name || '' 
        } : undefined}
        characters={novel?.characters || []}
        outline={novel?.structuredOutline}
        developmentDirection={novel?.developmentDirection}
        existingChapters={novel?.chapters || []}
        onChaptersGenerated={handleChaptersGenerated}
      />
    </div>
  );
}
