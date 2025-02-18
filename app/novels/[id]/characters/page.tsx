'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Novel, Character, NovelGenre } from '../../../api/novel/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { LLMPromptInput } from '@/components/LLMPromptInput';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PageProps {
  params: {
    id: string;
  };
}

export default function CharactersPage({ params }: PageProps) {
  const { id } = params;
  const router = useRouter();
  const { toast } = useToast();
  const [novel, setNovel] = useState<Novel & { genre?: NovelGenre } | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchNovel();
    fetchCharacters();
  }, []);

  const fetchNovel = async () => {
    try {
      const response = await fetch(`/api/novel/${id}`);
      if (!response.ok) {
        throw new Error('获取小说失败');
      }
      const data = await response.json();
      setNovel(data);
    } catch (error) {
      console.error('获取小说失败:', error);
      toast({
        variant: "destructive",
        title: "错误",
        description: "获取小说失败"
      });
    }
  };

  const fetchCharacters = async () => {
    try {
      const response = await fetch(`/api/novel/${id}/characters`);
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

  const handleGenerateCharacter = async (params: { provider: string; model: string; prompt: string }) => {
    if (!novel) return;

    setIsGenerating(true);
    try {
      const response = await fetch(`/api/novel/${id}/characters/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: params.provider,
          model: params.model,
          prompt: params.prompt,
          context: {
            title: novel.title,
            genre: novel.genre?.name,
            description: novel.description,
            outline: novel.outline
          }
        })
      });

      if (!response.ok) {
        throw new Error('生成角色失败');
      }

      const newCharacter = await response.json();
      setCharacters(prev => [...prev, newCharacter]);
      setSelectedCharacter(newCharacter);

      toast({
        title: "成功",
        description: "角色生成成功"
      });
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

  const handleSaveCharacter = async (character: Character) => {
    try {
      const response = await fetch(`/api/novel/${id}/characters/${character.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(character)
      });

      if (!response.ok) {
        throw new Error('保存角色失败');
      }

      setCharacters((prev: Character[]) => 
        prev.map(c => c.id === character.id ? character : c)
      );

      toast({
        title: "成功",
        description: "角色信息已更新"
      });
    } catch (error) {
      console.error('保存角色失败:', error);
      toast({
        variant: "destructive",
        title: "错误",
        description: "保存角色失败"
      });
    }
  };

  const handleDeleteCharacter = async (characterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/novel/${id}/characters/${characterId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('删除角色失败');
      }

      setCharacters((prev: Character[]) => prev.filter(c => c.id !== characterId));
      if (selectedCharacter?.id === characterId) {
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
        description: "删除角色失败"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">角色管理</h1>
          <p className="text-muted-foreground">{novel?.title}</p>
        </div>
        <Button onClick={() => router.push(`/novels/${id}/edit`)}>返回编辑</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 角色列表 */}
        <Card>
          <CardHeader>
            <CardTitle>角色列表</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-2">
                {characters.map(character => (
                  <Button
                    key={character.id}
                    variant={selectedCharacter?.id === character.id ? 'default' : 'outline'}
                    className="w-full justify-between group"
                    onClick={() => setSelectedCharacter(character)}
                  >
                    <span>{character.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteCharacter(character.id, e)}
                    >
                      删除
                    </Button>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* 角色详情/生成 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {selectedCharacter ? '角色详情' : '生成新角色'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCharacter ? (
              <div className="space-y-4">
                <div>
                  <Label>角色名称</Label>
                  <Input
                    value={selectedCharacter.name}
                    onChange={(e) => setSelectedCharacter((prev: Character | null) => 
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
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedCharacter(null)}
                  >
                    新建角色
                  </Button>
                  <Button
                    onClick={() => selectedCharacter && handleSaveCharacter(selectedCharacter)}
                  >
                    保存角色
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-gray-500">
                  描述你想要生成的角色特点，包括性格、背景、在故事中的作用等。AI 将根据你的描述生成详细的角色设定。
                </div>
                <LLMPromptInput
                  inputType="textarea"
                  placeholder="例如：我需要一个性格坚韧、富有正义感的女主角，她是一名经验丰富的刑警..."
                  buttonText="AI 生成角色"
                  disabled={isGenerating}
                  onSubmit={handleGenerateCharacter}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 