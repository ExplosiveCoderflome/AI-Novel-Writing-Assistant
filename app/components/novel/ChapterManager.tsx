import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Wand2, MoreHorizontal, ArrowUp, ArrowDown, Trash2, Edit } from 'lucide-react';

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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

interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

interface ChapterManagerProps {
  novelId: string;
  chapters: Chapter[];
  onChapterSelect: (chapterId: string) => void;
  onChapterAdd: () => void;
  onChapterGenerate?: () => void;
  selectedChapterId?: string;
}

const ChapterManager: React.FC<ChapterManagerProps> = ({
  novelId,
  chapters,
  onChapterSelect,
  onChapterAdd,
  onChapterGenerate,
  selectedChapterId
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChapters = chapters.filter(chapter =>
    chapter.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>章节管理</CardTitle>
            <CardDescription>
              管理小说的所有章节内容
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {onChapterGenerate && (
              <Button onClick={onChapterGenerate} className="flex items-center gap-1" variant="outline">
                <Wand2 className="w-4 h-4" />
                生成章节
              </Button>
            )}
            <Button onClick={onChapterAdd} className="flex items-center gap-1">
              <Plus className="w-4 h-4" />
              添加章节
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Input
            placeholder="搜索章节..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
          
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredChapters.map((chapter, index) => (
                <React.Fragment key={chapter.id}>
                  {index > 0 && <Separator />}
                  <button
                    onClick={() => onChapterSelect(chapter.id)}
                    className={`w-full px-4 py-2 text-left hover:bg-accent rounded-md transition-colors ${
                      selectedChapterId === chapter.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        第 {chapter.order} 章：{chapter.title}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {chapter.content ? `${chapter.content.length} 字` : '空'}
                      </span>
                    </div>
                  </button>
                </React.Fragment>
              ))}
              {filteredChapters.length === 0 && (
                <div className="text-center text-muted-foreground py-4">
                  {searchQuery ? '未找到匹配的章节' : '暂无章节'}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChapterManager; 