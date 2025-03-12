'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import FormulaExtractor from '../components/writing-formula/FormulaExtractor';
import FormulaApplicator from '../components/writing-formula/FormulaApplicator';
import FormulaList from '../components/writing-formula/FormulaList';
import { toast } from 'sonner';

interface Formula {
  id: string;
  name: string;
  sourceText?: string;
  content?: string;
  genre?: string;
  style?: string;
  toneVoice?: string;
  createdAt: string;
  updatedAt: string;
  analysis?: any;
}

/**
 * 写作公式页面
 */
const WritingFormulaPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('extract');
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const searchParams = useSearchParams();
  const formulaId = searchParams?.get('id') || null;

  // 如果URL中有id参数，自动切换到应用公式标签
  useEffect(() => {
    if (formulaId) {
      setActiveTab('apply');
    }
  }, [formulaId]);

  // 获取公式列表数据
  useEffect(() => {
    const fetchFormulas = async () => {
      try {
        setIsLoading(true);
        // 修正：使用正确的API端点
        const response = await fetch('/api/writing-formula/list');
        
        if (!response.ok) {
          throw new Error('获取公式列表失败');
        }
        
        const data = await response.json();
        if (data.success && data.data?.formulas) {
          setFormulas(data.data.formulas);
        } else {
          // 如果响应格式不是列表中预期的格式，记录错误
          console.error('API响应格式不符合预期:', data);
          toast.error('获取公式列表失败：响应格式不正确');
        }
      } catch (error) {
        console.error('获取公式列表错误:', error);
        toast.error('获取公式列表失败，请重试');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFormulas();
  }, []);

  // 如果URL中指定了formulaId，但公式列表中没有，尝试单独获取
  useEffect(() => {
    const fetchSingleFormula = async () => {
      if (!formulaId || !formulas.length) return;
      
      // 检查formulaId是否在已加载的公式列表中
      const formulaExists = formulas.some(f => f.id === formulaId);
      if (!formulaExists) {
        try {
          const response = await fetch(`/api/writing-formula/detail/${formulaId}`);
          if (!response.ok) {
            console.warn(`指定的公式ID(${formulaId})未找到`);
            return;
          }
          
          const data = await response.json();
          if (data.success && data.data) {
            // 将单独获取的公式添加到列表中
            setFormulas(prev => [...prev, data.data]);
          }
        } catch (error) {
          console.error('获取单个公式失败:', error);
        }
      }
    };
    
    fetchSingleFormula();
  }, [formulaId, formulas]);

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
          <FormulaApplicator 
            formulas={formulas} 
            initialFormulaId={formulaId || undefined} 
          />
        </TabsContent>
        <TabsContent value="library" className="mt-6">
          <FormulaList onFormulaSelect={(id) => {
            setActiveTab('apply');
          }} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default WritingFormulaPage; 