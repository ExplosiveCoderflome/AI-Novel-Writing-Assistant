import React, { useState } from 'react';
import { NovelGenre, genreFeatures } from '../types/novel';
import { WorldGenerationParams } from '../types/world';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { LLMPromptInput } from './LLMPromptInput';

interface WorldGeneratorProps {
  onGenerate: (params: WorldGenerationParams & {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<void>;
  isGenerating: boolean;
}

export const WorldGenerator: React.FC<WorldGeneratorProps> = ({
  onGenerate,
  isGenerating
}) => {
  const [genre, setGenre] = useState<NovelGenre>('fantasy');
  const [complexity, setComplexity] = useState<'simple' | 'moderate' | 'complex'>('moderate');
  const [emphasis, setEmphasis] = useState({
    geography: false,
    culture: false,
    magic: false,
    technology: false
  });

  const handleEmphasisChange = (key: keyof typeof emphasis) => {
    setEmphasis(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleLLMPromptSubmit = async (data: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    await onGenerate({
      genre,
      prompt: data.prompt,
      complexity,
      emphasis,
      provider: data.provider,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>世界生成器</CardTitle>
          <CardDescription>
            选择小说类型并提供额外的世界设定要求，生成一个独特的故事世界
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="genre">小说类型</Label>
            <Select
              value={genre}
              onValueChange={(value: NovelGenre) => setGenre(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择小说类型" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(genreFeatures).map(([key, value]) => (
                  <SelectItem key={key} value={key}>
                    {key.replace('_', ' ').split(' ').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="complexity">世界复杂度</Label>
            <Select
              value={complexity}
              onValueChange={(value: 'simple' | 'moderate' | 'complex') => setComplexity(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择复杂度" />
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
                  onCheckedChange={() => handleEmphasisChange('geography')}
                />
                <Label htmlFor="geography">地理环境</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="culture"
                  checked={emphasis.culture}
                  onCheckedChange={() => handleEmphasisChange('culture')}
                />
                <Label htmlFor="culture">文化社会</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="magic"
                  checked={emphasis.magic}
                  onCheckedChange={() => handleEmphasisChange('magic')}
                />
                <Label htmlFor="magic">魔法系统</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="technology"
                  checked={emphasis.technology}
                  onCheckedChange={() => handleEmphasisChange('technology')}
                />
                <Label htmlFor="technology">科技发展</Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>额外要求</Label>
            <LLMPromptInput
              inputType="textarea"
              buttonText="生成世界"
              disabled={isGenerating}
              onSubmit={handleLLMPromptSubmit}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 