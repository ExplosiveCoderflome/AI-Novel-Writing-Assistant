import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../types/llm';
import { LLMProviderType } from '../../../llm/providers/factory';
import { z } from 'zod';
import { getApiKey } from '../../../../lib/api-key';

// 验证请求体的 schema
const chatRequestSchema = z.object({
  provider: z.enum(['deepseek', 'siliconflow'] as const),
  model: z.string(),
  prompt: z.string(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

const SYSTEM_PROMPT = `你是一位专业的小说创作助手，可以帮助用户进行小说创作、世界设定、角色设计等工作。
在回答时，请遵循以下原则：
1. 保持友好和专业的态度
2. 给出详细和有见地的回答
3. 结合文学创作理论和实践经验
4. 鼓励用户的创意，并给出建设性的建议
5. 如果用户的问题不够清晰，主动询问更多细节
6. 在合适的时候使用例子来说明观点
7. 避免生成有害或不当的内容

你擅长：
- 小说写作技巧指导
- 情节构思和发展建议
- 角色设计和发展
- 世界观构建
- 文风和语言风格建议
- 创作瓶颈突破
- 写作计划制定

请根据用户的具体需求提供相应的帮助。`;

export async function POST(request: NextRequest) {
  try {
    // 解析并验证请求体
    const body = await request.json();
    const result = chatRequestSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求参数',
        details: result.error.format()
      }, { status: 400 });
    }

    const { provider, model, prompt, temperature, maxTokens } = result.data;

    // 获取 API Key
    let apiKey;
    try {
      apiKey = await getApiKey(provider);
    } catch (error) {
      console.error(`获取 ${provider} 的API Key失败:`, error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : '未找到有效的 API Key，请在设置中配置或在环境变量中设置'
        },
        { status: 404 }
      );
    }

    // 创建配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey,
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

    // 创建响应流
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // 启动流式生成
    (async () => {
      try {
        console.log('开始生成回复，参数:', {
          provider,
          model,
          prompt,
          temperature,
          maxTokens
        });

        const generator = factory.generateRecommendationStream({
          userPrompt: prompt,
          systemPrompt: SYSTEM_PROMPT,
          model,
          temperature,
          maxTokens
        }, provider as LLMProviderType);

        let hasContent = false;
        let buffer = '';

        for await (const chunk of generator) {
          if (chunk.type === 'error') {
            console.error('生成过程中收到错误:', chunk.content);
            const errorResponse = {
              type: 'error',
              error: chunk.content
            };
            await writer.write(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
            break;
          }

          hasContent = true;
          buffer += chunk.content;

          const contentResponse = {
            type: 'content',
            choices: [{
              delta: {
                content: chunk.content
              }
            }]
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(contentResponse)}\n\n`));
        }

        // 如果没有收到任何内容，返回错误
        if (!hasContent || !buffer.trim()) {
          console.warn('生成的内容为空');
          const emptyResponse = {
            type: 'error',
            error: '生成的回复为空，请重试'
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(emptyResponse)}\n\n`));
        }

        console.log('生成完成，总内容长度:', buffer.length);
      } catch (error) {
        console.error('生成过程发生错误:', error);
        const errorResponse = {
          type: 'error',
          error: error instanceof Error ? error.message : '生成过程中发生未知错误'
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
      } finally {
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      }
    })();

    // 返回流式响应
    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('处理请求时发生错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '处理请求时发生未知错误'
    }, { status: 500 });
  }
} 