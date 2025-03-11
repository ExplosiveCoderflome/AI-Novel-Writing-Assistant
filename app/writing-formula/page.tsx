'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import FormulaExtractor from '../components/writing-formula/FormulaExtractor';
import FormulaApplicator from '../components/writing-formula/FormulaApplicator';
import FormulaList from '../components/writing-formula/FormulaList';

/**
 * 写作公式页面
 */
const WritingFormulaPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('extract');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">写作公式提取与应用</h1>
        <p className="text-muted-foreground mt-2">
          提取文本中的写作风格和技巧，创建可重用的写作公式，并将其应用于新内容
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="extract">提取公式</TabsTrigger>
          <TabsTrigger value="apply">应用公式</TabsTrigger>
          <TabsTrigger value="library">公式库</TabsTrigger>
        </TabsList>
        <TabsContent value="extract" className="mt-6">
          <FormulaExtractor />
        </TabsContent>
        <TabsContent value="apply" className="mt-6">
          <FormulaApplicator />
        </TabsContent>
        <TabsContent value="library" className="mt-6">
          <FormulaList />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WritingFormulaPage; 