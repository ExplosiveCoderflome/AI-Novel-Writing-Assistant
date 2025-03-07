import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

// 定义支持的provider列表
const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'cohere', 'volc', 'siliconflow'];

export async function GET() {
  try {
    // 从数据库获取API密钥
    const dbApiKeys = await prisma.aPIKey.findMany({
      where: {
        userId: 'default',
        isActive: true,
      },
      select: {
        provider: true,
        key: true,
      },
    });

    // 合并数据库和环境变量中的API key
    const allApiKeys = SUPPORTED_PROVIDERS.map(provider => {
      // 检查数据库中是否有该provider的key
      const dbKey = dbApiKeys.find(k => k.provider === provider);
      
      // 检查环境变量中是否有该provider的key
      const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
      
      // 如果数据库或环境变量中有key，则返回provider信息
      if (dbKey?.key || envKey) {
        return {
          provider,
          hasKey: true,
          source: dbKey?.key ? 'database' : 'environment'
        };
      }
      
      // 如果都没有key，返回provider但标记为没有key
      return {
        provider,
        hasKey: false,
        source: null
      };
    });

    // 只返回有key的provider
    const availableApiKeys = allApiKeys.filter(key => key.hasKey);

    console.log('[Settings API] 可用的API Keys:', availableApiKeys);

    return NextResponse.json({
      success: true,
      data: availableApiKeys
    });
  } catch (error) {
    console.error('获取API密钥列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取API密钥列表失败',
        details: error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    );
  }
} 