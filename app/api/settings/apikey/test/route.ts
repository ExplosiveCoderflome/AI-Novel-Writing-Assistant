import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { LLMFactory } from '../../../../llm/factory';
import { llmConfigFromDB, LLMDBConfig, LLMProviderConfig } from '../../../../config/llm';
import { z } from 'zod';

const testSchema = z.object({
  provider: z.string(),
});

type LLMProvider = keyof Omit<LLMDBConfig, 'defaultProvider'>;

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

    const { provider } = result.data;

    // 从数据库获取 API 密钥
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
      },
      select: {
        key: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: '未找到有效的 API 密钥' },
        { status: 404 }
      );
    }

    // 使用 LLMFactory 进行测试
    const llmFactory = LLMFactory.getInstance();
    
    // 创建配置对象
    const config: LLMDBConfig = {
      ...llmConfigFromDB,
      [provider]: {
        ...llmConfigFromDB[provider as LLMProvider],
        getApiKey: async () => apiKey.key,
      },
    };
    
    llmFactory.setConfig(config);

    const isConnected = await llmFactory.testConnection(provider);

    if (isConnected) {
      return NextResponse.json({ success: true, message: '连接测试成功' });
    } else {
      return NextResponse.json(
        { error: 'API 连接测试失败' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('API 测试失败:', error);
    return NextResponse.json(
      { error: '测试过程中发生错误' },
      { status: 500 }
    );
  }
} 