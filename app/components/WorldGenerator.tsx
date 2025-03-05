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
  const [dimensionOptions, setDimensionOptions] = useState({
    geography: {
      enabled: false,
      terrain: false,
      climate: false,
      locations: false,
      spatialStructure: false,
    },
    culture: {
      enabled: false,
      societies: false,
      customs: false,
      religions: false,
      politics: false,
    },
    magic: {
      enabled: false,
      rules: false,
      elements: false,
      practitioners: false,
      limitations: false,
    },
    technology: {
      enabled: false,
      innovations: false,
      impact: false,
    },
    narrative: {
      enabled: true, // 默认启用
      history: true,
      conflicts: true,
    },
  });

  // 处理维度开关变化
  const handleDimensionToggle = (dimension: keyof typeof dimensionOptions, value: boolean) => {
    setDimensionOptions(prev => {
      const newOptions = { ...prev };
      newOptions[dimension].enabled = value;
      
      // 如果禁用维度，同时禁用其所有子选项
      if (!value) {
        Object.keys(newOptions[dimension]).forEach(key => {
          if (key !== 'enabled') {
            // 使用类型断言确保TypeScript理解这是有效的操作
            (newOptions[dimension] as any)[key] = false;
          }
        });
      }
      
      return newOptions;
    });
  };

  // 处理子选项变化
  const handleSubOptionToggle = (dimension: keyof typeof dimensionOptions, option: string, value: boolean) => {
    setDimensionOptions(prev => {
      const newOptions = { ...prev };
      // 使用类型断言确保TypeScript理解这是有效的操作
      (newOptions[dimension] as any)[option] = value;
      
      // 如果启用任何子选项，同时启用父维度
      if (value) {
        newOptions[dimension].enabled = true;
      }
      
      return newOptions;
    });
  };

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
      dimensionOptions,
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
          <Label>维度选择</Label>
          <div className="space-y-4">
            {/* 地理维度 */}
            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="geography-enabled"
                  checked={dimensionOptions.geography.enabled}
                  onCheckedChange={(checked) => handleDimensionToggle('geography', checked === true)}
                />
                <Label htmlFor="geography-enabled" className="font-semibold">地理环境</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-2 ml-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="geography-terrain"
                    checked={dimensionOptions.geography.terrain}
                    disabled={!dimensionOptions.geography.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('geography', 'terrain', checked === true)
                    }
                  />
                  <Label htmlFor="geography-terrain">地形</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="geography-climate"
                    checked={dimensionOptions.geography.climate}
                    disabled={!dimensionOptions.geography.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('geography', 'climate', checked === true)
                    }
                  />
                  <Label htmlFor="geography-climate">气候</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="geography-locations"
                    checked={dimensionOptions.geography.locations}
                    disabled={!dimensionOptions.geography.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('geography', 'locations', checked === true)
                    }
                  />
                  <Label htmlFor="geography-locations">地点</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="geography-spatialStructure"
                    checked={dimensionOptions.geography.spatialStructure}
                    disabled={!dimensionOptions.geography.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('geography', 'spatialStructure', checked === true)
                    }
                  />
                  <Label htmlFor="geography-spatialStructure">空间结构</Label>
                </div>
              </div>
            </Card>

            {/* 文化维度 */}
            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="culture-enabled"
                  checked={dimensionOptions.culture.enabled}
                  onCheckedChange={(checked) => handleDimensionToggle('culture', checked === true)}
                />
                <Label htmlFor="culture-enabled" className="font-semibold">文化社会</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-2 ml-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="culture-societies"
                    checked={dimensionOptions.culture.societies}
                    disabled={!dimensionOptions.culture.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('culture', 'societies', checked === true)
                    }
                  />
                  <Label htmlFor="culture-societies">社会群体</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="culture-customs"
                    checked={dimensionOptions.culture.customs}
                    disabled={!dimensionOptions.culture.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('culture', 'customs', checked === true)
                    }
                  />
                  <Label htmlFor="culture-customs">习俗</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="culture-religions"
                    checked={dimensionOptions.culture.religions}
                    disabled={!dimensionOptions.culture.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('culture', 'religions', checked === true)
                    }
                  />
                  <Label htmlFor="culture-religions">宗教信仰</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="culture-politics"
                    checked={dimensionOptions.culture.politics}
                    disabled={!dimensionOptions.culture.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('culture', 'politics', checked === true)
                    }
                  />
                  <Label htmlFor="culture-politics">政治体系</Label>
                </div>
              </div>
            </Card>

            {/* 魔法维度 */}
            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="magic-enabled"
                  checked={dimensionOptions.magic.enabled}
                  onCheckedChange={(checked) => handleDimensionToggle('magic', checked === true)}
                />
                <Label htmlFor="magic-enabled" className="font-semibold">魔法体系</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-2 ml-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="magic-rules"
                    checked={dimensionOptions.magic.rules}
                    disabled={!dimensionOptions.magic.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('magic', 'rules', checked === true)
                    }
                  />
                  <Label htmlFor="magic-rules">魔法规则</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="magic-elements"
                    checked={dimensionOptions.magic.elements}
                    disabled={!dimensionOptions.magic.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('magic', 'elements', checked === true)
                    }
                  />
                  <Label htmlFor="magic-elements">魔法元素</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="magic-practitioners"
                    checked={dimensionOptions.magic.practitioners}
                    disabled={!dimensionOptions.magic.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('magic', 'practitioners', checked === true)
                    }
                  />
                  <Label htmlFor="magic-practitioners">施法者</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="magic-limitations"
                    checked={dimensionOptions.magic.limitations}
                    disabled={!dimensionOptions.magic.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('magic', 'limitations', checked === true)
                    }
                  />
                  <Label htmlFor="magic-limitations">限制条件</Label>
                </div>
              </div>
            </Card>

            {/* 科技维度 */}
            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="technology-enabled"
                  checked={dimensionOptions.technology.enabled}
                  onCheckedChange={(checked) => handleDimensionToggle('technology', checked === true)}
                />
                <Label htmlFor="technology-enabled" className="font-semibold">科技水平</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-2 ml-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="technology-innovations"
                    checked={dimensionOptions.technology.innovations}
                    disabled={!dimensionOptions.technology.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('technology', 'innovations', checked === true)
                    }
                  />
                  <Label htmlFor="technology-innovations">技术创新</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="technology-impact"
                    checked={dimensionOptions.technology.impact}
                    disabled={!dimensionOptions.technology.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('technology', 'impact', checked === true)
                    }
                  />
                  <Label htmlFor="technology-impact">影响</Label>
                </div>
              </div>
            </Card>

            {/* 叙事维度（历史与冲突） */}
            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Checkbox
                  id="narrative-enabled"
                  checked={dimensionOptions.narrative.enabled}
                  onCheckedChange={(checked) => handleDimensionToggle('narrative', checked === true)}
                />
                <Label htmlFor="narrative-enabled" className="font-semibold">叙事元素</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-2 ml-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="narrative-history"
                    checked={dimensionOptions.narrative.history}
                    disabled={!dimensionOptions.narrative.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('narrative', 'history', checked === true)
                    }
                  />
                  <Label htmlFor="narrative-history">历史</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="narrative-conflicts"
                    checked={dimensionOptions.narrative.conflicts}
                    disabled={!dimensionOptions.narrative.enabled}
                    onCheckedChange={(checked) => 
                      handleSubOptionToggle('narrative', 'conflicts', checked === true)
                    }
                  />
                  <Label htmlFor="narrative-conflicts">冲突</Label>
                </div>
              </div>
            </Card>
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