import { NextRequest, NextResponse } from 'next/server';
import { getApiKey } from '../../../../lib/api-key';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/options';
import { GenerateParams } from '../../../types/llm';
import { LangChainFactory } from '../../../../lib/langchain/factory';
import { createStreamableResponse } from '../../../../lib/langchain/streaming';
// 导入LangChain初始化文件，确保配置已加载
import '../../_initLangChain';

export async function POST(request: NextRequest) {
  try {
    console.log('收到LLM生成请求');

    // 检查用户会话
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: '请先登录以使用此功能' },
        { status: 401 }
      );
    }

    // 解析请求内容
    const body = await request.json();
    const { prompt, systemPrompt, model, provider, stream = false, temperature, maxTokens } = body;
    
    if (!prompt) {
      return NextResponse.json(
        { error: '必须提供提示词' },
        { status: 400 }
      );
    }
    
    console.log('LLM生成请求参数:', {
      provider: provider || '默认',
      model: model || '默认',
      promptLength: prompt.length,
      systemPromptLength: systemPrompt?.length || 0,
      stream,
      temperature,
      maxTokens
    });

    // 获取LangChain工厂实例
    const langChainFactory = LangChainFactory.getInstance();
    
    // 构建生成参数
    const generateParams: GenerateParams = {
      userPrompt: prompt,
      systemPrompt,
      model,
      temperature,
      maxTokens
    };

    // 流式响应处理
    if (stream) {
      console.log('使用流式响应模式');
      
      const { stream: responseStream, controller } = createStreamableResponse({
        onStart: () => {
          console.log('开始LLM流式生成');
        },
        onComplete: (content) => {
          console.log('LLM流式生成完成, 总内容长度:', content.length);
        },
        onError: (error) => {
          console.error('LLM流式生成错误:', error);
        }
      });
      
      // 异步处理生成过程
      (async () => {
        try {
          // 获取API密钥
          const apiKey = await getApiKey(provider);
          if (!apiKey) {
            throw new Error(`找不到 ${provider || '默认'} 提供商的API密钥`);
          }
          
          // 获取LangChain实例
          const langChain = await langChainFactory.getLangChainInstance({
            provider: provider || 'openai',
            apiKey,
            model
          });
          
          console.log('开始流式生成');
          
          // 使用迭代器获取流式响应
          const streamGenerator = langChain.generateRecommendationStream(generateParams);
          
          for await (const chunk of streamGenerator) {
            controller.enqueue(chunk);
          }
          
          controller.close();
        } catch (error) {
          console.error('流式生成过程错误:', error);
          controller.error(error instanceof Error ? error : new Error(String(error)));
        }
      })();
      
      // 返回流式响应
      return new Response(responseStream, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      console.log('使用标准响应模式');
      
      // 获取API密钥
      const apiKey = await getApiKey(provider);
      if (!apiKey) {
        return NextResponse.json(
          { error: `找不到 ${provider || '默认'} 提供商的API密钥` },
          { status: 400 }
        );
      }
      
      // 获取LangChain实例
      const langChain = await langChainFactory.getLangChainInstance({
        provider: provider || 'openai',
        apiKey,
        model
      });
      
      // 生成内容
      const response = await langChain.generateRecommendation(generateParams);
      
      console.log('LLM生成完成', {
        success: !response.error,
        contentLength: response.content?.length || 0
      });
      
      return NextResponse.json(response);
    }
  } catch (error) {
    console.error('LLM生成API错误:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '处理请求时发生错误',
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      }, 
      { status: 500 }
    );
  }
} 