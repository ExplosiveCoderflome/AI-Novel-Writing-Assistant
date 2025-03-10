import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { getApiKey } from '../../../../lib/api-key';
import { LLMDBConfig, LLMProviderConfig, GenerateParams } from '../../../types/llm';

interface ChapterInfo {
  title: string;
  order: number;
  content?: string;
}

interface NovelInfo {
  title: string;
  description: string;
  genre: string;
}

interface RequestData {
  novelId: string;
  basicInfo?: NovelInfo;
  chapter: ChapterInfo;
  previousChapters?: ChapterInfo[];
  prompt: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export async function POST(request: NextRequest) {
  try {
    const data: RequestData = await request.json();

    // 验证必要的参数
    if (!data.novelId || !data.provider || !data.model || !data.chapter?.title) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 构建发送给LLM的提示词
    let systemPrompt = `你是一位优秀的小说内容创作者，根据提供的小说和章节信息，生成高质量的章节内容。`;
    
    // 添加基本信息
    if (data.basicInfo) {
      systemPrompt += `\n\n小说标题: ${data.basicInfo.title}`;
      systemPrompt += `\n小说描述: ${data.basicInfo.description}`;
      if (data.basicInfo.genre) {
        systemPrompt += `\n小说类型: ${data.basicInfo.genre}`;
      }
    }
    
    // 添加当前章节信息
    systemPrompt += `\n\n当前章节: 第${data.chapter.order}章 - ${data.chapter.title}`;
    
    // 添加前置章节摘要
    if (data.previousChapters && data.previousChapters.length > 0) {
      systemPrompt += `\n\n前置章节内容:`;
      data.previousChapters.forEach(chapter => {
        systemPrompt += `\n- 第${chapter.order}章 ${chapter.title}: ${
          chapter.content 
            ? chapter.content.substring(0, 200) + '...' 
            : '无内容'
        }`;
      });
    }
    
    // 添加生成要求
    systemPrompt += `\n\n请为这个章节创作出色的内容，确保与小说的整体风格和前面的章节内容保持一致。内容应当丰富有趣，推动故事情节发展，并深化角色形象。`;
    systemPrompt += `\n\n你的输出应该是一个完整的章节内容，不需要包含章节标题。`;

    // 用户提供的额外提示
    const userPrompt = data.prompt || `请为第${data.chapter.order}章"${data.chapter.title}"创作内容。`;
    
    try {
      // 获取API Key
      const apiKey = await getApiKey(data.provider);
      
      // 创建配置
      const providerConfig: LLMProviderConfig = {
        getApiKey: async () => apiKey,
        model: data.model,
        temperature: data.temperature || 0.7,
        maxTokens: data.maxTokens || 4000
      };

      const config = {
        defaultProvider: data.provider,
        [data.provider]: providerConfig
      } as LLMDBConfig;
      
      // 初始化 LLM Factory
      const factory = LLMFactory.getInstance();
      factory.setConfig(config);
      
      // 调用LLM生成内容
      const params: GenerateParams = {
        userPrompt,
        systemPrompt,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens
      };
      
      const llmResponse = await factory.generateRecommendation(params, data.provider);
      
      if (!llmResponse.content) {
        console.error('LLM响应内容为空');
        return new Response(JSON.stringify({ error: 'LLM响应内容为空' }), { status: 500 });
      }
      
      return NextResponse.json({ content: llmResponse.content });
    } catch (error) {
      console.error('LLM调用失败:', error);
      return new Response(JSON.stringify({ error: '生成章节内容失败: ' + (error instanceof Error ? error.message : String(error)) }), { status: 500 });
    }
  } catch (error) {
    console.error('生成章节内容失败:', error);
    return new Response(JSON.stringify({ error: '生成章节内容失败: ' + (error instanceof Error ? error.message : String(error)) }), { status: 500 });
  }
} 