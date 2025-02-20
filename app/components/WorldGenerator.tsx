import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
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
import { LLMPromptInput } from './LLMPromptInput';

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
  const [genre, setGenre] = useState<NovelGenre>('fantasy');
  const [complexity, setComplexity] = useState<'simple' | 'moderate' | 'complex'>('moderate');
  const [emphasis, setEmphasis] = useState({
    geography: false,
    culture: false,
    magic: false,
    technology: false,
  });

  const handleSubmit = async (llmParams: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    onGenerate({
      genre,
      complexity,
      emphasis,
      prompt: llmParams.prompt,
      provider: llmParams.provider,
      model: llmParams.model,
      temperature: llmParams.temperature,
      maxTokens: llmParams.maxTokens,
    });
  };

  return (
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
          <Label>世界复杂度</Label>
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
                  setEmphasis((prev) => ({ ...prev, geography: checked === true }))
                }
              />
              <Label htmlFor="geography">地理环境</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="culture"
                checked={emphasis.culture}
                onCheckedChange={(checked) =>
                  setEmphasis((prev) => ({ ...prev, culture: checked === true }))
                }
              />
              <Label htmlFor="culture">文化社会</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="magic"
                checked={emphasis.magic}
                onCheckedChange={(checked) =>
                  setEmphasis((prev) => ({ ...prev, magic: checked === true }))
                }
              />
              <Label htmlFor="magic">魔法体系</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="technology"
                checked={emphasis.technology}
                onCheckedChange={(checked) =>
                  setEmphasis((prev) => ({ ...prev, technology: checked === true }))
                }
              />
              <Label htmlFor="technology">科技水平</Label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>世界描述</Label>
          <LLMPromptInput
            inputType="textarea"
            buttonText={isGenerating ? "生成中..." : "生成世界"}
            disabled={isGenerating}
            onSubmit={handleSubmit}
          />
        </div>
      </CardContent>
    </Card>
  );
} 