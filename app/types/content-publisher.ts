// 内容平台类型
export type ContentPlatform = 
  | 'xiaohongshu' 
  | 'zhihu' 
  | 'toutiao' 
  | 'weibo' 
  | 'bilibili' 
  | 'wechat'
  | string; // 添加string类型以兼容IndexedDB

// 平台信息
export interface PlatformInfo {
  id: ContentPlatform;
  name: string;
  description: string;
  icon: string;
  contentTypes: ContentType[];
  maxLength?: number;
  features: string[];
}

// 内容类型
export type ContentType = 
  | 'article'    // 文章
  | 'post'       // 帖子
  | 'answer'     // 回答
  | 'note'       // 笔记
  | 'script'     // 脚本
  | 'weibo'      // 微博
  | 'comment'    // 评论
  | string;      // 添加string类型以兼容IndexedDB

// 内容模板
export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  platform: ContentPlatform;
  contentType: ContentType;
  systemPrompt: string;
  examplePrompt?: string;
}

// 已发布内容
export interface PublishedContent {
  id: string;
  title: string;
  content: string;
  platform: ContentPlatform;
  contentType: ContentType;
  createdAt: Date;
  prompt: string;
  tags: string[];
}

// 生成内容请求参数
export interface GenerateContentParams {
  platform: ContentPlatform;
  contentType: ContentType;
  topic: string;
  keywords?: string[];
  tone?: string;
  length?: number;
  additionalInstructions?: string;
} 