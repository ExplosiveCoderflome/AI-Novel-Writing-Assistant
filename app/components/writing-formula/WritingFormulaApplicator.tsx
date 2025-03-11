'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// 内容类型选项
const contentTypes = [
  { id: 'story', name: '故事' },
  { id: 'article', name: '文章' },
  { id: 'poem', name: '诗歌' },
  { id: 'dialogue', name: '对话' },
  { id: 'description', name: '描述' },
  { id: 'custom', name: '自定义' },
];

// 内容长度选项
const contentLengths = [
  { id: 'short', name: '短篇', description: '500-1000字左右' },
  { id: 'medium', name: '中篇', description: '1500-2500字左右' },
  { id: 'long', name: '长篇', description: '3000-5000字左右' },
];

/**
 * 写作公式应用组件
 */
export default function WritingFormulaApplicator({ formulaId }: { formulaId?: string }) {
  // 状态管理
  const [formulas, setFormulas] = useState<any[]>([]);
  const [selectedFormulaId, setSelectedFormulaId] = useState<string>(formulaId || '');
  const [selectedFormula, setSelectedFormula] = useState<any>(null);
  const [contentPrompt, setContentPrompt] = useState('');
  const [contentType, setContentType] = useState('story');
  const [customContentType, setCustomContentType] = useState('');
  const [contentLength, setContentLength] = useState('medium');
  const [targetWordCount, setTargetWordCount] = useState<number | undefined>(undefined);
  const [additionalRequirements, setAdditionalRequirements] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [activeTab, setActiveTab] = useState('input');
  
  // 引用
  const eventSourceRef = useRef<EventSource | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 加载写作公式列表
  useEffect(() => {
    const fetchFormulas = async () => {
      try {
        // 这里应该从API获取写作公式列表
        // 临时使用模拟数据
        const mockFormulas = [
          { id: '1', name: '海明威式简洁风格' },
          { id: '2', name: '魔幻现实主义' },
          { id: '3', name: '科幻冒险' },
        ];
        setFormulas(mockFormulas);
        
        // 如果有传入的formulaId，则设置为选中
        if (formulaId) {
          setSelectedFormulaId(formulaId);
          // 获取该公式的详细信息
          // 临时使用模拟数据
          setSelectedFormula({
            id: formulaId,
            name: '海明威式简洁风格',
            genre: '小说',
            style: '简洁、直接',
            toneVoice: '冷静、克制',
          });
        }
      } catch (error) {
        console.error('获取写作公式列表失败:', error);
        toast.error('获取写作公式列表失败');
      }
    };
    
    fetchFormulas();
  }, [formulaId]);

  // 处理公式选择变化
  const handleFormulaChange = async (id: string) => {
    setSelectedFormulaId(id);
    
    try {
      // 这里应该从API获取选中公式的详细信息
      // 临时使用模拟数据
      const mockFormula = {
        id,
        name: formulas.find(f => f.id === id)?.name || '未知公式',
        genre: '小说',
        style: '简洁、直接',
        toneVoice: '冷静、克制',
      };
      setSelectedFormula(mockFormula);
    } catch (error) {
      console.error('获取写作公式详情失败:', error);
      toast.error('获取写作公式详情失败');
    }
  };

  // 处理内容生成请求
  const handleGenerate = async () => {
    if (!selectedFormulaId) {
      toast.error('请选择一个写作公式');
      return;
    }
    
    if (contentPrompt.trim().length < 10) {
      toast.error('内容提示至少需要10个字符');
      return;
    }

    try {
      setIsGenerating(true);
      setGeneratedContent('');
      setActiveTab('result');

      // 关闭之前的连接
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // 准备请求数据
      const requestData = {
        formulaId: selectedFormulaId,
        contentPrompt,
        contentType,
        customContentType: contentType === 'custom' ? customContentType : undefined,
        contentLength,
        targetWordCount: targetWordCount || undefined,
        additionalRequirements: additionalRequirements || undefined,
      };

      // 创建SSE连接
      const eventSource = new EventSource(`/api/writing-formula/apply?data=${encodeURIComponent(JSON.stringify(requestData))}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          eventSource.close();
          setIsGenerating(false);
          return;
        }

        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'chunk') {
            setGeneratedContent(prev => prev + data.content);
            
            // 自动滚动到底部
            if (contentRef.current) {
              contentRef.current.scrollTop = contentRef.current.scrollHeight;
            }
          } else if (data.type === 'complete') {
            setGeneratedContent(data.content);
            toast.success('内容生成完成');
          } else if (data.type === 'error') {
            toast.error(`生成失败: ${data.error}`);
            setIsGenerating(false);
          }
        } catch (error) {
          console.error('解析事件数据失败:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE连接错误:', error);
        eventSource.close();
        setIsGenerating(false);
        toast.error('连接中断，请重试');
      };
    } catch (error) {
      console.error('生成请求失败:', error);
      setIsGenerating(false);
      toast.error('请求失败，请重试');
    }
  };

  // 复制生成的内容
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent)
      .then(() => toast.success('已复制到剪贴板'))
      .catch(() => toast.error('复制失败，请手动复制'));
  };

  // 渲染生成结果
  const renderGeneratedContent = () => {
    if (generatedContent.length === 0 && !isGenerating) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4 text-muted-foreground">
          <AlertCircle className="h-12 w-12" />
          <p>尚未生成内容，请先在输入选项卡中设置参数并生成内容</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div 
          ref={contentRef}
          className="bg-card border rounded-md p-6 min-h-[400px] max-h-[600px] overflow-y-auto whitespace-pre-wrap"
        >
          {generatedContent}
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => {
              setActiveTab('input');
            }}
          >
            修改参数
          </Button>
          <Button 
            onClick={handleCopy}
            disabled={!generatedContent || isGenerating}
          >
            复制内容
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
        <h3 className="text-lg font-medium">正在生成内容</h3>
        <p className="text-sm text-muted-foreground">这可能需要一些时间，请耐心等待...</p>
      </div>
    </div>
  );

  // 渲染公式信息
  const renderFormulaInfo = () => {
    if (!selectedFormula) return null;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>已选择的写作公式</CardTitle>
          <CardDescription>
            {selectedFormula.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">体裁/类型:</span> {selectedFormula.genre}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">整体风格:</span> {selectedFormula.style}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">语气/语调:</span> {selectedFormula.toneVoice}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">应用写作公式</h2>
          <p className="text-muted-foreground">
            使用提取的写作公式生成新的内容，保持一致的风格和技巧
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="input">输入参数</TabsTrigger>
            <TabsTrigger value="result">生成结果</TabsTrigger>
          </TabsList>
          
          <TabsContent value="input" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>选择写作公式</CardTitle>
                <CardDescription>
                  选择一个已提取的写作公式作为内容生成的基础
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="formula-select">写作公式</Label>
                    <Select 
                      value={selectedFormulaId} 
                      onValueChange={handleFormulaChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择一个写作公式" />
                      </SelectTrigger>
                      <SelectContent>
                        {formulas.map(formula => (
                          <SelectItem key={formula.id} value={formula.id}>
                            {formula.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {renderFormulaInfo()}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>内容提示</CardTitle>
                <CardDescription>
                  描述您想要生成的内容主题、情节或关键元素
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="content-prompt">内容提示</Label>
                    <Textarea
                      id="content-prompt"
                      placeholder="描述您想要生成的内容，例如：'一个年轻人在森林中发现了一个神秘的洞穴...'"
                      className="min-h-[150px]"
                      value={contentPrompt}
                      onChange={(e) => setContentPrompt(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      提供详细的提示可以获得更符合您期望的内容
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="additional-requirements">额外要求 (可选)</Label>
                    <Textarea
                      id="additional-requirements"
                      placeholder="添加任何特殊要求或限制，例如：'包含一个意外转折' 或 '使用第一人称视角'"
                      className="min-h-[100px]"
                      value={additionalRequirements}
                      onChange={(e) => setAdditionalRequirements(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>内容设置</CardTitle>
                <CardDescription>
                  自定义生成内容的类型和长度
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label>内容类型</Label>
                    <RadioGroup 
                      value={contentType} 
                      onValueChange={setContentType}
                      className="grid grid-cols-3 gap-4"
                    >
                      {contentTypes.map(type => (
                        <div key={type.id} className="flex items-center space-x-2">
                          <RadioGroupItem value={type.id} id={`content-type-${type.id}`} />
                          <Label htmlFor={`content-type-${type.id}`}>{type.name}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                    
                    {contentType === 'custom' && (
                      <div className="mt-2">
                        <Input
                          placeholder="输入自定义内容类型"
                          value={customContentType}
                          onChange={(e) => setCustomContentType(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>内容长度</Label>
                    <RadioGroup 
                      value={contentLength} 
                      onValueChange={setContentLength}
                      className="grid grid-cols-3 gap-4"
                    >
                      {contentLengths.map(length => (
                        <div 
                          key={length.id}
                          className={`flex flex-col space-y-1 rounded-md border p-4 cursor-pointer ${
                            contentLength === length.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border'
                          }`}
                          onClick={() => setContentLength(length.id)}
                        >
                          <div className="font-medium">{length.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {length.description}
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="target-word-count">目标字数 (可选)</Label>
                    <Input
                      id="target-word-count"
                      type="number"
                      placeholder="输入具体的目标字数"
                      value={targetWordCount || ''}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : undefined;
                        setTargetWordCount(value);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      如果设置，将覆盖上面选择的内容长度
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t px-6 py-4">
                <Button 
                  onClick={handleGenerate} 
                  disabled={!selectedFormulaId || contentPrompt.length < 10 || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    '生成内容'
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="result">
            {isGenerating ? renderLoading() : renderGeneratedContent()}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 