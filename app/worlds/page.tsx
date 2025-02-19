'use client';

import React from 'react';
import { WorldGenerator } from '../components/WorldGenerator';
import { WorldDisplay } from '../components/WorldDisplay';
import { WorldList } from '../components/WorldList';
import { WorldGenerationParams, GeneratedWorld } from '../types/world';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function WorldsPage() {
  const [generatedWorld, setGeneratedWorld] = useState<GeneratedWorld | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (params: WorldGenerationParams & {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    try {
      setIsGenerating(true);
      setError(null);
      setGeneratedWorld(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成世界时发生未知错误');
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
            <div>
              <WorldGenerator
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
              
              {error && (
                <Card className="mt-4 border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive">生成失败</CardTitle>
                    <CardDescription>{error}</CardDescription>
                  </CardHeader>
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