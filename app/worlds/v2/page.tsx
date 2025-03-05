'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import WorldGeneratorV2 from '../../components/v2/WorldGeneratorV2';

export default function WorldGeneratorV2Page() {
  const [generatedContent, setGeneratedContent] = useState<string>('');

  const handleGenerateComplete = (content: string) => {
    setGeneratedContent(content);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">世界生成器 V2</h1>
      
      <div className="grid grid-cols-1 gap-8">
        <WorldGeneratorV2 onGenerateComplete={handleGenerateComplete} />
      </div>
    </div>
  );
} 