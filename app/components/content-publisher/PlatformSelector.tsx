'use client';

import { useState } from 'react';
import { ContentPlatform, ContentType, PlatformInfo } from '../../types/content-publisher';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { MessageSquare, BookOpen, FileText, Video, Send, Coffee } from 'lucide-react';

// 平台信息配置
const PLATFORMS: PlatformInfo[] = [
  {
    id: 'xiaohongshu',
    name: '小红书',
    description: '生活方式分享社区',
    icon: 'Coffee',
    contentTypes: ['note', 'post'],
    features: ['图文并茂', '个人体验', '种草推荐', '轻松活泼']
  },
  {
    id: 'zhihu',
    name: '知乎',
    description: '专业知识问答社区',
    icon: 'MessageSquare',
    contentTypes: ['answer', 'article'],
    features: ['专业知识', '深度内容', '逻辑性强', '有理有据']
  },
  {
    id: 'toutiao',
    name: '今日头条',
    description: '资讯内容平台',
    icon: 'FileText',
    contentTypes: ['article'],
    maxLength: 5000,
    features: ['标题吸引力', '内容简明', '时效性强', '易于理解']
  },
  {
    id: 'weibo',
    name: '微博',
    description: '短内容社交平台',
    icon: 'Send',
    contentTypes: ['weibo', 'comment'],
    maxLength: 2000,
    features: ['话题性强', '互动性高', '简短有力', '传播性强']
  },
  {
    id: 'bilibili',
    name: 'B站',
    description: '视频创作社区',
    icon: 'Video',
    contentTypes: ['script'],
    features: ['创意性强', '年轻化表达', '专业知识', '互动性高']
  },
  {
    id: 'wechat',
    name: '公众号',
    description: '内容创作与订阅平台',
    icon: 'BookOpen',
    contentTypes: ['article'],
    features: ['系统性内容', '深度阅读', '排版精美', '品牌化表达']
  }
];

// 获取平台图标
const getPlatformIcon = (iconName: string) => {
  switch (iconName) {
    case 'Coffee': return <Coffee className="h-6 w-6" />;
    case 'MessageSquare': return <MessageSquare className="h-6 w-6" />;
    case 'FileText': return <FileText className="h-6 w-6" />;
    case 'Send': return <Send className="h-6 w-6" />;
    case 'Video': return <Video className="h-6 w-6" />;
    case 'BookOpen': return <BookOpen className="h-6 w-6" />;
    default: return <FileText className="h-6 w-6" />;
  }
};

interface PlatformSelectorProps {
  selectedPlatform: ContentPlatform | null;
  selectedContentType: ContentType | null;
  onSelectPlatform: (platform: ContentPlatform) => void;
  onSelectContentType: (contentType: ContentType) => void;
}

export function PlatformSelector({
  selectedPlatform,
  selectedContentType,
  onSelectPlatform,
  onSelectContentType
}: PlatformSelectorProps) {
  const [activeTab, setActiveTab] = useState<string>('all');

  // 根据标签筛选平台
  const filteredPlatforms = activeTab === 'all' 
    ? PLATFORMS 
    : PLATFORMS.filter(p => p.contentTypes.includes(activeTab as ContentType));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">选择内容平台</h2>
      
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="article">文章</TabsTrigger>
          <TabsTrigger value="post">帖子</TabsTrigger>
          <TabsTrigger value="answer">回答</TabsTrigger>
          <TabsTrigger value="note">笔记</TabsTrigger>
          <TabsTrigger value="script">脚本</TabsTrigger>
          <TabsTrigger value="weibo">微博</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlatforms.map((platform) => (
          <Card 
            key={platform.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedPlatform === platform.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => onSelectPlatform(platform.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  {getPlatformIcon(platform.icon)}
                  <CardTitle>{platform.name}</CardTitle>
                </div>
                {platform.maxLength && (
                  <Badge variant="outline" className="text-xs">
                    最大{platform.maxLength}字
                  </Badge>
                )}
              </div>
              <CardDescription>{platform.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1 mb-2">
                {platform.features.map((feature, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
              
              {selectedPlatform === platform.id && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-sm font-medium mb-2">选择内容类型:</p>
                  <div className="flex flex-wrap gap-2">
                    {platform.contentTypes.map((type) => (
                      <Badge 
                        key={type}
                        variant={selectedContentType === type ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectContentType(type);
                        }}
                      >
                        {getContentTypeName(type)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// 获取内容类型名称
function getContentTypeName(type: ContentType): string {
  const typeNames = {
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