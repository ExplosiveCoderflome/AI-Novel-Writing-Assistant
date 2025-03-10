'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { 
  Trash2, Edit, Plus, Book, ArrowDown, ArrowUp, MoreHorizontal,
  FileText, Sparkles
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Chapter } from '@/api/novel/types';

interface ChapterListProps {
  novelId: string;
  chapters: Chapter[];
  onChaptersChange: () => void;
  onGenerateChapters: () => void;
}

const ChapterList: React.FC<ChapterListProps> = ({ 
  novelId, 
  chapters, 
  onChaptersChange,
  onGenerateChapters
}) => {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  // 跳转到章节详情编辑页面
  const handleEditChapter = (chapterId: string) => {
    router.push(`/novels/${novelId}/chapters/${chapterId}`);
  };

  // 删除章节
  const handleDeleteChapter = async (chapterId: string) => {
    try {
      setIsDeleting(chapterId);
      const response = await fetch(`/api/novel/${novelId}/chapters/${chapterId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('删除章节失败');
      }

      toast.success('章节已删除');
      onChaptersChange();
    } catch (error) {
      console.error('删除章节失败:', error);
      toast.error('删除章节失败，请重试');
    } finally {
      setIsDeleting(null);
    }
  };

  // 移动章节顺序
  const handleMoveChapter = async (chapterId: string, direction: 'up' | 'down') => {
    try {
      setIsReordering(true);
      const currentIndex = chapters.findIndex(chapter => chapter.id === chapterId);
      if (currentIndex === -1) return;

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      
      // 检查目标位置是否有效
      if (targetIndex < 0 || targetIndex >= chapters.length) return;
      
      const targetChapter = chapters[targetIndex];
      
      // 交换顺序
      const currentOrder = chapters[currentIndex].order;
      const targetOrder = targetChapter.order;
      
      // 更新当前章节顺序
      await fetch(`/api/novel/${novelId}/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: targetOrder }),
      });
      
      // 更新目标章节顺序
      await fetch(`/api/novel/${novelId}/chapters/${targetChapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: currentOrder }),
      });
      
      toast.success('章节顺序已更新');
      onChaptersChange();
    } catch (error) {
      console.error('更新章节顺序失败:', error);
      toast.error('更新章节顺序失败，请重试');
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>章节列表</CardTitle>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={onGenerateChapters}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            智能生成章节
          </Button>
          <Button
            size="sm"
            onClick={() => router.push(`/novels/${novelId}/chapters/new`)}
          >
            <Plus className="mr-2 h-4 w-4" />
            新增章节
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {chapters.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="mx-auto h-12 w-12 mb-4 opacity-20" />
            <p>尚未创建任何章节</p>
            <p className="text-sm">点击"新增章节"或"智能生成章节"按钮开始创建</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {chapters.map((chapter, index) => (
                <Card key={chapter.id} className="border-l-4 border-l-primary/40">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div 
                        className="flex-1 cursor-pointer" 
                        onClick={() => handleEditChapter(chapter.id)}
                      >
                        <h3 className="font-medium text-lg line-clamp-1">
                          第 {chapter.order} 章：{chapter.title}
                        </h3>
                        {chapter.content && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {chapter.content.substring(0, 150)}...
                          </p>
                        )}
                        <div className="flex items-center mt-2 text-xs text-muted-foreground">
                          <span>{chapter.content ? `${chapter.content.length} 字` : '无内容'}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1 ml-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>章节操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleEditChapter(chapter.id)}>
                              <Edit className="mr-2 h-4 w-4" />
                              编辑章节
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleMoveChapter(chapter.id, 'up')} disabled={index === 0 || isReordering}>
                              <ArrowUp className="mr-2 h-4 w-4" />
                              上移章节
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleMoveChapter(chapter.id, 'down')} disabled={index === chapters.length - 1 || isReordering}>
                              <ArrowDown className="mr-2 h-4 w-4" />
                              下移章节
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  删除章节
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>确认删除章节</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    您确定要删除章节"{chapter.title}"吗？该操作无法撤销。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDeleteChapter(chapter.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {isDeleting === chapter.id ? "删除中..." : "确认删除"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default ChapterList;