/*
 * @LastEditors: biz
 */
/*
 * @LastEditors: biz
 */
'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Edit, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LLMPromptInput } from '@/components/LLMPromptInput';
import { BatchGenerateDialog } from '../../components/BatchGenerateDialog';
import dynamic from 'next/dynamic';

interface NoSSRWrapperProps {
  children: ReactNode;
}

// 禁用 SSR
const NoSSRWrapper = dynamic(() => 
  Promise.resolve((props: NoSSRWrapperProps) => <>{props.children}</>), 
  { ssr: false }
);

interface BaseCharacter {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  appearance: string;
  weaknesses: string;
  interests: string;
  keyEvents: string;
  category: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  '主角',
  '反派',
  '配角',
  '自动生成'
];

export default function BaseCharactersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [characters, setCharacters] = useState<BaseCharacter[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<BaseCharacter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [isBatchGenerateOpen, setIsBatchGenerateOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      toast({
        title: "需要登录",
        description: "请先登录后再访问基础角色库",
        variant: "destructive",
      });
      router.push('/auth/signin');
    }
  }, [status, router, toast]);

  useEffect(() => {
    fetchCharacters();
  }, [searchTerm, selectedCategory]);

  const fetchCharacters = async () => {
    try {
      let url = '/api/base-characters';
      const params = new URLSearchParams();
      
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('获取角色列表失败');
      }
      const data = await response.json();
      setCharacters(data);
    } catch (error) {
      console.error('获取角色列表失败:', error);
      toast({
        variant: "destructive",
        title: "错误",
        description: "获取角色列表失败"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCharacter = async () => {
    if (!selectedCharacter) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        selectedCharacter.id 
          ? `/api/base-characters/${selectedCharacter.id}`
          : '/api/base-characters',
        {
          method: selectedCharacter.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(selectedCharacter)
        }
      );

      if (!response.ok) {
        throw new Error('保存角色失败');
      }

      const savedCharacter = await response.json();
      
      if (selectedCharacter.id) {
        setCharacters(prev => prev.map(c => 
          c.id === savedCharacter.id ? savedCharacter : c
        ));
      } else {
        setCharacters(prev => [...prev, savedCharacter]);
      }
      
      setSelectedCharacter(savedCharacter);

      toast({
        title: "成功",
        description: "角色信息已保存"
      });
    } catch (error) {
      console.error('保存角色失败:', error);
      toast({
        variant: "destructive",
        title: "错误",
        description: "保存角色失败"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    try {
      const response = await fetch(`/api/base-characters/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除角色失败');
      }

      setCharacters(prev => prev.filter(c => c.id !== id));
      if (selectedCharacter?.id === id) {
        setSelectedCharacter(null);
      }

      toast({
        title: "成功",
        description: "角色已删除"
      });
    } catch (error) {
      console.error('删除角色失败:', error);
      toast({
        variant: "destructive",
        title: "错误",
        description: error instanceof Error ? error.message : "删除角色失败"
      });
    }
  };

  const handleCreateNew = () => {
    setSelectedCharacter(null);
    setIsEditing(false);
  };

  const handleGenerateCharacter = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/base-characters/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          count: 1,
          provider: params.provider,
          model: params.model,
          prompt: params.prompt,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '生成角色失败');
      }

      const characters = await response.json();
      if (Array.isArray(characters) && characters.length > 0) {
        const newCharacter = characters[0];
        setCharacters(prev => [newCharacter, ...prev]);
        setSelectedCharacter(newCharacter);
        setIsEditing(false);

        toast({
          title: "成功",
          description: "角色生成成功"
        });
      } else {
        throw new Error('未能生成有效的角色数据');
      }
    } catch (error) {
      console.error('生成角色失败:', error);
      toast({
        variant: "destructive",
        title: "错误",
        description: error instanceof Error ? error.message : "生成角色失败"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchGenerate = async (params: { 
    count: number; 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    try {
      const response = await fetch("/api/base-characters/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          count: params.count,
          provider: params.provider,
          model: params.model,
          prompt: params.prompt,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        }),
      });

      if (!response.ok) {
        throw new Error("批量生成失败");
      }

      // 刷新角色列表
      await fetchCharacters();
      toast({
        title: "成功",
        description: `成功生成 ${params.count} 个角色`
      });
    } catch (error) {
      console.error("批量生成错误:", error);
      toast({
        variant: "destructive",
        title: "错误",
        description: "批量生成失败，请重试"
      });
    }
  };

  const renderCharacterPreview = () => {
    if (!selectedCharacter) return null;

    return (
      <div className="space-y-8 p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold mb-2">{selectedCharacter.name}</h2>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{selectedCharacter.category}</Badge>
              <span className="text-muted-foreground">{selectedCharacter.role}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setIsBatchGenerateOpen(true)} variant="outline" size="sm">
              批量生成
            </Button>
            <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              编辑角色
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div key="left-column" className="space-y-6">
            <div key="personality-section">
              <h3 className="text-lg font-semibold mb-2">性格特征</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedCharacter.personality}</p>
            </div>
            <div key="background-section">
              <h3 className="text-lg font-semibold mb-2">背景故事</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedCharacter.background}</p>
            </div>
            <div key="development-section">
              <h3 className="text-lg font-semibold mb-2">成长轨迹</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedCharacter.development}</p>
            </div>
          </div>
          <div key="right-column" className="space-y-6">
            <div key="appearance-section">
              <h3 className="text-lg font-semibold mb-2">外貌描述</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedCharacter.appearance}</p>
            </div>
            <div key="weaknesses-section">
              <h3 className="text-lg font-semibold mb-2">弱点与不足</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedCharacter.weaknesses}</p>
            </div>
            <div key="interests-section">
              <h3 className="text-lg font-semibold mb-2">兴趣爱好</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedCharacter.interests}</p>
            </div>
            <div key="keyEvents-section">
              <h3 className="text-lg font-semibold mb-2">重要事件</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{selectedCharacter.keyEvents}</p>
            </div>
          </div>
        </div>

        <div key="tags-section">
          <h3 className="text-lg font-semibold mb-2">标签</h3>
          <div className="flex flex-wrap gap-2">
            {selectedCharacter.tags?.split(',').filter(Boolean).map((tag, index) => (
              <Badge key={`${tag.trim()}-${index}`} variant="outline">
                {tag.trim()}
              </Badge>
            )) || (
              <span className="text-sm text-muted-foreground">暂无标签</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCharacterEdit = () => {
    if (!selectedCharacter) return null;

    return (
      <div className="space-y-4">
        <div key="edit-header" className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => setIsEditing(false)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回预览
          </Button>
        </div>
        <div>
          <Label>角色名称</Label>
          <Input
            value={selectedCharacter.name}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, name: e.target.value } : null
            )}
          />
        </div>
        <div>
          <Label>角色身份</Label>
          <Input
            value={selectedCharacter.role}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, role: e.target.value } : null
            )}
          />
        </div>
        <div>
          <Label>性格特征</Label>
          <Textarea
            value={selectedCharacter.personality}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, personality: e.target.value } : null
            )}
          />
        </div>
        <div>
          <Label>背景故事</Label>
          <Textarea
            value={selectedCharacter.background}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, background: e.target.value } : null
            )}
          />
        </div>
        <div>
          <Label>成长轨迹</Label>
          <Textarea
            value={selectedCharacter.development}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, development: e.target.value } : null
            )}
          />
        </div>
        <div>
          <Label>外貌描述</Label>
          <Textarea
            value={selectedCharacter.appearance}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, appearance: e.target.value } : null
            )}
            placeholder="描述角色的身高、体型、面容特征、穿衣风格等"
          />
        </div>
        <div>
          <Label>弱点与不足</Label>
          <Textarea
            value={selectedCharacter.weaknesses}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, weaknesses: e.target.value } : null
            )}
            placeholder="描述角色的人际关系、情感问题、自我冲突等"
          />
        </div>
        <div>
          <Label>兴趣爱好</Label>
          <Textarea
            value={selectedCharacter.interests}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, interests: e.target.value } : null
            )}
            placeholder="描述角色的个人特长、休闲活动等"
          />
        </div>
        <div>
          <Label>重要事件</Label>
          <Textarea
            value={selectedCharacter.keyEvents}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, keyEvents: e.target.value } : null
            )}
            placeholder="描述影响角色成长的重要事件"
          />
        </div>
        <div>
          <Label>分类</Label>
          <Select
            value={selectedCharacter.category}
            onValueChange={(value) => setSelectedCharacter(prev => 
              prev ? { ...prev, category: value } : null
            )}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>标签</Label>
          <Input
            value={selectedCharacter.tags}
            onChange={(e) => setSelectedCharacter(prev => 
              prev ? { ...prev, tags: e.target.value } : null
            )}
            placeholder="使用逗号分隔多个标签"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setSelectedCharacter(null)}
          >
            取消
          </Button>
          <Button
            onClick={handleSaveCharacter}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </div>
      </div>
    );
  };

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <NoSSRWrapper>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">基础角色库</h1>
            <p className="text-muted-foreground">管理可复用的角色模板</p>
          </div>
          <Button onClick={() => router.push('/novels')}>返回小说列表</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="space-y-4">
              <CardTitle>角色列表</CardTitle>
              <div className="flex flex-col gap-4">
                <Input
                  placeholder="搜索角色..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
                    {CATEGORIES.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-2">
                  <div key="character-list-header">
                    <Button
                      key="create-new-button"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleCreateNew}
                    >
                      + 创建新角色
                    </Button>
                  </div>
                  {characters.map((character, index) => (
                    <div
                      key={`character-item-${character.id || index}`}
                      className="relative group mb-2"
                    >
                      <Button
                        variant={selectedCharacter?.id === character.id ? 'default' : 'outline'}
                        className={`w-full justify-start text-left p-4 h-auto ${
                          selectedCharacter?.id === character.id 
                            ? 'bg-primary hover:bg-primary' 
                            : ''
                        }`}
                        onClick={() => {
                          setSelectedCharacter(character);
                          setIsEditing(false);
                        }}
                      >
                        <div key={`character-content-${character.id}`} className="flex flex-col items-start gap-2 min-w-0 w-[calc(100%-40px)]">
                          <div key={`character-header-${character.id}`} className="flex items-center gap-2 w-full">
                            <div className={`font-medium truncate ${
                              selectedCharacter?.id === character.id 
                                ? 'text-primary-foreground' 
                                : ''
                            }`}>
                              {character.name}
                            </div>
                            <div className={`text-sm truncate ${
                              selectedCharacter?.id === character.id 
                                ? 'text-primary-foreground/90' 
                                : 'text-muted-foreground'
                            }`}>
                              {character.role}
                            </div>
                          </div>
                          <div key={`character-meta-${character.id}`} className="flex flex-wrap items-center gap-2 w-full">
                            <Badge variant={selectedCharacter?.id === character.id ? 'secondary' : 'outline'} className="text-xs">
                              {character.category}
                            </Badge>
                            {character.tags && (
                              <span className={`text-xs truncate max-w-[200px] ${
                                selectedCharacter?.id === character.id 
                                  ? 'text-primary-foreground/80' 
                                  : 'text-muted-foreground'
                              }`}>
                                {character.tags}
                              </span>
                            )}
                          </div>
                        </div>
                      </Button>
                      <Button
                        key={`delete-button-${character.id}`}
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCharacter(character.id);
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <path d="M3 6h18"></path>
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>
                {selectedCharacter 
                  ? (isEditing ? '编辑角色' : '角色详情') 
                  : '生成新角色'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedCharacter ? (
                isEditing ? renderCharacterEdit() : renderCharacterPreview()
              ) : (
                <div key="generate-new-character" className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    <p>描述你想要生成的角色特点，包括性格、背景、在故事中的作用等。AI 将根据你的描述生成详细的角色设定。</p>
                    <p className="mt-2">提示：可以描述以下方面</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>角色的性格特征和个性</li>
                      <li>背景故事和成长经历</li>
                      <li>在故事中的定位和作用</li>
                      <li>外貌特征和穿着风格</li>
                      <li>特殊技能或专长</li>
                    </ul>
                  </div>
                  <LLMPromptInput
                    inputType="textarea"
                    placeholder="例如：我需要一个性格坚韧、富有正义感的女主角。她是一名经验丰富的刑警，在一次重大案件调查中意外发现了自己的过去与案件有关。她外表冷静专业，但内心充满正义感和同理心..."
                    buttonText="AI 生成角色"
                    disabled={isGenerating}
                    showAdvancedOptions={true}
                    onSubmit={handleGenerateCharacter}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">基础角色列表</h1>
          <div className="space-x-2">
            {/* ... existing buttons ... */}
          </div>
        </div>

        <BatchGenerateDialog
          open={isBatchGenerateOpen}
          onClose={() => setIsBatchGenerateOpen(false)}
          onGenerate={handleBatchGenerate}
          characterInfo={selectedCharacter}
        />
      </div>
    </NoSSRWrapper>
  );
} 