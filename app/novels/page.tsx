/*
 * @LastEditors: biz
 */
'use client';

import { useState, useEffect } from 'react';
import { Novel } from '../api/novel/types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import Link from 'next/link';
import { PlusIcon, EditIcon, TrashIcon } from 'lucide-react';

export default function NovelsPage() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNovels();
  }, []);

  const fetchNovels = async () => {
    try {
      const response = await fetch('/api/novel');
      if (!response.ok) {
        throw new Error('Failed to fetch novels');
      }
      const data = await response.json();
      setNovels(data);
    } catch (error) {
      console.error('获取小说列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNovel = async (id: string) => {
    if (confirm('确定要删除这部小说吗？')) {
      try {
        await fetch(`/api/novel/${id}`, { method: 'DELETE' });
        setNovels(novels.filter(novel => novel.id !== id));
      } catch (error) {
        console.error('删除小说失败:', error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">加载中...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">我的小说</h1>
        <Link href="/novels/create">
          <Button className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            创建新小说
          </Button>
        </Link>
      </div>

      {novels.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">还没有创建任何小说</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {novels.map((novel) => (
            <Card key={novel.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{novel.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">{novel.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                    {novel.genre}
                  </span>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                    {novel.status === 'draft' ? '草稿' : '已发布'}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 mt-auto">
                <Link href={`/novels/${novel.id}/edit`}>
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <EditIcon className="w-4 h-4" />
                    编辑
                  </Button>
                </Link>
                <Button 
                  variant="destructive" 
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => handleDeleteNovel(novel.id)}
                >
                  <TrashIcon className="w-4 h-4" />
                  删除
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}