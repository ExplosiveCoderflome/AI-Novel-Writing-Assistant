import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { Prisma } from '@prisma/client';

// 获取所有API密钥
export async function GET() {
  try {
    await prisma.$connect();
    
    // 从数据库获取API密钥
    const dbApiKeys = await prisma.aPIKey.findMany({
      where: {
        userId: 'user-1', // 临时固定用户ID
      },
      select: {
        id: true,
        provider: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        key: true,
      },
    });

    // 获取所有可能的provider列表
    const allProviders = ['openai', 'anthropic', 'deepseek', 'cohere', 'volc', 'siliconflow'];
    
    // 合并数据库和环境变量中的API key信息
    const mergedApiKeys = allProviders.map(provider => {
      const dbKey = dbApiKeys.find(k => k.provider === provider);
      const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
      
      if (dbKey) {
        return {
          id: dbKey.id,
          provider: dbKey.provider,
          isActive: dbKey.isActive,
          createdAt: dbKey.createdAt,
          updatedAt: dbKey.updatedAt,
          hasKey: true,
          source: 'database'
        };
      } else if (envKey) {
        return {
          id: `env-${provider}`,
          provider: provider,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          hasKey: true,
          source: 'environment'
        };
      }
      return null;
    }).filter(key => key !== null);

    return NextResponse.json({
      success: true,
      data: mergedApiKeys,
    });
  } catch (error) {
    console.error('Failed to fetch API keys:', error);
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;

    if (error instanceof Prisma.PrismaClientInitializationError) {
      errorMessage = 'Database initialization failed';
      statusCode = 503;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error: ${error.message}`;
      statusCode = 400;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: 'Failed to fetch API keys', details: errorMessage },
      { status: statusCode }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 更新或创建API密钥
export async function POST(request: NextRequest) {
  try {
    const { provider, key }: { provider: string; key: string } = await request.json();

    if (!provider || !key) {
      return NextResponse.json(
        { error: 'Provider and key are required' },
        { status: 400 }
      );
    }

    await prisma.$connect();
    const apiKey = await prisma.aPIKey.upsert({
      where: {
        provider_userId: {
          provider,
          userId: 'user-1', // 临时固定用户ID
        },
      },
      update: {
        key,
        isActive: true,
      },
      create: {
        provider,
        key,
        userId: 'user-1', // 临时固定用户ID
      },
    });

    return NextResponse.json({
      id: apiKey.id,
      provider: apiKey.provider,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    });
  } catch (error) {
    console.error('Failed to save API key:', error);
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;

    if (error instanceof Prisma.PrismaClientInitializationError) {
      errorMessage = 'Database initialization failed';
      statusCode = 503;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error: ${error.message}`;
      statusCode = 400;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: 'Failed to save API key', details: errorMessage },
      { status: statusCode }
    );
  } finally {
    await prisma.$disconnect();
  }
}

// 删除API密钥
export async function DELETE(request: NextRequest) {
  try {
    const { provider }: { provider: string } = await request.json();

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      );
    }

    await prisma.$connect();
    await prisma.aPIKey.delete({
      where: {
        provider_userId: {
          provider,
          userId: 'user-1', // 临时固定用户ID
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete API key:', error);
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;

    if (error instanceof Prisma.PrismaClientInitializationError) {
      errorMessage = 'Database initialization failed';
      statusCode = 503;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error: ${error.message}`;
      statusCode = 400;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: 'Failed to delete API key', details: errorMessage },
      { status: statusCode }
    );
  } finally {
    await prisma.$disconnect();
  }
} 