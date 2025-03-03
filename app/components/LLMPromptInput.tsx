'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Loader2 } from 'lucide-react';
import { Label } from './ui/label';
import dynamic from 'next/dynamic';

interface LLMModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface LLMPromptInputProps {
  // 输入框类型
  inputType?: 'input' | 'textarea';
  // 按钮文本
  buttonText?: string;
  // 是否禁用
  disabled?: boolean;
  // 回调函数
  onSubmit: (data: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => void;
}

interface APIKeyData {
  provider: string;
  hasKey: boolean;
}

// 使用 dynamic import 并禁用 SSR
const LLMPromptInputComponent = ({
  inputType = 'input',
  buttonText = 'AI 生成',
  disabled = false,
  onSubmit,
}: LLMPromptInputProps) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<APIKeyData[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [models, setModels] = useState<LLMModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(4000);

  useEffect(() => {
    fetchProviders();
  }, []);

  useEffect(() => {
    if (providers.length > 0) {
      // 设置 deepseek 为默认提供商
      const deepseekProvider = providers.find(p => p.provider === 'deepseek');
      if (deepseekProvider) {
        setSelectedProvider('deepseek');
      } else {
        // 如果没有 deepseek，则使用第一个可用的提供商
        setSelectedProvider(providers[0].provider);
      }
    }
  }, [providers]);

  useEffect(() => {
    if (selectedProvider) {
      fetchModels();
    }
  }, [selectedProvider]);

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/settings/apikeys');
      if (!response.ok) throw new Error('获取API密钥列表失败');
      const data = await response.json();
      if (data.success && data.data) {
        setProviders(data.data);
      }
    } catch (error) {
      console.error('获取API提供商列表失败:', error);
    }
  };

  const fetchModels = async () => {
    if (!selectedProvider) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/llm/models?provider=${selectedProvider}`);
      if (!response.ok) throw new Error('获取模型列表失败');
      const data = await response.json();
      
      if (data.success && data.data?.models) {
        // 过滤出聊天和指令类模型
        const chatModels = data.data.models.filter((model: LLMModel) => {
          const modelId = model.id.toLowerCase();
          return (
            modelId.includes('chat') ||
            modelId.includes('instruct') ||
            modelId.includes('yi') ||
            modelId.includes('glm') ||
            modelId.includes('qwen') ||
            modelId.includes('flux') ||
            modelId.includes('telechat') ||
            modelId.includes('deepseek')
          ) && !modelId.includes('embedding') 
            && !modelId.includes('reranker')
            && !modelId.includes('stable-diffusion')
            && !modelId.includes('vl')
            && !modelId.includes('video')
            && !modelId.includes('speech')
            && !modelId.includes('voice');
        });
        
        setModels(chatModels);
        // 如果有可用模型，默认选择第一个
        if (chatModels.length > 0) {
          setSelectedModel(chatModels[0].id);
        }
      }
    } catch (error) {
      console.error('获取模型列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    setSelectedModel(''); // 清空已选模型
  };

  const handleSubmit = async () => {
    if (!selectedProvider || !selectedModel || disabled || isLoading) return;
    if (inputType === 'textarea' && !prompt.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit({
        provider: selectedProvider,
        model: selectedModel,
        prompt: inputType === 'input' ? '' : prompt.trim(),
        temperature,
        maxTokens: maxTokens,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const providerOptions = [
    { value: 'deepseek', label: 'Deepseek' },
    { value: 'volc', label: '火山方舟' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'cohere', label: 'Cohere' },
    { value: 'siliconflow', label: '硅基流动' },
  ];

  // 获取模型的显示名称
  const getModelDisplayName = (modelId: string) => {
    const parts = modelId.split('/');
    return parts[parts.length - 1];
  };

  return (
    <div className="space-y-4 w-full m-4">
      <div className="flex gap-4 w-full">
        <Select
          value={selectedProvider}
          onValueChange={handleProviderChange}
          disabled={disabled || isLoading}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="选择 LLM 提供商" />
          </SelectTrigger>
          <SelectContent>
            {providerOptions
              .filter(option => 
                providers.some(p => p.provider === option.value && p.hasKey)
              )
              .map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedModel}
          onValueChange={setSelectedModel}
          disabled={disabled || isLoading || !selectedProvider}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={isLoading ? "加载模型中..." : "选择模型"} />
          </SelectTrigger>
          <SelectContent className="w-full max-h-[300px] overflow-y-auto">
            {models.map(model => (
              <SelectItem key={model.id} value={model.id}>
                {getModelDisplayName(model.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="space-y-2">
          <Label htmlFor="temperature">Temperature ({temperature})</Label>
          <div className="flex items-center gap-2">
            <Input
              id="temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="flex-1"
            />
            <Input
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-20"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxTokens">最大 Tokens</Label>
          <Input
            id="maxTokens"
            type="number"
            min="1"
            max="8000"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </div>
      </div>

      {inputType === 'input' ? (
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!selectedProvider || !selectedModel || disabled || isLoading}
            className="w-24"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              buttonText
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="请输入提示词..."
            disabled={disabled || isLoading || !selectedModel}
            className="min-h-[120px] resize-y"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim() || !selectedProvider || !selectedModel || disabled || isLoading}
              className="w-24"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                buttonText
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// 导出一个禁用 SSR 的版本
export const LLMPromptInput = dynamic(() => Promise.resolve(LLMPromptInputComponent), {
  ssr: false as const
}); 