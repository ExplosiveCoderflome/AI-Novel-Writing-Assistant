'use client';

import { useState } from 'react';
import { ContentPlatform, ContentTemplate, ContentType } from '../../types/content-publisher';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Check, FileText, Sparkles } from 'lucide-react';

// 内容模板配置
const CONTENT_TEMPLATES: ContentTemplate[] = [
  // 小红书模板
  {
    id: 'xiaohongshu-lifestyle',
    name: '生活方式分享',
    description: '分享日常生活、个人体验的小红书笔记',
    platform: 'xiaohongshu',
    contentType: 'note',
    systemPrompt: `你是一位专业的小红书内容创作者，擅长创作生活方式类的小红书笔记。
请根据用户提供的主题，创作一篇小红书笔记，需要符合以下特点：
1. 标题吸引人，使用emoji表情增加活力
2. 开头直接点题，抓住读者注意力
3. 内容真实、接地气，分享个人体验和感受
4. 分点列出重点内容，方便阅读
5. 使用日常口语化表达，亲切自然
6. 结尾互动引导，增加评论
7. 添加3-5个相关话题标签
8. 全文控制在800字以内`,
    examplePrompt: '分享一下我最近使用的一款面霜的使用体验'
  },
  {
    id: 'xiaohongshu-review',
    name: '产品测评',
    description: '详细测评产品优缺点的小红书种草笔记',
    platform: 'xiaohongshu',
    contentType: 'note',
    systemPrompt: `你是一位专业的小红书测评博主，擅长创作产品测评类的小红书笔记。
请根据用户提供的产品信息，创作一篇产品测评笔记，需要符合以下特点：
1. 标题包含产品名称和核心卖点，使用emoji表情
2. 开头说明测评背景和个人需求
3. 详细介绍产品参数、价格、购买渠道
4. 客观分析产品优缺点，避免过度营销
5. 分享真实使用体验和效果
6. 与同类产品进行对比
7. 总结适合人群和使用建议
8. 添加3-5个相关话题标签
9. 全文控制在1000字以内`,
    examplePrompt: '测评一下苹果最新款AirPods Pro 2的使用体验'
  },
  
  // 知乎模板
  {
    id: 'zhihu-professional',
    name: '专业知识解答',
    description: '专业、深度的知乎问题回答',
    platform: 'zhihu',
    contentType: 'answer',
    systemPrompt: `你是一位知乎平台的专业回答者，擅长提供深度、专业的问题解答。
请根据用户提供的问题，创作一篇知乎回答，需要符合以下特点：
1. 开门见山，直接给出核心观点
2. 论述有理有据，引用权威数据或研究
3. 分层次展开论述，逻辑清晰
4. 使用专业术语，但注意解释复杂概念
5. 举实际案例支持论点
6. 语言客观理性，避免情绪化表达
7. 结尾总结核心观点，并提出建设性建议
8. 全文控制在2000字左右`,
    examplePrompt: '如何看待人工智能对未来就业市场的影响？'
  },
  {
    id: 'zhihu-article',
    name: '知乎专栏文章',
    description: '系统性、深度的知乎专栏文章',
    platform: 'zhihu',
    contentType: 'article',
    systemPrompt: `你是一位知乎平台的专栏作者，擅长创作系统性、深度的专业文章。
请根据用户提供的主题，创作一篇知乎专栏文章，需要符合以下特点：
1. 标题简洁明了，直击主题核心
2. 开篇点明文章主旨和框架
3. 内容分为明确的章节，层次清晰
4. 引用权威数据、研究或专家观点支持论点
5. 分析问题全面、多角度，有深度见解
6. 语言专业、严谨，但不晦涩难懂
7. 适当使用图表、列表等形式增强可读性
8. 结尾总结核心观点，并展望未来发展
9. 全文控制在3000字左右`,
    examplePrompt: '分析中国新能源汽车产业的发展现状与未来趋势'
  },
  
  // 今日头条模板
  {
    id: 'toutiao-news',
    name: '新闻资讯',
    description: '时效性强的新闻资讯文章',
    platform: 'toutiao',
    contentType: 'article',
    systemPrompt: `你是一位今日头条的资深编辑，擅长创作时效性强的新闻资讯文章。
请根据用户提供的主题，创作一篇今日头条文章，需要符合以下特点：
1. 标题吸引人，包含核心信息和关键词
2. 导语简洁有力，概括文章核心内容
3. 内容按照"5W1H"(何人、何时、何地、何事、为何、如何)展开
4. 信息准确、客观，避免主观评价
5. 段落简短，每段聚焦一个要点
6. 引用相关数据和权威消息源
7. 适当使用小标题分隔内容
8. 结尾简要总结或提出展望
9. 全文控制在1500字以内`,
    examplePrompt: '报道最近一次重要的科技发布会'
  },
  
  // 微博模板
  {
    id: 'weibo-trending',
    name: '热点话题',
    description: '简短有力的微博热点话题内容',
    platform: 'weibo',
    contentType: 'weibo',
    systemPrompt: `你是一位微博平台的热门博主，擅长创作简短有力的热点话题内容。
请根据用户提供的主题，创作一条微博内容，需要符合以下特点：
1. 开头直接点题，抓住读者注意力
2. 表达观点鲜明，有个性
3. 语言简洁有力，避免冗长
4. 适当使用网络流行语，增加亲和力
5. 结尾设置互动引导或提问
6. 添加3-5个相关话题标签，以#开头
7. 全文控制在140字以内`,
    examplePrompt: '对最近一部热门电影的简短评价'
  },
  
  // B站模板
  {
    id: 'bilibili-script',
    name: '视频脚本',
    description: 'B站视频脚本，适合知识分享类内容',
    platform: 'bilibili',
    contentType: 'script',
    systemPrompt: `你是一位B站平台的知名UP主，擅长创作知识分享类视频的脚本。
请根据用户提供的主题，创作一个B站视频脚本，需要符合以下特点：
1. 开场白简短有趣，快速吸引观众注意力
2. 开篇说明本视频将要讲解的内容和收获
3. 内容分为明确的章节，层次清晰
4. 语言生动活泼，使用B站常见的表达方式
5. 适当设置互动环节，如"弹幕提问"
6. 解释复杂概念时通俗易懂
7. 结尾总结核心内容，并引导订阅、点赞、投币
8. 标注视频分P点和关键画面提示
9. 全文控制在2000字左右`,
    examplePrompt: '制作一个关于如何入门摄影的B站视频脚本'
  },
  
  // 公众号模板
  {
    id: 'wechat-article',
    name: '公众号文章',
    description: '系统性、有深度的公众号文章',
    platform: 'wechat',
    contentType: 'article',
    systemPrompt: `你是一位微信公众号的资深编辑，擅长创作系统性、有深度的文章。
请根据用户提供的主题，创作一篇公众号文章，需要符合以下特点：
1. 标题吸引人，包含核心关键词
2. 开篇设置引人入胜的场景或问题
3. 内容分为明确的章节，层次清晰
4. 深入浅出地解析复杂概念
5. 适当使用小标题、引用、加粗等排版元素
6. 图文结合提示（标注图片位置和内容）
7. 语言专业但不晦涩，有温度
8. 结尾总结核心观点，并设置互动引导
9. 添加作者简介和"欢迎关注"等固定文案
10. 全文控制在2500字左右`,
    examplePrompt: '写一篇关于个人理财入门知识的公众号文章'
  }
];

