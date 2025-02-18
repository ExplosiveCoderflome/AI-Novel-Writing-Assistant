/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { z } from 'zod';

const settingsSchema = z.object({
  provider: z.string(),
  apiKey: z.string(),
  model: z.string().optional(),
});

export async function GET() {
  try {
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        userId: 'default', // TODO: 替换为实际的用户 ID
        isActive: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        provider: apiKey.provider,
        key: apiKey.key,
        model: apiKey.model,
      },
    });
  } catch (error) {
    console.error('Error fetching LLM settings:', error);
    return NextResponse.json({
      success: false,
      error: '获取设置失败',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = settingsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求数据',
      }, { status: 400 });
    }

    const { provider, apiKey, model } = result.data;

    // 更新或创建 API Key
    const updatedApiKey = await prisma.aPIKey.upsert({
      where: {
        provider_userId: {
          provider,
          userId: 'default', // TODO: 替换为实际的用户 ID
        },
      },
      update: {
        key: apiKey,
        model: model,
        isActive: true,
      },
      create: {
        provider,
        key: apiKey,
        model: model,
        isActive: true,
        userId: 'default', // TODO: 替换为实际的用户 ID
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        provider: updatedApiKey.provider,
        model: updatedApiKey.model,
      },
    });
  } catch (error) {
    console.error('Error saving LLM settings:', error);
    return NextResponse.json({
      success: false,
      error: '保存设置失败',
    }, { status: 500 });
  }
} 