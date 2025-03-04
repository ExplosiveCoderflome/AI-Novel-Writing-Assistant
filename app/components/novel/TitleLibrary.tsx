'use client';

import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../../components/ui/table';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '../../components/ui/card';
import { 
  Pagination, 
  PaginationContent, 
  PaginationEllipsis, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '../../components/ui/pagination';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Search, Star, Trash2, Clock, RefreshCw, Check } from 'lucide-react';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '../../components/ui/tooltip';
import { toast } from '../../components/ui/use-toast';
import { GenreSelector } from '../GenreSelector';
import { NovelGenre } from '../../api/novel/types';

// 标题库项目的类型
interface TitleLibraryItem {
  id: string;
  title: string;
  description?: string;
  clickRate?: number;
  keywords?: string;
  genreId?: string;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
}

// 分页信息类型
interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface TitleLibraryProps {
  onSelectTitle: (title: string) => void;
}

export function TitleLibrary({ onSelectTitle }: TitleLibraryProps) {
  const [titles, setTitles] = useState<TitleLibraryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [genreId, setGenreId] = useState<string>('');
  const [genres, setGenres] = useState<NovelGenre[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

  // 获取标题列表
  const fetchTitles = async (page = 1, searchTerm = search, genre = genreId) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      query.append('page', page.toString());
      query.append('pageSize', pagination.pageSize.toString());
      
      if (searchTerm) {
        query.append('search', searchTerm);
      }
      
      if (genre) {
        query.append('genreId', genre);
      }
      
      const response = await fetch(`/api/title-library?${query.toString()}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '获取标题库失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setTitles(data.titles);
        setPagination(data.pagination);
      } else {
        throw new Error(data.error || '获取标题库失败');
      }
    } catch (error) {
      console.error('获取标题库失败:', error);
      toast({
        title: '获取标题库失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 获取类型列表
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

  // 删除标题
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个标题吗？')) return;
    
    try {
      const response = await fetch(`/api/title-library/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除标题失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: '删除成功',
          description: '标题已从库中移除',
        });
        
        // 重新获取列表
        fetchTitles(pagination.page);
      } else {
        throw new Error(data.error || '删除标题失败');
      }
    } catch (error) {
      console.error('删除标题失败:', error);
      toast({
        title: '删除标题失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    }
  };

  // 使用标题
  const handleUseTitle = async (title: string, id: string) => {
    try {
      // 设置选中的标题
      setSelectedTitle(title);
      onSelectTitle(title);
      
      // 更新标题使用次数
      const titleItem = titles.find(t => t.id === id);
      if (titleItem) {
        const response = await fetch(`/api/title-library/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            usedCount: (titleItem.usedCount || 0) + 1,
          }),
        });
        
        if (!response.ok) {
          console.error('更新标题使用次数失败');
        }
      }
      
      toast({
        title: '已选择标题',
        description: `已选择标题：${title}`,
      });
    } catch (error) {
      console.error('使用标题失败:', error);
    }
  };

  // 处理搜索
  const handleSearch = () => {
    fetchTitles(1, search, genreId);
  };

  // 处理类型变更
  const handleGenreChange = (value: string) => {
    setGenreId(value);
    fetchTitles(1, search, value);
  };

  // 处理页码变更
  const handlePageChange = (page: number) => {
    fetchTitles(page, search, genreId);
  };

  // 初始化
  useEffect(() => {
    fetchGenres();
    fetchTitles();
  }, []);

  // 渲染分页控件
  const renderPagination = () => {
    const { page, totalPages } = pagination;
    
    if (totalPages <= 1) return null;
    
    return (
      <Pagination className="mt-4">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              onClick={() => page > 1 && handlePageChange(page - 1)}
              className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>
          
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = i + 1;
            return (
              <PaginationItem key={i}>
                <PaginationLink 
                  isActive={page === pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className="cursor-pointer"
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            );
          })}
          
          {totalPages > 5 && (
            <>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink 
                  onClick={() => handlePageChange(totalPages)}
                  className="cursor-pointer"
                >
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            </>
          )}
          
          <PaginationItem>
            <PaginationNext 
              onClick={() => page < totalPages && handlePageChange(page + 1)}
              className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>我的标题库</CardTitle>
        <CardDescription>
          管理您保存的标题收藏，随时调用
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="title-search">搜索标题</Label>
              <div className="flex mt-1">
                <Input
                  id="title-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="输入标题关键词"
                  className="rounded-r-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button 
                  variant="default" 
                  className="rounded-l-none"
                  onClick={handleSearch}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="genre-filter">按类型筛选</Label>
              <GenreSelector
                value={genreId}
                onChange={handleGenreChange}
                genres={genres}
                placeholder="选择小说类型"
              />
            </div>
            
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearch('');
                  setGenreId('');
                  fetchTitles(1, '', '');
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                重置筛选
              </Button>
            </div>
          </div>
          
          <ScrollArea className="h-[400px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>点击率</TableHead>
                  <TableHead>使用次数</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {titles.length > 0 ? (
                  titles.map((title) => (
                    <TableRow key={title.id}>
                      <TableCell className="font-medium">
                        {title.title}
                        {selectedTitle === title.title && (
                          <Badge className="ml-2 bg-green-500">已选择</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {title.clickRate ? (
                          <Badge className={`bg-${
                            title.clickRate >= 85 ? 'red' : 
                            title.clickRate >= 70 ? 'orange' : 
                            title.clickRate >= 50 ? 'yellow' : 
                            'gray'
                          }-500`}>
                            {title.clickRate}%
                          </Badge>
                        ) : '未知'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-1 text-muted-foreground" />
                          {title.usedCount || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(title.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleUseTitle(title.title, title.id)}
                                >
                                  <Check className="h-4 w-4 text-green-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>使用此标题</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleDelete(title.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>删除标题</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      {loading ? '加载中...' : '暂无保存的标题'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          
          {renderPagination()}
        </div>
      </CardContent>
    </Card>
  );
} 