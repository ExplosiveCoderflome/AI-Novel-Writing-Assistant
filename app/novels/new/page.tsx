'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { GenreSelector } from '../../components/GenreSelector';
import { toast } from '../../components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { NovelGenre } from '../../api/novel/types';
import { TitleFactory } from '../../components/novel/TitleFactory';

export default function NewNovelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [genres, setGenres] = useState<NovelGenre[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genreId, setGenreId] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !genreId) {
      toast({
        title: '请完善信息',
        description: '标题、简介和类型都是必填项',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/novels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          genreId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '创建失败');
      }

      const data = await response.json();
      
      toast({
        title: '创建成功',
        description: '正在跳转到编辑页面...',
      });

      // 跳转到编辑页面
      router.push(`/novels/${data.id}/edit`);
    } catch (error) {
      console.error('创建小说失败:', error);
      toast({
        title: '创建失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理标题选择
  const handleTitleSelect = (selectedTitle: string) => {
    setTitle(selectedTitle);
    toast({
      title: '标题已选择',
      description: `已选择标题：${selectedTitle}`,
    });
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">创建新小说</h1>
      
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        <div className="xl:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6 sticky top-6">
            <div className="space-y-2">
              <Label htmlFor="title">标题</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="请输入小说标题"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">简介</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请输入小说简介"
                disabled={loading}
                required
                className="min-h-[150px]"
              />
            </div>

            <div className="space-y-2">
              <Label>类型</Label>
              <GenreSelector
                value={genreId}
                onChange={setGenreId}
                genres={genres}
                placeholder="选择小说类型"
              />
            </div>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    创建中...
                  </>
                ) : (
                  '创建'
                )}
              </Button>
            </div>
          </form>
        </div>
        
        <div className="xl:col-span-3">
          <TitleFactory onSelectTitle={handleTitleSelect} initialTitle={title} />
        </div>
      </div>
    </div>
  );
} 