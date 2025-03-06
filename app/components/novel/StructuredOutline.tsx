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
import { Save, Loader2, BookOpen, Sparkles, Bookmark, RocketIcon, Map, Compass, Footprints, Activity, LineChart, Workflow, GitBranch, Target, BarChart3, ActivitySquare } from 'lucide-react';
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

// 结构类型定义
type StructureType = 'three_act' | 'web_novel';

// 支线任务类型
interface SubplotTask {
  id: string;
  title: string;
  type: 'romance' | 'powerup' | 'world' | 'character';
  description: string;
  position: string;
}

// 章节节点类型
interface PlotNode {
  id: string;
  chapter: number;
  title: string;
  description: string;
  phase: string;
  importance: 1 | 2 | 3; // 1-普通 2-重要 3-关键
}

// 黄金三章分析结果
interface GoldenChaptersAnalysis {
  qidian: {
    worldBuilding: { score: number; level: string };
    characterDepth: { score: number; level: string };
    suspense: { score: number; level: string };
    suggestions: string[];
  };
  fanqie: {
    conflictIntensity: { score: number; level: string };
    pacingDensity: { score: number; level: string };
    hookEffect: { score: number; level: string };
    suggestions: string[];
  };
  overall: {
    suspenseIndex: number;
    immersionScore: number;
    detailedScores: {
      plotTwist: number;
      unknownElements: number;
      crisisForeshadowing: number;
      characterization: number;
      emotionalResonance: number;
      perspectiveImmersion: number;
    };
    suggestions: string[];
  };
}

// 卡点类型
interface CliffhangerSample {
  id: string;
  content: string;
  type: 'crisis' | 'twist' | 'mystery' | 'emotional';
  chapter?: number;
}

// 章节张力分析结果
interface PacingAnalysis {
  tensionCurve: Array<{chapter: number; tension: number}>;
  climaxFrequency: number;
  fatigueRisk: 'low' | 'medium' | 'high';
  averageInterval: number;
  suggestions: string[];
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
  
  // 新增状态
  const [structureType, setStructureType] = useState<StructureType>('three_act');
  const [isConverting, setIsConverting] = useState(false);
  const [plotNodes, setPlotNodes] = useState<PlotNode[]>([]);
  const [isGeneratingNodes, setIsGeneratingNodes] = useState(false);
  const [subplotTasks, setSubplotTasks] = useState<SubplotTask[]>([]);
  const [isGeneratingSubplots, setIsGeneratingSubplots] = useState(false);
  const [goldenChaptersAnalysis, setGoldenChaptersAnalysis] = useState<GoldenChaptersAnalysis | null>(null);
  const [isAnalyzingChapters, setIsAnalyzingChapters] = useState(false);
  const [pacingAnalysis, setPacingAnalysis] = useState<PacingAnalysis | null>(null);
  const [isAnalyzingPacing, setIsAnalyzingPacing] = useState(false);
  const [cliffhangers, setCliffhangers] = useState<CliffhangerSample[]>([]);
  const [selectedCliffhanger, setSelectedCliffhanger] = useState<CliffhangerSample | null>(null);
  const [isGeneratingCliffhanger, setIsGeneratingCliffhanger] = useState(false);
  const [totalChapters, setTotalChapters] = useState(200);
  const [nodeDensity, setNodeDensity] = useState(3);
  const [currentChapter, setCurrentChapter] = useState(12);
  const [chapterTitles, setChapterTitles] = useState<{direct: string; descriptive: string; suspense: string}>({
    direct: '觉醒的力量',
    descriptive: '沉睡的血脉，意外的礼物',
    suspense: '命运转折的代价'
  });

  // 在状态定义部分添加以下状态变量:
  const [showLLMNodeInput, setShowLLMNodeInput] = useState(false);
  const [showLLMSubplotInput, setShowLLMSubplotInput] = useState(false);
  const [showLLMConvertInput, setShowLLMConvertInput] = useState(false);

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

  // 生成大纲的处理函数
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

