import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { worldId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { worldId } = params;
    
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

    // 将 JSON 字符串转换回对象，并确保所有必需的字段都存在
    const parsedWorld = {
      ...world,
      geography: world.geography ? JSON.parse(world.geography) : {
        terrain: [],
        climate: [],
        locations: []
      },
      culture: world.cultures ? JSON.parse(world.cultures) : {
        societies: [],
        customs: [],
        religions: [],
        politics: []
      },
      magicSystem: world.magicSystem ? JSON.parse(world.magicSystem) : null,
      technology: world.technology ? JSON.parse(world.technology) : null,
      history: world.background ? JSON.parse(world.background) : [],
      conflicts: world.conflicts ? JSON.parse(world.conflicts) : [],
      races: world.races ? JSON.parse(world.races) : [],
      religions: world.religions ? JSON.parse(world.religions) : []
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
  { params }: { params: { worldId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { worldId } = params;
    
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { worldId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { worldId } = params;
    const data = await request.json();
    
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

    // 更新世界
    const updatedWorld = await prisma.world.update({
      where: {
        id: worldId,
      },
      data: {
        // 这里根据实际需要更新字段
        name: data.name,
        description: data.description,
        // 其他字段...
      },
    });

    return NextResponse.json(updatedWorld);
  } catch (error) {
    console.error('[WORLD_UPDATE]', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
} 