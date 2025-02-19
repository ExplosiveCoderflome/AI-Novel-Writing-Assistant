'use client';

import { useEffect, useState, use } from 'react';
import { GeneratedWorld } from '../../types/world';
import { WorldDisplay } from '../../components/WorldDisplay';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/use-toast';
import { useRouter } from 'next/navigation';

export default function WorldDetailPage({
  params,
}: {
  params: Promise<{ worldId: string }>;
}) {
  const [world, setWorld] = useState<GeneratedWorld | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const resolvedParams = use(params);

  useEffect(() => {
    const fetchWorld = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/worlds/${resolvedParams.worldId}`);
        if (!response.ok) {
          throw new Error('获取世界详情失败');
        }
        const data = await response.json();
        setWorld(data);
      } catch (error) {
        toast({
          title: '加载失败',
          description: error instanceof Error ? error.message : '获取世界详情时发生未知错误',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorld();
  }, [resolvedParams.worldId]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-[200px]" />
            <Skeleton className="h-4 w-[300px] mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!world) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">世界不存在</CardTitle>
            <CardDescription>
              找不到指定的世界设定，可能已被删除。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/worlds')}>返回世界列表</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{world.name}</h1>
          <p className="text-muted-foreground mt-2">
            创建于 {world.createdAt ? new Date(world.createdAt).toLocaleString('zh-CN') : '未知时间'}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/worlds')}>
          返回列表
        </Button>
      </div>
      <WorldDisplay world={world} hideActions />
    </div>
  );
} 