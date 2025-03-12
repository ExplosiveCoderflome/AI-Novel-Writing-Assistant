import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LLMPromptInput } from '../LLMPromptInput';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { MarkdownRenderer } from '../ui/markdown-renderer';

interface FormulaExtractorProps {
  onFormulaExtracted?: (formula: any) => void;
}

// 写作公式提取提示词
const FORMULA_EXTRACTION_PROMPT = `你是一个专业的写作风格分析专家，擅长分析文本中的写作技巧和风格特点。
请分析以下文本，提取其中的写作公式，包括但不限于：

1. 语言风格特点（如：华丽、简洁、幽默、正式等）
2. 句式结构特点（如：长短句搭配、排比、设问等）
3. 修辞手法（如：比喻、拟人、夸张等）
4. 叙事视角（如：第一人称、第三人称、全知视角等）
5. 情感表达方式（如：直接抒情、含蓄暗示等）
6. 节奏控制（如：快慢节奏变化、停顿等）
7. 特殊词汇选择（如：专业术语、方言、古语等）
8. 意象和符号运用
9. 其他独特的写作技巧

请以Markdown格式回答，自行组织内容结构，确保分析深入、专业，并提供具体的文本例证。
你可以自由发挥，创建适合的写作公式格式，但应当包含以下方面：
- 对整体写作风格的简要总结
- 关键写作技巧及其例子
- 风格指南（如词汇选择、句式结构、语气、节奏等）
- 如何应用这种写作风格的建议

请确保你的分析既有理论高度，又有实用性，能帮助作者理解并应用这种写作风格。`;

const FormulaExtractor: React.FC<FormulaExtractorProps> = ({ onFormulaExtracted }) => {
  const [sourceText, setSourceText] = useState('');
  const [formulaName, setFormulaName] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedFormula, setExtractedFormula] = useState<any>(null);
  const [streamContent, setStreamContent] = useState('');
  const [activeTab, setActiveTab] = useState('input');
  const [systemPrompt, setSystemPrompt] = useState(FORMULA_EXTRACTION_PROMPT);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleLLMSubmit = async (data: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    agentMode?: boolean;
  }) => {
    if (!sourceText.trim()) {
      toast.error('请输入源文本');
      return;
    }

    if (!formulaName.trim()) {
      toast.error('请输入公式名称');
      return;
    }

    setIsExtracting(true);
    setIsStreaming(true);
    setStreamContent('');
    
    const baseFormula = {
      name: formulaName,
      sourceText,
      content: '',
    };
    
    setExtractedFormula(baseFormula);
    
    try {
      const response = await fetch('/api/writing-formula/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceText,
          name: formulaName,
          provider: data.provider,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          systemPrompt: data.systemPrompt || systemPrompt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '提取失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let accumulatedContent = '';
      let hasError = false;
      let hasStartedReceiving = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        
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
                const content = eventData.choices[0].delta.content;
                accumulatedContent += content;
                
                setStreamContent(accumulatedContent);
                
                const updatedFormula = {
                  ...baseFormula,
                  content: accumulatedContent,
                };
                setExtractedFormula(updatedFormula);
                
                if (!hasStartedReceiving) {
                  hasStartedReceiving = true;
                  setActiveTab('result');
                  toast.success('正在生成写作公式，请稍候...');
                }
                
                if (onFormulaExtracted) {
                  onFormulaExtracted(updatedFormula);
                }
              }
            } catch (e) {
              if (hasError) {
                throw e;
              }
              console.log('解析 SSE 数据失败:', e);
            }
          }
        }
      }

      if (accumulatedContent) {
        const finalFormula = {
          ...baseFormula,
          content: accumulatedContent,
        };
        setExtractedFormula(finalFormula);
        toast.success('写作公式提取完成');
      } else {
        toast.error('未能获得模型响应');
      }
    } catch (error) {
      console.error('提取写作公式失败:', error);
      toast.error(error instanceof Error ? error.message : '提取失败，请重试');
    } finally {
      setIsExtracting(false);
      setIsStreaming(false);
    }
  };

  const handleSave = async () => {
    if (!extractedFormula || !extractedFormula.content) {
      toast.error('没有可保存的公式');
      return;
    }

    try {
      const formulaToSave = {
        name: extractedFormula.name,
        sourceText: extractedFormula.sourceText,
        content: extractedFormula.content,
        createdAt: new Date().toISOString()
      };

      const response = await fetch('/api/writing-formula/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formulaToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      const result = await response.json();
      toast.success(result.message || '写作公式保存成功');
    } catch (error) {
      console.error('保存写作公式失败:', error);
      toast.error(error instanceof Error ? error.message : '保存失败，请重试');
    }
  };

  const renderFormulaDetails = () => {
    if (isStreaming && streamContent) {
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">公式名称</h3>
            <div className="p-2 border rounded mt-2">{formulaName}</div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium">写作公式内容</h3>
            <div className="mt-2 p-4 border rounded bg-white dark:bg-gray-900">
              <MarkdownRenderer key={streamContent.length} content={streamContent} />
            </div>
          </div>
        </div>
      );
    }
    
    if (!extractedFormula || !extractedFormula.content) return null;
    
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">公式名称</h3>
          <div className="p-2 border rounded mt-2">{extractedFormula.name}</div>
        </div>
        
        <div>
          <h3 className="text-lg font-medium">写作公式内容</h3>
          <div className="mt-2 p-4 border rounded bg-white dark:bg-gray-900">
            <MarkdownRenderer content={extractedFormula.content} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>写作公式提取器</CardTitle>
        <CardDescription>
          从文本中提取写作风格、技巧和模式，创建可重用的写作公式
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="input">输入</TabsTrigger>
            <TabsTrigger value="result" disabled={!extractedFormula}>
              结果
            </TabsTrigger>
          </TabsList>
          <TabsContent value="input" className="space-y-4">
            <div>
              <Label htmlFor="formula-name">公式名称</Label>
              <Input
                id="formula-name"
                value={formulaName}
                onChange={(e) => setFormulaName(e.target.value)}
                placeholder="为这个写作公式命名"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="source-text">源文本</Label>
              <Textarea
                id="source-text"
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="粘贴您想要分析的文本、故事或小说片段"
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
                  buttonText="提取公式"
                  disabled={isExtracting || !sourceText.trim() || !formulaName.trim()}
                  systemPrompt={systemPrompt}
                  onSubmit={handleLLMSubmit}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="result">
            {renderFormulaDetails()}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => {
          setSourceText('');
          setFormulaName('');
          setExtractedFormula(null);
          setActiveTab('input');
        }}>
          重置
        </Button>
        {activeTab === 'result' && extractedFormula && (
          <Button onClick={handleSave}>保存公式</Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default FormulaExtractor; 