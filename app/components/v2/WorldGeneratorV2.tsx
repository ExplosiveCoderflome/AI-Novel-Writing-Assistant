'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { WorldPropertyOption, WorldOptionRefinementLevel } from '../../types/worldV2';
import WorldTypeSelector from './WorldTypeSelector';
import RefinementLevelSelector from './RefinementLevelSelector';
import WorldPropertySelector from './WorldPropertySelector';
import MarkdownEditor from '../MarkdownEditor';
import { LLMPromptInput } from '../LLMPromptInput';
import { useStreamResponse } from '../../hooks/useStreamResponse';
import PropertyOptionCard from './PropertyOptionCard';
import PropertyLibrary from './PropertyLibrary';
import { WorldPropertyLibraryItem } from '../../types/worldV2';

// 步骤类型
type GenerationStep = 'options' | 'world' | 'result';

interface WorldGeneratorV2Props {
  onGenerateComplete?: (content: string) => void;
}

export default function WorldGeneratorV2({ onGenerateComplete }: WorldGeneratorV2Props) {
  // 当前步骤
  const [currentStep, setCurrentStep] = useState<GenerationStep>('options');
  
  // 选项生成相关状态
  const [selectedWorldType, setSelectedWorldType] = useState<string>('');
  const [refinementLevel, setRefinementLevel] = useState<WorldOptionRefinementLevel>('standard');
  const [optionsCount, setOptionsCount] = useState<number>(5);
  const [isGeneratingOptions, setIsGeneratingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  
  // 世界属性相关状态
  const [worldProperties, setWorldProperties] = useState<WorldPropertyOption[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [propertyDetails, setPropertyDetails] = useState<Record<string, string>>({});
  
  // 处理单个属性的选择
  const handlePropertySelect = (id: string, selected: boolean) => {
    if (selected) {
      setSelectedProperties(prev => [...prev.filter(p => p !== id), id]);
    } else {
      setSelectedProperties(prev => prev.filter(p => p !== id));
    }
  };
  
  // 世界生成相关状态
  const [isGeneratingWorld, setIsGeneratingWorld] = useState(false);
  const [worldContent, setWorldContent] = useState<string>('');
  const [worldError, setWorldError] = useState<string | null>(null);

  // 添加从属性库选择属性的处理函数
  const handleSelectFromLibrary = (libraryItem: WorldPropertyLibraryItem) => {
    // 检查是否已经添加过
    const existingOption = worldProperties.find(opt => opt.name === libraryItem.name);
    
    if (existingOption) {
      // 如果已存在，直接选中
      if (!selectedProperties.includes(existingOption.id)) {
        handlePropertySelect(existingOption.id, true);
      }
      return;
    }
    
    // 转换库项目为选项
    const newOption: WorldPropertyOption = {
      id: libraryItem.id,
      name: libraryItem.name,
      description: libraryItem.description,
      category: libraryItem.category
    };
    
    // 添加到选项列表
    setWorldProperties(prev => [...prev, newOption]);
    
    // 选中新添加的选项
    handlePropertySelect(newOption.id, true);
  };

  // 处理世界属性选项生成
  const handleGenerateOptions = async (llmParams: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (isGeneratingOptions || !selectedWorldType) return;
    
    console.log('开始生成世界属性选项:', {
      worldType: selectedWorldType,
      refinementLevel,
      optionsCount,
      provider: llmParams.provider,
      model: llmParams.model,
      temperature: llmParams.temperature,
      maxTokens: llmParams.maxTokens,
      prompt: llmParams.prompt
    });
    
    setIsGeneratingOptions(true);
    setOptionsError(null);
    
    try {
      console.log('发送请求到 /api/worlds/v2/generate-options');
      const response = await fetch('/api/worlds/v2/generate-options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          worldType: selectedWorldType,
          prompt: llmParams.prompt,
          refinementLevel,
          optionsCount,
          provider: llmParams.provider,
          model: llmParams.model,
          temperature: llmParams.temperature,
          maxTokens: llmParams.maxTokens
        }),
      });
      
      console.log('收到API响应，状态码:', response.status);
      const result = await response.json();
      console.log('解析响应数据:', {
        success: result.success,
        dataLength: result.data?.length || 0,
        error: result.error
      });
      
      if (!result.success) {
        throw new Error(result.error || '生成世界属性选项失败');
      }
      
      console.log('成功生成属性选项，数量:', result.data?.length || 0);
      setWorldProperties(result.data || []);
      // 自动进入下一步
      setCurrentStep('world');
    } catch (error) {
      console.error('生成世界属性选项出错:', error);
      setOptionsError(error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsGeneratingOptions(false);
      console.log('世界属性选项生成流程结束');
    }
  };

  // 处理属性详情变更
  const handlePropertyDetailChange = (id: string, detail: string) => {
    setPropertyDetails(prev => ({
      ...prev,
      [id]: detail
    }));
  };

  // 处理世界生成
  const handleGenerateWorld = async (llmParams: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (isGeneratingWorld || selectedProperties.length === 0) return;
    
    console.log('开始生成世界设定:', {
      selectedPropertiesCount: selectedProperties.length,
      propertyDetailsCount: Object.keys(propertyDetails).length,
      provider: llmParams.provider,
      model: llmParams.model,
      temperature: llmParams.temperature,
      maxTokens: llmParams.maxTokens,
      prompt: llmParams.prompt
    });
    
    console.log('选中的属性:', selectedProperties);
    console.log('属性详情:', propertyDetails);
    
    setIsGeneratingWorld(true);
    setWorldError(null);
    setWorldContent('');
    
    try {
      console.log('发送请求到 /api/worlds/v2/generate');
      const response = await fetch('/api/worlds/v2/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedProperties,
          propertyDetails,
          prompt: llmParams.prompt,
          provider: llmParams.provider,
          model: llmParams.model,
          temperature: llmParams.temperature,
          maxTokens: llmParams.maxTokens
        }),
      });
      
      console.log('收到API响应，状态码:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP错误! 状态码: ${response.status}`);
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法创建响应流读取器');
      }
      
      const decoder = new TextDecoder();
      let accumulatedContent = '';
      let buffer = '';
      
      // 自动进入结果步骤
      setCurrentStep('result');
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('流式响应完成');
            break;
          }
          
          // 处理数据行
          buffer += decoder.decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
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
                
                if (parsed.type === 'content' || parsed.type === 'reasoning') {
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    accumulatedContent += content;
                    setWorldContent(accumulatedContent);
                  }
                } else if (parsed.type === 'error') {
                  const errorMessage = parsed.choices?.[0]?.delta?.content;
                  if (errorMessage) {
                    throw new Error(errorMessage);
                  }
                }
              } catch (e) {
                if (e instanceof SyntaxError) {
                  console.error('JSON解析错误:', e, data);
                } else {
                  throw e;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      // 回调通知生成完成
      if (onGenerateComplete && accumulatedContent) {
        onGenerateComplete(accumulatedContent);
        console.log('已触发生成完成回调');
      }
    } catch (error) {
      console.error('生成世界出错:', error);
      setWorldError(error instanceof Error ? error.message : '未知错误');
    } finally {
      setIsGeneratingWorld(false);
      console.log('世界生成流程结束');
    }
  };

  // 重置当前步骤
  const resetStep = () => {
    if (currentStep === 'world') {
      // 重置世界属性相关状态
      setSelectedProperties([]);
      setPropertyDetails({});
    } else if (currentStep === 'result') {
      // 重置世界内容
      setWorldContent('');
    }
  };

  // 渲染步骤内容
  const renderStepContent = () => {
    switch (currentStep) {
      case 'options':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-3">选择世界类型</h3>
              <WorldTypeSelector 
                value={selectedWorldType}
                onChange={setSelectedWorldType}
                disabled={isGeneratingOptions}
              />
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-3">选项细化程度</h3>
              <RefinementLevelSelector 
                value={refinementLevel}
                onChange={setRefinementLevel}
                disabled={isGeneratingOptions}
              />
            </div>

            <div>
              <h3 className="text-lg font-medium mb-3">生成属性数量</h3>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={optionsCount}
                  onChange={(e) => setOptionsCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isGeneratingOptions}
                />
                <span className="text-sm text-muted-foreground">
                  (1-20之间)
                </span>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-3">补充提示词（可选）</h3>
              <LLMPromptInput 
                inputType="textarea"
                buttonText="生成世界属性选项"
                disabled={isGeneratingOptions || !selectedWorldType}
                onSubmit={handleGenerateOptions}
              />
            </div>
            
            {optionsError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-md">
                错误: {optionsError}
              </div>
            )}
          </div>
        );
        
      case 'world':
        return (
          <div className="space-y-6">
            {worldError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-md">
                错误: {worldError}
              </div>
            )}
            
            <Tabs defaultValue="selected">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="selected">已选属性</TabsTrigger>
                <TabsTrigger value="library">属性库</TabsTrigger>
              </TabsList>
              
              <TabsContent value="selected" className="mt-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {worldProperties.map((option) => (
                      <PropertyOptionCard
                        key={option.id}
                        option={option}
                        selected={selectedProperties.includes(option.id)}
                        detail={propertyDetails[option.id] || ''}
                        worldType={selectedWorldType}
                        onSelect={handlePropertySelect}
                        onDetailChange={handlePropertyDetailChange}
                        disabled={isGeneratingWorld}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="library" className="mt-4">
                <PropertyLibrary 
                  worldType={selectedWorldType} 
                  onSelectProperty={handleSelectFromLibrary}
                />
              </TabsContent>
            </Tabs>
            
            <LLMPromptInput 
              inputType="textarea"
              buttonText="生成世界"
              disabled={isGeneratingWorld || selectedProperties.length === 0}
              onSubmit={handleGenerateWorld}
            />
            
          </div>
        );
        
      case 'result':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>生成的世界</CardTitle>
              </CardHeader>
              <CardContent>
                <MarkdownEditor 
                  value={worldContent}
                  onChange={(value) => value !== undefined && setWorldContent(value)}
                  preview="preview"
                  height={600}
                />
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  // 渲染步骤控制按钮
  const renderStepActions = () => {
    switch (currentStep) {
      case 'options':
        return (
          <div className="flex justify-between">
            <div></div>
            <Button
              onClick={() => setCurrentStep('world')}
              disabled={isGeneratingOptions || worldProperties.length === 0}
            >
              下一步: 选择世界属性
            </Button>
          </div>
        );
        
      case 'world':
        return (
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                resetStep();
                setCurrentStep('options');
              }}
              disabled={isGeneratingWorld}
            >
              上一步: 选择世界类型
            </Button>
            <Button
              onClick={() => setCurrentStep('result')}
              disabled={isGeneratingWorld || worldContent === ''}
            >
              下一步: 查看世界
            </Button>
          </div>
        );
        
      case 'result':
        return (
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                resetStep();
                setCurrentStep('world');
              }}
            >
              上一步: 选择世界属性
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // 重置所有状态，重新开始
                setSelectedWorldType('');
                setRefinementLevel('standard');
                setWorldProperties([]);
                setSelectedProperties([]);
                setPropertyDetails({});
                setWorldContent('');
                setCurrentStep('options');
              }}
            >
              重新开始
            </Button>
          </div>
        );
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl">世界生成器 v2</CardTitle>
        <CardDescription>
          创建丰富详实的小说世界背景
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={currentStep} className="w-full">
          <TabsList className="grid grid-cols-3 mb-8">
            <TabsTrigger 
              value="options" 
              onClick={() => !isGeneratingOptions && setCurrentStep('options')}
              disabled={isGeneratingOptions}
            >
              1. 选择世界类型
            </TabsTrigger>
            <TabsTrigger 
              value="world" 
              onClick={() => !isGeneratingWorld && worldProperties.length > 0 && setCurrentStep('world')}
              disabled={isGeneratingWorld || worldProperties.length === 0}
            >
              2. 选择世界属性
            </TabsTrigger>
            <TabsTrigger 
              value="result" 
              onClick={() => worldContent !== '' && setCurrentStep('result')}
              disabled={worldContent === ''}
            >
              3. 生成世界
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value={currentStep} className="mt-0">
            {renderStepContent()}
            
            <div className="mt-8">
              {renderStepActions()}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
} 