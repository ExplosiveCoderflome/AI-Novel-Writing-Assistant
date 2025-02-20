/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../types/llm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider) {
      return NextResponse.json(
        { success: false, error: '缺少 provider 参数' },
        { status: 400 }
      );
    }

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        userId: 'default',
        isActive: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: '未找到有效的 API Key' },
        { status: 404 }
      );
    }

    // 创建 LLM 实例
    const llmFactory = LLMFactory.getInstance();
    
    // 创建新的配置对象
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey.key,
      temperature: 0.7,
      maxTokens: 2000
    };

    const config: LLMDBConfig = {
      defaultProvider: provider,
      [provider]: providerConfig
    };
    
    llmFactory.setConfig(config);

    // 获取可用模型列表
    const models = await llmFactory.getAvailableModels(provider);

    return NextResponse.json({
      success: true,
      data: {
        models
      }
    });
  } catch (error) {
    console.error('获取模型列表失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '获取模型列表失败' 
      },
      { status: 500 }
    );
  }
} 