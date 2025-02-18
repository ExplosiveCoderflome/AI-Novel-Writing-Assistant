import { NextRequest } from 'next/server';
import { getApiKey } from '../../../../lib/api-key';
import { LLMFactory } from '../../../../lib/llm/factory';

type ChunkType = {
  type: 'reasoning' | 'content' | 'error';
  content: string;
};

function cleanJsonString(content: string): string {
  // 移除 Markdown 代码块标记
  content = content.replace(/```json\n/, '').replace(/\n```$/, '');
  // 移除可能存在的其他 Markdown 标记
  content = content.replace(/```/g, '');
  return content.trim();
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout = 300000) {
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
    console.log('请求超时，正在中断...');
  }, timeout);

  try {
    console.log(`开始请求，超时时间设置为 ${timeout/1000} 秒...`);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    console.log('请求完成，已清除超时计时器');
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`请求超时（${timeout/1000}秒）`);
    }
    throw error;
  }
}

async function retryFetch(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`尝试请求 API (第 ${i + 1}/${retries} 次)...`);
      const response = await fetchWithTimeout(url, options);
      
      if (response.ok) {
        console.log('请求成功，正在读取响应内容...');
        const text = await response.text();
        if (!text) {
          console.error('收到空响应');
          throw new Error('空响应');
        }
        console.log(`成功获取到响应内容 (${text.length} 字节)`);
        return text;
      }
      
      const errorText = await response.text();
      console.error(`API 错误响应 (尝试 ${i + 1}/${retries}):`, errorText);
      
      if (i === retries - 1) {
        throw new Error(`API 请求失败: ${response.status} ${errorText}`);
      }

      const nextRetryDelay = 1000 * (i + 1);
      console.log(`等待 ${nextRetryDelay/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, nextRetryDelay));
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      console.error(`请求失败 (尝试 ${i + 1}/${retries}):`, error);
      const nextRetryDelay = 1000 * (i + 1);
      console.log(`等待 ${nextRetryDelay/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, nextRetryDelay));
    }
  }
  throw new Error('所有重试都失败了');
}

export async function POST(req: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[Genre] 请求超时');
    controller?.abort();
  }, 120000); // 设置2分钟超时

  try {
    const { prompt, provider, model, temperature, maxTokens } = await req.json();
    
    if (!prompt || !provider) {
      throw new Error('缺少必要参数');
    }

    // 获取对应提供商的 API Key
    const apiKey = await getApiKey(provider);
    if (!apiKey) {
      throw new Error(`未找到 ${provider} 的 API Key`);
    }

    // 使用 LLM Factory 创建对应的 LLM 实例
    const factory = LLMFactory.getInstance();
    const llm = await factory.getLLMInstance({
      provider,
      apiKey,
      model
    });

    const systemPrompt = `你是一个专业的网络小说分类专家。请根据用户的描述，生成合适的小说类型结构。
返回的数据必须是一个JSON格式的对象，包含以下字段：
{
  "name": "类型名称",
  "description": "类型描述",
  "children": [
    {
      "name": "子类型名称",
      "description": "子类型描述",
      "children": [] // 可选的下一级子类型
    }
  ]
}

注意：
1. 直接返回 JSON 对象，不要包含任何其他格式标记
2. 类型名称要简洁且具有代表性
3. 描述要详细说明该类型的特点
4. 子类型要合理，避免过度细分
5. 确保生成的是合法且符合主流价值观的类型`;

    // 创建流式响应
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          // 调用 LLM 的流式生成方法
          const stream = await llm.generateRecommendationStream({
            systemPrompt,
            userPrompt: prompt,
          });

          let isControllerClosed = false;

          // 处理流式响应
          for await (const chunk of stream) {
            if (isControllerClosed) break;

            try {
              const typedChunk = chunk as ChunkType;
              if (typedChunk.type === 'reasoning' || typedChunk.type === 'content') {
                // 发送消息
                const message = {
                  type: typedChunk.type,
                  choices: [{
                    delta: { content: typedChunk.content },
                    index: 0,
                    finish_reason: null
                  }]
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
              }
            } catch (error: unknown) {
              if (error instanceof TypeError && error.message.includes('Controller is already closed')) {
                isControllerClosed = true;
                break;
              }
              throw error;
            }
          }

          if (!isControllerClosed) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          }
        } catch (error: unknown) {
          console.error('[Genre] 生成失败:', error);
          try {
            const errorMessage = {
              error: error instanceof Error ? error.message : '生成失败',
              type: 'error',
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
          } catch (e: unknown) {
            // 如果控制器已关闭，忽略错误
            if (e instanceof TypeError && e.message.includes('Controller is already closed')) {
              console.log('[Genre] 消息发送时控制器已关闭');
            } else {
              throw e;
            }
          }
        } finally {
          try {
            controller.close();
          } catch (e: unknown) {
            // 忽略已关闭的控制器错误
            if (e instanceof TypeError && e.message.includes('Controller is already closed')) {
              console.log('[Genre] 控制器已关闭');
            }
          }
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[Genre] 生成类型失败:', error);
    return new Response(JSON.stringify({
      error: '生成类型失败',
      details: error instanceof Error ? error.message : '未知错误'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 