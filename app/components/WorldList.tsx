import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { GeneratedWorld } from '../types/world';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { toast } from './ui/use-toast';
import { useRouter } from 'next/navigation';

export function WorldList() {
  const [worlds, setWorlds] = useState<GeneratedWorld[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const fetchWorlds = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/worlds');
      if (!response.ok) {
        throw new Error('获取世界列表失败');
      }
      const data = await response.json();
      setWorlds(data);
    } catch (error) {
      toast({
        title: '加载失败',
        description: error instanceof Error ? error.message : '获取世界列表时发生未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorlds();
  }, []);

  const handleDelete = async (worldId: string | undefined) => {
    if (!worldId) return;
    
    try {
      const response = await fetch(`/api/worlds/${worldId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('删除世界失败');
      }

      toast({
        title: '删除成功',
        description: '世界已成功删除',
      });

      // 重新获取世界列表
      fetchWorlds();
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除世界时发生未知错误',
        variant: 'destructive',
      });
    }
  };

  const handleViewDetails = (worldId: string | undefined) => {
    if (!worldId) return;
    router.push(`/worlds/${worldId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-[300px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (worlds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>暂无保存的世界</CardTitle>
          <CardDescription>
            你还没有保存任何世界设定，请先生成并保存一个世界。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-4 pr-4">
        {worlds.map((world) => (
          <Card key={world.id}>
            <CardHeader>
              <CardTitle>{world.name}</CardTitle>
              <CardDescription>
                创建于 {world.createdAt ? new Date(world.createdAt).toLocaleString('zh-CN') : '未知时间'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{world.description}</p>
            </CardContent>
            <CardFooter className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => handleDelete(world.id)}
              >
                删除
              </Button>
              <Button onClick={() => handleViewDetails(world.id)}>
                查看详情
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
} 