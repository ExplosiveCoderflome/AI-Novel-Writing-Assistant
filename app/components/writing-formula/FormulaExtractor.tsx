import React, { useState } from 'react';
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

请以JSON格式返回分析结果，格式如下：
{
  "summary": "对整体写作风格的简要总结（100-200字）",
  "techniques": [
    {
      "name": "技巧名称",
      "description": "技巧详细描述",
      "examples": ["文本中的例子1", "文本中的例子2"]
    }
  ],
  "styleGuide": {
    "vocabulary": "词汇选择特点",
    "sentenceStructure": "句式结构特点",
    "tone": "语气特点",
    "rhythm": "节奏特点"
  },
  "applicationTips": [
    "如何应用这种写作风格的建议1",
    "如何应用这种写作风格的建议2"
  ]
}

请确保分析深入、专业，并提供具体的文本例证。`;

const FormulaExtractor: React.FC<FormulaExtractorProps> = ({ onFormulaExtracted }) => {
  const [sourceText, setSourceText] = useState('');
  const [formulaName, setFormulaName] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedFormula, setExtractedFormula] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('input');
  const [systemPrompt, setSystemPrompt] = useState(FORMULA_EXTRACTION_PROMPT);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    setActiveTab('input');

    try {
      // 使用 LLMPromptInput 提供的模型参数
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

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let formula: any = {
        name: formulaName,
        sourceText,
      };
      
      let accumulatedContent = '';
      let analysisData = null;
      let hasError = false;

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
                accumulatedContent += content;
                
                // 尝试解析 JSON
                try {
                  // 检查是否是完整的 JSON
                  const parsedData = JSON.parse(accumulatedContent);
                  if (parsedData) {
                    analysisData = parsedData;
                    formula.analysis = analysisData;
                    setExtractedFormula(formula);
                    
                    if (onFormulaExtracted) {
                      onFormulaExtracted(formula);
                    }
                  }
                } catch (e) {
                  // 如果不是完整的 JSON，继续累积
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

      // 尝试最后一次解析完整的 JSON
      if (!analysisData && accumulatedContent) {
        try {
          const cleanedContent = accumulatedContent.trim();
          // 查找 JSON 的开始和结束
          const jsonStartIndex = cleanedContent.indexOf('{');
          const jsonEndIndex = cleanedContent.lastIndexOf('}') + 1;
          
          if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
            const jsonContent = cleanedContent.substring(jsonStartIndex, jsonEndIndex);
            analysisData = JSON.parse(jsonContent);
            formula.analysis = analysisData;
            setExtractedFormula(formula);
            
            if (onFormulaExtracted) {
              onFormulaExtracted(formula);
            }
          }
        } catch (e) {
          console.error('最终解析 JSON 失败:', e);
        }
      }

      if (analysisData) {
        setActiveTab('result');
        toast.success('写作公式提取成功');
      } else {
        toast.error('未能成功解析模型响应');
      }
    } catch (error) {
      console.error('提取写作公式失败:', error);
      toast.error(error instanceof Error ? error.message : '提取失败，请重试');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!extractedFormula) {
      toast.error('没有可保存的公式');
      return;
    }

    try {
      const response = await fetch('/api/writing-formula/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(extractedFormula),
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
    if (!extractedFormula || !extractedFormula.analysis) return null;
    
    const analysis = extractedFormula.analysis;

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">基本信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div>
              <Label>名称</Label>
              <div className="p-2 border rounded">{extractedFormula.name}</div>
            </div>
            <div>
              <Label>总结</Label>
              <div className="p-2 border rounded whitespace-pre-wrap">{analysis.summary || '未提供'}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">写作技巧</h3>
          <div className="space-y-2 mt-2">
            {analysis.techniques && analysis.techniques.length > 0 ? (
              analysis.techniques.map((technique: any, index: number) => (
                <div key={index} className="border rounded p-3">
                  <h4 className="font-medium">{technique.name}</h4>
                  <p className="text-sm mt-1">{technique.description}</p>
                  {technique.examples && technique.examples.length > 0 && (
                    <div className="mt-2">
                      <Label className="text-xs">例子:</Label>
                      <ul className="list-disc pl-5 text-sm">
                        {technique.examples.map((example: string, i: number) => (
                          <li key={i}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-2 border rounded">未提供写作技巧</div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">风格指南</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            {analysis.styleGuide ? (
              <>
                <div>
                  <Label>词汇选择</Label>
                  <div className="p-2 border rounded">{analysis.styleGuide.vocabulary || '未指定'}</div>
                </div>
                <div>
                  <Label>句式结构</Label>
                  <div className="p-2 border rounded">{analysis.styleGuide.sentenceStructure || '未指定'}</div>
                </div>
                <div>
                  <Label>语气</Label>
                  <div className="p-2 border rounded">{analysis.styleGuide.tone || '未指定'}</div>
                </div>
                <div>
                  <Label>节奏</Label>
                  <div className="p-2 border rounded">{analysis.styleGuide.rhythm || '未指定'}</div>
                </div>
              </>
            ) : (
              <div className="col-span-2 p-2 border rounded">未提供风格指南</div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium">应用提示</h3>
          <div className="mt-2">
            {analysis.applicationTips && analysis.applicationTips.length > 0 ? (
              <ul className="list-disc pl-5">
                {analysis.applicationTips.map((tip: string, index: number) => (
                  <li key={index} className="mb-1">{tip}</li>
                ))}
              </ul>
            ) : (
              <div className="p-2 border rounded">未提供应用提示</div>
            )}
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