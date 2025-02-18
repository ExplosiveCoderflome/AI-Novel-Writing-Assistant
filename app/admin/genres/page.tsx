'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from '../../components/ui/use-toast';
import { Loader2, Plus, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { log } from 'console';
import { LLMPromptInput } from '../../components/LLMPromptInput';

interface NovelGenre {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  children: NovelGenre[];
}

interface NestedType {
  name: string;
  description: string;
  children?: NestedType[];
}

export default function GenresPage() {
  const router = useRouter();
  const [genres, setGenres] = useState<NovelGenre[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGenre, setEditingGenre] = useState<NovelGenre | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedGenres, setExpandedGenres] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedGenre, setGeneratedGenre] = useState<NovelGenre | null>(null);
  const [streamContent, setStreamContent] = useState<string>('');
  const [reasoningContent, setReasoningContent] = useState<string>('');
  const [isThinking, setIsThinking] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('deepseek-chat');
  const [nestedTypes, setNestedTypes] = useState<NestedType[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    fetchGenres();
  }, []);

  const fetchGenres = async () => {
    try {
      const response = await fetch('/api/genres');
      if (!response.ok) throw new Error('获取类型列表失败');
      const data = await response.json();
      // 将扁平的类型列表转换为树形结构
      const genreMap = new Map<string, NovelGenre>();
      const rootGenres: NovelGenre[] = [];

      // 首先创建所有类型的映射
      data.forEach((genre: NovelGenre) => {
        genreMap.set(genre.id, { ...genre, children: [] });
      });

      // 然后构建树形结构
      data.forEach((genre: NovelGenre) => {
        const genreWithChildren = genreMap.get(genre.id)!;
        if (genre.parentId) {
          const parent = genreMap.get(genre.parentId);
          if (parent) {
            parent.children.push(genreWithChildren);
          }
        } else {
          rootGenres.push(genreWithChildren);
        }
      });

      setGenres(rootGenres);
    } catch (error) {
      console.error('获取类型列表失败:', error);
      toast({
        title: '获取失败',
        description: '无法加载小说类型列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: '请输入类型名称',
        description: '类型名称不能为空',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // 创建主类型
      const mainResponse = await fetch('/api/genres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, parentId }),
      });

      if (!mainResponse.ok) {
        throw new Error('创建主类型失败');
      }

      const mainGenre = await mainResponse.json();

      // 如果有嵌套类型，递归创建它们
      if (nestedTypes.length > 0) {
        const createNestedTypes = async (parentId: string, types: NestedType[]) => {
          for (const type of types) {
            // 创建子类型
            const response = await fetch('/api/genres', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: type.name,
                description: type.description,
                parentId
              }),
            });

            if (!response.ok) {
              throw new Error(`创建子类型 ${type.name} 失败`);
            }

            const newType = await response.json();

            // 如果还有下一级类型，递归创建
            if (type.children && type.children.length > 0) {
              await createNestedTypes(newType.id, type.children);
            }
          }
        };

        await createNestedTypes(mainGenre.id, nestedTypes);
      }

      toast({
        title: '保存成功',
        description: '小说类型已更新',
      });

      // 重置表单
      setName('');
      setDescription('');
      setParentId(null);
      setEditingGenre(null);
      setNestedTypes([]);
      setIsDialogOpen(false);
      
      // 刷新列表
      fetchGenres();
    } catch (error) {
      console.error('保存失败:', error);
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '无法保存小说类型',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (genre: NovelGenre) => {
    setEditingGenre(genre);
    setName(genre.name);
    setDescription(genre.description);
    setParentId(genre.parentId);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个类型吗？删除后无法恢复，且可能影响已使用该类型的小说。')) return;

    try {
      const response = await fetch(`/api/genres/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('删除失败');

      toast({
        title: '删除成功',
        description: '小说类型已删除',
      });

      fetchGenres();
    } catch (error) {
      toast({
        title: '删除失败',
        description: '无法删除小说类型',
        variant: 'destructive',
      });
    }
  };

  const handleOpenDialog = () => {
    setEditingGenre(null);
    setName('');
    setDescription('');
    setParentId(null);
    setIsDialogOpen(true);
  };

  const toggleGenreExpand = (genreId: string) => {
    const newExpanded = new Set(expandedGenres);
    if (newExpanded.has(genreId)) {
      newExpanded.delete(genreId);
    } else {
      newExpanded.add(genreId);
    }
    setExpandedGenres(newExpanded);
  };

  const renderGenreCard = (genre: NovelGenre, level: number = 0) => {
    const hasChildren = genre.children && genre.children.length > 0;
    const isExpanded = expandedGenres.has(genre.id);

    return (
      <div key={genre.id} style={{ marginLeft: `${level * 1.5}rem` }}>
        <Card className="mb-2">
          <div className="p-3">
            <div className="flex items-center gap-2">
              {hasChildren && (
                <button
                  onClick={() => toggleGenreExpand(genre.id)}
                  className="p-1 hover:bg-accent rounded-md"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm truncate">{genre.name}</h4>
                    {genre.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {genre.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleEdit(genre)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(genre.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
        {hasChildren && isExpanded && (
          <div className="ml-4">
            {genre.children.map(child => renderGenreCard(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleAIGenerate = async (data: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    setIsGenerating(true);
    setStreamContent('');
    setReasoningContent('');
    setGeneratedGenre(null);
    setIsThinking(false);

    const MAX_RETRIES = 3;
    let currentRetry = 0;

    while (currentRetry < MAX_RETRIES) {
      try {
        const response = await fetch('/api/genres/generate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          body: JSON.stringify({ 
            prompt: data.prompt,
            provider: data.provider,
            model: data.model,
            temperature: data.temperature,
            maxTokens: data.maxTokens
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: '请求失败' }));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        // 使用新的方式处理流数据
        const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
        if (!reader) {
          throw new Error('无法创建读取器');
        }

        let accumulatedJson = '';
        let lastUpdateTime = Date.now();

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log('流式响应完成');
              break;
            }

            // 处理数据行
            const lines = value.split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;

              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  console.log('收到完成标记');
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);

                  if (parsed.type === 'reasoning') {
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      setReasoningContent(prev => prev + content);
                      setIsThinking(true);
                    }
                  } else if (parsed.type === 'content') {
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      accumulatedJson += content;
                      setStreamContent(prev => prev + content);
                      lastUpdateTime = Date.now();
                      setIsThinking(false);
                    }
                  }
                } catch (e) {
                  console.error('JSON解析错误:', e);
                }
              }
            }
          }

          // 尝试解析最终的JSON内容
          try {
            // 清理和格式化累积的JSON字符串
            const cleanContent = accumulatedJson.trim()
              .replace(/^```json\s*/, '')
              .replace(/```$/, '')
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .trim();

            if (!cleanContent) {
              throw new Error('生成的内容为空');
            }

            let parsedContent;
            try {
              parsedContent = JSON.parse(cleanContent);
            } catch (e) {
              const fixedContent = cleanContent
                .replace(/,(\s*[}\]])/g, '$1')
                .replace(/([{,]\s*)(\w+):/g, '$1"$2":');
              parsedContent = JSON.parse(fixedContent);
            }

            if (!parsedContent.name || !parsedContent.description) {
              throw new Error('生成的内容缺少必要字段');
            }

            setGeneratedGenre(parsedContent);
            setName(parsedContent.name);
            setDescription(parsedContent.description);
            setParentId(null);

            if (parsedContent.children && parsedContent.children.length > 0) {
              setNestedTypes(parsedContent.children);
            }

            setIsDialogOpen(true);
            toast({
              title: 'AI 生成成功',
              description: '请检查并确认生成的类型结构',
            });

            break;
          } catch (error) {
            console.error('最终内容解析或创建失败:', error);
            toast({
              title: '创建类型失败',
              description: error instanceof Error ? error.message : '生成的内容格式不正确',
              variant: 'destructive',
            });
            throw error;
          }
        } catch (error) {
          console.error('流处理错误:', error);
          throw error;
        } finally {
          reader.releaseLock();
        }

      } catch (error) {
        console.error(`尝试 ${currentRetry + 1}/${MAX_RETRIES} 失败:`, error);
        
        if (currentRetry === MAX_RETRIES - 1) {
          toast({
            title: '生成失败',
            description: error instanceof Error ? error.message : '无法生成类型信息',
            variant: 'destructive',
          });
          break;
        }
        
        currentRetry++;
        await new Promise(resolve => setTimeout(resolve, 1000 * currentRetry));
        continue;
      }
    }

    setIsGenerating(false);
    setIsThinking(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // 在客户端初始化完成前不渲染内容
  if (!isClient) {
    return null;
  }

  const flattenGenres = (genres: NovelGenre[]): NovelGenre[] => {
    return genres.reduce((acc: NovelGenre[], genre) => {
      acc.push(genre);
      if (genre.children && genre.children.length > 0) {
        acc.push(...flattenGenres(genre.children));
      }
      return acc;
    }, []);
  };

  return (
    <div className="container mx-auto p-4" suppressHydrationWarning>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">小说类型管理</h1>
          <p className="text-sm text-muted-foreground">
            管理小说的分类和标签，支持多级分类结构
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenDialog} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              添加类型
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingGenre ? '编辑类型' : '添加新类型'}
              </DialogTitle>
              <DialogDescription>
                填写类型信息，可以选择父级类型来创建多级分类
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex gap-2">
               
                  <LLMPromptInput
                    inputType="textarea"
                    placeholder="输入提示词，描述你想要的小说类型"
                    buttonText="AI 生成"
                    disabled={isGenerating}
                    onSubmit={handleAIGenerate}
                  />
                </div>
                {(reasoningContent || streamContent) && (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 mb-1">
                      <p>AI 生成的类型结构：</p>
                      {isThinking && (
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          深度思考中...
                        </div>
                      )}
                    </div>
                    {reasoningContent && (
                      <div className="relative mt-2 mb-4 border border-border rounded-md bg-muted/50">
                        <div className="max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
                          <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                            {reasoningContent}
                          </pre>
                        </div>
                      </div>
                    )}
                    <div className="relative mt-2 border border-border rounded-md">
                      <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
                        <pre className="p-3 text-xs leading-relaxed whitespace-pre-wrap break-all bg-secondary">
                          {streamContent || '等待生成...'}
                        </pre>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
                    </div>
                  </div>
                )}
                {!isGenerating && generatedGenre && (
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-1">生成结果：</p>
                    <div className="relative mt-2 border border-border rounded-md">
                      <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent">
                        <div className="p-3 space-y-2">
                          <div className="flex flex-col gap-1">
                            <div className="font-medium text-foreground">主类型</div>
                            <div className="pl-4 border-l-2 border-primary">
                              <div className="font-medium">{generatedGenre.name}</div>
                              <div className="text-xs text-muted-foreground">{generatedGenre.description}</div>
                            </div>
                          </div>
                          {generatedGenre.children && generatedGenre.children.length > 0 && (
                            <div className="flex flex-col gap-1">
                              <div className="font-medium text-foreground">子类型</div>
                              <div className="space-y-2">
                                {generatedGenre.children.map((child: any, index: number) => (
                                  <div key={index} className="pl-4 border-l-2 border-secondary">
                                    <div className="font-medium">{child.name}</div>
                                    <div className="text-xs text-muted-foreground">{child.description}</div>
                                    {child.children && child.children.length > 0 && (
                                      <div className="mt-2 pl-4 space-y-2">
                                        {child.children.map((grandChild: any, gIndex: number) => (
                                          <div key={gIndex} className="border-l-2 border-muted pl-2">
                                            <div className="font-medium">{grandChild.name}</div>
                                            <div className="text-xs text-muted-foreground">{grandChild.description}</div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
                    </div>
                  </div>
                )}
                <div className="border-t pt-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium">主类型信息</h3>
                  </div>
                  
                  <div>
                    <Label htmlFor="parent">父级类型</Label>
                    <Select
                      value={parentId || undefined}
                      onValueChange={(value) => setParentId(value === 'none' ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择父级类型（可选）" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无父级类型</SelectItem>
                        {flattenGenres(genres).map((genre) => (
                          <SelectItem 
                            key={genre.id} 
                            value={genre.id}
                            disabled={editingGenre?.id === genre.id}
                          >
                            {genre.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="name">类型名称</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="请输入类型名称"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">描述</Label>
                    <div className="space-y-2">
                      <Input
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="请输入类型描述"
                      />
                 
                    </div>
                  </div>
                </div>

                {nestedTypes.length > 0 && (
                  <div className="border-t pt-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium">子类型信息</h3>
                      <p className="text-sm text-muted-foreground">
                        这些子类型将在主类型创建后自动创建
                      </p>
                    </div>
                    
                    <div className="space-y-4">
                      {nestedTypes.map((type, index) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">子类型 {index + 1}</h4>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newTypes = [...nestedTypes];
                                newTypes.splice(index, 1);
                                setNestedTypes(newTypes);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="space-y-2">
                            <div>
                              <Label>名称</Label>
                              <Input
                                value={type.name}
                                onChange={(e) => {
                                  const newTypes = [...nestedTypes];
                                  newTypes[index] = { ...type, name: e.target.value };
                                  setNestedTypes(newTypes);
                                }}
                                placeholder="子类型名称"
                              />
                            </div>
                            
                            <div>
                              <Label>描述</Label>
                              <Input
                                value={type.description}
                                onChange={(e) => {
                                  const newTypes = [...nestedTypes];
                                  newTypes[index] = { ...type, description: e.target.value };
                                  setNestedTypes(newTypes);
                                }}
                                placeholder="子类型描述"
                              />
                            </div>

                            {type.children && type.children.length > 0 && (
                              <div className="mt-4 pl-4 border-l-2">
                                <h5 className="font-medium mb-2">下级类型</h5>
                                <div className="space-y-4">
                                  {type.children.map((child, childIndex) => (
                                    <div key={childIndex} className="border rounded-lg p-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <h6 className="font-medium">下级类型 {childIndex + 1}</h6>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            const newTypes = [...nestedTypes];
                                            newTypes[index].children = type.children?.filter((_, i) => i !== childIndex);
                                            setNestedTypes(newTypes);
                                          }}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      
                                      <div className="space-y-2">
                                        <div>
                                          <Label>名称</Label>
                                          <Input
                                            value={child.name}
                                            onChange={(e) => {
                                              const newTypes = [...nestedTypes];
                                              if (newTypes[index].children) {
                                                newTypes[index].children![childIndex] = {
                                                  ...child,
                                                  name: e.target.value
                                                };
                                              }
                                              setNestedTypes(newTypes);
                                            }}
                                            placeholder="下级类型名称"
                                          />
                                        </div>
                                        
                                        <div>
                                          <Label>描述</Label>
                                          <Input
                                            value={child.description}
                                            onChange={(e) => {
                                              const newTypes = [...nestedTypes];
                                              if (newTypes[index].children) {
                                                newTypes[index].children![childIndex] = {
                                                  ...child,
                                                  description: e.target.value
                                                };
                                              }
                                              setNestedTypes(newTypes);
                                            }}
                                            placeholder="下级类型描述"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setNestedTypes([]);
                  }}
                >
                  取消
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    '保存'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-1">
        {genres.map(genre => renderGenreCard(genre))}
      </div>
    </div>
  );
} 