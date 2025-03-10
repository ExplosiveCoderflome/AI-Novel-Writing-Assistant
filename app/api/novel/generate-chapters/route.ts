import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { getApiKey } from '../../../../lib/api-key';
import { LLMDBConfig, LLMProviderConfig, GenerateParams } from '../../../types/llm';

interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

interface NovelInfo {
  title: string;
  description: string;
  genre: string;
}

interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
}

interface OutlineNode {
  id: string;
  type: string;
  content: string;
  children?: OutlineNode[];
}

interface RequestData {
  id: string;
  basicInfo?: NovelInfo;
  characters?: Character[];
  outline?: OutlineNode[];
  developmentDirection?: string;
  chapterCount: number;
  startChapterNumber: number;
  generateContent: boolean;
  detailedContentGeneration: boolean;
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
    if (!data.id || !data.provider || !data.model || !data.chapterCount) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 构建发送给LLM的提示词
    let systemPrompt = `你是一位专业的小说章节规划师，根据提供的小说信息，生成章节规划。`;
    
    // 添加基本信息
    if (data.basicInfo) {
      systemPrompt += `\n\n小说标题: ${data.basicInfo.title}`;
      systemPrompt += `\n小说描述: ${data.basicInfo.description}`;
      systemPrompt += `\n小说类型: ${data.basicInfo.genre}`;
    }
    
    // 添加角色信息
    if (data.characters && data.characters.length > 0) {
      systemPrompt += `\n\n主要角色:`;
      data.characters.forEach(character => {
        systemPrompt += `\n- ${character.name}（${character.role}）: ${character.description}`;
      });
    }
    
    // 处理大纲信息
    if (data.outline && Array.isArray(data.outline) && data.outline.length > 0) {
      systemPrompt += '\n\n小说大纲结构:';
      
      const processOutlineNode = (node: OutlineNode, depth: number = 0) => {
        const indent = '  '.repeat(depth);
        systemPrompt += `\n${indent}- ${node.content}`;
        
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            processOutlineNode(child, depth + 1);
          });
        }
      };
      
      data.outline.forEach(node => {
        processOutlineNode(node);
      });
    }
    
    // 添加发展方向
    if (data.developmentDirection) {
      systemPrompt += `\n\n小说发展方向:\n${data.developmentDirection}`;
    }
    
    // 添加生成需求
    systemPrompt += `\n\n你的任务是生成从第 ${data.startChapterNumber} 章开始的 ${data.chapterCount} 个章节`;
    
    if (data.generateContent) {
      systemPrompt += `，并为每个章节生成${data.detailedContentGeneration ? '详细' : '简要'}内容`;
    } else {
      systemPrompt += `的标题`;
    }
    
    systemPrompt += `。请确保章节之间有连贯性，并符合上述小说的风格和设定。`;
    systemPrompt += `\n\n你生成的章节应该遵循小说的逻辑发展，推动剧情前进，并保持读者的兴趣。`;
    
    // 输出格式说明
    systemPrompt += `\n\n请以JSON数组格式输出，例如:
[
  {
    "title": "章节标题",
    "content": "${data.generateContent ? '章节内容' : ''}"
  },
  ...
]`;

    // 用户提供的额外提示
    const userPrompt = data.prompt ? data.prompt : "请根据上述信息生成章节规划。";
    
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
      
      const responseContent = llmResponse.content;
      
      // 解析LLM返回的JSON
      let parsedChapters;
      try {
        // 尝试提取JSON部分
        const jsonMatch = responseContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsedChapters = JSON.parse(jsonMatch[0]);
        } else {
          // 如果没有找到JSON数组，尝试解析整个响应
          parsedChapters = JSON.parse(responseContent);
        }
      } catch (error) {
        console.error('解析LLM响应失败:', error);
        console.log('原始响应:', responseContent);
        return NextResponse.json(
          { error: '解析生成内容失败' },
          { status: 500 }
        );
      }
      
      // 格式化章节数据
      const chapters: Chapter[] = parsedChapters.map((chapter: any, index: number) => ({
        id: '', // Prisma会自动生成ID
        title: chapter.title,
        content: chapter.content || '',
        order: data.startChapterNumber + index
      }));
      
      return NextResponse.json(chapters);
    } catch (error) {
      console.error('LLM调用失败:', error);
      return new Response(JSON.stringify({ error: '生成章节失败: ' + (error instanceof Error ? error.message : String(error)) }), { status: 500 });
    }
  } catch (error) {
    console.error('LLM调用失败:', error);
    return new Response(JSON.stringify({ error: '生成章节失败: ' + (error instanceof Error ? error.message : String(error)) }), { status: 500 });
  }
} 