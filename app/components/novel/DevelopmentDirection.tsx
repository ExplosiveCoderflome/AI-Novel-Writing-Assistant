import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LLMPromptInput } from '../LLMPromptInput';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const MarkdownEditor = dynamic(() => import('../MarkdownEditor'), { ssr: false });

interface Character {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
}

interface DevelopmentDirectionProps {
  novelId: string;
  outline: string;
  onOutlineChange: (value: string) => void;
}

const DevelopmentDirection: React.FC<DevelopmentDirectionProps> = ({
  novelId,
  outline,
  onOutlineChange,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);

  useEffect(() => {
    fetchCharacters();
  }, [novelId]);

  const fetchCharacters = async () => {
    setIsLoadingCharacters(true);
    try {
      const response = await fetch(`/api/novel/${novelId}/characters`);
      if (!response.ok) {
        throw new Error('获取角色列表失败');
      }
      const data = await response.json();
      setCharacters(data);
    } catch (error) {
      console.error('获取角色列表失败:', error);
      toast.error('获取角色列表失败');
    } finally {
      setIsLoadingCharacters(false);
    }
  };

  const handleCharacterSelect = (characterId: string) => {
    setSelectedCharacters(prev => {
      if (prev.includes(characterId)) {
        return prev.filter(id => id !== characterId);
      } else {
        return [...prev, characterId];
      }
    });
  };

  const handleSaveOutline = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/novel/${novelId}/outline`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outline,
        }),
      });

      if (!response.ok) {
        throw new Error('保存发展走向失败');
      }

      toast.success('发展走向保存成功');
    } catch (error) {
      console.error('保存发展走向失败:', error);
      toast.error(error instanceof Error ? error.message : '保存发展走向失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateOutline = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    setIsGenerating(true);
    try {
      // 获取选中角色的详细信息
      const selectedCharacterDetails = characters
        .filter(char => selectedCharacters.includes(char.id))
        .map(char => ({
          name: char.name,
          role: char.role,
          personality: char.personality,
          background: char.background,
          development: char.development
        }));

      // 构建包含角色信息的提示
      const characterInfo = selectedCharacterDetails.length > 0 
        ? `\n\n已选择的角色信息：\n${selectedCharacterDetails.map(char => 
            `角色名称：${char.name}\n` +
            `角色身份：${char.role}\n` +
            `性格特征：${char.personality}\n` +
            `背景故事：${char.background}\n` +
            `成长轨迹：${char.development}\n`
          ).join('\n')}`
        : '';

      const response = await fetch(`/api/novel/${novelId}/outline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: params.provider,
          model: params.model,
          prompt: params.prompt + characterInfo,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '生成发展走向失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应数据');
      }

      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const newContent = parsed.choices?.[0]?.delta?.content || '';
              content += newContent;
              onOutlineChange(content);
            } catch (e) {
              console.error('解析数据失败:', e);
            }
          }
        }
      }

      toast.success('发展走向生成成功');
    } catch (error) {
      console.error('生成发展走向失败:', error);
      toast.error(error instanceof Error ? error.message : '生成发展走向失败');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>发展方向</CardTitle>
        <CardDescription>
          描述小说的整体发展方向，包括主要情节、人物成长和故事走向
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          {/* 左侧：Markdown 编辑器 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="outline" className="text-lg font-medium">发展走向</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  预览模式
                </Badge>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSaveOutline}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      保存中...
                    </>
                  ) : '保存'}
                </Button>
              </div>
            </div>
            <div className="border rounded-lg">
              <MarkdownEditor
                value={outline}
                onChange={(value) => onOutlineChange(value || '')}
                preview="preview"
                height={600}
                className="min-h-[600px]"
              />
            </div>
          </div>

          {/* 右侧：生成模块 */}
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium">选择相关角色</h4>
              <div className="space-y-2">
                {isLoadingCharacters ? (
                  <p className="text-sm text-muted-foreground">加载角色列表中...</p>
                ) : characters.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {characters.map(character => (
                      <div key={character.id} className="flex items-start space-x-2">
                        <Checkbox
                          id={character.id}
                          checked={selectedCharacters.includes(character.id)}
                          onCheckedChange={() => handleCharacterSelect(character.id)}
                        />
                        <div className="grid gap-1.5">
                          <Label htmlFor={character.id} className="font-medium">
                            {character.name}
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {character.role}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无角色</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">AI</Badge>
                <h4 className="font-medium">智能生成设置</h4>
              </div>
              <LLMPromptInput
                inputType="textarea"
                placeholder="描述你期望的小说发展方向，包括主要情节走向、人物成长、矛盾冲突等..."
                buttonText={isGenerating ? "正在生成..." : "生成发展走向"}
                disabled={isGenerating}
                showAdvancedOptions={true}
                onSubmit={handleGenerateOutline}
              />
              <div className="text-sm text-muted-foreground">
                <p>提示：</p>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>可以描述主要情节的发展脉络</li>
                  <li>可以说明人物的成长和改变</li>
                  <li>可以设定重要的转折点和高潮</li>
                  <li>可以规划故事的节奏和氛围</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DevelopmentDirection; 