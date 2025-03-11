'use client';

import { useState, useEffect } from 'react';
import { ContentPlatform, ContentType, GenerateContentParams, PublishedContent } from '../../types/content-publisher';
import { PlatformSelector } from './PlatformSelector';
import { ContentTemplates, getTemplateById } from './ContentTemplates';
import { LLMPromptInput } from '../LLMPromptInput';
import { chatHistoryDB } from '../../lib/indexedDB';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';
import { Loader2, Copy, Check, Save, Share, FileText, Tag, Trash2 } from 'lucide-react';
import { useToast } from '../ui/use-toast';

export function ContentPublisherForm() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('create');
  
  // 平台和内容类型选择
  const [selectedPlatform, setSelectedPlatform] = useState<ContentPlatform | null>(null);
  const [selectedContentType, setSelectedContentType] = useState<ContentType | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  
  // 生成参数
  const [topic, setTopic] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [tone, setTone] = useState<string>('');
  const [additionalInstructions, setAdditionalInstructions] = useState<string>('');
  
  // 生成结果
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedContent, setGeneratedContent] = useState<string>('');
  const [generatedTitle, setGeneratedTitle] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [savedContents, setSavedContents] = useState<PublishedContent[]>([]);
  
  // 加载已保存的内容
  useEffect(() => {
    const loadSavedContents = async () => {
      try {
        const contents = await chatHistoryDB.getAllPublishedContent();
        setSavedContents(contents);
      } catch (error) {
        console.error('加载已保存内容失败:', error);
        toast({
          title: "加载失败",
          description: "无法加载已保存的内容",
          variant: "destructive"
        });
      }
    };
    
    loadSavedContents();
  }, []);
  
  // 处理平台选择
  const handleSelectPlatform = (platform: ContentPlatform) => {
    setSelectedPlatform(platform);
    setSelectedContentType(null);
    setSelectedTemplate(null);
  };
  
  // 处理内容类型选择
  const handleSelectContentType = (contentType: ContentType) => {
    setSelectedContentType(contentType);
    setSelectedTemplate(null);
  };
  
  // 处理模板选择
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    
    // 如果有示例提示，自动填充
    const template = getTemplateById(templateId);
    if (template?.examplePrompt) {
      setTopic(template.examplePrompt);
    }
  };
  
  // 构建提示词
  const buildPrompt = (): string => {
    const template = selectedTemplate ? getTemplateById(selectedTemplate) : null;
    
    let prompt = `主题: ${topic}\n`;
    
    if (keywords) {
      prompt += `关键词: ${keywords}\n`;
    }
    
    if (tone) {
      prompt += `语调: ${tone}\n`;
    }
    
    if (additionalInstructions) {
      prompt += `额外要求: ${additionalInstructions}\n`;
    }
    
    return prompt;
  };
  
  // 处理内容生成
  const handleGenerateContent = async (data: { 
    provider: string; 
    model: string; 
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    agentMode?: boolean;
  }) => {
    if (!selectedPlatform || !selectedContentType || !selectedTemplate || !topic) {
      toast({
        title: "请完成所有必填项",
        description: "请选择平台、内容类型、模板并填写主题",
        variant: "destructive"
      });
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const template = getTemplateById(selectedTemplate);
      
      // 构建提示词
      const userPrompt = buildPrompt();
      
      // 调用Langchain Chat API
      const response = await fetch('/api/llm/langchain-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: data.provider,
          model: data.model,
          prompt: userPrompt,
          temperature: data.temperature || 0.7,
          maxTokens: data.maxTokens || 2000,
          systemPrompt: template?.systemPrompt || '',
          agentMode: data.agentMode || false,
          autoWebSearch: false, // 内容生成不需要自动联网搜索
          contextHistory: [] // 不需要上下文历史
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `请求失败，状态码: ${response.status}`);
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应数据");
      }
      
      const decoder = new TextDecoder();
      let content = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          
          for (const line of lines) {
            if (line.trim() && line.startsWith("data: ")) {
              const data = line.slice(6);
              
              if (data === "[DONE]") {
                continue;
              }
              
              try {
                const parsed = JSON.parse(data);
                
                if (parsed.type === "content") {
                  const contentDelta = parsed.choices[0]?.delta?.content || "";
                  content += contentDelta;
                } else if (parsed.type === "error") {
                  throw new Error(parsed.error);
                }
              } catch (parseError) {
                console.warn("解析数据失败:", parseError, "原始数据:", line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      
      if (content) {
        // 提取标题
        let title = '';
        
        // 尝试从内容中提取标题
        const titleMatch = content.match(/^#\s+(.+?)$|^【(.+?)】|^《(.+?)》|^(.+?)\n/m);
        if (titleMatch) {
          title = (titleMatch[1] || titleMatch[2] || titleMatch[3] || titleMatch[4]).trim();
        } else {
          title = `${selectedPlatform}-${selectedContentType}-${new Date().toLocaleString()}`;
        }
        
        setGeneratedTitle(title);
        setGeneratedContent(content);
        setActiveTab('preview');
      } else {
        throw new Error("生成内容为空");
      }
    } catch (error) {
      console.error('生成内容失败:', error);
      toast({
        title: "生成失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  // 复制内容
  const handleCopyContent = () => {
    navigator.clipboard.writeText(generatedContent).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      
      toast({
        title: "复制成功",
        description: "内容已复制到剪贴板",
      });
    });
  };
  
  // 保存内容
  const handleSaveContent = async () => {
    if (!generatedContent || !selectedPlatform || !selectedContentType) return;
    
    try {
      // 创建新的内容对象
      const newContent: PublishedContent = {
        id: Date.now().toString(),
        title: generatedTitle || `${selectedPlatform}-${new Date().toLocaleString()}`,
        content: generatedContent,
        platform: selectedPlatform,
        contentType: selectedContentType,
        createdAt: new Date(),
        prompt: topic,
        tags: keywords ? keywords.split(',').map(k => k.trim()) : []
      };
      
      // 保存到IndexedDB
      await chatHistoryDB.savePublishedContent(newContent);
      
      // 更新状态
      setSavedContents(prev => [newContent, ...prev]);
      
      toast({
        title: "保存成功",
        description: "内容已保存到历史记录",
      });
    } catch (error) {
      console.error('保存内容失败:', error);
      toast({
        title: "保存失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    }
  };
  
  // 删除内容
  const handleDeleteContent = async (id: string) => {
    try {
      await chatHistoryDB.deletePublishedContent(id);
      setSavedContents(prev => prev.filter(content => content.id !== id));
      
      toast({
        title: "删除成功",
        description: "内容已从历史记录中删除",
      });
    } catch (error) {
      console.error('删除内容失败:', error);
      toast({
        title: "删除失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    }
  };
  
  // 渲染创建表单
  const renderCreateForm = () => {
    return (
      <div className="space-y-8">
        {/* 步骤1: 选择平台 */}
        <div className={selectedPlatform ? "opacity-60" : ""}>
          <PlatformSelector
            selectedPlatform={selectedPlatform}
            selectedContentType={selectedContentType}
            onSelectPlatform={handleSelectPlatform}
            onSelectContentType={handleSelectContentType}
          />
          
          {selectedPlatform && (
            <div className="mt-2 flex justify-end">
              <Button 
                variant="ghost" 
                onClick={() => {
                  setSelectedPlatform(null);
                  setSelectedContentType(null);
                  setSelectedTemplate(null);
                }}
              >
                重新选择
              </Button>
            </div>
          )}
        </div>
        
        {/* 步骤2: 选择内容模板 */}
        {selectedPlatform && selectedContentType && (
          <div className={selectedTemplate ? "opacity-60" : ""}>
            <ContentTemplates
              platform={selectedPlatform}
              contentType={selectedContentType}
              selectedTemplate={selectedTemplate}
              onSelectTemplate={handleSelectTemplate}
            />
            
            {selectedTemplate && (
              <div className="mt-2 flex justify-end">
                <Button 
                  variant="ghost" 
                  onClick={() => setSelectedTemplate(null)}
                >
                  重新选择
                </Button>
              </div>
            )}
          </div>
        )}
        
        {/* 步骤3: 填写内容参数 */}
        {selectedTemplate && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">填写内容参数</h2>
            
            <div className="space-y-4">
              <div className="grid w-full gap-1.5">
                <Label htmlFor="topic">主题 <span className="text-red-500">*</span></Label>
                <Textarea
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="请输入内容主题或问题"
                  className="min-h-[80px]"
                />
              </div>
              
              <div className="grid w-full gap-1.5">
                <Label htmlFor="keywords">关键词 (用逗号分隔)</Label>
                <Input
                  id="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="例如: 科技, 创新, 未来"
                />
              </div>
              
              <div className="grid w-full gap-1.5">
                <Label htmlFor="tone">语调风格</Label>
                <Input
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="例如: 专业, 轻松, 幽默"
                />
              </div>
              
              <div className="grid w-full gap-1.5">
                <Label htmlFor="additionalInstructions">额外要求</Label>
                <Textarea
                  id="additionalInstructions"
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="任何其他特殊要求或说明"
                  className="min-h-[80px]"
                />
              </div>
            </div>
            
            <div className="pt-4">
              <h3 className="text-lg font-medium mb-2">生成内容</h3>
              <LLMPromptInput
                inputType="textarea"
                buttonText={isGenerating ? "生成中..." : "生成内容"}
                disabled={isGenerating}
                onSubmit={handleGenerateContent}
              />
              {isGenerating && (
                <div className="mt-4 p-4 border rounded-md bg-muted flex items-center justify-center">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  <p className="text-sm">正在生成内容，请稍候...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // 渲染预览
  const renderPreview = () => {
    if (!generatedContent) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>尚未生成内容</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setActiveTab('create')}
          >
            返回创建
          </Button>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">预览生成内容</h2>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCopyContent}
            >
              {isCopied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  复制
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleSaveContent}
            >
              <Save className="h-4 w-4 mr-1" />
              保存
            </Button>
            <Button 
              variant="outline" 
              size="sm"
            >
              <Share className="h-4 w-4 mr-1" />
              分享
            </Button>
          </div>
        </div>
        
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>{generatedTitle}</CardTitle>
                <CardDescription>
                  {selectedPlatform && getPlatformName(selectedPlatform)} · 
                  {selectedContentType && getContentTypeName(selectedContentType)}
                </CardDescription>
              </div>
              {keywords && (
                <div className="flex flex-wrap gap-1 justify-end">
                  {keywords.split(',').map((keyword, index) => (
                    <Badge key={index} variant="outline" className="flex items-center">
                      <Tag className="h-3 w-3 mr-1" />
                      {keyword.trim()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="whitespace-pre-wrap">{generatedContent}</div>
            </ScrollArea>
          </CardContent>
          <CardFooter className="border-t pt-4 flex justify-between">
            <Button 
              variant="outline"
              onClick={() => setActiveTab('create')}
            >
              返回编辑
            </Button>
            <Button 
              onClick={handleSaveContent}
            >
              <Save className="h-4 w-4 mr-1" />
              保存内容
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  };
  
  // 渲染历史记录
  const renderHistory = () => {
    if (savedContents.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>暂无保存的内容</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setActiveTab('create')}
          >
            开始创建
          </Button>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">历史记录</h2>
        
        <div className="grid grid-cols-1 gap-4">
          {savedContents.map((content) => (
            <Card key={content.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{content.title}</CardTitle>
                    <CardDescription>
                      {getPlatformName(content.platform as ContentPlatform)} · 
                      {getContentTypeName(content.contentType as ContentType)} · 
                      {new Date(content.createdAt).toLocaleString()}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {content.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="flex items-center">
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {content.content.substring(0, 200)}...
                </p>
              </CardContent>
              <CardFooter className="border-t pt-4 flex justify-end gap-2">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setGeneratedTitle(content.title);
                    setGeneratedContent(content.content);
                    setActiveTab('preview');
                  }}
                >
                  查看
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(content.content);
                    toast({
                      title: "复制成功",
                      description: "内容已复制到剪贴板",
                    });
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  复制
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteContent(content.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  删除
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">内容发布助手</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create">创建内容</TabsTrigger>
          <TabsTrigger value="preview">预览</TabsTrigger>
          <TabsTrigger value="history">历史记录</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          {renderCreateForm()}
        </TabsContent>
        <TabsContent value="preview">
          {renderPreview()}
        </TabsContent>
        <TabsContent value="history">
          {renderHistory()}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 获取平台名称
function getPlatformName(platform: ContentPlatform | string): string {
  const platformNames: Record<string, string> = {
    xiaohongshu: '小红书',
    zhihu: '知乎',
    toutiao: '今日头条',
    weibo: '微博',
    bilibili: 'B站',
    wechat: '公众号'
  };
  return platformNames[platform] || platform;
}

// 获取内容类型名称
function getContentTypeName(type: ContentType | string): string {
  const typeNames: Record<string, string> = {
    article: '文章',
    post: '帖子',
    answer: '回答',
    note: '笔记',
    script: '脚本',
    weibo: '微博',
    comment: '评论'
  };
  return typeNames[type] || type;
} 