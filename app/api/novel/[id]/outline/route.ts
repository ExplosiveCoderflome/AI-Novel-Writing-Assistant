import { NextRequest } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { LLMFactory } from '../../../../../lib/llm/factory';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/options';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId } = params;
    // ... existing code ...
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { provider, model, prompt } = await request.json();
    console.log('请求数据:', { provider, model, promptLength: prompt?.length });

    if (!provider || !model || !prompt) {
      throw new Error('缺少必要参数');
    }

    const { id: novelId } = params;

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
        OR: [
          { userId: session.user.id },
          { userId: 'default' }
        ]
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!apiKey) {
      throw new Error('未找到有效的 API Key，请先在设置中配置');
    }
    console.log('API Key 验证成功');

    // 使用 LLM Factory 创建实例
    const llmFactory = LLMFactory.getInstance();
    console.log('创建 LLM 实例，使用配置:', {
      provider,
      model,
      hasApiKey: !!apiKey?.key
    });
    
    const llm = await llmFactory.getLLMInstance({
      provider,
      apiKey: apiKey.key,
      model
    });

    // 构建系统提示词
    const systemPrompt = `你是一位专业的小说发展走向策划师。请根据用户的要求，生成一个详细的章节发展走向。

要求：
1. 明确故事的核心主题和情感基调
2. 描述主要人物的成长与改变轨迹
3. 规划主要矛盾冲突的递进与升级
4. 设计关键转折点和高潮情节
5. 注重情节的合理性和因果关系
6. 保持故事节奏的张弛有度

请从以下几个方面详细描述故事发展走向：

1. 核心主题
- 故事要表达的核心思想
- 情感基调的变化走向

2. 人物发展
- 主要人物的性格转变
- 重要关系的演变

3. 矛盾冲突
- 核心矛盾的递进过程
- 次要矛盾的交织影响

4. 关键节点
- 重要转折点的设置
- 高潮情节的铺垫

5. 情节走向
- 主线剧情的发展脉络
- 重要支线的切入时机`;

    // 生成内容
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('开始调用 LLM 流式生成...');
          console.log('使用模型配置:', {
            provider,
            model,
            systemPromptLength: systemPrompt.length,
            userPromptLength: prompt?.length
          });
          
          const streamGenerator = llm.generateRecommendationStream({
            systemPrompt,
            userPrompt: prompt
          });
          console.log('成功创建流式生成器');

          // 处理流式响应
          for await (const chunk of streamGenerator) {
            console.log('收到流式生成器数据:', chunk);
            if (!chunk || (!chunk.content && !chunk.reasoning_content)) continue;

            // 构建消息对象
            const message = {
              type: chunk.type,
              choices: [{
                delta: { 
                  content: chunk.content || '',
                  reasoning_content: chunk.reasoning_content || ''
                },
                index: 0,
                finish_reason: null
              }]
            };

            console.log('推送消息到客户端:', JSON.stringify(message, null, 2));
            // 直接传输对象
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`));
          }

          // 发送完成标记
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();

        } catch (error) {
          console.error('生成过程出错:', error);
          console.error('错误详情:', {
            name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace available'
          });
          
          const errorMessage = {
            error: error instanceof Error ? error.message : '生成失败',
            type: 'error',
            details: error instanceof Error ? error.stack : undefined
          };
          
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
          controller.close();
        }
      },
      cancel() {
        console.log('流被取消');
      }
    });

    return new Response(stream, {
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { outline } = await request.json();
    const { id: novelId } = params;

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

    // 更新大纲内容
    const updatedNovel = await prisma.novel.update({
      where: {
        id: novelId
      },    
      data: {
        outline
      }
    });

    return new Response(
      JSON.stringify(updatedNovel),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('保存大纲失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '保存大纲失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 