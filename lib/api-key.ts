/*
 * @LastEditors: biz
 */
import { log } from 'console';
import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

export class APIKeyError extends Error {
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'APIKeyError';
    this.details = details;
  }
}

export interface APIKeyResult {
  key: string;
  isActive: boolean;
}

export async function getApiKey(provider: string): Promise<string> {
  try {
    // 确保数据库连接
    await prisma.$connect();

    // 首先尝试获取默认用户的API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
        OR: [
          { userId: 'default' },
          { userId: 'user-1' }
        ]
      },
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        key: true,
        isActive: true,
      },
    });

    // 如果数据库中找到了有效的API key，直接返回
    if (apiKey?.key && apiKey.isActive) {
      return apiKey.key;
    }

    // 如果数据库中没有找到，尝试从环境变量获取
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    console.log('在数据库中没有找到，尝试从环境变量获取', envKey )
    if (envKey) {
      return envKey;
    }

    // 如果都没有找到，抛出错误
    throw new APIKeyError(`未配置 ${provider} API 密钥，请在设置页面配置相应的 API 密钥或在环境变量中设置 ${provider.toUpperCase()}_API_KEY`);

  } catch (error) {
    if (error instanceof APIKeyError) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      throw new APIKeyError('数据库连接失败，请检查数据库配置');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new APIKeyError(`数据库操作失败: ${error.message}`);
    }
    throw new APIKeyError(`获取 ${provider} API 密钥失败`);
  } finally {
    // 确保关闭数据库连接
    await prisma.$disconnect();
  }
}

export async function validateApiKey(provider: string): Promise<boolean> {
  try {
    await getApiKey(provider);
    return true;
  } catch (error) {
    console.error('验证 API 密钥失败:', error);
    return false;
  }
} 