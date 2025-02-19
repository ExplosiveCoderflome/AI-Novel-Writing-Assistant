/*
 * @LastEditors: biz
 */
import { NextRequest } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../../lib/llm/factory';
import { getApiKey } from '../../../../lib/api-key';
import { llmConfigFromDB } from '../../../../app/config/llm';
import { log } from 'console';

export async function POST(req: NextRequest) {
  try {
    const { title, genre, promptContent, model } = await req.json();
    console.log('请求数据:', { title, genre, contentLength: promptContent?.length });

    if (!title || !genre || !promptContent) {
      throw new Error('缺少必要参数');
    }

    // 获取 API Key
    const apiKey = await getApiKey('deepseek');
    if (!apiKey) {
      throw new Error('未找到有效的 API Key');
    }
    console.log('API Key 验证成功');

    // 使用 LLM Factory 创建实例
    const llmFactory = LLMFactory.getInstance();
    llmFactory.setConfig({
      providers: {
        deepseek: {
          getApiKey: async () => apiKey,
          model: model || 'deepseek-chat',
        },
      },
      defaultProvider: 'deepseek',
    });

    // 构建提示词
    const systemPrompt = `你是一位专业的小说发展走向策划师。请根据以下信息梳理一个完整的小说发展走向：

标题：${title}
类型：${genre}
要求：
1. 明确故事的核心主题和情感基调
2. 描述主要人物的成长与改变轨迹
3. 规划主要矛盾冲突的递进与升级
4. 设计关键转折点和高潮情节
5. 符合${genre}类型的特点
6. 注重情节的合理性和因果关系
7. 保持故事节奏的张弛有度`;

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // 开始生成
    try {
      const llm = await llmFactory.getLLMInstance({
        provider: 'deepseek',
        apiKey,
        model: model || 'deepseek-chat',
      });

      const streamGenerator = llm.generateRecommendationStream({
        systemPrompt,
        userPrompt: promptContent,
      });
      console.log('promptContent', promptContent);
      // 处理流式响应
      for await (const chunk of streamGenerator) {
        const message = {
          type: chunk.type,
          choices: [{
            delta: { content: chunk.content },
            index: 0,
            finish_reason: null
          }]
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      }

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (error) {
      console.error('生成过程出错:', error);
      const errorMessage = {
        error: error instanceof Error ? error.message : '生成失败',
        type: 'error',
      };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
    } finally {
      await writer.close();
    }

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '生成大纲失败',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}