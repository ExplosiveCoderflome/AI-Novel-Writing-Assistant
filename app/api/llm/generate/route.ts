import { NextRequest, NextResponse } from 'next/server';
import { getApiKey } from '../../../../lib/api-key';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import { LLMFactory } from '../../../llm/factory';
import { GenerateParams } from '../../../types/llm';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: '未授权访问' },
        { status: 401 }
      );
    }

    const { provider, model, prompt, temperature, maxTokens } = await request.json();

    if (!provider || !model || !prompt) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 使用封装好的方法获取 API Key
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

    // 创建 LLM 实例
    const llmFactory = LLMFactory.getInstance();
    
    // 生成内容
    const params: GenerateParams = {
      userPrompt: prompt,
      model,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 2000,
    };

    const response = await llmFactory.generateRecommendation(params, provider);

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('生成内容失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '生成内容失败' },
      { status: 500 }
    );
  }
} 