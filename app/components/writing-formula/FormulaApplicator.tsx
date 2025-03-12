import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LLMPromptInput } from '../LLMPromptInput';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

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

interface FormulaApplicatorProps {
  formulas?: Formula[];
  onFormulaApplied?: (result: string) => void;
  initialFormulaId?: string;
}

// 默认写作公式应用提示词
const DEFAULT_FORMULA_APPLICATION_PROMPT = `你是一位专业的写作助手，能够按照特定的写作风格改写文本。
请按照以下写作公式，改写用户提供的文本：

写作风格概述：
{summary}

写作技巧：
{techniques}

风格指南：
{styleGuide}

应用提示：
{applicationTips}

请确保改写后的文本保持原文的核心意思，但风格应该符合上述写作公式的特点。
不要简单地复制原文，而是要真正按照指定的风格进行创造性改写。`;

const FormulaApplicator: React.FC<FormulaApplicatorProps> = ({ formulas = [], onFormulaApplied, initialFormulaId }) => {
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(initialFormulaId || '');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [streamText, setStreamText] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (formulas.length > 0 && !selectedFormulaId) {
      setSelectedFormulaId(formulas[0].id);
    } else if (initialFormulaId && formulas.length > 0) {
      // 检查initialFormulaId是否在formulas列表中
      const formulaExists = formulas.some(f => f.id === initialFormulaId);
      if (formulaExists) {
        setSelectedFormulaId(initialFormulaId);
      }
    }
  }, [formulas, selectedFormulaId, initialFormulaId]);

  useEffect(() => {
    // 当选择的公式变化时，更新系统提示词
    if (selectedFormulaId) {
      const selectedFormula = formulas.find(f => f.id === selectedFormulaId);
      if (selectedFormula) {
        // 构建系统提示词
        let prompt = DEFAULT_FORMULA_APPLICATION_PROMPT;
        
        if (selectedFormula.content) {
          // 如果有content字段，直接使用Markdown内容
          prompt = `你是一位专业的写作助手，能够按照特定的写作风格改写文本。
请按照以下写作公式，改写用户提供的文本：

写作公式：
${selectedFormula.content}

请确保改写后的文本保持原文的核心意思，但风格应该符合上述写作公式的特点。
不要简单地复制原文，而是要真正按照指定的风格进行创造性改写。`;
        } else if (selectedFormula.analysis) {
          // 兼容旧格式，使用analysis字段
          const analysis = selectedFormula.analysis;
          
          // 替换占位符
          prompt = prompt.replace('{summary}', analysis.summary || '未提供');
          prompt = prompt.replace('{techniques}', JSON.stringify(analysis.techniques || [], null, 2));
          prompt = prompt.replace('{styleGuide}', JSON.stringify(analysis.styleGuide || {}, null, 2));
          prompt = prompt.replace('{applicationTips}', JSON.stringify(analysis.applicationTips || [], null, 2));
        }
        
        setSystemPrompt(prompt);
      }
    }
  }, [selectedFormulaId, formulas]);

  const handleLLMSubmit = async (data: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    agentMode?: boolean;
  }) => {
    if (!selectedFormulaId) {
      toast.error('请选择写作公式');
      return;
    }

    if (!inputText.trim()) {
      toast.error('请输入需要应用公式的文本');
      return;
    }

    setIsApplying(true);
    setIsStreaming(true);
    setStreamText('');
    setOutputText('');

    try {
      const response = await fetch('/api/writing-formula/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formulaId: selectedFormulaId,
          inputText,
          provider: data.provider,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          systemPrompt: data.systemPrompt || systemPrompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '应用失败');
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let result = '';
      let hasError = false;
      let hasStartedReceiving = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 将 Uint8Array 转换为文本
        const text = new TextDecoder().decode(value);
        
        // 处理 SSE 格式的数据
        const lines = text.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              if (jsonStr === '[DONE]') continue;
              
              const eventData = JSON.parse(jsonStr);
              
              if (eventData.type === 'error') {
                hasError = true;
                throw new Error(eventData.error);
              }
              
              if (eventData.type === 'content' && eventData.choices && eventData.choices[0].delta.content) {
                // 累积内容
                const content = eventData.choices[0].delta.content;
                result += content;
                
                // 直接更新流式文本状态，这会触发重新渲染
                setStreamText(result);
                // 同时更新输出文本
                setOutputText(result);
                
                // 接收到第一个内容后，切换到结果标签页
                if (!hasStartedReceiving) {
                  hasStartedReceiving = true;
                  setActiveTab('result');
                  toast.success('正在应用写作公式，请稍候...');
                }
              }
            } catch (e) {
              if (hasError) {
                throw e;
              }
              // 解析错误，继续累积
              console.log('解析 SSE 数据失败:', e);
            }
          }
        }
      }

      if (result) {
        // 已经在流式响应开始时切换了标签页，这里不再需要
        if (onFormulaApplied) {
          onFormulaApplied(result);
        }

        toast.success('写作公式应用完成');
      } else {
        toast.error('未能成功应用写作公式');
      }
    } catch (error) {
      console.error('应用写作公式失败:', error);
      toast.error(error instanceof Error ? error.message : '应用失败，请重试');
    } finally {
      setIsApplying(false);
      setIsStreaming(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>写作公式应用器</CardTitle>
        <CardDescription>
          将提取的写作公式应用到新文本，生成具有特定风格的内容
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="input">输入</TabsTrigger>
            <TabsTrigger value="result" disabled={!outputText && !isStreaming}>
              结果
            </TabsTrigger>
          </TabsList>
          <TabsContent value="input" className="space-y-4">
            <div>
              <Label htmlFor="formula-select">选择写作公式</Label>
              <Select
                value={selectedFormulaId}
                onValueChange={setSelectedFormulaId}
              >
                <SelectTrigger id="formula-select" className="mt-1">
                  <SelectValue placeholder="选择写作公式" />
                </SelectTrigger>
                <SelectContent>
                  {formulas.map((formula) => (
                    <SelectItem key={formula.id} value={formula.id}>
                      {formula.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="input-text">输入文本</Label>
              <Textarea
                id="input-text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="输入您想要应用写作公式的文本"
                className="min-h-[200px] mt-1"
              />
            </div>
            
            <Accordion
              type="single"
              collapsible
              value={showAdvanced ? "advanced" : ""}
              onValueChange={(value) => setShowAdvanced(value === "advanced")}
            >
              <AccordionItem value="advanced">
                <AccordionTrigger className="text-sm">高级设置</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="system-prompt">系统提示词</Label>
                      <Textarea
                        id="system-prompt"
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        placeholder="自定义系统提示词"
                        className="min-h-[150px] mt-1 text-sm"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
            <div className="mt-4">
              <Label>模型设置</Label>
              <div className="mt-2">
                <LLMPromptInput
                  inputType="input"
                  buttonText="应用公式"
                  disabled={isApplying || !inputText.trim() || !selectedFormulaId}
                  systemPrompt={systemPrompt}
                  onSubmit={handleLLMSubmit}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="result">
            <div>
              <Label htmlFor="output-text">生成结果</Label>
              <Textarea
                id="output-text"
                value={isStreaming ? streamText : outputText}
                readOnly
                className="min-h-[300px] mt-1"
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => {
          setInputText('');
          setOutputText('');
          setStreamText('');
          setActiveTab('input');
        }}>
          重置
        </Button>
      </CardFooter>
    </Card>
  );
};

export default FormulaApplicator; 