import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { WorldGenerationParams, GeneratedWorld } from '../types/world';
import { NovelGenre } from '../types/novel';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ScrollArea } from './ui/scroll-area';

interface WorldGeneratorProps {
  onGenerate: (params: WorldGenerationParams & {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }) => void;
  isGenerating: boolean;
}

export function WorldGenerator({ onGenerate, isGenerating }: WorldGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<NovelGenre>('fantasy');
  const [complexity, setComplexity] = useState<'simple' | 'moderate' | 'complex'>('moderate');
  const [emphasis, setEmphasis] = useState({
    geography: false,
    culture: false,
    magic: false,
    technology: false,
  });
  const [provider, setProvider] = useState('deepseek');
  const [model, setModel] = useState('deepseek-chat');
  const [streamContent, setStreamContent] = useState('');
  const [generatedWorld, setGeneratedWorld] = useState<GeneratedWorld | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStreamContent('');
    setGeneratedWorld(null);

    try {
      const response = await fetch('/api/worlds/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          genre,
          complexity,
          emphasis,
          provider,
          model,
        }),
      });

      if (!response.ok) {
        throw new Error('生成世界失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应数据');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content') {
                // 更新流式内容
                setStreamContent(prev => prev + (parsed.choices[0]?.delta?.content || ''));
              } else if (parsed.type === 'json') {
                // 设置最终的世界数据
                setGeneratedWorld(parsed.data);
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              }
            } catch (e) {
              console.warn('解析数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('生成失败:', error);
      // 这里可以添加错误提示
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>生成新世界</CardTitle>
          <CardDescription>
            描述你想要创建的世界，我们将为你生成详细的世界设定
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="genre">选择类型</Label>
            <Select
              value={genre}
              onValueChange={(value) => setGenre(value as NovelGenre)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择小说类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fantasy">奇幻</SelectItem>
                <SelectItem value="science_fiction">科幻</SelectItem>
                <SelectItem value="wuxia">武侠</SelectItem>
                <SelectItem value="xianxia">仙侠</SelectItem>
                <SelectItem value="urban">都市</SelectItem>
                <SelectItem value="history">历史</SelectItem>
                <SelectItem value="mystery">悬疑</SelectItem>
                <SelectItem value="romance">言情</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">世界描述</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想要创建的世界..."
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label>复杂度</Label>
            <Select
              value={complexity}
              onValueChange={(value) => setComplexity(value as 'simple' | 'moderate' | 'complex')}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择世界复杂度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simple">简单</SelectItem>
                <SelectItem value="moderate">中等</SelectItem>
                <SelectItem value="complex">复杂</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>重点关注</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="geography"
                  checked={emphasis.geography}
                  onCheckedChange={(checked) =>
                    setEmphasis({ ...emphasis, geography: !!checked })
                  }
                />
                <label
                  htmlFor="geography"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  地理环境
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="culture"
                  checked={emphasis.culture}
                  onCheckedChange={(checked) =>
                    setEmphasis({ ...emphasis, culture: !!checked })
                  }
                />
                <label
                  htmlFor="culture"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  文化社会
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="magic"
                  checked={emphasis.magic}
                  onCheckedChange={(checked) =>
                    setEmphasis({ ...emphasis, magic: !!checked })
                  }
                />
                <label
                  htmlFor="magic"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  魔法体系
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="technology"
                  checked={emphasis.technology}
                  onCheckedChange={(checked) =>
                    setEmphasis({ ...emphasis, technology: !!checked })
                  }
                />
                <label
                  htmlFor="technology"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  科技发展
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>AI 模型</Label>
            <div className="grid grid-cols-2 gap-4">
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="选择 AI 提供商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">Deepseek</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>

              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek-chat">Deepseek Chat</SelectItem>
                  <SelectItem value="deepseek-coder">Deepseek Coder</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isGenerating}>
            {isGenerating ? '生成中...' : '生成世界'}
          </Button>
        </CardContent>
      </Card>

      {streamContent && (
        <Card>
          <CardHeader>
            <CardTitle>生成进度</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px] w-full rounded-md border p-4">
              <pre className="text-sm whitespace-pre-wrap">{streamContent}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </form>
  );
} 