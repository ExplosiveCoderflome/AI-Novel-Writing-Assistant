import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { LLMPromptInput } from '../LLMPromptInput';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import ScoreDisplay from './ScoreDisplay';

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

// 新增的生成模式提示词模板
const DEFAULT_GENERATION_PROMPT = `你是一位专业的写作助手，能够按照特定的写作风格创作新内容。
请按照以下写作公式，根据用户提供的主题/想法创作新内容：

写作风格概述：
{summary}

写作技巧：
{techniques}

风格指南：
{styleGuide}

应用提示：
{applicationTips}

请根据用户提供的主题/想法，创作一篇符合上述写作风格的新文本。
生成的内容应该具有创意性、连贯性和可读性，同时完全符合指定的写作风格。
请严格控制文本长度在用户指定的字数范围内。`;

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
  
  // 新增状态
  const [isGenerationMode, setIsGenerationMode] = useState(false);
  const [ideaText, setIdeaText] = useState('');
  const [wordCount, setWordCount] = useState<number>(500);
  const [wordCountRange, setWordCountRange] = useState<[number, number]>([wordCount - 50, wordCount + 50]);

  // 评分状态
  const [showScore, setShowScore] = useState(false);
  const [scoreData, setScoreData] = useState<any>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [scoreResponse, setScoreResponse] = useState<string>('');

  // 新增思考过程状态
  const [reasoningText, setReasoningText] = useState<string>('');
  const [showReasoning, setShowReasoning] = useState<boolean>(true);
  const [isThinking, setIsThinking] = useState<boolean>(false);

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

  // 更新字数范围
  useEffect(() => {
    setWordCountRange([wordCount - 50, wordCount + 50]);
  }, [wordCount]);

  useEffect(() => {
    // 当选择的公式变化时，更新系统提示词
    if (selectedFormulaId) {
      updateSystemPrompt();
    }
  }, [selectedFormulaId, formulas, isGenerationMode]);

  // 提取更新系统提示词的逻辑为独立函数
  const updateSystemPrompt = () => {
    const selectedFormula = formulas.find(f => f.id === selectedFormulaId);
    if (!selectedFormula) return;

    // 选择模板
    const templatePrompt = isGenerationMode ? DEFAULT_GENERATION_PROMPT : DEFAULT_FORMULA_APPLICATION_PROMPT;
    
    let prompt = templatePrompt;
    
    if (selectedFormula.content) {
      // 如果有content字段，直接使用Markdown内容
      prompt = isGenerationMode 
        ? `你是一位专业的写作助手，能够按照特定的写作风格创作新内容。
请按照以下写作公式，根据用户提供的主题/想法创作新内容：

写作公式：
${selectedFormula.content}

请根据用户提供的主题/想法，创作一篇符合上述写作风格的新文本。
生成的内容应该具有创意性、连贯性和可读性，同时完全符合指定的写作风格。
请严格控制文本长度在用户指定的字数范围内。`
        : `你是一位专业的写作助手，能够按照特定的写作风格改写文本。
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
  };

  // 处理评分请求
  const handleScoreContent = async (provider: string, model: string) => {
    if (!selectedFormulaId || !outputText) {
      toast.error('没有可评分的内容');
      return;
    }

    setIsScoring(true);
    setShowScore(true);
    setScoreData(null);
    setScoreResponse('');

    try {
      const response = await fetch('/api/writing-formula/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formulaId: selectedFormulaId,
          generatedContent: outputText,
          originalInput: isGenerationMode ? ideaText : inputText,
          isGenerationMode,
          provider,
          model,
          temperature: 0.3, // 使用较低的温度以获得更一致的评分
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '评分失败');
      }

      const data = await response.json();
      
      if (data.success) {
        setScoreData(data.scoreData);
        setScoreResponse(data.fullResponse);
        toast.success('内容评分完成');
      } else {
        throw new Error(data.error || '评分失败');
      }
    } catch (error) {
      console.error('评分失败:', error);
      toast.error(error instanceof Error ? error.message : '评分过程中出现错误');
      setScoreData({ error: error instanceof Error ? error.message : '未知错误' });
    } finally {
      setIsScoring(false);
    }
  };

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

    // 检查输入是否有效
    if (isGenerationMode) {
      if (!ideaText.trim()) {
        toast.error('请输入创作主题/想法');
        return;
      }
    } else {
      if (!inputText.trim()) {
        toast.error('请输入需要应用公式的文本');
        return;
      }
    }

    // 重置评分状态
    setShowScore(false);
    setScoreData(null);
    
    // 重置思考过程状态
    setReasoningText('');
    
    setIsApplying(true);
    setIsStreaming(true);
    setStreamText('');
    setOutputText('');

    // 检查是否是推理模型
    const isReasonerModel = data.model === 'deepseek-reasoner';
    if (isReasonerModel) {
      setIsThinking(true);
      setShowReasoning(true); // 对推理模型默认显示思考过程
    } else {
      setShowReasoning(false); // 非推理模型则隐藏思考过程区域
    }

    try {
      const response = await fetch('/api/writing-formula/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formulaId: selectedFormulaId,
          inputText: isGenerationMode ? ideaText : inputText,
          provider: data.provider,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          systemPrompt: data.systemPrompt || systemPrompt,
          isGenerationMode,
          wordCount: isGenerationMode ? wordCount : undefined,
          wordCountRange: isGenerationMode ? wordCountRange : undefined,
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
      let reasoningContent = '';
      let hasError = false;
      let hasStartedReceiving = false;
      // 用于记录最后活动时间，防止长时间无响应
      let lastActivityTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 更新最后活动时间
        lastActivityTime = Date.now();

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
              
              // 处理心跳包
              if (eventData.type === 'heartbeat') {
                console.log('收到心跳包:', eventData.timestamp);
                // 只需更新最后活动时间，无需其他操作
                continue;
              }
              
              // 处理reasoning消息（来自推理模型）
              if (eventData.type === 'reasoning') {
                console.log('收到推理内容:', eventData.reasoning);
                setIsThinking(true);
                
                // 更新思考内容
                if (eventData.reasoning && eventData.reasoning.trim() !== '') {
                  // 添加到reasoningContent中
                  if (!reasoningContent) {
                    reasoningContent = `--- AI思考过程 ---\n${eventData.reasoning}`;
                  } else {
                    reasoningContent += eventData.reasoning;
                  }
                  
                  setReasoningText(reasoningContent);
                }
                
                if (!hasStartedReceiving) {
                  hasStartedReceiving = true;
                  setActiveTab('result');
                  setShowReasoning(true);
                  toast.success('AI正在进行深度思考，详细过程已显示...');
                }
                continue;
              }
              
              // 处理content消息（最终结果）
              if (eventData.type === 'content' && eventData.choices && eventData.choices[0].delta.content) {
                // 累积内容
                const content = eventData.choices[0].delta.content;
                
                // 如果内容为空，可能是思考中或心跳包，跳过更新
                if (content.trim() === '') {
                  continue;
                }
                
                result += content;
                
                // 直接更新流式文本状态，这会触发重新渲染
                setStreamText(result);
                // 同时更新输出文本
                setOutputText(result);
                
                // 如果之前在思考状态，现在有实际内容了，则结束思考状态
                if (isThinking) {
                  setIsThinking(false);
                }
                
                // 接收到第一个内容后，切换到结果标签页
                if (!hasStartedReceiving) {
                  hasStartedReceiving = true;
                  setActiveTab('result');
                  toast.success(isGenerationMode ? '正在生成新内容，请稍候...' : '正在应用写作公式，请稍候...');
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
        
        // 如果长时间无响应，则显示提示
        const currentTime = Date.now();
        if (currentTime - lastActivityTime > 30000 && isThinking) {
          console.log('长时间无响应，可能在深入思考中...');
          // 更新状态，但不重置lastActivityTime，这样只会每30秒提醒一次
          
          // 将长时间无响应的提示也添加到reasoningContent中
          const timestamp = new Date().toLocaleTimeString();
          const timeoutMsg = `[${timestamp}] AI仍在深入思考中，这可能需要一些时间...\n`;
          reasoningContent += timeoutMsg;
          setReasoningText(reasoningContent);
          
          toast.info('AI正在深入思考中，这可能需要一些时间...');
        }
      }

      if (result) {
        // 已经在流式响应开始时切换了标签页，这里不再需要
        if (onFormulaApplied) {
          onFormulaApplied(result);
        }

        toast.success(isGenerationMode ? '内容生成完成' : '写作公式应用完成');
      } else if (reasoningContent && !result) {
        // 如果只有思考过程但没有实际输出，可能是模型只思考没有产出
        toast.warning('AI已完成思考，但未能生成有效内容，请重试或调整提示词');
      } else {
        toast.error(isGenerationMode ? '未能成功生成内容' : '未能成功应用写作公式');
      }
    } catch (error) {
      console.error(isGenerationMode ? '生成内容失败:' : '应用写作公式失败:', error);
      toast.error(error instanceof Error ? error.message : '操作失败，请重试');
    } finally {
      setIsApplying(false);
      setIsStreaming(false);
      setIsThinking(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>写作公式应用器</CardTitle>
        <CardDescription>
          将写作公式应用到现有文本或根据您的想法生成全新内容
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="input">输入</TabsTrigger>
            <TabsTrigger value="result" disabled={!outputText && !isStreaming && !isThinking}>
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

            <div className="flex items-center space-x-2">
              <Switch
                id="generation-mode"
                checked={isGenerationMode}
                onCheckedChange={setIsGenerationMode}
              />
              <Label htmlFor="generation-mode">
                创作新内容模式
              </Label>
            </div>

            {isGenerationMode ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="idea-text">创作主题/想法</Label>
                  <Textarea
                    id="idea-text"
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    placeholder="描述您想要创作的内容主题、情节、场景或任何创意想法..."
                    className="min-h-[150px] mt-1"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label htmlFor="word-count">目标字数: {wordCount}</Label>
                    <span className="text-xs text-muted-foreground">
                      范围: {wordCountRange[0]}-{wordCountRange[1]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="word-count"
                      type="number"
                      min={100}
                      max={5000}
                      value={wordCount}
                      onChange={(e) => setWordCount(parseInt(e.target.value) || 500)}
                      className="w-20"
                    />
                    <Slider
                      value={[wordCount]}
                      min={100}
                      max={5000}
                      step={50}
                      onValueChange={(value) => setWordCount(value[0])}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            ) : (
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
            )}
            
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
                  buttonText={isGenerationMode ? "开始创作" : "应用公式"}
                  disabled={isApplying || (isGenerationMode ? !ideaText.trim() : !inputText.trim()) || !selectedFormulaId}
                  systemPrompt={systemPrompt}
                  onSubmit={handleLLMSubmit}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="result">
            <div className="space-y-6">
              {isThinking && (
                <div className="flex items-center space-x-2 mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <span className="font-medium">AI正在思考中</span> - 思考过程实时显示在下方，请耐心等待...
                  </p>
                </div>
              )}
              
              {reasoningText && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="reasoning-text" className="flex items-center">
                      <span className="mr-2">AI思考过程</span>
                      {isThinking && <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full">实时更新中</span>}
                    </Label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowReasoning(!showReasoning)}
                      className="h-7 px-2 text-xs"
                    >
                      {showReasoning ? '隐藏' : '显示'}
                    </Button>
                  </div>
                  
                  {showReasoning && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-md bg-gray-50 dark:bg-gray-900 p-3 overflow-auto max-h-[400px]">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">
                        {reasoningText || (isThinking ? '正在加载思考内容...' : '无思考内容')}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              <div>
                <Label htmlFor="output-text">生成结果</Label>
                <Textarea
                  id="output-text"
                  value={isStreaming ? streamText : outputText}
                  readOnly
                  className={`min-h-[300px] mt-1 ${isThinking && !outputText ? 'bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-600' : ''}`}
                  placeholder={isThinking && !outputText ? "AI正在思考中，结果将在思考完成后显示..." : ""}
                />
              </div>
              
              {outputText && !isStreaming && (
                <div className="flex flex-col gap-4">
                  {showScore ? (
                    <ScoreDisplay 
                      scoreData={scoreData} 
                      isGenerationMode={isGenerationMode}
                      isLoading={isScoring}
                      fullResponse={scoreResponse}
                    />
                  ) : (
                    <Button 
                      onClick={() => {
                        const provider = 'deepseek'; // 默认使用deepseek
                        const model = 'deepseek-chat'; // 使用chat模型进行评分
                        handleScoreContent(provider, model);
                      }}
                      variant="outline"
                      className="w-full"
                      disabled={isScoring}
                    >
                      {isScoring ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          正在评分...
                        </>
                      ) : (
                        <>
                          <Star className="mr-2 h-4 w-4" />
                          评估内容符合度
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => {
          setInputText('');
          setIdeaText('');
          setOutputText('');
          setStreamText('');
          setReasoningText('');
          setActiveTab('input');
          setShowScore(false);
          setScoreData(null);
          // 保持showReasoning为true，这样下次使用推理模型时默认显示思考过程
        }}>
          重置
        </Button>
      </CardFooter>
    </Card>
  );
};

export default FormulaApplicator; 