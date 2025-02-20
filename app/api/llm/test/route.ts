/*
 * @LastEditors: biz
 */
/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../types/llm';
import { z } from 'zod';

const testSchema = z.object({
  provider: z.string(),
  type: z.enum(['connection', 'speed']).default('connection'),
  model: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = testSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求参数',
        details: result.error.format()
      });
    }

    const { provider, type, model } = result.data;

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: '未找到有效的 API Key'
      });
    }

    // 创建配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey.key,
      model,
      temperature: 0.7,
      maxTokens: 100
    };

    const config = {
      defaultProvider: provider,
      [provider]: providerConfig
    } as LLMDBConfig;

    const factory = LLMFactory.getInstance();
    factory.setConfig(config);

    if (type === 'speed') {
      console.log('开始速度测试:', { 
        provider, 
        model,
        apiKey: {
          id: apiKey.id,
          provider: apiKey.provider,
          isActive: apiKey.isActive,
          keyLength: apiKey.key.length
        }
      });

      const result = await factory.testSpeed(provider, model);
      console.log('速度测试结果:', result);

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.data.error || '速度测试失败'
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          duration: result.data.duration,
          response: result.data.response,
          model: result.data.model
        }
      });
    } else if (type === 'connection') {
      const result = await factory.testConnection(provider);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({
        success: false,
        error: '不支持的测试类型'
      });
    }
  } catch (error) {
    console.error('测试失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    });
  }
} 