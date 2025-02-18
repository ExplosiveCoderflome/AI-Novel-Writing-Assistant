'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Loader2 } from 'lucide-react';
import { Novel } from './api/novel/types';

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    fetchNovels();
  }, []);

  const fetchNovels = async () => {
    try {
      const response = await fetch('/api/novels');
      if (!response.ok) throw new Error('获取小说列表失败');
      const data = await response.json();
      setNovels(data);
    } catch (error) {
      console.error('获取小说列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNovel = () => {
    router.push('/novels/new');
  };

  // 在客户端初始化完成前不渲染内容
  if (!isClient) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6" suppressHydrationWarning>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">我的小说</h1>
        <Button onClick={handleCreateNovel}>创建新小说</Button>
      </div>

      {novels.length === 0 ? (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-4">开始你的创作之旅</h2>
          <p className="text-gray-500 mb-6">
            创建你的第一部小说，让AI助手帮助你完成创作。
          </p>
          <Button onClick={handleCreateNovel} size="lg">
            立即创建
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {novels.map((novel) => (
            <Card key={novel.id} className="p-4">
              <div className="flex flex-col h-full">
                <h3 className="text-xl font-semibold mb-2">{novel.title}</h3>
                <p className="text-gray-500 mb-4 flex-grow">
                  {novel.description || '暂无简介'}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">
                    {novel.status === 'published' ? '已发布' : '草稿'}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/novels/${novel.id}/edit`)}
                  >
                    继续创作
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
