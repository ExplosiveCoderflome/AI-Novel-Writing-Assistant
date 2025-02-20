'use client';

import React, { useState } from 'react';
import { WorldGenerator } from '../components/WorldGenerator';
import { WorldDisplay } from '../components/WorldDisplay';
import { WorldList } from '../components/WorldList';
import { WorldGenerationParams, GeneratedWorld } from '../types/world';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from '../components/ui/use-toast';

export default function WorldsPage() {
  const [generatedWorld, setGeneratedWorld] = useState<GeneratedWorld | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState('');

  const handleGenerate = async (params: WorldGenerationParams & {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    try {
      setIsGenerating(true);
      setStreamContent('');
      setGeneratedWorld(null);

      const response = await fetch('/api/worlds/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
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
                setStreamContent(prev => prev + (parsed.choices[0]?.delta?.content || ''));
              } else if (parsed.type === 'json') {
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
      toast({
        title: '生成失败',
        description: error instanceof Error ? error.message : '生成世界时发生未知错误',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">世界管理</h1>
        <p className="text-muted-foreground mt-2">
          创建和管理你的小说世界设定
        </p>
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generate">生成新世界</TabsTrigger>
          <TabsTrigger value="saved">已保存的世界</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <WorldGenerator
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
              
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
            </div>

            <div>
              {generatedWorld && <WorldDisplay world={generatedWorld} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="saved">
          <WorldList />
        </TabsContent>
      </Tabs>
    </div>
  );
} 