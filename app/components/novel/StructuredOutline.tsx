import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { NovelOutline } from '../../types/novel';
import { toast } from 'sonner';
import { LLMPromptInput } from '../LLMPromptInput';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Save, Loader2, BookOpen, Sparkles, Bookmark, RocketIcon, Map, Compass, Footprints } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';

interface StructuredOutlineProps {
  novelId: string;
  developmentDirection: string;
  onOutlineGenerated: (outline: NovelOutline) => void;
  onSave?: (outline: NovelOutline) => Promise<void>;
  savedOutline?: NovelOutline | null;
  onDevelopmentDirectionChange?: (value: string) => void;
}

const StructuredOutline: React.FC<StructuredOutlineProps> = ({
  novelId,
  developmentDirection,
  onOutlineGenerated,
  onSave,
  savedOutline,
  onDevelopmentDirectionChange,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('generate');
  const [outlineData, setOutlineData] = useState<NovelOutline | null>(savedOutline || null);
  const [expandedDirectionGuide, setExpandedDirectionGuide] = useState(false);

  // 当savedOutline变化时，更新本地状态
  useEffect(() => {
    console.log('StructuredOutline组件接收到props变化:', {
      hasSavedOutline: !!savedOutline,
      currentActiveTab: activeTab
    });
    
    if (savedOutline) {
      console.log('接收到已保存的大纲数据:', savedOutline);
      setOutlineData(savedOutline);
      
      // 如果有已保存的大纲数据，自动切换到预览标签
      if (activeTab === 'generate') {
        console.log('自动切换到预览标签');
        setActiveTab('preview');
      }
    }
  }, [savedOutline, activeTab]);

  const handleGenerateOutline = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (!developmentDirection) {
      toast.error('请先填写发展走向');
      return;
    }

    setIsGenerating(true);
    try {
      console.log('开始请求大纲生成API...');
      console.log('请求参数:', {
        provider: params.provider,
        model: params.model,
        developmentDirection: developmentDirection.substring(0, 100) + '...',
        temperature: params.temperature,
        maxTokens: params.maxTokens
      });

      const response = await fetch(`/api/novel/${novelId}/outline/structure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: params.provider,
          model: params.model,
          developmentDirection,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '生成大纲失败');
      }

      const responseData = await response.json();
      console.log('收到的大纲数据:', responseData);
      
      // 确保数据符合NovelOutline结构
      const outlineData: NovelOutline = responseData;
      
      // 保存到本地状态
      setOutlineData(outlineData);
      
      // 调用父组件的回调
      onOutlineGenerated(outlineData);
      
      toast.success('大纲生成成功');
      setActiveTab('preview');
    } catch (error) {
      console.error('生成大纲失败:', error);
      toast.error(error instanceof Error ? error.message : '生成大纲失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveOutline = async () => {
    if (!outlineData || !onSave) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(outlineData);
      toast.success('大纲保存成功');
    } catch (error) {
      console.error('保存大纲失败:', error);
      toast.error('保存大纲失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDirectionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onDevelopmentDirectionChange) {
      onDevelopmentDirectionChange(e.target.value);
    }
  };

  const renderOutlineSection = (title: string, content: React.ReactNode) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-1 bg-primary rounded-full"></div>
        <h3 className="text-lg font-medium">{title}</h3>
      </div>
      <div className="pl-4 border-l-2 border-primary/20 ml-1">{content}</div>
    </div>
  );

  // 发展走向引导示例
  const directionGuideExamples = [
    {
      title: '英雄成长历程',
      example: '主角从普通人开始，经历一系列挑战与成长，最终成为拯救世界的英雄。故事将展现主角如何克服自我怀疑，战胜外部威胁，并在过程中领悟到真正的勇气来源于内心。'
    },
    {
      title: '双线叙事结构',
      example: '故事将交替展现过去和现在两条时间线，逐步揭示主角身世之谜与当下困境的关联。随着情节推进，两条线索逐渐交织，最终在高潮部分汇合，解开谜团。'
    },
    {
      title: '内外冲突并行',
      example: '主角一方面需要对抗不断升级的外部威胁，另一方面也在与自己内心的恐惧与阴暗面抗争。故事将探索两种冲突如何相互影响，并最终在精神和现实层面都得到解决。'
    }
  ];

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="bg-muted/30 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span>结构化大纲生成器</span>
            </CardTitle>
            <CardDescription className="mt-1">
              基于发展走向智能生成完整的小说结构大纲，包含主题、人物、情节等核心要素
            </CardDescription>
          </div>
          {outlineData && (
            <Button 
              onClick={handleSaveOutline} 
              disabled={isSaving || !onSave} 
              className="flex items-center gap-2 bg-primary/90 hover:bg-primary"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>保存中...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>保存大纲</span>
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="generate" className="flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              <span>生成设置</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-1">
              <Bookmark className="h-4 w-4" />
              <span>大纲预览</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="generate" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <Map className="h-4 w-4 mr-1" />
                  发展走向
                </Badge>
                <h4 className="font-medium">小说整体发展规划</h4>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <Compass className="h-4 w-4 text-blue-600" />
                  <h4 className="font-medium text-blue-800">什么是发展走向？</h4>
                </div>
                <p className="text-sm text-blue-800 mb-3">
                  发展走向是小说的宏观规划与创作蓝图，它描述了你的故事将如何展开、发展和结束，是整个小说的骨架与灵魂。
                </p>
                
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1" className="border-blue-200">
                    <AccordionTrigger className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:no-underline py-2">
                      <div className="flex items-center gap-1">
                        <RocketIcon className="h-3.5 w-3.5" />
                        <span>查看发展走向的要素与示例</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-blue-700">
                      <div className="space-y-3 pt-1">
                        <div className="space-y-2">
                          <h5 className="font-medium text-blue-800">发展走向应包含的要素：</h5>
                          <ul className="list-disc list-inside pl-1 space-y-1 text-blue-700">
                            <li>核心矛盾与冲突走向</li>
                            <li>主要角色的成长轨迹</li>
                            <li>情节发展的主要阶段</li>
                            <li>世界观拓展路径</li>
                            <li>主题思想的递进方式</li>
                          </ul>
                        </div>
                        
                        <div className="space-y-2">
                          <h5 className="font-medium text-blue-800">发展走向示例：</h5>
                          <div className="space-y-2">
                            {directionGuideExamples.map((guide, idx) => (
                              <div key={idx} className="bg-white p-2 rounded-md border border-blue-100">
                                <p className="font-medium text-blue-700 text-xs">{guide.title}</p>
                                <p className="text-xs mt-1">{guide.example}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
              
              <div className="bg-white rounded-lg p-4 border">
                <Label htmlFor="development-direction" className="text-sm font-medium mb-2 block">
                  输入你的小说发展走向规划：
                </Label>
                <Textarea 
                  id="development-direction"
                  placeholder="描述小说的整体发展路径、核心冲突走向、角色成长轨迹和主题思想演进..."
                  className="min-h-[120px] resize-y"
                  value={developmentDirection}
                  onChange={handleDirectionChange}
                />
              </div>
            </div>
            
            <Separator className="my-6" />
            
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10">AI</Badge>
                <h4 className="font-medium">智能生成设置</h4>
              </div>
              <LLMPromptInput
                inputType="textarea"
                buttonText={isGenerating ? "正在生成..." : "生成大纲"}
                disabled={isGenerating || !developmentDirection}
                onSubmit={handleGenerateOutline}
              />
              <div className="text-sm text-muted-foreground bg-muted/20 p-3 rounded-md border border-muted">
                <p className="font-medium mb-1">提示：</p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>可以指定特定的主题方向或写作风格</li>
                  <li>可以强调某些情节或人物关系的重要性</li>
                  <li>可以要求特定的结构或节奏安排</li>
                  <li>支持调整生成参数以获得不同的创作效果</li>
                </ul>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="preview" className="mt-4">
            {outlineData ? (
              <ScrollArea className="h-[600px] w-full pr-4">
                <div className="space-y-6 p-1">
                  {/* 调试信息 - 仅在开发环境显示 */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="bg-yellow-50 p-2 rounded-md mb-4 text-xs border border-yellow-200">
                      <p className="font-bold">调试信息（仅开发环境可见）：</p>
                      <p>大纲数据已加载，包含以下部分：</p>
                      <ul className="list-disc list-inside">
                        {outlineData.core ? <li>核心设定 ✅</li> : <li>核心设定 ❌</li>}
                        {outlineData.characters ? <li>人物设定 ✅</li> : <li>人物设定 ❌</li>}
                        {outlineData.plotStructure ? <li>情节结构 ✅</li> : <li>情节结构 ❌</li>}
                        {outlineData.worldBuilding ? <li>世界观设定 ✅</li> : <li>世界观设定 ❌</li>}
                        {outlineData.pacing ? <li>节奏控制 ✅</li> : <li>节奏控制 ❌</li>}
                      </ul>
                      <p className="mt-1">数据来源: {savedOutline ? '已保存的大纲' : '新生成的大纲'}</p>
                    </div>
                  )}

                  {/* 核心设定部分 */}
                  {outlineData.core && renderOutlineSection("核心设定", (
                    <div className="space-y-3 bg-muted/10 p-3 rounded-md">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">主题</Badge>
                          <p className="font-medium">{outlineData.core.theme}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">情感基调</Badge>
                          <p>{outlineData.core.emotionalTone}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">核心矛盾</Badge>
                          <p>{outlineData.core.mainConflict}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* 人物部分 - 安全渲染 */}
                  {outlineData.characters && renderOutlineSection("人物设定", (
                    <div className="space-y-4">
                      {outlineData.characters.main && outlineData.characters.main.length > 0 && (
                        <div>
                          <h4 className="text-md font-medium flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">主要角色</Badge>
                          </h4>
                          <div className="grid gap-4 mt-2">
                            {outlineData.characters.main.map((character, idx) => (
                              <div key={idx} className="bg-blue-50/50 p-4 rounded-md border border-blue-100 shadow-sm">
                                <p className="font-medium text-blue-800 border-b border-blue-100 pb-1 mb-2">{character.name} - {character.role}</p>
                                <p className="text-sm mt-1"><strong>成长弧：</strong> {character.arc}</p>
                                {character.relationships && character.relationships.length > 0 && (
                                  <div className="mt-3 bg-white/80 p-2 rounded-md">
                                    <p className="text-sm font-medium text-blue-700">人物关系：</p>
                                    <ul className="list-disc list-inside text-sm pl-2 mt-1">
                                      {character.relationships.map((rel, relIdx) => (
                                        <li key={relIdx} className="mb-1">
                                          <span className="font-medium">{rel.target}</span> ({rel.type}): {rel.development}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {outlineData.characters.supporting && outlineData.characters.supporting.length > 0 && (
                        <div>
                          <h4 className="text-md font-medium flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">配角</Badge>
                          </h4>
                          <div className="grid gap-2 mt-2">
                            {outlineData.characters.supporting.map((character, idx) => (
                              <div key={idx} className="bg-indigo-50/50 p-3 rounded-md border border-indigo-100">
                                <p className="font-medium text-indigo-800">{character.name} - {character.role}</p>
                                <p className="text-sm"><strong>作用：</strong> {character.purpose}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* 情节结构 */}
                  {outlineData.plotStructure && renderOutlineSection("情节结构", (
                    <div className="space-y-5">
                      {/* 起始部分 */}
                      {outlineData.plotStructure.setup && (
                        <div className="bg-green-50/50 p-3 rounded-md border border-green-100">
                          <h4 className="text-md font-medium text-green-800 border-b border-green-100 pb-1 mb-2">起始</h4>
                          <div className="pl-2">
                            {outlineData.plotStructure.setup.events && outlineData.plotStructure.setup.events.length > 0 && (
                              <div className="mb-3">
                                <p className="text-sm font-medium text-green-700">事件：</p>
                                <ul className="list-disc list-inside text-sm pl-2 mt-1">
                                  {outlineData.plotStructure.setup.events.map((event, idx) => (
                                    <li key={idx} className="text-green-800">{event}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {outlineData.plotStructure.setup.goals && outlineData.plotStructure.setup.goals.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-green-700">目标：</p>
                                <ul className="list-disc list-inside text-sm pl-2 mt-1">
                                  {outlineData.plotStructure.setup.goals.map((goal, idx) => (
                                    <li key={idx} className="text-green-800">{goal}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 发展部分 */}
                      {outlineData.plotStructure.development && (
                        <div className="bg-amber-50/50 p-3 rounded-md border border-amber-100">
                          <h4 className="text-md font-medium text-amber-800 border-b border-amber-100 pb-1 mb-2">发展</h4>
                          <div className="pl-2">
                            {outlineData.plotStructure.development.mainPlot && outlineData.plotStructure.development.mainPlot.events && (
                              <div className="mb-3">
                                <p className="text-sm font-medium text-amber-700">主线事件：</p>
                                <ul className="list-disc list-inside text-sm pl-2 mt-1">
                                  {outlineData.plotStructure.development.mainPlot.events.map((event, idx) => (
                                    <li key={idx} className="text-amber-800">{event}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {outlineData.plotStructure.development.mainPlot && outlineData.plotStructure.development.mainPlot.conflicts && (
                              <div className="mb-3">
                                <p className="text-sm font-medium text-amber-700">矛盾冲突：</p>
                                <ul className="list-disc list-inside text-sm pl-2 mt-1">
                                  {outlineData.plotStructure.development.mainPlot.conflicts.map((conflict, idx) => (
                                    <li key={idx} className="text-amber-800">{conflict}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {outlineData.plotStructure.development.subplots && outlineData.plotStructure.development.subplots.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-amber-700">支线：</p>
                                <div className="grid gap-2 mt-2">
                                  {outlineData.plotStructure.development.subplots.map((subplot, idx) => (
                                    <div key={idx} className="bg-white/80 p-2 rounded-md">
                                      <p className="font-medium text-sm text-amber-800">{subplot.title}</p>
                                      {subplot.events && (
                                        <ul className="list-disc list-inside text-sm mt-1 pl-2">
                                          {subplot.events.map((event, eventIdx) => (
                                            <li key={eventIdx}>{event}</li>
                                          ))}
                                        </ul>
                                      )}
                                      <p className="text-sm mt-1 text-amber-700"><strong>关联：</strong> {subplot.connection}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* 高潮部分 */}
                      {outlineData.plotStructure.climax && (
                        <div className="bg-red-50/50 p-3 rounded-md border border-red-100">
                          <h4 className="text-md font-medium text-red-800 border-b border-red-100 pb-1 mb-2">高潮</h4>
                          <div className="pl-2">
                            {outlineData.plotStructure.climax.events && (
                              <div className="mb-3">
                                <p className="text-sm font-medium text-red-700">关键事件：</p>
                                <ul className="list-disc list-inside text-sm pl-2 mt-1">
                                  {outlineData.plotStructure.climax.events.map((event, idx) => (
                                    <li key={idx} className="text-red-800">{event}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <p className="text-sm mt-2 bg-white/80 p-2 rounded-md"><strong>结局：</strong> {outlineData.plotStructure.climax.resolution}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* 世界观 */}
                  {outlineData.worldBuilding && renderOutlineSection("世界观设定", (
                    <div className="space-y-3 bg-purple-50/50 p-3 rounded-md border border-purple-100">
                      <p className="bg-white/80 p-2 rounded-md"><strong>背景：</strong> {outlineData.worldBuilding.background}</p>
                      {outlineData.worldBuilding.rules && outlineData.worldBuilding.rules.length > 0 && (
                        <div>
                          <p className="font-medium text-purple-800">世界规则：</p>
                          <ul className="list-disc list-inside text-sm pl-2 mt-1">
                            {outlineData.worldBuilding.rules.map((rule, idx) => (
                              <li key={idx} className="text-purple-700">{rule}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {outlineData.worldBuilding.elements && outlineData.worldBuilding.elements.length > 0 && (
                        <div>
                          <p className="font-medium text-purple-800 mt-2">重要元素：</p>
                          <div className="grid gap-2 mt-1">
                            {outlineData.worldBuilding.elements.map((element, idx) => (
                              <div key={idx} className="bg-white/80 p-2 rounded-md">
                                <p className="font-medium text-sm text-purple-800">{element.name}</p>
                                <p className="text-sm">{element.description}</p>
                                <p className="text-sm mt-1 text-purple-700"><strong>意义：</strong> {element.significance}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* 节奏控制 */}
                  {outlineData.pacing && renderOutlineSection("节奏控制", (
                    <div className="space-y-4">
                      {outlineData.pacing.turning_points && outlineData.pacing.turning_points.length > 0 && (
                        <div className="bg-cyan-50/50 p-3 rounded-md border border-cyan-100">
                          <h4 className="text-md font-medium text-cyan-800 border-b border-cyan-100 pb-1 mb-2">转折点</h4>
                          <div className="grid gap-2 mt-1">
                            {outlineData.pacing.turning_points.map((point, idx) => (
                              <div key={idx} className="bg-white/80 p-2 rounded-md">
                                <p className="font-medium text-sm text-cyan-800">{point.position} - {point.event}</p>
                                <p className="text-sm text-cyan-700"><strong>影响：</strong> {point.impact}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {outlineData.pacing.tension_curve && outlineData.pacing.tension_curve.length > 0 && (
                        <div className="bg-teal-50/50 p-3 rounded-md border border-teal-100">
                          <h4 className="text-md font-medium text-teal-800 border-b border-teal-100 pb-1 mb-2">张力曲线</h4>
                          <div className="grid gap-2 mt-1">
                            {outlineData.pacing.tension_curve.map((point, idx) => (
                              <div key={idx} className="bg-white/80 p-2 rounded-md flex items-center gap-3">
                                <div className="min-w-[100px]">
                                  <p className="font-medium text-sm text-teal-800">{point.phase}</p>
                                  <Badge variant="outline" className="mt-1 bg-teal-100 text-teal-700 border-teal-200">
                                    张力 {point.tension_level}/10
                                  </Badge>
                                </div>
                                <p className="text-sm">{point.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center text-muted-foreground py-16 bg-muted/10 rounded-lg border border-dashed border-muted">
                <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-lg font-medium">生成的大纲将在这里展示</p>
                <p className="text-sm mt-2">请先点击"生成大纲"按钮</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default StructuredOutline; 