import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET() {
  try {
    const apiKeys = await prisma.aPIKey.findMany({
      where: {
        userId: 'default',
        isActive: true,
      },
      select: {
        provider: true,
        key: true,
      },
    });

    // 转换数据格式，只返回必要的信息
    const providers = apiKeys.map(key => ({
      provider: key.provider,
      hasKey: Boolean(key.key),
    }));

    return NextResponse.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    console.error('获取API密钥列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取API密钥列表失败',
      },
      { status: 500 }
    );
  }
} 