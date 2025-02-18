'use client';

import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Label } from '../components/ui/label';
import { toast } from '../components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Key, Save, Trash2, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useRecommendationStore } from '../store/recommendation';
import { Separator } from '../components/ui/separator';
import { useToast } from '../components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

interface APIKeyData {
  id: string;
  provider: string;
  isActive: boolean;
  hasKey: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SiliconFlowModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

const providers = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-3.5/GPT-4 API',
    placeholder: 'sk-...'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude API',
    placeholder: 'sk-ant-...'
  },
  {
    id: 'deepseek',
    name: 'Deepseek',
    description: 'Deepseek Chat/Code API',
    placeholder: 'sk-...'
  },
  {
    id: 'cohere',
    name: 'Cohere',
    description: 'Command API',
    placeholder: 'Co-...'
  },
  {
    id: 'volc',
    name: '火山引擎',
    description: 'Volc Engine API',
    placeholder: 'volc-...'
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    description: 'SiliconFlow API',
    placeholder: 'sf-...'
  }
];

export default function SettingsPage() {
  const { selectedLLM, setSelectedLLM } = useRecommendationStore();
  const [apiKeys, setApiKeys] = useState<APIKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, SiliconFlowModel[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [speedTestResults, setSpeedTestResults] = useState<Record<string, { duration: number; response: string; model: string } | null>>({});
  const [testingSpeed, setTestingSpeed] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const llmOptions = [
    { value: 'volc', label: '火山方舟' },
    { value: 'deepseek', label: 'Deepseek' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'cohere', label: 'Cohere' },
    { value: 'siliconflow', label: '硅基流动' },
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings/apikeys');
      if (!response.ok) throw new Error('获取设置失败');
      const data = await response.json();
      
      if (data.success) {
        setApiKeys(data.data);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
      toast({
        title: '加载失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (provider: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [provider]: value
    }));
  };

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider);
    try {
      const response = await fetch('/api/llm/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: '连接测试成功',
          description: `${provider} API 连接正常`,
        });
      } else {
        throw new Error(data.error || '连接测试失败');
      }
    } catch (error) {
      console.error('测试连接失败:', error);
      toast({
        title: '测试失败',
        description: error instanceof Error ? error.message : '请检查 API Key 是否正确',
        variant: 'destructive',
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleModelSelect = (provider: string, modelId: string) => {
    setSelectedModels(prev => ({
      ...prev,
      [provider]: modelId
    }));
  };

  const handleTestSpeed = async (provider: string) => {
    const selectedModel = selectedModels[provider];
    if (!selectedModel) {
      toast({
        title: '请先选择模型',
        description: '需要选择一个模型来进行速度测试',
        variant: 'destructive',
      });
      return;
    }

    setTestingSpeed(provider);
    try {
      const response = await fetch('/api/llm/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          provider, 
          type: 'speed',
          model: selectedModel
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setSpeedTestResults(prev => ({
          ...prev,
          [provider]: data.data
        }));
        toast({
          title: '速度测试完成',
          description: `响应时间: ${data.data.duration}ms`,
        });
      } else {
        throw new Error(data.error || '速度测试失败');
      }
    } catch (error) {
      console.error('速度测试失败:', error);
      toast({
        title: '测试失败',
        description: error instanceof Error ? error.message : '请检查 API Key 是否正确',
        variant: 'destructive',
      });
      setSpeedTestResults(prev => ({
        ...prev,
        [provider]: null
      }));
    } finally {
      setTestingSpeed(null);
    }
  };

  const handleSave = async (provider: string) => {
    if (!formData[provider]?.trim()) {
      toast({
        title: '请输入 API Key',
        description: 'API Key 不能为空',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/settings/apikey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          apiKey: formData[provider],
        }),
      });

      if (!response.ok) {
        throw new Error('保存失败');
      }

      toast({
        title: '保存成功',
        description: `${provider} API Key 已更新`,
      });

      // 重新加载设置
      await loadSettings();
    } catch (error) {
      console.error('保存设置失败:', error);
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async (provider: string) => {
    if (!apiKeys.find(k => k.provider === provider)?.hasKey) return;
    
    try {
      setLoadingModels(prev => ({ ...prev, [provider]: true }));
      const response = await fetch(`/api/llm/models?provider=${provider}`);
      const data: APIResponse<{ models: SiliconFlowModel[] }> = await response.json();
      
      if (data.success && data.data) {
        const models = data.data.models;
        if (Array.isArray(models)) {
          setModelsByProvider(prev => ({
            ...prev,
            [provider]: models
          }));
        }
      } else if (data.error) {
        toast({
          title: '获取模型列表失败',
          description: data.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('获取模型列表失败:', error);
      toast({
        title: '获取模型列表失败',
        description: '请求失败，请检查网络连接',
        variant: 'destructive',
      });
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }));
    }
  };

  useEffect(() => {
    apiKeys.forEach(key => {
      if (key.hasKey) {
        fetchModels(key.provider);
      }
    });
  }, [apiKeys]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-muted-foreground">
          配置 AI 模型提供商的 API Key 和其他设置
        </p>
      </div>

      <Tabs defaultValue="api-keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="preferences">偏好设置</TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {providers.map(provider => {
              const apiKey = apiKeys.find(k => k.provider === provider.id);
              const models = modelsByProvider[provider.id] || [];
              const isLoadingModels = loadingModels[provider.id];

              return (
                <Card key={provider.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{provider.name}</span>
                      {apiKey?.hasKey && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                    </CardTitle>
                    <CardDescription>{provider.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${provider.id}-key`}>API Key</Label>
                      <Input
                        id={`${provider.id}-key`}
                        type="password"
                        placeholder={provider.placeholder}
                        value={formData[provider.id] || ''}
                        onChange={(e) => handleInputChange(provider.id, e.target.value)}
                      />
                    </div>
                    
                    {apiKey?.hasKey && (
                      <div className="space-y-2">
                        <Label>可用模型</Label>
                        <div className="border rounded-md p-4">
                          {isLoadingModels ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="ml-2">加载模型列表...</span>
                            </div>
                          ) : models.length > 0 ? (
                            <div className="space-y-2">
                              {models.map((model) => (
                                <div 
                                  key={model.id} 
                                  className={`flex items-center justify-between p-2 hover:bg-accent rounded-md cursor-pointer ${
                                    selectedModels[provider.id] === model.id ? 'bg-accent' : ''
                                  }`}
                                  onClick={() => handleModelSelect(provider.id, model.id)}
                                >
                                  <div>
                                    <p className="font-medium">{model.id}</p>
                                    <p className="text-sm text-muted-foreground">
                                      所有者: {model.owned_by}
                                    </p>
                                  </div>
                                  {selectedModels[provider.id] === model.id && (
                                    <CheckCircle className="h-4 w-4 text-primary" />
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              暂无可用模型
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleTestConnection(provider.id)}
                        disabled={loading || testingProvider === provider.id || !apiKey?.hasKey}
                      >
                        {testingProvider === provider.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            测试中
                          </>
                        ) : (
                          '测试连接'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleTestSpeed(provider.id)}
                        disabled={loading || testingSpeed === provider.id || !apiKey?.hasKey || !selectedModels[provider.id]}
                      >
                        {testingSpeed === provider.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            测试中
                          </>
                        ) : (
                          '测试速度'
                        )}
                      </Button>
                      <Button
                        onClick={() => handleSave(provider.id)}
                        disabled={loading || !formData[provider.id]?.trim()}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            保存中
                          </>
                        ) : (
                          '保存'
                        )}
                      </Button>
                    </div>
                    {speedTestResults[provider.id] && (
                      <div className="mt-2 p-2 bg-muted rounded-md text-sm">
                        <p>测试模型: {speedTestResults[provider.id]?.model}</p>
                        <p>响应时间: {speedTestResults[provider.id]?.duration}ms</p>
                        <p className="truncate">响应内容: {speedTestResults[provider.id]?.response}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>偏好设置</CardTitle>
              <CardDescription>
                自定义你的使用体验
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                更多设置选项即将推出...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 