/*
 * @LastEditors: biz
 */
/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, llmConfigFromDB, LLMProviderConfig } from '../../../config/llm';
import { z } from 'zod';

type LLMProvider = keyof Omit<LLMDBConfig, 'defaultProvider'>;

const testSchema = z.object({
  provider: z.string(),
  type: z.enum(['connection', 'speed']).default('connection'),
  model: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = testSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: '输入数据无效', errors: result.error.errors },
        { status: 400 }
      );
    }

    const { provider, type, model } = result.data;

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
    const providerKey = provider as LLMProvider;
    const config: LLMDBConfig = {
      ...llmConfigFromDB,
      [providerKey]: {
        ...llmConfigFromDB[providerKey],
        getApiKey: async () => apiKey.key,
        model: model,
      },
    } as LLMDBConfig;
    
    llmFactory.setConfig(config);

    // 根据测试类型执行不同的测试
    if (type === 'speed') {
      console.log('开始速度测试:', {
        provider,
        model,
        apiKey: {
          id: apiKey.id,
          provider: apiKey.provider,
          isActive: apiKey.isActive,
          keyLength: apiKey.key.length
        },
        config: {
          provider: providerKey,
          model: model || llmConfigFromDB[providerKey]?.model
        }
      });

      const startTime = Date.now();
      const response = await llmFactory.generateRecommendation({
        prompt: '请介绍一下你自己。',
        model: model
      }, provider);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log('速度测试结果:', {
        duration,
        hasResponse: !!response,
        responseContent: response.content,
        model: model || llmConfigFromDB[providerKey]?.model || 'default'
      });

      return NextResponse.json({
        success: true,
        data: {
          duration: duration,
          response: response.content,
          model: model || llmConfigFromDB[providerKey]?.model || 'default',
        },
      });
    } else {
      const isConnected = await llmFactory.testConnection(provider);
      if (!isConnected) {
        return NextResponse.json(
          { success: false, error: 'API 连接测试失败' },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Test API error:', error);
    return NextResponse.json(
      { success: false, error: '测试 API 失败' },
      { status: 500 }
    );
  }
} 