  // 新增函数 - 分析黄金三章
  const handleAnalyzeGoldenChapters = async () => {
    if (!outlineData) {
      toast.error('请先生成大纲');
      return;
    }

    setIsAnalyzingChapters(true);
    try {
      // 调用后端API进行黄金三章分析
      const response = await fetch(`/api/novel/${novelId}/golden-chapters/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ outlineId: outlineData }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '分析失败');
      }

      const analysisResult: GoldenChaptersAnalysis = await response.json();
      setGoldenChaptersAnalysis(analysisResult);
      toast.success('黄金三章分析完成');
    } catch (error) {
      console.error('黄金三章分析失败:', error);
      toast.error(error instanceof Error ? error.message : '黄金三章分析失败');
    } finally {
      setIsAnalyzingChapters(false);
    }
  };

  // 新增函数 - 生成优化后的章节示例
  const handleGenerateOptimizedChapter = async (platform: 'qidian' | 'fanqie') => {
    try {
      toast.loading(`正在生成${platform === 'qidian' ? '起点' : '番茄'}风格优化章节...`);
      
      // 调用API生成优化章节
      const response = await fetch(`/api/novel/${novelId}/golden-chapters/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '优化失败');
      }
      
      const result = await response.json();
      
      // 处理返回的优化结果
      if (result.optimizedChapters && result.optimizedChapters.length > 0) {
        const optimizedChapter = result.optimizedChapters[0];
        toast.success('章节优化完成');
        
        // 这里可以打开一个模态框显示优化内容，或者导航到章节预览页面
        // 简化处理，直接弹出成功提示
      } else {
        toast.error('未能获取优化结果');
      }
    } catch (error) {
      console.error('章节优化失败:', error);
      toast.error(error instanceof Error ? error.message : '章节优化失败');
    } finally {
      toast.dismiss();
    }
  };

  // 新增函数 - 一键生成优化后的黄金三章
  const handleGenerateAllOptimizedChapters = async () => {
    try {
      toast.loading('正在生成优化后的黄金三章...');
      
      // 调用API优化所有三章
      const response = await fetch(`/api/novel/${novelId}/golden-chapters/optimize-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '优化失败');
      }
      
      const result = await response.json();
      
      if (result.success && result.optimizedChapters) {
        toast.success('黄金三章优化完成');
        // 这里可以导航到预览页面，或者打开模态框显示优化后的章节
      } else {
        toast.error('未能获取优化结果');
      }
    } catch (error) {
      console.error('黄金三章优化失败:', error);
      toast.error(error instanceof Error ? error.message : '黄金三章优化失败');
    } finally {
      toast.dismiss();
    }
  };

  // 修改 - 结构转换
  const handleConvertStructure = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (!outlineData) {
      toast.error('请先生成大纲');
      return;
    }

    setIsConverting(true);
    try {
      // 调用后端API
      const response = await fetch(`/api/novel/${novelId}/structure/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          provider: params.provider,
          model: params.model,
          structureType: structureType === 'three_act' ? 'web_novel' : 'three_act',
          outline: outlineData,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '结构转换失败');
      }
      
      const convertedOutline = await response.json();
      
      // 保存到本地状态
      setOutlineData(convertedOutline);
      
      // 切换结构类型
      setStructureType(structureType === 'three_act' ? 'web_novel' : 'three_act');
      
      // 显示成功消息
      toast.success(`结构转换为${structureType === 'three_act' ? '网文流' : '三幕式'}成功`);
    } catch (error) {
      console.error('结构转换失败:', error);
      toast.error(error instanceof Error ? error.message : '结构转换失败');
    } finally {
      setIsConverting(false);
    }
  };
  
  // 为Button组件提供的onClick处理函数
  const handlePlotNodesGenerate = () => {
    setShowLLMNodeInput(true);
  };
  
  const handleSubplotsGenerate = () => {
    setShowLLMSubplotInput(true);
  };
  
  const handleStructureConvert = () => {
    setShowLLMConvertInput(true);
  };

  // 新增函数 - 生成关键节点
  const handleGeneratePlotNodes = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (!outlineData) {
      toast.error('请先生成大纲');
      return;
    }

    setIsGeneratingNodes(true);
    try {
      // 调用后端API
      const response = await fetch(`/api/novel/${novelId}/plot-nodes/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          provider: params.provider,
          model: params.model,
          totalChapters,
          nodeDensity,
          outline: outlineData,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '生成关键节点失败');
      }
      
      const plotNodes: PlotNode[] = await response.json();
      
      // 保存到本地状态
      setPlotNodes(plotNodes);
      
      // 显示成功消息
      toast.success('关键节点生成成功');
      
      // 自动切换到节点标签
      setActiveTab('nodes');
    } catch (error) {
      console.error('生成关键节点失败:', error);
      toast.error(error instanceof Error ? error.message : '生成关键节点失败');
    } finally {
      setIsGeneratingNodes(false);
    }
  };

  // 新增函数 - 生成支线任务
  const handleGenerateSubplots = async (params: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }) => {
    if (!outlineData) {
      toast.error('请先生成大纲');
      return;
    }

    setIsGeneratingSubplots(true);
    try {
      // 调用后端API
      const response = await fetch(`/api/novel/${novelId}/subplots/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          provider: params.provider,
          model: params.model,
          outline: outlineData,
          temperature: params.temperature,
          maxTokens: params.maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '生成支线任务失败');
      }
      
      const subplots: SubplotTask[] = await response.json();
      
      // 保存到本地状态
      setSubplotTasks(subplots);
      
      // 显示成功消息
      toast.success('支线任务生成成功');
      
      // 自动切换到支线标签
      setActiveTab('subplots');
    } catch (error) {
      console.error('生成支线任务失败:', error);
      toast.error(error instanceof Error ? error.message : '生成支线任务失败');
    } finally {
      setIsGeneratingSubplots(false);
    }
  };

  // 新增函数 - 分析章节张力
  const handleAnalyzePacing = async () => {
    if (!outlineData) {
      toast.error('请先生成大纲');
      return;
    }

    setIsAnalyzingPacing(true);
    try {
      // 调用API分析章节张力
      const response = await fetch(`/api/novel/${novelId}/pacing/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          structuredOutline: outlineData
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '分析失败');
      }
      
      const analysisResult = await response.json();
      setPacingAnalysis(analysisResult);
      toast.success('章节张力分析完成');
    } catch (error) {
      console.error('章节张力分析失败:', error);
      toast.error(error instanceof Error ? error.message : '章节张力分析失败');
    } finally {
      setIsAnalyzingPacing(false);
    }
  };

  // 新增函数 - 生成卡点
  const handleGenerateCliffhanger = async (type: 'crisis' | 'twist' | 'mystery' | 'emotional') => {
    setIsGeneratingCliffhanger(true);
    try {
      // 调用API生成卡点
      const response = await fetch(`/api/novel/${novelId}/cliffhanger/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          type,
          chapter: currentChapter
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '生成失败');
      }
      
      const cliffhanger = await response.json();
      setSelectedCliffhanger(cliffhanger);
      setCliffhangers([...cliffhangers, cliffhanger]);
      toast.success('卡点生成成功');
    } catch (error) {
      console.error('卡点生成失败:', error);
      toast.error(error instanceof Error ? error.message : '卡点生成失败');
    } finally {
      setIsGeneratingCliffhanger(false);
    }
  };

  // 保存大纲的处理函数
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

  // 发展走向变更的处理函数
  const handleDirectionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onDevelopmentDirectionChange) {
      onDevelopmentDirectionChange(e.target.value);
    }
  };

  // 渲染大纲分节的辅助函数
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

  // 在组件return语句前添加这些JSX组件:
  const renderLLMInputModal = (
    title: string,
    isOpen: boolean,
    onClose: () => void,
    onSubmit: (params: { 
      provider: string; 
      model: string; 
      prompt: string;
      temperature?: number;
      maxTokens?: number;
    }) => Promise<void>,
    buttonText: string
  ) => {
    if (!isOpen) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-[600px] max-w-[90vw] max-h-[90vh] overflow-auto">
          <h3 className="text-xl font-bold mb-4">{title}</h3>
          <LLMPromptInput 
            inputType="input"
            buttonText={buttonText}
            onSubmit={onSubmit}
          />
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={onClose}>取消</Button>
          </div>
        </div>
      </div>
    );
  };

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
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="generate" className="flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              <span>生成设置</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-1">
              <Bookmark className="h-4 w-4" />
              <span>大纲预览</span>
            </TabsTrigger>
            <TabsTrigger value="golden_chapters" className="flex items-center gap-1">
              <Footprints className="h-4 w-4" />
              <span>黄金三章</span>
            </TabsTrigger>
            <TabsTrigger value="outline_engine" className="flex items-center gap-1">
              <Workflow className="h-4 w-4" />
              <span>大纲引擎</span>
            </TabsTrigger>
            <TabsTrigger value="pacing_analyzer" className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              <span>节奏分析</span>
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
          
          <TabsContent value="golden_chapters" className="mt-4 space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-amber-800 flex items-center gap-2 mb-3">
                <Footprints className="h-5 w-5" />
                黄金三章优化
              </h3>
              <p className="text-sm text-amber-700 mb-3">
                黄金三章是决定读者留存率的关键章节，通过AI智能分析为不同平台读者群体优化开篇体验。
              </p>
              {!goldenChaptersAnalysis && (
                <Button 
                  className="mt-2 bg-amber-600 hover:bg-amber-700" 
                  onClick={handleAnalyzeGoldenChapters}
                  disabled={isAnalyzingChapters || !outlineData}
                >
                  {isAnalyzingChapters ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    '开始黄金三章分析'
                  )}
                </Button>
              )}
            </div>
            
            {goldenChaptersAnalysis ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-blue-200">
                    <CardHeader className="bg-blue-50 pb-3">
                      <CardTitle className="text-blue-800 text-base">起点风格诊断</CardTitle>
                      <CardDescription className="text-blue-600">慢热铺垫检测与优化建议</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">世界观铺垫比例</span>
                          <Badge variant="outline" className="bg-blue-50">{goldenChaptersAnalysis.qidian.worldBuilding.level}</Badge>
                        </div>
                        <div className="w-full bg-blue-100 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${goldenChaptersAnalysis.qidian.worldBuilding.score}%` }}></div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-medium">人物介绍深度</span>
                          <Badge variant="outline" className="bg-blue-50">{goldenChaptersAnalysis.qidian.characterDepth.level}</Badge>
                        </div>
                        <div className="w-full bg-blue-100 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${goldenChaptersAnalysis.qidian.characterDepth.score}%` }}></div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-medium">悬念设置强度</span>
                          <Badge variant="outline" className="bg-blue-50">{goldenChaptersAnalysis.qidian.suspense.level}</Badge>
                        </div>
                        <div className="w-full bg-blue-100 rounded-full h-2.5">
                          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${goldenChaptersAnalysis.qidian.suspense.score}%` }}></div>
                        </div>
                      </div>
                      
                      <div className="mt-4 p-3 bg-blue-50 rounded-md text-sm text-blue-700">
                        <p className="font-medium mb-1">优化建议：</p>
                        <ul className="list-disc list-inside space-y-1">
                          {goldenChaptersAnalysis.qidian.suggestions.map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        className="mt-4 text-blue-600 border-blue-200 hover:bg-blue-50 w-full"
                        onClick={() => handleGenerateOptimizedChapter('qidian')}
                      >
                        生成优化后的章节示例
                      </Button>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-red-200">
                    <CardHeader className="bg-red-50 pb-3">
                      <CardTitle className="text-red-800 text-base">番茄风格诊断</CardTitle>
                      <CardDescription className="text-red-600">首章爆点分析与冲突优化</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">首章冲突强度</span>
                          <Badge variant="outline" className="bg-red-50">{goldenChaptersAnalysis.fanqie.conflictIntensity.level}</Badge>
                        </div>
                        <div className="w-full bg-red-100 rounded-full h-2.5">
                          <div className="bg-red-600 h-2.5 rounded-full" style={{ width: `${goldenChaptersAnalysis.fanqie.conflictIntensity.score}%` }}></div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-medium">情节紧凑度</span>
                          <Badge variant="outline" className="bg-red-50">{goldenChaptersAnalysis.fanqie.pacingDensity.level}</Badge>
                        </div>
                        <div className="w-full bg-red-100 rounded-full h-2.5">
                          <div className="bg-red-600 h-2.5 rounded-full" style={{ width: `${goldenChaptersAnalysis.fanqie.pacingDensity.score}%` }}></div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-medium">爆点设计效果</span>
                          <Badge variant="outline" className="bg-red-50">{goldenChaptersAnalysis.fanqie.hookEffect.level}</Badge>
                        </div>
                        <div className="w-full bg-red-100 rounded-full h-2.5">
                          <div className="bg-red-600 h-2.5 rounded-full" style={{ width: `${goldenChaptersAnalysis.fanqie.hookEffect.score}%` }}></div>
                        </div>
                      </div>
                      
                      <div className="mt-4 p-3 bg-red-50 rounded-md text-sm text-red-700">
                        <p className="font-medium mb-1">优化建议：</p>
                        <ul className="list-disc list-inside space-y-1">
                          {goldenChaptersAnalysis.fanqie.suggestions.map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        className="mt-4 text-red-600 border-red-200 hover:bg-red-50 w-full"
                        onClick={() => handleGenerateOptimizedChapter('fanqie')}
                      >
                        生成优化后的章节示例
                      </Button>
                    </CardContent>
                  </Card>
                </div>
                
                <Card className="border-green-200 mt-6">
                  <CardHeader className="bg-green-50 pb-3">
                    <CardTitle className="text-green-800 text-base">开场综合诊断</CardTitle>
                    <CardDescription className="text-green-600">AI评分与读者体验预测</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="inline-flex items-center justify-center p-4 bg-green-100 rounded-full mb-2">
                            <div className="text-2xl font-bold text-green-700">{goldenChaptersAnalysis.overall.suspenseIndex.toFixed(1)}</div>
                          </div>
                          <h4 className="font-medium text-green-800">悬念指数</h4>
                          <p className="text-xs text-green-600 mt-1">基于首章末尾悬念强度评分</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>剧情转折</span>
                            <span className="font-medium">{goldenChaptersAnalysis.overall.detailedScores.plotTwist.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>未知元素</span>
                            <span className="font-medium">{goldenChaptersAnalysis.overall.detailedScores.unknownElements.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>危机预警</span>
                            <span className="font-medium">{goldenChaptersAnalysis.overall.detailedScores.crisisForeshadowing.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="text-center">
                          <div className="inline-flex items-center justify-center p-4 bg-green-100 rounded-full mb-2">
                            <div className="text-2xl font-bold text-green-700">{goldenChaptersAnalysis.overall.immersionScore.toFixed(1)}</div>
                          </div>
                          <h4 className="font-medium text-green-800">代入感评分</h4>
                          <p className="text-xs text-green-600 mt-1">基于读者与主角情感连接强度</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>人物塑造</span>
                            <span className="font-medium">{goldenChaptersAnalysis.overall.detailedScores.characterization.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>情感共鸣</span>
                            <span className="font-medium">{goldenChaptersAnalysis.overall.detailedScores.emotionalResonance.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>视角沉浸</span>
                            <span className="font-medium">{goldenChaptersAnalysis.overall.detailedScores.perspectiveImmersion.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <Separator className="my-5" />
                    
                    <div className="space-y-3">
                      <h4 className="font-medium text-green-800">综合优化建议</h4>
                      <div className="p-3 bg-green-50 rounded-md text-sm">
                        <ul className="list-disc list-inside space-y-2">
                          {goldenChaptersAnalysis.overall.suggestions.map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    
                    <Button 
                      className="mt-5 bg-green-600 hover:bg-green-700 text-white w-full"
                      onClick={handleGenerateAllOptimizedChapters}
                    >
                      一键生成优化后的黄金三章
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                <p className="mb-2">点击上方按钮开始黄金三章分析</p>
                <p className="text-sm">系统将分析开篇三章的结构和节奏，并提供平台针对性优化</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="outline_engine" className="mt-4 space-y-6">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-purple-800 flex items-center gap-2 mb-3">
                <Workflow className="h-5 w-5" />
                智能大纲引擎
              </h3>
              <p className="text-sm text-purple-700 mb-3">
                智能大纲引擎支持三幕式/网文流自动转换，可生成200章节点预测和支线任务推荐，帮助作者规划长篇小说架构。
              </p>
            </div>
            
            <Tabs defaultValue="structure_converter">
              <TabsList className="mb-4">
                <TabsTrigger value="structure_converter">结构转换器</TabsTrigger>
                <TabsTrigger value="plot_nodes">关键节点生成</TabsTrigger>
                <TabsTrigger value="subplot_generator">支线任务推荐</TabsTrigger>
              </TabsList>
              
              <TabsContent value="structure_converter" className="space-y-4">
                <div className="flex space-x-4">
                  <Card className="flex-1 border-purple-200">
                    <CardHeader className="bg-purple-50 pb-3">
                      <CardTitle className="text-purple-800 text-base flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span>当前结构模式</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex justify-between mb-3">
                        <Badge>{structureType === 'three_act' ? '三幕式结构' : '网文流结构'}</Badge>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-xs h-7"
                          onClick={() => setStructureType(structureType === 'three_act' ? 'web_novel' : 'three_act')}
                        >
                          切换模式
                        </Button>
                      </div>
                      
                      {structureType === 'three_act' ? (
                        <div className="space-y-3 text-sm">
                          <div className="p-2 bg-purple-50 rounded-md">
                            <div className="font-medium text-purple-800 mb-1">第一幕：设置</div>
                            <div className="text-purple-700">建立世界观、人物关系、核心冲突</div>
                          </div>
                          <div className="p-2 bg-purple-50 rounded-md">
                            <div className="font-medium text-purple-800 mb-1">第二幕：对抗</div>
                            <div className="text-purple-700">主角面临挑战、探索解决方案、经历失败</div>
                          </div>
                          <div className="p-2 bg-purple-50 rounded-md">
                            <div className="font-medium text-purple-800 mb-1">第三幕：解决</div>
                            <div className="text-purple-700">最终对决、人物转变、故事结局</div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm">
                          <div className="p-2 bg-purple-50 rounded-md">
                            <div className="font-medium text-purple-800 mb-1">开局篇：基础设定</div>
                            <div className="text-purple-700">世界观、角色初遇、基本矛盾</div>
                          </div>
                          <div className="p-2 bg-purple-50 rounded-md">
                            <div className="font-medium text-purple-800 mb-1">进阶篇：能力提升</div>
                            <div className="text-purple-700">主角成长、小型冲突、技能获得</div>
                          </div>
                          <div className="p-2 bg-purple-50 rounded-md">
                            <div className="font-medium text-purple-800 mb-1">争锋篇：挑战升级</div>
                            <div className="text-purple-700">中型对决、盟友形成、敌人展现</div>
                          </div>
                          <div className="p-2 bg-purple-50 rounded-md">
                            <div className="font-medium text-purple-800 mb-1">终结篇：最终决战</div>
                            <div className="text-purple-700">大决战、终极真相、角色蜕变</div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card className="flex-1 border-purple-200">
                    <CardHeader className="bg-purple-50 pb-3">
                      <CardTitle className="text-purple-800 text-base flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        <span>{structureType === 'three_act' ? '网文流结构' : '三幕式结构'}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex justify-between mb-3">
                        <Badge variant="outline">目标结构</Badge>
                        <Button 
                          size="sm" 
                          className="text-xs h-7 bg-purple-600 hover:bg-purple-700"
                          onClick={handleStructureConvert}
                          disabled={isConverting || !outlineData}
                        >
                          {isConverting ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              转换中...
                            </>
                          ) : (
                            '一键转换'
                          )}
                        </Button>
                      </div>
                      
                      {structureType === 'three_act' ? (
                        <div className="space-y-3 text-sm">
                          <div className="p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-md border-l-4 border-purple-300">
                            <div className="font-medium text-purple-800 mb-1">铺垫期：奠定基础</div>
                            <div className="text-purple-700">世界设定、主角能力体系、初始冲突</div>
                          </div>
                          <div className="p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-md border-l-4 border-purple-300">
                            <div className="font-medium text-purple-800 mb-1">突破期：能力提升</div>
                            <div className="text-purple-700">解锁能力、获得资源、解决小冲突</div>
                          </div>
                          <div className="p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-md border-l-4 border-purple-300">
                            <div className="font-medium text-purple-800 mb-1">小高潮期：支线发展</div>
                            <div className="text-purple-700">次要矛盾展开、情感线发展、次要目标达成</div>
                          </div>
                          <div className="p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-md border-l-4 border-purple-300">
                            <div className="font-medium text-purple-800 mb-1">巅峰期：冲突升级</div>
                            <div className="text-purple-700">最终BOSS出现、全面对抗、大结局</div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm">
                          <div className="p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-md border-l-4 border-purple-300">
                            <div className="font-medium text-purple-800 mb-1">第一幕：设置</div>
                            <div className="text-purple-700">建立世界观、人物关系、核心冲突</div>
                          </div>
                          <div className="p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-md border-l-4 border-purple-300">
                            <div className="font-medium text-purple-800 mb-1">第二幕：对抗</div>
                            <div className="text-purple-700">主角面临挑战、探索解决方案、经历失败</div>
                          </div>
                          <div className="p-2 bg-gradient-to-r from-purple-50 to-purple-100 rounded-md border-l-4 border-purple-300">
                            <div className="font-medium text-purple-800 mb-1">第三幕：解决</div>
                            <div className="text-purple-700">最终对决、人物转变、故事结局</div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h4 className="text-purple-800 font-medium mb-2">结构转换适配</h4>
                  <p className="text-sm text-purple-700 mb-3">
                    系统将根据当前{structureType === 'three_act' ? '三幕式' : '网文流'}结构，生成适合{structureType === 'three_act' ? '网文连载' : '传统叙事'}的长篇结构方案，包括：
                  </p>
                  <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                    {structureType === 'three_act' ? (
                      <>
                        <li>将第一幕扩展为铺垫期和突破期前半段</li>
                        <li>将第二幕扩展为突破期后半段和小高潮期</li>
                        <li>将第三幕扩展为巅峰期</li>
                        <li>自动生成更多支线情节、角色发展弧</li>
                        <li>设计200章关键情节节点和转折点</li>
                      </>
                    ) : (
                      <>
                        <li>将铺垫期和突破期前半段压缩为第一幕</li>
                        <li>将突破期后半段和小高潮期压缩为第二幕</li>
                        <li>将巅峰期压缩为第三幕</li>
                        <li>保留核心情节，精简次要支线</li>
                        <li>重点强化三个关键转折点的戏剧效果</li>
                      </>
                    )}
                  </ul>
                </div>
              </TabsContent>
              
              <TabsContent value="plot_nodes" className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                  <h3 className="text-lg font-medium text-indigo-800 flex items-center gap-2 mb-3">
                    <Target className="h-5 w-5" />
                    关键节点生成
                  </h3>
                  <p className="text-sm text-indigo-700">
                    系统将根据你的小说大纲和风格，预测200章的关键情节节点，确保长篇小说结构合理、节奏紧凑。
                  </p>
                </div>
                
                <div className="flex space-x-4 mb-4">
                  <Card className="w-1/3 border-indigo-200">
                    <CardHeader className="bg-indigo-50 py-3">
                      <CardTitle className="text-indigo-800 text-sm">生成设置</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="total-chapters">总章节数</Label>
                          <Input 
                            id="total-chapters" 
                            type="number" 
                            placeholder="200" 
                            className="border-indigo-200" 
                            value={totalChapters}
                            onChange={(e) => setTotalChapters(parseInt(e.target.value) || 200)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="chapter-density">节点密度</Label>
                          <div className="flex items-center justify-between">
                            <span className="text-xs">低</span>
                            <input 
                              type="range" 
                              id="chapter-density" 
                              min="1" 
                              max="5" 
                              value={nodeDensity}
                              onChange={(e) => setNodeDensity(parseInt(e.target.value))}
                              className="w-full mx-2"
                            />
                            <span className="text-xs">高</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>高潮分布</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Button variant="outline" size="sm" className="bg-indigo-100 text-xs">均匀</Button>
                            <Button variant="outline" size="sm" className="text-xs">前密后疏</Button>
                            <Button variant="outline" size="sm" className="text-xs">递进式</Button>
                          </div>
                        </div>
                        <Button 
                          className="w-full bg-indigo-600 hover:bg-indigo-700"
                          onClick={handlePlotNodesGenerate}
                          disabled={isGeneratingNodes || !outlineData}
                        >
                          {isGeneratingNodes ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            '生成节点'
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <div className="w-2/3 border rounded-lg">
                    <div className="p-3 bg-muted border-b flex justify-between items-center">
                      <div className="font-medium">关键节点预览</div>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          筛选节点
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          导出大纲
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[350px] p-4">
                      {plotNodes.length > 0 ? (
                        <div className="space-y-6">
                          {/* 分组显示节点 */}
                          {Array.from(new Set(plotNodes.map(node => node.phase))).map(phase => (
                            <div key={phase}>
                              <h4 className="text-sm font-medium text-indigo-800 mb-2">
                                {phase} (第{Math.min(...plotNodes.filter(n => n.phase === phase).map(n => n.chapter))}-
                                {Math.max(...plotNodes.filter(n => n.phase === phase).map(n => n.chapter))}章)
                              </h4>
                              <div className="space-y-2">
                                {plotNodes.filter(node => node.phase === phase).map(node => (
                                  <div 
                                    key={node.id} 
                                    className={`p-2 border-l-2 border-indigo-${node.importance === 3 ? '600' : node.importance === 2 ? '500' : '400'} bg-indigo-50 rounded-r-md text-xs`}
                                  >
                                    <span className="font-medium text-indigo-700">第{node.chapter}章：</span>
                                    <span className="text-indigo-600">{node.title}</span>
                                    {node.description && (
                                      <p className="mt-1 text-indigo-500">{node.description}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <div className="text-center text-muted-foreground py-8">
                            <p>请点击"生成节点"按钮开始生成</p>
                            <p className="text-sm mt-2">系统将根据大纲内容生成关键情节节点</p>
                          </div>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="subplot_generator" className="space-y-4">
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-4">
                  <h3 className="text-lg font-medium text-teal-800 flex items-center gap-2 mb-3">
                    <GitBranch className="h-5 w-5" />
                    支线任务推荐
                  </h3>
                  <p className="text-sm text-teal-700">
                    系统会根据主线故事架构，生成推荐的支线任务，丰富故事内容，提升作品深度与广度。
                  </p>
                  <Button 
                    className="mt-2 bg-teal-600 hover:bg-teal-700" 
                    onClick={handleSubplotsGenerate}
                    disabled={isGeneratingSubplots || !outlineData}
                  >
                    {isGeneratingSubplots ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      '生成支线任务'
                    )}
                  </Button>
                </div>
                
                {subplotTasks.length > 0 && (
                  <>
                    <div className="bg-white rounded-lg border p-4 mb-4">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium">支线类别分布</h4>
                        <Button variant="outline" size="sm">调整比例</Button>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>感情线 <Badge>{subplotTasks.filter(t => t.type === 'romance').length}条</Badge></span>
                            <span className="text-blue-600">{Math.round(subplotTasks.filter(t => t.type === 'romance').length / subplotTasks.length * 100)}%</span>
                          </div>
                          <div className="w-full bg-blue-100 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.round(subplotTasks.filter(t => t.type === 'romance').length / subplotTasks.length * 100)}%` }}></div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>能力升级线 <Badge>{subplotTasks.filter(t => t.type === 'powerup').length}条</Badge></span>
                            <span className="text-purple-600">{Math.round(subplotTasks.filter(t => t.type === 'powerup').length / subplotTasks.length * 100)}%</span>
                          </div>
                          <div className="w-full bg-purple-100 rounded-full h-2">
                            <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${Math.round(subplotTasks.filter(t => t.type === 'powerup').length / subplotTasks.length * 100)}%` }}></div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>世界探索线 <Badge>{subplotTasks.filter(t => t.type === 'world').length}条</Badge></span>
                            <span className="text-green-600">{Math.round(subplotTasks.filter(t => t.type === 'world').length / subplotTasks.length * 100)}%</span>
                          </div>
                          <div className="w-full bg-green-100 rounded-full h-2">
                            <div className="bg-green-600 h-2 rounded-full" style={{ width: `${Math.round(subplotTasks.filter(t => t.type === 'world').length / subplotTasks.length * 100)}%` }}></div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>角色成长线 <Badge>{subplotTasks.filter(t => t.type === 'character').length}条</Badge></span>
                            <span className="text-amber-600">{Math.round(subplotTasks.filter(t => t.type === 'character').length / subplotTasks.length * 100)}%</span>
                          </div>
                          <div className="w-full bg-amber-100 rounded-full h-2">
                            <div className="bg-amber-600 h-2 rounded-full" style={{ width: `${Math.round(subplotTasks.filter(t => t.type === 'character').length / subplotTasks.length * 100)}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <Card className="border-teal-200">
                        <CardHeader className="bg-teal-50 pb-3">
                          <CardTitle className="text-teal-800 text-base">感情线推荐</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <ScrollArea className="h-[200px]">
                            <div className="p-4 space-y-3">
                              {subplotTasks.filter(task => task.type === 'romance').map(task => (
                                <div key={task.id} className="p-3 bg-teal-50 rounded-md text-sm border-l-4 border-teal-400">
                                  <div className="font-medium text-teal-800 mb-1 flex justify-between">
                                    <span>{task.title}</span>
                                    <Badge variant="outline" className="text-xs">{task.position}</Badge>
                                  </div>
                                  <p className="text-teal-700 text-xs">{task.description}</p>
                                </div>
                              ))}
                              {subplotTasks.filter(task => task.type === 'romance').length === 0 && (
                                <div className="p-3 text-center text-muted-foreground">
                                  <p>没有相关支线任务</p>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                      
                      <Card className="border-purple-200">
                        <CardHeader className="bg-purple-50 pb-3">
                          <CardTitle className="text-purple-800 text-base">能力升级线推荐</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <ScrollArea className="h-[200px]">
                            <div className="p-4 space-y-3">
                              {subplotTasks.filter(task => task.type === 'powerup').map(task => (
                                <div key={task.id} className="p-3 bg-purple-50 rounded-md text-sm border-l-4 border-purple-400">
                                  <div className="font-medium text-purple-800 mb-1 flex justify-between">
                                    <span>{task.title}</span>
                                    <Badge variant="outline" className="text-xs">{task.position}</Badge>
                                  </div>
                                  <p className="text-purple-700 text-xs">{task.description}</p>
                                </div>
                              ))}
                              {subplotTasks.filter(task => task.type === 'powerup').length === 0 && (
                                <div className="p-3 text-center text-muted-foreground">
                                  <p>没有相关支线任务</p>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <Button 
                      className="w-full bg-teal-600 hover:bg-teal-700 mt-2"
                      onClick={handleSubplotsGenerate}
                      disabled={isGeneratingSubplots}
                    >
                      {isGeneratingSubplots ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        '重新生成支线任务'
                      )}
                    </Button>
                  </>
                )}
                
                {!subplotTasks.length && (
                  <div className="text-center text-muted-foreground py-12">
                    <p className="mb-2">点击上方按钮开始生成支线任务</p>
                    <p className="text-sm">系统将根据主线内容推荐合适的支线任务</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
          
          <TabsContent value="pacing_analyzer" className="mt-4 space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-blue-800 flex items-center gap-2 mb-3">
                <Activity className="h-5 w-5" />
                节奏分析仪
              </h3>
              <p className="text-sm text-blue-700 mb-3">
                节奏分析仪可分析高潮间隔、情感起伏和章节张力，提供智能分章建议和卡点生成，确保读者长期阅读体验。
              </p>
              {!pacingAnalysis && (
                <Button 
                  className="mt-2 bg-blue-600 hover:bg-blue-700 text-white" 
                  onClick={handleAnalyzePacing}
                  disabled={isAnalyzingPacing || !outlineData}
                >
                  {isAnalyzingPacing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    '开始节奏分析'
                  )}
                </Button>
              )}
            </div>
            
            <Tabs defaultValue="tension_analysis">
              <TabsList className="mb-4">
                <TabsTrigger value="tension_analysis">张力曲线</TabsTrigger>
                <TabsTrigger value="chapter_break">智能分章</TabsTrigger>
                <TabsTrigger value="cliffhanger">卡点生成器</TabsTrigger>
              </TabsList>
              
              <TabsContent value="tension_analysis" className="space-y-4">
                {pacingAnalysis ? (
                  <div className="bg-white rounded-lg border p-4 mb-4">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="font-medium flex items-center gap-2">
                        <LineChart className="h-4 w-4 text-blue-600" />
                        故事张力分析
                      </h4>
                      <div className="flex gap-2">
                        <Badge variant="outline">200章预测</Badge>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          调整分析范围
                        </Button>
                      </div>
                    </div>
                    
                    <div className="h-64 relative mb-6 border rounded-md p-4">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center p-4 bg-blue-50 rounded-md">
                          <BarChart3 className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                          <p className="text-sm font-medium">张力曲线分析图</p>
                          <p className="text-xs text-muted-foreground mt-1">根据大纲生成的预测张力变化</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="p-3 bg-red-50 rounded-md">
                        <div className="font-medium text-center mb-1 text-red-700">高潮频率</div>
                        <div className="text-center text-2xl font-bold text-red-600">{pacingAnalysis.climaxFrequency.toFixed(1)}%</div>
                        <div className="text-xs text-center text-red-600 mt-1">建议值：8-10%</div>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-md">
                        <div className="font-medium text-center mb-1 text-amber-700">疲劳风险</div>
                        <div className="text-center text-2xl font-bold text-amber-600">
                          {pacingAnalysis.fatigueRisk === 'high' ? '高' : 
                           pacingAnalysis.fatigueRisk === 'medium' ? '中等' : '低'}
                        </div>
                        <div className="text-xs text-center text-amber-600 mt-1">
                          {pacingAnalysis.fatigueRisk === 'high' ? '需立即调整' : 
                           pacingAnalysis.fatigueRisk === 'medium' ? '中段缺乏变化' : '良好节奏'}
                        </div>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-md">
                        <div className="font-medium text-center mb-1 text-blue-700">高潮间隔</div>
                        <div className="text-center text-2xl font-bold text-blue-600">{pacingAnalysis.averageInterval.toFixed(1)}</div>
                        <div className="text-xs text-center text-blue-600 mt-1">平均间隔章节数</div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="font-medium text-blue-800">节奏优化建议</h4>
                      <div className="p-3 bg-blue-50 rounded-md text-sm text-blue-700">
                        <ul className="list-disc list-inside space-y-2">
                          {pacingAnalysis.suggestions.map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    <p className="mb-2">请先点击上方按钮进行节奏分析</p>
                    <p className="text-sm">系统将分析小说节奏控制的各个要素并提出优化建议</p>
                  </div>
                )}
                
                {pacingAnalysis && (
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    生成优化后的张力曲线
                  </Button>
                )}
              </TabsContent>
              
              <TabsContent value="chapter_break" className="space-y-4">
                <div className="bg-white rounded-lg border p-4 mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <ActivitySquare className="h-4 w-4 text-blue-600" />
                      智能分章策略
                    </h4>
                    <Button variant="outline" size="sm">
                      调整分章模式
                    </Button>
                  </div>
                  
                  <div className="space-y-5 mb-4">
                    <div className="p-3 bg-blue-50 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-medium text-blue-800">起始章节 (1-30)</div>
                        <Badge>黄金三章重点区</Badge>
                      </div>
                      <div className="text-sm text-blue-700 mb-3">
                        短小精悍模式：每章2000-2500字，重点突出人物形象和故事悬念
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">章节长度</div>
                          <div>2000-2500字</div>
                        </div>
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">场景切换</div>
                          <div>1-2处/章</div>
                        </div>
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">悬念设置</div>
                          <div>每章末尾</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-blue-50 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-medium text-blue-800">中期章节 (31-120)</div>
                        <Badge variant="outline">读者沉浸区</Badge>
                      </div>
                      <div className="text-sm text-blue-700 mb-3">
                        标准模式：每章2500-3000字，平衡情节发展和角色成长
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">章节长度</div>
                          <div>2500-3000字</div>
                        </div>
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">场景切换</div>
                          <div>2-3处/章</div>
                        </div>
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">悬念设置</div>
                          <div>每3-5章/次</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-blue-50 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-medium text-blue-800">高潮章节 (121-200)</div>
                        <Badge className="bg-blue-600">高能爆发区</Badge>
                      </div>
                      <div className="text-sm text-blue-700 mb-3">
                        紧凑刺激模式：每章3000-3500字，强化冲突和决战场景
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">章节长度</div>
                          <div>3000-3500字</div>
                        </div>
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">场景切换</div>
                          <div>1-2处/章</div>
                        </div>
                        <div className="p-2 border border-blue-200 rounded bg-white text-center">
                          <div className="font-medium mb-1">悬念设置</div>
                          <div>每章强化</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  生成自动分章计划
                </Button>
              </TabsContent>
              
              <TabsContent value="cliffhanger" className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                  <h3 className="text-base font-medium text-indigo-800 flex items-center gap-2 mb-2">
                    <Target className="h-4 w-4" />
                    卡点生成器
                  </h3>
                  <p className="text-sm text-indigo-700">
                    自动为章节结尾生成吸引人的悬念设计，提高读者追更欲望和留存率。
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Card className="border-indigo-200">
                    <CardHeader className="bg-indigo-50 pb-3">
                      <CardTitle className="text-indigo-800 text-base">悬念类型推荐</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        <div className="p-2 border border-indigo-200 rounded-md flex justify-between items-center">
                          <div className="text-sm">
                            <div className="font-medium">危机型</div>
                            <div className="text-xs text-muted-foreground">角色陷入危险</div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => handleGenerateCliffhanger('crisis')}
                            disabled={isGeneratingCliffhanger}
                          >
                            生成
                          </Button>
                        </div>
                        <div className="p-2 border border-indigo-200 rounded-md flex justify-between items-center">
                          <div className="text-sm">
                            <div className="font-medium">转折型</div>
                            <div className="text-xs text-muted-foreground">意外情节转变</div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => handleGenerateCliffhanger('twist')}
                            disabled={isGeneratingCliffhanger}
                          >
                            生成
                          </Button>
                        </div>
                        <div className="p-2 border border-indigo-200 rounded-md flex justify-between items-center">
                          <div className="text-sm">
                            <div className="font-medium">谜团型</div>
                            <div className="text-xs text-muted-foreground">揭示新谜题</div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => handleGenerateCliffhanger('mystery')}
                            disabled={isGeneratingCliffhanger}
                          >
                            生成
                          </Button>
                        </div>
                        <div className="p-2 border border-indigo-200 rounded-md flex justify-between items-center">
                          <div className="text-sm">
                            <div className="font-medium">情感型</div>
                            <div className="text-xs text-muted-foreground">关系变化暗示</div>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => handleGenerateCliffhanger('emotional')}
                            disabled={isGeneratingCliffhanger}
                          >
                            生成
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <div className="border rounded-lg">
                    <div className="p-3 bg-muted border-b">
                      <div className="font-medium">多版本标题生成</div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="text-sm mb-2 flex justify-between">
                          <span className="font-medium">第{currentChapter}章标题方案</span>
                          <Badge variant="outline">当前章节</Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="p-2 border rounded-md text-sm flex justify-between">
                            <span>{chapterTitles.direct}</span>
                            <Badge className="bg-blue-600">直白型</Badge>
                          </div>
                          <div className="p-2 border rounded-md text-sm flex justify-between">
                            <span>{chapterTitles.descriptive}</span>
                            <Badge className="bg-indigo-600">描述型</Badge>
                          </div>
                          <div className="p-2 border rounded-md text-sm flex justify-between">
                            <span>{chapterTitles.suspense}</span>
                            <Badge className="bg-purple-600">悬念型</Badge>
                          </div>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="pt-2">
                        <Label htmlFor="custom-chapter" className="text-sm">自定义章节选择</Label>
                        <div className="flex space-x-2 mt-2">
                          <Input 
                            id="custom-chapter" 
                            placeholder="输入章节号" 
                            className="text-sm" 
                            type="number"
                            value={currentChapter}
                            onChange={(e) => setCurrentChapter(parseInt(e.target.value) || 1)}
                          />
                          <Button variant="outline" size="sm" className="whitespace-nowrap">
                            生成标题
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg border p-4">
                  <div className="text-sm mb-3 font-medium flex items-center gap-2">
                    <span>第{currentChapter}章末尾卡点预览</span>
                    <Badge variant="outline" className="ml-auto">
                      {isGeneratingCliffhanger ? "生成中..." : (selectedCliffhanger ? selectedCliffhanger.type === 'crisis' ? '危机型' :
                      selectedCliffhanger.type === 'twist' ? '转折型' :
                      selectedCliffhanger.type === 'mystery' ? '谜团型' : '情感型' : '自动生成')}
                    </Badge>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-md text-sm italic border border-indigo-200">
                    {isGeneratingCliffhanger ? (
                      <div className="flex justify-center items-center py-4">
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        <span>正在生成卡点内容...</span>
                      </div>
                    ) : (
                      <p>
                        {selectedCliffhanger ? selectedCliffhanger.content : 
                        "就在林夜以为一切终于平息之时，他的手臂突然传来一阵剧痛。那枚从遗迹中带出的神秘符石不知何时已经融入了他的血肉，暗红色的纹路开始在他的皮肤下蔓延。与此同时，远处的天空中，一道诡异的光柱直冲云霄，似乎在回应着什么…"}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex justify-between mt-4">
                    <Button variant="outline" size="sm" onClick={() => {
                      if (selectedCliffhanger) {
                        handleGenerateCliffhanger(selectedCliffhanger.type);
                      } else {
                        handleGenerateCliffhanger('crisis');
                      }
                    }} disabled={isGeneratingCliffhanger}>
                      重新生成
                    </Button>
                    <Button variant="outline" size="sm">编辑优化</Button>
                    <Button className="bg-indigo-600 hover:bg-indigo-700" size="sm">应用到章节</Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </CardContent>
      
      {renderLLMInputModal(
        "生成关键情节节点",
        showLLMNodeInput,
        () => setShowLLMNodeInput(false),
        handleGeneratePlotNodes,
        "生成节点"
      )}
      
      {renderLLMInputModal(
        "生成支线任务",
        showLLMSubplotInput,
        () => setShowLLMSubplotInput(false),
        handleGenerateSubplots,
        "生成支线"
      )}
      
      {renderLLMInputModal(
        "转换结构类型",
        showLLMConvertInput,
        () => setShowLLMConvertInput(false),
        handleConvertStructure,
        "转换结构"
      )}
    </Card>
  );
};

export default StructuredOutline; 