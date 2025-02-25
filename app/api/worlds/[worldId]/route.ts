import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

export async function GET(
  req: Request,
  context: { params: Promise<{ worldId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { worldId } = await context.params;
    
    if (!session?.user?.email) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const world = await prisma.world.findUnique({
      where: {
        id: worldId,
      },
    });

    if (!world) {
      return new NextResponse('World not found', { status: 404 });
    }

    if (world.userId !== session.user.email) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 辅助函数，安全地解析JSON
    const safeParseJson = (value: any, defaultValue: any) => {
      if (!value) return defaultValue;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (e) {
          console.error('JSON解析失败:', e);
          return defaultValue;
        }
      }
      return value; // 已经是对象，直接返回
    };

    // 将 JSON 字段转换为对象，并确保所有必需的字段都存在
    const parsedWorld = {
      ...world,
      geography: safeParseJson(world.geography, {
        terrain: [],
        climate: [],
        locations: []
      }),
      culture: safeParseJson(world.cultures, {
        societies: [],
        customs: [],
        religions: [],
        politics: []
      }),
      magicSystem: safeParseJson(world.magicSystem, null),
      technology: safeParseJson(world.technology, null),
      history: safeParseJson(world.background, []),
      conflicts: safeParseJson(world.conflicts, []),
      races: safeParseJson(world.races, []),
      religions: safeParseJson(world.religions, [])
    };

    // 确保所有必需的嵌套对象都存在
    if (parsedWorld.magicSystem) {
      parsedWorld.magicSystem = {
        rules: parsedWorld.magicSystem.rules || [],
        elements: parsedWorld.magicSystem.elements || [],
        practitioners: parsedWorld.magicSystem.practitioners || [],
        limitations: parsedWorld.magicSystem.limitations || []
      };
    }

    if (parsedWorld.technology) {
      parsedWorld.technology = {
        level: parsedWorld.technology.level || '',
        innovations: parsedWorld.technology.innovations || [],
        impact: parsedWorld.technology.impact || []
      };
    }

    return NextResponse.json(parsedWorld);
  } catch (error) {
    console.error('[WORLD_GET]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ worldId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { worldId } = await context.params;
    
    if (!session?.user?.email) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // 确保世界属于当前用户
    const world = await prisma.world.findUnique({
      where: {
        id: worldId,
      },
    });

    if (!world) {
      return new NextResponse('World not found', { status: 404 });
    }

    if (world.userId !== session.user.email) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 删除世界
    await prisma.world.delete({
      where: {
        id: worldId,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[WORLD_DELETE]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
} 