/*
 * @LastEditors: biz
 */
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

  const handleGenerate = async (params: WorldGenerationParams & {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    try {
      setIsGenerating(true);
      setGeneratedWorld(null);

      const requestBody = {
        ...params,
        dimensionOptions: params.dimensionOptions,
      };

      const response = await fetch('/api/worlds/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '生成世界失败');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '生成世界失败');
      }

      setGeneratedWorld(data.data);
    } catch (error) {
      console.error('生成世界失败:', error);
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
            <WorldGenerator
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
            />

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