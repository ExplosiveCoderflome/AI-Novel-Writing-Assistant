import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, llmConfigFromDB } from '../../../config/llm';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

type LLMProvider = keyof Omit<LLMDBConfig, 'defaultProvider'>;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  try {
    const { provider, model, prompt, temperature, maxTokens } = await request.json();

    if (!provider || !model || !prompt) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
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
      return NextResponse.json(
        { success: false, error: '未找到有效的 API Key' },
        { status: 404 }
      );
    }

    // 创建 LLM 实例
    const llmFactory = LLMFactory.getInstance();
    const providerKey = provider as LLMProvider;
    const config: LLMDBConfig = {
      ...llmConfigFromDB,
      [providerKey]: {
        ...llmConfigFromDB[providerKey],
        getApiKey: async () => apiKey.key,
        model,
        temperature: temperature ?? llmConfigFromDB[providerKey].temperature,
        maxTokens: maxTokens ?? llmConfigFromDB[providerKey].maxTokens,
      },
    } as LLMDBConfig;
    
    llmFactory.setConfig(config);

    // 生成内容
    const response = await llmFactory.generateRecommendation({
      prompt,
      model,
    }, provider);

    if (response.error) {
      return NextResponse.json(
        { success: false, error: response.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      content: response.content
    });
  } catch (error) {
    console.error('生成失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '生成失败' 
      },
      { status: 500 }
    );
  }
} 