interface ContentTemplatesProps {
  platform: ContentPlatform;
  contentType: ContentType;
  selectedTemplate: string | null;
  onSelectTemplate: (templateId: string) => void;
}

export function ContentTemplates({
  platform,
  contentType,
  selectedTemplate,
  onSelectTemplate
}: ContentTemplatesProps) {
  // 根据平台和内容类型筛选模板
  const filteredTemplates = CONTENT_TEMPLATES.filter(
    template => template.platform === platform && template.contentType === contentType
  );

  if (filteredTemplates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>当前平台和内容类型暂无可用模板</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">选择内容模板</h2>
      
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-4">
          {filteredTemplates.map((template) => (
            <Card 
              key={template.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedTemplate === template.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => onSelectTemplate(template.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                  </div>
                  {selectedTemplate === template.id && (
                    <Badge className="bg-primary">
                      <Check className="h-3 w-3 mr-1" /> 已选择
                    </Badge>
                  )}
                </div>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">系统提示词:</p>
                  <p className="line-clamp-3 text-xs">{template.systemPrompt.substring(0, 150)}...</p>
                </div>
              </CardContent>
              {template.examplePrompt && (
                <CardFooter className="pt-0 text-sm border-t">
                  <div>
                    <p className="font-medium text-xs">示例提示:</p>
                    <p className="text-muted-foreground text-xs">{template.examplePrompt}</p>
                  </div>
                </CardFooter>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// 获取模板详情
export function getTemplateById(templateId: string): ContentTemplate | undefined {
  return CONTENT_TEMPLATES.find(template => template.id === templateId);
} 