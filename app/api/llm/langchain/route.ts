import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/options';
import { LangChainFactory } from '../../../../lib/langchain/factory';
import { initLangChainConfig } from '../../../../lib/config/langchain';
import { createStreamableResponse } from '../../../../lib/langchain/streaming';
import { GenerateParams } from '../../../types/llm';

/**
 * LangChain测试API
 * 用于测试LangChain集成是否正常工作
 */
export async function POST(request: NextRequest) {
  try {
    console.log('收到LangChain测试请求');
    
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
    const { 
      prompt = '你好，请简要介绍一下自己。', 
      provider = 'openai',
      stream = false,
      temperature = 0.7,
      maxTokens = 2000
    } = body;
    
    console.log('LangChain测试参数:', {
      provider,
      promptLength: prompt.length,
      stream,
      temperature,
      maxTokens
    });
    
    // 初始化LangChain配置
    await initLangChainConfig();
    const langChainFactory = LangChainFactory.getInstance();
    
    // 构建生成参数
    const generateParams: GenerateParams = {
      userPrompt: prompt,
      systemPrompt: '你是一个有帮助的AI助手，提供简明扼要的回答。',
      temperature,
      maxTokens
    };
    
    // 流式响应处理
    if (stream) {
      console.log('使用流式响应模式');
      
      const { stream: responseStream, controller } = createStreamableResponse({
        onStart: () => {
          console.log('开始LangChain流式测试');
        },
        onComplete: (content) => {
          console.log('LangChain流式测试完成, 总内容长度:', content.length);
        },
        onError: (error) => {
          console.error('LangChain流式测试错误:', error);
        }
      });
      
      // 异步处理生成过程
      (async () => {
        try {
          const config = langChainFactory.getConfig();
          if (!config) {
            throw new Error('LangChain配置未初始化');
          }
          
          const providerConfig = config[provider];
          if (typeof providerConfig === 'string') {
            throw new Error(`提供商 ${provider} 的配置无效`);
          }
          
          const apiKey = await providerConfig.getApiKey();
          if (!apiKey) {
            throw new Error(`找不到 ${provider} 提供商的API密钥`);
          }
          
          // 获取LangChain实例
          const langChain = await langChainFactory.getLangChainInstance({
            provider,
            apiKey,
            model: providerConfig.model
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
      
      const config = langChainFactory.getConfig();
      if (!config) {
        return NextResponse.json(
          { error: 'LangChain配置未初始化' },
          { status: 500 }
        );
      }
      
      const providerConfig = config[provider];
      if (typeof providerConfig === 'string') {
        return NextResponse.json(
          { error: `提供商 ${provider} 的配置无效` },
          { status: 400 }
        );
      }
      
      const apiKey = await providerConfig.getApiKey();
      if (!apiKey) {
        return NextResponse.json(
          { error: `找不到 ${provider} 提供商的API密钥` },
          { status: 400 }
        );
      }
      
      // 获取LangChain实例
      const langChain = await langChainFactory.getLangChainInstance({
        provider,
        apiKey,
        model: providerConfig.model
      });
      
      // 生成内容
      const response = await langChain.generateRecommendation(generateParams);
      
      console.log('LangChain测试完成', {
        success: !response.error,
        contentLength: response.content?.length || 0
      });
      
      return NextResponse.json({
        success: !response.error,
        content: response.content,
        error: response.error
      });
    }
  } catch (error) {
    console.error('LangChain测试API错误:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : '处理请求时发生错误',
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      }, 
      { status: 500 }
    );
  }
} 