'use client';

import { useState, useEffect } from 'react';
import { SystemPrompt, chatHistoryDB } from '../lib/indexedDB';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import ResetDatabase from './ResetDatabase';

export default function DebugInfo() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [activePrompt, setActivePrompt] = useState<SystemPrompt | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const loadData = async () => {
    try {
      // 获取所有系统提示词
      const allPrompts = await chatHistoryDB.getAllSystemPrompts();
      setPrompts(allPrompts);
      
      // 获取活跃的系统提示词
      const active = await chatHistoryDB.getActiveSystemPrompt();
      setActivePrompt(active);
      
      console.log('已加载系统提示词:', allPrompts);
      console.log('活跃系统提示词:', active);
    } catch (error) {
      console.error('调试信息加载失败:', error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (!showDebug) {
    return (
      <Button 
        size="sm" 
        onClick={() => setShowDebug(true)}
        className="absolute top-2 right-2 z-50 bg-yellow-500 hover:bg-yellow-600"
      >
        显示调试信息
      </Button>
    );
  }

  return (
    <Card className="absolute top-20 right-2 z-50 w-96 max-h-[80vh] overflow-auto">
      <CardHeader className="pb-2">
        <CardTitle className="flex justify-between items-center">
          <span>调试信息</span>
          <Button size="sm" onClick={() => setShowDebug(false)}>关闭</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">系统提示词 ({prompts.length})</h3>
            {prompts.length > 0 ? (
              <ul className="list-disc list-inside space-y-2 mt-2">
                {prompts.map(prompt => (
                  <li key={prompt.id} className="text-sm">
                    <span className={prompt.type === 'agent' ? 'text-blue-500' : 'text-green-500'}>
                      [{prompt.type}]
                    </span>{' '}
                    <strong>{prompt.name}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">未找到系统提示词</p>
            )}
          </div>
          
          <div>
            <h3 className="text-lg font-semibold">活跃系统提示词</h3>
            {activePrompt ? (
              <div className="text-sm mt-2 p-2 bg-muted rounded">
                <p><strong>ID:</strong> {activePrompt.id}</p>
                <p><strong>名称:</strong> {activePrompt.name}</p>
                <p><strong>类型:</strong> {activePrompt.type}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">未找到活跃系统提示词</p>
            )}
          </div>
          
          <div className="flex justify-between items-center">
            <Button size="sm" onClick={loadData}>刷新数据</Button>
            <ResetDatabase />
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 