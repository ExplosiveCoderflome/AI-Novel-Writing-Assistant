'use client'

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, RefreshCw } from 'lucide-react';

/**
 * LangChain测试页面
 * 用于测试LangChain集成效果
 */
export default function LangChainTestPage() {
  const [prompt, setPrompt] = useState('你好，请介绍一下LangChain的主要功能和应用场景。');
  const [provider, setProvider] = useState('openai');
  const [isStreaming, setIsStreaming] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const responseRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // 清理函数，确保在组件卸载时取消所有挂起的请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 清除之前的响应和错误
    setResponse('');
    setError('');
    setIsLoading(true);
    
    // 创建新的 AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    try {
      console.log('提交请求，参数:', {
        prompt,
        provider,
        stream: isStreaming,
        temperature,
        maxTokens
      });
      
      // 构建请求参数
      const requestBody = {
        prompt,
        provider,
        stream: isStreaming,
        temperature,
        maxTokens
      };
      
      // 发送请求到API
      if (isStreaming) {
        // 处理流式响应
        const response = await fetch('/api/llm/langchain', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `请求失败，状态码: ${response.status}`);
        }
        
        if (!response.body) {
          throw new Error('响应没有返回数据流');
        }
        
        // 处理数据流
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';
        
        try {
          // 开始流式接收之前设置加载状态
          setIsLoading(false);
          
          while (true) {
            const { value, done } = await reader.read();
            
            if (done) {
              console.log('流式响应接收完成');
              break;
            }
            
            // 解码接收到的数据
            const decodedValue = decoder.decode(value, { stream: true });
            console.log('接收到数据块:', decodedValue.length, '字节');
            
            // 分割多个JSON对象
            // 有时单个chunk可能包含多个完整的JSON对象
            const jsonChunks = decodedValue
              .split('}\n{')
              .map((chunk, index, array) => {
                if (index === 0) return chunk + (array.length > 1 ? '}' : '');
                if (index === array.length - 1) return '{' + chunk;
                return '{' + chunk + '}';
              })
              .filter(chunk => chunk.trim());
            
            for (const jsonChunk of jsonChunks) {
              try {
                let chunk;
                try {
                  // 尝试解析单个JSON对象
                  chunk = JSON.parse(jsonChunk);
                } catch (parseError) {
                  // 如果解析失败，尝试修复并再次解析
                  // 有时json对象可能被分割
                  console.warn('JSON解析失败，尝试修复:', jsonChunk);
                  
                  // 尝试查找完整的JSON对象
                  const match = jsonChunk.match(/\{.*\}/);
                  if (match) {
                    chunk = JSON.parse(match[0]);
                  } else {
                    console.error('无法修复JSON:', jsonChunk);
                    continue;
                  }
                }
                
                console.log('解析的数据类型:', chunk.type);
                
                if (chunk.type === 'content') {
                  // 立即更新状态以实现流式效果
                  const newContent = chunk.content || '';
                  accumulatedContent += newContent;
                  
                  // 立即更新UI，强制React渲染
                  setResponse(prev => {
                    const updated = prev + newContent;
                    requestAnimationFrame(() => {
                      if (responseRef.current) {
                        responseRef.current.scrollTop = responseRef.current.scrollHeight;
                      }
                    });
                    return updated;
                  });
                } else if (chunk.type === 'error') {
                  throw new Error(chunk.content || '获取响应时发生错误');
                }
              } catch (parseError) {
                console.error('处理JSON块错误:', parseError, '原始数据:', jsonChunk);
              }
            }
          }
        } catch (streamError: any) {
          if (streamError.name !== 'AbortError') {
            console.error('流处理错误:', streamError);
            setError(`流处理错误: ${streamError.message}`);
          }
        } finally {
          reader.releaseLock();
          setIsLoading(false);
        }
      } else {
        // 处理标准响应
        const response = await fetch('/api/llm/langchain', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `请求失败，状态码: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        setResponse(data.content || '');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('请求错误:', error);
        setError(`请求错误: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };
  
  // 取消请求
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      setError('请求已取消');
    }
  };
  
  // 清除响应
  const handleClear = () => {
    setResponse('');
    setError('');
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">LangChain 测试页面</h1>
      <p className="text-gray-500 mb-6">测试 LangChain 集成效果，支持流式响应和多种大语言模型</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 控制面板 */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>请求参数</CardTitle>
              <CardDescription>配置 LLM 请求参数</CardDescription>
            </CardHeader>
            <CardContent>
              <form id="langchainForm" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">提供商</Label>
                  <Select value={provider} onValueChange={setProvider}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择提供商" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="deepseek">Deepseek</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="streaming">流式响应</Label>
                  <div className="flex items-center space-x-2">
                    <Switch 
                      id="streaming" 
                      checked={isStreaming} 
                      onCheckedChange={setIsStreaming}
                    />
                    <Label htmlFor="streaming">{isStreaming ? '启用' : '禁用'}</Label>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="temperature">温度 ({temperature})</Label>
                  <Input
                    id="temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="maxTokens">最大 Token</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    min="100"
                    max="8000"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  />
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
              <Button 
                type="submit" 
                form="langchainForm" 
                className="w-full" 
                disabled={isLoading || !prompt.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    开始生成
                  </>
                )}
              </Button>
              
              {isLoading && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleCancel}
                >
                  取消请求
                </Button>
              )}
              
              {response && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleClear}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  清除响应
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
        
        {/* 输入和输出区域 */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>提示词</CardTitle>
              <CardDescription>输入要发送给 LLM 的提示词</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="输入提示词..."
                className="min-h-[120px]"
                disabled={isLoading}
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>响应</CardTitle>
              <CardDescription>LLM 响应内容</CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                ref={responseRef}
                className="bg-secondary p-4 rounded-md min-h-[200px] max-h-[400px] overflow-auto whitespace-pre-wrap"
              >
                {error ? (
                  <p className="text-red-500">{error}</p>
                ) : response ? (
                  response
                ) : isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <p className="text-muted-foreground">响应将显示在这里...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 