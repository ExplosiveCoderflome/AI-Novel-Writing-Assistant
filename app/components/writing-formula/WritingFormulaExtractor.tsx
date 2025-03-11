'use client';

import { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// 提取级别选项
const extractionLevels = [
  { id: 'basic', name: '基础', description: '提取最基本的写作风格特点' },
  { id: 'detailed', name: '详细', description: '提供全面的写作风格分析' },
  { id: 'comprehensive', name: '深入', description: '深入分析所有写作技巧和细节' },
];

// 重点关注区域选项
const focusAreaOptions = [
  { id: 'structure', name: '结构', description: '段落组织和整体结构' },
  { id: 'language', name: '语言', description: '词汇选择和句式结构' },
  { id: 'narrative', name: '叙事', description: '叙事视角和人称' },
  { id: 'style', name: '风格', description: '整体风格和语气' },
  { id: 'rhetoric', name: '修辞', description: '修辞手法和表达技巧' },
  { id: 'themes', name: '主题', description: '主题元素和意象' },
];

/**
 * 写作公式提取组件
 */
export default function WritingFormulaExtractor() {
  // 状态管理
  const [sourceText, setSourceText] = useState('');
  const [formulaName, setFormulaName] = useState('');
  const [extractionLevel, setExtractionLevel] = useState('detailed');
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('input');
  
  // 引用
  const eventSourceRef = useRef<EventSource | null>(null);

  // 处理提取请求
  const handleExtract = async () => {
    if (sourceText.trim().length < 50) {
      toast.error('源文本至少需要50个字符');
      return;
    }

    try {
      setIsExtracting(true);
      setExtractionResult(null);
      setActiveTab('result');

      // 关闭之前的连接
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // 准备请求数据
      const requestData = {
        sourceText,
        name: formulaName || undefined,
        extractionLevel,
        focusAreas: selectedFocusAreas.length > 0 ? selectedFocusAreas : undefined,
      };

      // 创建SSE连接
      const eventSource = new EventSource(`/api/writing-formula/extract?data=${encodeURIComponent(JSON.stringify(requestData))}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          eventSource.close();
          setIsExtracting(false);
          return;
        }

        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'result') {
            setExtractionResult(data.formula);
            toast.success('写作公式提取完成');
          } else if (data.type === 'error') {
            toast.error(`提取失败: ${data.error}`);
            setIsExtracting(false);
          }
        } catch (error) {
          console.error('解析事件数据失败:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE连接错误:', error);
        eventSource.close();
        setIsExtracting(false);
        toast.error('连接中断，请重试');
      };
    } catch (error) {
      console.error('提取请求失败:', error);
      setIsExtracting(false);
      toast.error('请求失败，请重试');
    }
  };

  // 处理重点关注区域选择
  const handleFocusAreaToggle = (areaId: string) => {
    setSelectedFocusAreas(prev => 
      prev.includes(areaId) 
        ? prev.filter(id => id !== areaId) 
        : [...prev, areaId]
    );
  };

  // 渲染分析结果
  const renderAnalysisResult = () => {
    if (!extractionResult) return null;

    const { analysis, rawText } = extractionResult;
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{extractionResult.name}</h3>
          <div className="flex items-center text-sm text-muted-foreground">
            <CheckCircle2 className="mr-1 h-4 w-4 text-green-500" />
            已保存
          </div>
        </div>

        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">摘要</TabsTrigger>
            <TabsTrigger value="details">详细分析</TabsTrigger>
            <TabsTrigger value="raw">原始分析</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">基本信息</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-muted-foreground">体裁/类型</dt>
                      <dd>{analysis.genre || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">整体风格</dt>
                      <dd>{analysis.style || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">语气/语调</dt>
                      <dd>{analysis.toneVoice || '未提取'}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">结构特点</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-muted-foreground">整体结构</dt>
                      <dd>{analysis.structure || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">节奏控制</dt>
                      <dd>{analysis.pacing || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">段落模式</dt>
                      <dd>{analysis.paragraphPattern || '未提取'}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">写作公式核心</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{analysis.formulaDescription || '未提取公式描述'}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">公式步骤</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.formulaSteps && analysis.formulaSteps.length > 0 ? (
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {analysis.formulaSteps.map((step: string, index: number) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">未提取公式步骤</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">语言分析</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-muted-foreground">句式结构</dt>
                      <dd>{analysis.sentenceStructure || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">词汇水平</dt>
                      <dd>{analysis.vocabularyLevel || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">修辞手法</dt>
                      {analysis.rhetoricalDevices && analysis.rhetoricalDevices.length > 0 ? (
                        <dd>
                          <ul className="list-disc list-inside">
                            {analysis.rhetoricalDevices.map((device: string, index: number) => (
                              <li key={index}>{device}</li>
                            ))}
                          </ul>
                        </dd>
                      ) : (
                        <dd>未提取</dd>
                      )}
                    </div>
                  </dl>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">叙事分析</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-muted-foreground">叙事模式</dt>
                      <dd>{analysis.narrativeMode || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">视角/人称</dt>
                      <dd>{analysis.perspectivePoint || '未提取'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">角色声音</dt>
                      <dd>{analysis.characterVoice || '未提取'}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">主题与内容</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-muted-foreground">主题元素</dt>
                      {analysis.themes && analysis.themes.length > 0 ? (
                        <dd>
                          <ul className="list-disc list-inside">
                            {analysis.themes.map((theme: string, index: number) => (
                              <li key={index}>{theme}</li>
                            ))}
                          </ul>
                        </dd>
                      ) : (
                        <dd>未提取</dd>
                      )}
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">意象/符号</dt>
                      {analysis.motifs && analysis.motifs.length > 0 ? (
                        <dd>
                          <ul className="list-disc list-inside">
                            {analysis.motifs.map((motif: string, index: number) => (
                              <li key={index}>{motif}</li>
                            ))}
                          </ul>
                        </dd>
                      ) : (
                        <dd>未提取</dd>
                      )}
                    </div>
                    <div>
                      <dt className="font-medium text-muted-foreground">情感基调</dt>
                      <dd>{analysis.emotionalTone || '未提取'}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">特殊元素</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-muted-foreground">独特特征</dt>
                      {analysis.uniqueFeatures && analysis.uniqueFeatures.length > 0 ? (
                        <dd>
                          <ul className="list-disc list-inside">
                            {analysis.uniqueFeatures.map((feature: string, index: number) => (
                              <li key={index}>{feature}</li>
                            ))}
                          </ul>
                        </dd>
                      ) : (
                        <dd>未提取</dd>
                      )}
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">应用技巧</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.applicationTips && analysis.applicationTips.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {analysis.applicationTips.map((tip: string, index: number) => (
                      <li key={index}>{tip}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">未提取应用技巧</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="raw">
            <Card>
              <CardContent className="pt-6">
                <pre className="whitespace-pre-wrap text-sm">{rawText}</pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => {
              setActiveTab('input');
              setSourceText('');
              setFormulaName('');
              setExtractionLevel('detailed');
              setSelectedFocusAreas([]);
            }}
          >
            新建提取
          </Button>
          <Button 
            onClick={() => {
              // 这里可以添加应用写作公式的逻辑
              toast.info('即将实现应用写作公式功能');
            }}
          >
            应用此公式
          </Button>
        </div>
      </div>
    );
  };

  // 渲染加载状态
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <div className="text-center">
        <h3 className="text-lg font-medium">正在提取写作公式</h3>
        <p className="text-sm text-muted-foreground">这可能需要一些时间，请耐心等待...</p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">写作公式提取</h2>
          <p className="text-muted-foreground">
            分析文本并提取其写作风格、技巧和公式，以便应用于新的创作
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="input">输入文本</TabsTrigger>
            <TabsTrigger value="result" disabled={!isExtracting && !extractionResult}>
              分析结果
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="input" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>源文本</CardTitle>
                <CardDescription>
                  输入您想要分析的文本，可以是小说片段、文章或任何写作样本
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="formula-name">公式名称 (可选)</Label>
                    <Input
                      id="formula-name"
                      placeholder="为这个写作公式命名，例如：'海明威式简洁'"
                      value={formulaName}
                      onChange={(e) => setFormulaName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="source-text">文本内容</Label>
                    <Textarea
                      id="source-text"
                      placeholder="在此粘贴或输入您想要分析的文本..."
                      className="min-h-[300px]"
                      value={sourceText}
                      onChange={(e) => setSourceText(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      至少需要50个字符，建议提供足够长度的文本以获得更准确的分析
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  {sourceText.length} 个字符
                </div>
                <Button onClick={handleExtract} disabled={sourceText.length < 50 || isExtracting}>
                  {isExtracting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      提取中...
                    </>
                  ) : (
                    '提取写作公式'
                  )}
                </Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>提取选项</CardTitle>
                <CardDescription>
                  自定义分析深度和重点关注区域
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>提取级别</Label>
                    <div className="grid grid-cols-3 gap-4">
                      {extractionLevels.map((level) => (
                        <div
                          key={level.id}
                          className={`flex flex-col space-y-2 rounded-md border p-4 cursor-pointer ${
                            extractionLevel === level.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                          onClick={() => setExtractionLevel(level.id)}
                        >
                          <div className="font-medium">{level.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {level.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>重点关注区域 (可选)</Label>
                    <div className="grid grid-cols-3 gap-4">
                      {focusAreaOptions.map((area) => (
                        <div key={area.id} className="flex items-start space-x-2">
                          <Checkbox
                            id={`focus-${area.id}`}
                            checked={selectedFocusAreas.includes(area.id)}
                            onCheckedChange={() => handleFocusAreaToggle(area.id)}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <Label
                              htmlFor={`focus-${area.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {area.name}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {area.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="result">
            {isExtracting ? renderLoading() : renderAnalysisResult()}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 