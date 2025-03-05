/*
 * @LastEditors: biz
 */
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';

export class APIKeyError extends Error {
  details?: unknown;
  
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'APIKeyError';
    this.details = details;
  }
}

export async function getApiKey(provider: string): Promise<string> {
  try {
    // 确保数据库连接
    await prisma.$connect();

    const apiKey = await prisma.aPIKey.findUnique({
      where: {
        provider_userId: {
          provider,
          userId: 'user-1', // 临时固定用户ID
        },
      },
      select: {
        key: true,
        isActive: true,
      },
    });

    if (!apiKey || !apiKey.key || !apiKey.isActive) {
      throw new APIKeyError(`未配置 ${provider} API 密钥，请在设置页面配置相应的 API 密钥`);
    }

    return apiKey.key;
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