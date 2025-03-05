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
  const [isGeneratingOptions, setIsGeneratingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  
  // 世界属性相关状态
  const [worldProperties, setWorldProperties] = useState<WorldPropertyOption[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [propertyDetails, setPropertyDetails] = useState<Record<string, string>>({});
  
  // 世界生成相关状态
  const [isGeneratingWorld, setIsGeneratingWorld] = useState(false);
  const [worldContent, setWorldContent] = useState<string>('');
  const [worldError, setWorldError] = useState<string | null>(null);

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
      const result = await response.json();
      console.log('解析响应数据:', {
        success: result.success,
        hasData: !!result.data,
        error: result.error,
        contentLength: result.data?.length || 0
      });
      
      if (!result.success) {
        throw new Error(result.error || '生成失败');
      }
      
      console.log('成功生成世界设定，内容长度:', result.data?.length || 0);
      // 只使用result.data作为内容
      setWorldContent(result.data);
      
      // 自动进入结果步骤
      setCurrentStep('result');
      
      // 回调通知生成完成
      if (onGenerateComplete) {
        onGenerateComplete(result.data);
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
            <WorldPropertySelector 
              properties={worldProperties}
              selectedProperties={selectedProperties}
              onSelect={setSelectedProperties}
              propertyDetails={propertyDetails}
              onPropertyDetailChange={handlePropertyDetailChange}
              disabled={isGeneratingWorld}
            />
            
            <div>
              <h3 className="text-lg font-medium mb-3">补充提示词（可选）</h3>
              <LLMPromptInput 
                inputType="textarea"
                buttonText="生成世界"
                disabled={isGeneratingWorld || selectedProperties.length === 0}
                onSubmit={handleGenerateWorld}
              />
            </div>
            
            {worldError && (
              <div className="p-4 bg-red-50 text-red-600 rounded-md">
                错误: {worldError}
              </div>
            )}
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
                {isGeneratingWorld ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="ml-3">正在生成世界...</span>
                  </div>
                ) : (
                  <MarkdownEditor 
                    value={worldContent}
                    onChange={(value) => value !== undefined && setWorldContent(value)}
                    preview="preview"
                    height={600}
                  />
                )}
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