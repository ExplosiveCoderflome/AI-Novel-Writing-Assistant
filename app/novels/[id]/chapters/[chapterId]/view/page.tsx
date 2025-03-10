'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, ArrowRight, Settings, Home, BookOpen } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { Card, CardContent } from '../../../../../components/ui/card';
import { Separator } from '../../../../../components/ui/separator';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../../../../components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../../components/ui/dropdown-menu';
import Link from 'next/link';

// 动态导入 Markdown 预览组件以避免 SSR 问题
const MarkdownPreview = dynamic(
  () => import('@uiw/react-markdown-preview').then((mod) => mod.default),
  { ssr: false }
);

interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
  novelId: string;
}

interface Novel {
  id: string;
  title: string;
}

interface ChapterViewPageProps {
  params: {
    id: string;
    chapterId: string;
  };
}

const ChapterViewPage: React.FC<ChapterViewPageProps> = ({ params }) => {
  const router = useRouter();
  const { id: novelId, chapterId } = params;
  
  const [isLoading, setIsLoading] = useState(true);
  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [fontSize, setFontSize] = useState<number>(16);
  const [lineHeight, setLineHeight] = useState<number>(1.8);
  const [prevChapter, setPrevChapter] = useState<Chapter | null>(null);
  const [nextChapter, setNextChapter] = useState<Chapter | null>(null);
  
  // 获取小说信息
  const fetchNovelInfo = async () => {
    try {
      const response = await fetch(`/api/novel/${novelId}`);
      const data = await response.json();
      setNovel(data);
    } catch (error) {
      console.error('获取小说信息失败:', error);
      toast.error('获取小说信息失败');
    }
  };
  
  // 获取章节列表
  const fetchChapters = async () => {
    try {
      const response = await fetch(`/api/novel/${novelId}/chapters`);
      const data = await response.json();
      setChapters(data);
      return data;
    } catch (error) {
      console.error('获取章节列表失败:', error);
      toast.error('获取章节列表失败');
      return [];
    }
  };
  
  // 获取当前章节详情
  const fetchChapter = async () => {
    try {
      const response = await fetch(`/api/novel/${novelId}/chapters/${chapterId}`);
      const data = await response.json();
      setChapter(data);
      return data;
    } catch (error) {
      console.error('获取章节详情失败:', error);
      toast.error('获取章节详情失败');
      return null;
    }
  };
  
  // 加载数据
  useEffect(() => {
    setIsLoading(true);
    
    Promise.all([
      fetchNovelInfo(),
      fetchChapters(),
      fetchChapter()
    ]).finally(() => {
      setIsLoading(false);
    });
  }, [novelId, chapterId]);
  
  // 更新上一章和下一章的信息
  useEffect(() => {
    if (chapters.length > 0 && chapter) {
      const currentIndex = chapters.findIndex(c => c.id === chapter.id);
      
      if (currentIndex > 0) {
        setPrevChapter(chapters[currentIndex - 1]);
      } else {
        setPrevChapter(null);
      }
      
      if (currentIndex < chapters.length - 1) {
        setNextChapter(chapters[currentIndex + 1]);
      } else {
        setNextChapter(null);
      }
    }
  }, [chapters, chapter]);
  
  // 加载本地存储的阅读设置
  useEffect(() => {
    const savedFontSize = localStorage.getItem('reader_fontSize');
    const savedLineHeight = localStorage.getItem('reader_lineHeight');
    
    if (savedFontSize) {
      setFontSize(Number(savedFontSize));
    }
    
    if (savedLineHeight) {
      setLineHeight(Number(savedLineHeight));
    }
  }, []);
  
  // 保存阅读设置到本地存储
  const saveReaderSettings = () => {
    localStorage.setItem('reader_fontSize', fontSize.toString());
    localStorage.setItem('reader_lineHeight', lineHeight.toString());
    toast.success('阅读设置已保存');
  };
  
  // 导航到上一章
  const goToPrevChapter = () => {
    if (prevChapter) {
      router.push(`/novels/${novelId}/chapters/${prevChapter.id}/view`);
    }
  };
  
  // 导航到下一章
  const goToNextChapter = () => {
    if (nextChapter) {
      router.push(`/novels/${novelId}/chapters/${nextChapter.id}/view`);
    }
  };
  
  // 编辑当前章节
  const handleEditChapter = () => {
    router.push(`/novels/${novelId}/chapters/${chapterId}`);
  };
  
  // 加载中显示
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">正在加载章节内容...</span>
      </div>
    );
  }
  
  // 未找到章节
  if (!chapter) {
    return (
      <div className="container py-6">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">未找到章节</h2>
            <p className="text-muted-foreground mb-4">无法加载请求的章节内容</p>
            <Button onClick={() => router.push(`/novels/${novelId}/edit`)}>
              返回小说编辑
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container py-6 max-w-4xl mx-auto">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.push(`/novels/${novelId}/edit`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回小说
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleEditChapter}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            编辑章节
          </Button>
        </div>
        
        <div className="flex items-center space-x-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="mr-2 h-4 w-4" />
                阅读设置
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>阅读设置</SheetTitle>
                <SheetDescription>
                  调整阅读体验以获得最佳阅读效果
                </SheetDescription>
              </SheetHeader>
              
              <div className="py-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    字体大小: {fontSize}px
                  </label>
                  <div className="flex items-center space-x-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setFontSize(prev => Math.max(12, prev - 1))}
                    >
                      -
                    </Button>
                    <input 
                      type="range" 
                      min="12" 
                      max="24" 
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="flex-1"
                      aria-label="字体大小调节"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setFontSize(prev => Math.min(24, prev + 1))}
                    >
                      +
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    行高: {lineHeight.toFixed(1)}
                  </label>
                  <div className="flex items-center space-x-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLineHeight(prev => Math.max(1.2, prev - 0.1))}
                    >
                      -
                    </Button>
                    <input 
                      type="range" 
                      min="1.2" 
                      max="2.5" 
                      step="0.1"
                      value={lineHeight}
                      onChange={(e) => setLineHeight(Number(e.target.value))}
                      className="flex-1"
                      aria-label="行高调节"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setLineHeight(prev => Math.min(2.5, prev + 0.1))}
                    >
                      +
                    </Button>
                  </div>
                </div>
                
                <Button onClick={saveReaderSettings}>
                  保存设置
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <BookOpen className="mr-2 h-4 w-4" />
                章节
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-[400px] overflow-y-auto">
              {chapters.map((ch) => (
                <DropdownMenuItem key={ch.id} asChild>
                  <Link href={`/novels/${novelId}/chapters/${ch.id}/view`}>
                    <span className={`flex-1 ${ch.id === chapterId ? 'font-bold' : ''}`}>
                      第{ch.order}章: {ch.title}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      {/* 章节内容 */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold mb-2 text-center">
            第{chapter.order}章: {chapter.title}
          </h1>
          
          <p className="text-center text-muted-foreground mb-6">
            {novel?.title}
          </p>
          
          <Separator className="my-4" />
          
          <div 
            style={{ 
              fontSize: `${fontSize}px`, 
              lineHeight: lineHeight 
            }}
          >
            {chapter.content ? (
              <MarkdownPreview source={chapter.content} />
            ) : (
              <p className="text-center text-muted-foreground py-8">
                该章节暂无内容
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* 底部导航 */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={goToPrevChapter}
          disabled={!prevChapter}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {prevChapter ? `上一章: ${prevChapter.title}` : '没有上一章'}
        </Button>
        
        <Button
          variant="outline"
          onClick={goToNextChapter}
          disabled={!nextChapter}
        >
          {nextChapter ? `下一章: ${nextChapter.title}` : '没有下一章'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChapterViewPage; 