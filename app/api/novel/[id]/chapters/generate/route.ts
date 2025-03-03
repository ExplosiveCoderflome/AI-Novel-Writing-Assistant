import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../auth/[...nextauth]/route';
import { LLMFactory } from '../../../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../../../types/llm';
import { LLMProviderType } from '../../../../../llm/providers/factory';
import { z } from 'zod';

// 验证请求体的 schema
const generateChaptersSchema = z.object({
  provider: z.enum(['deepseek', 'siliconflow'] as const),
  model: z.string(),
  developmentDirection: z.string(),
  prompt: z.string(),
  structuredOutline: z.object({
    core: z.object({
      theme: z.string(),
      emotionalTone: z.string(),
      mainConflict: z.string(),
    }),
    plotStructure: z.object({
      setup: z.object({
        events: z.array(z.string()),
        goals: z.array(z.string()),
      }),
      development: z.object({
        mainPlot: z.object({
          events: z.array(z.string()),
          conflicts: z.array(z.string()),
        }),
        subplots: z.array(z.object({
          title: z.string(),
          connection: z.string(),
          events: z.array(z.string()),
        })),
      }),
      climax: z.object({
        events: z.array(z.string()),
        resolution: z.string(),
      }),
    }),
  }).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  try {
    // 获取用户会话
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    const { id: novelId } = context.params;

    // 验证小说所有权
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return NextResponse.json(
        { error: '未找到小说或无权访问' },
        { status: 404 }
      );
    }

    // 解析并验证请求体
    const body = await request.json();
    const result = generateChaptersSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求参数',
        details: result.error.format()
      }, { status: 400 });
    }

    const { provider, model, developmentDirection, structuredOutline, temperature, maxTokens, prompt } = result.data;

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: '未找到有效的 API Key'
      }, { status: 404 });
    }

    // 创建配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey.key,
      model,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 2000
    };

    const config = {
      defaultProvider: provider,
      [provider]: providerConfig
    } as LLMDBConfig;

    // 初始化 LLM Factory
    const factory = LLMFactory.getInstance();
    factory.setConfig(config);

    // 构建系统提示词
    const systemPrompt = `你是一位专业的小说创作助手。现在需要你根据小说的发展走向和结构大纲，生成详细的章节列表。

要求：
1. 每个章节都要有标题和简要内容概述
2. 章节安排要符合故事发展的节奏
3. 确保主线剧情和支线剧情的合理分配
4. 注意情节的递进和铺垫
5. 保持故事的连贯性和完整性

严格按照以下 JSON 格式返回章节列表，不要包含任何其他内容，不要使用 Markdown 代码块：

{
  "chapters": [
    {
      "title": "章节标题",
      "summary": "章节内容概述",
      "plotPoints": ["关键情节点1", "关键情节点2"],
      "characters": ["涉及角色1", "涉及角色2"],
      "purpose": "本章节在故事中的作用",
      "wordCountEstimate": "预计字数"
    }
  ]
}

注意：
1. 必须返回纯 JSON 格式
2. 不要添加任何额外的说明或注释
3. 不要使用 Markdown 代码块标记
4. JSON 必须是合法的，确保所有引号和括号都正确配对`;

    // 构建用户提示词
    const userPrompt = `请根据以下发展走向和结构大纲生成章节列表：

发展走向：
${developmentDirection}

${structuredOutline ? `结构大纲：
${JSON.stringify(structuredOutline, null, 2)}` : ''}

用户的额外要求：
${prompt}

要求：
1. 章节数量要适中，确保每章都有足够的内容
2. 章节标题要吸引人，并能反映章节主要内容
3. 每章都要有明确的情节推进
4. 注意主线剧情和支线剧情的平衡
5. 考虑情感铺垫和人物发展
6. 严格遵循用户的额外要求`;

    // 生成章节列表
    const response = await factory.generateRecommendation({
      userPrompt,
      systemPrompt,
      model,
      temperature,
      maxTokens: Math.min(maxTokens || 2000, 4000)
    }, provider as LLMProviderType);

    if (!response || !response.content) {
      console.warn('生成的内容为空');
      return NextResponse.json({
        success: false,
        error: '生成的回复为空，请重试'
      }, { status: 500 });
    }

    try {
      // 清理并解析 JSON
      let cleanJson = response.content.replace(/[\r\n\t]/g, '').trim();
      
      // 移除可能的 Markdown 代码块标记
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/```$/, '');
      
      // 如果内容以 { 开头，直接解析
      if (cleanJson.startsWith('{')) {
        const chaptersData = JSON.parse(cleanJson);
        console.log('章节列表生成完成，数据长度:', cleanJson.length);
        return NextResponse.json({
          success: true,
          data: chaptersData
        });
      }
      
      // 尝试在内容中查找 JSON 对象
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const chaptersData = JSON.parse(jsonMatch[0]);
        console.log('章节列表生成完成，数据长度:', jsonMatch[0].length);
        return NextResponse.json({
          success: true,
          data: chaptersData
        });
      }

      throw new Error('无法在响应中找到有效的 JSON 数据');
    } catch (error) {
      console.error('解析章节数据失败:', error);
      console.error('原始响应内容:', response.content);
      return NextResponse.json({
        success: false,
        error: '解析章节数据失败',
        details: error instanceof Error ? error.message : '未知错误',
        rawContent: response.content
      }, { status: 500 });
    }
  } catch (error) {
    console.error('处理请求时发生错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '处理请求时发生未知错误'
    }, { status: 500 });
  }
} 