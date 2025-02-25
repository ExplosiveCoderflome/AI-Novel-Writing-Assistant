import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { z } from 'zod';

// 简化的验证 schema
const worldSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional().nullable(),
  genre: z.string().optional().nullable(),
  magicSystem: z.any().optional().nullable(),
  technology: z.any().optional().nullable(),
  races: z.any().optional().nullable(),
  religions: z.any().optional().nullable(),
  politics: z.any().optional().nullable(),
  geography: z.any().optional().nullable(),
  culture: z.any().optional().nullable(),
  history: z.any().optional().nullable(),
  conflicts: z.any().optional().nullable()
});

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({
        success: false,
        error: '未登录'
      }, { status: 401 });
    }

    const body = await request.json();
    const result = worldSchema.safeParse(body);

    if (!result.success) {
      console.log('验证世界数据失败:', JSON.stringify(result.error.format(), null, 2));
      return NextResponse.json({
        success: false,
        error: '无效的世界数据',
        details: result.error.format()
      }, { status: 400 });
    }

    const { id, name, description, genre } = result.data;

    // 准备要保存的数据
    const worldData = {
      name,
      description,
      genre,
      magicSystem: body.magicSystem as Prisma.InputJsonValue,
      technology: body.technology as Prisma.InputJsonValue,
      races: body.races as Prisma.InputJsonValue,
      religions: body.religions as Prisma.InputJsonValue,
      politics: body.politics as Prisma.InputJsonValue,
      geography: body.geography as Prisma.InputJsonValue,
      culture: body.culture as Prisma.InputJsonValue,
      history: body.history as Prisma.InputJsonValue,
      conflicts: body.conflicts as Prisma.InputJsonValue,
      updatedAt: new Date()
    };

    console.log('准备保存的数据:', JSON.stringify(worldData, null, 2));

    let updatedWorld;

    if (id) {
      // 如果有 ID，检查世界是否存在且属于当前用户
      const existingWorld = await prisma.world.findFirst({
        where: {
          id,
          userId: session.user.email
        }
      });

      if (!existingWorld) {
        return NextResponse.json({
          success: false,
          error: '世界不存在或无权访问'
        }, { status: 404 });
      }

      // 更新世界
      updatedWorld = await prisma.world.update({
        where: { id },
        data: worldData
      });
    } else {
      // 如果没有 ID，创建新世界
      updatedWorld = await prisma.world.create({
        data: {
          ...worldData,
          userId: session.user.email
        }
      });
    }

    // 转换响应数据
    const responseData = updatedWorld;

    return NextResponse.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.log('保存世界失败:', error instanceof Error ? error.message : '未知错误');
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return NextResponse.json({
          success: false,
          error: '外键约束错误：请确保所有引用的数据都存在'
        }, { status: 400 });
      }
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '保存世界失败'
    }, { status: 500 });
  }
} 