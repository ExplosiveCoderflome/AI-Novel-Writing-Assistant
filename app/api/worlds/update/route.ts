import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { z } from 'zod';

// 验证请求体的 schema
const updateWorldSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  geography: z.object({
    terrain: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    climate: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    locations: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
  }).optional(),
  culture: z.object({
    societies: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    customs: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    religions: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    politics: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
  }).optional(),
  magicSystem: z.object({
    rules: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    elements: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    practitioners: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    limitations: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
  }).optional(),
  technology: z.object({
    level: z.string(),
    innovations: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
    impact: z.array(z.object({
      name: z.string(),
      description: z.string(),
      significance: z.string().optional(),
      attributes: z.record(z.string()).optional(),
    })),
  }).optional(),
  history: z.array(z.object({
    name: z.string(),
    description: z.string(),
    significance: z.string().optional(),
    attributes: z.record(z.string()).optional(),
  })).optional(),
  conflicts: z.array(z.object({
    name: z.string(),
    description: z.string(),
    significance: z.string().optional(),
    attributes: z.record(z.string()).optional(),
  })).optional(),
});

export async function PUT(request: NextRequest) {
  try {
    // 获取用户会话
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({
        success: false,
        error: '未授权的访问'
      }, { status: 401 });
    }

    // 解析请求体
    const body = await request.json();

    // 如果没有 id，生成一个新的
    if (!body.id) {
      const newWorld = await prisma.world.create({
        data: {
          userId: session.user.email,
          name: body.name,
          description: body.description,
          geography: body.geography ? JSON.stringify(body.geography) : null,
          cultures: body.culture ? JSON.stringify(body.culture) : null,
          magicSystem: body.magicSystem ? JSON.stringify(body.magicSystem) : null,
          technology: body.technology ? JSON.stringify(body.technology) : null,
          background: body.history ? JSON.stringify(body.history) : null,
          conflicts: body.conflicts ? JSON.stringify(body.conflicts) : null,
        }
      });
      body.id = newWorld.id;
    }

    // 验证请求体
    const result = updateWorldSchema.safeParse(body);

    if (!result.success) {
      console.error('验证世界数据失败:', result.error);
      return NextResponse.json({
        success: false,
        error: '无效的世界数据',
        details: result.error.format()
      }, { status: 400 });
    }

    const { id, name, description, geography, culture, magicSystem, technology, history, conflicts } = result.data;

    // 检查世界是否存在且属于当前用户
    const existingWorld = await prisma.world.findUnique({
      where: { id }
    });

    if (!existingWorld) {
      return NextResponse.json({
        success: false,
        error: '世界不存在'
      }, { status: 404 });
    }

    if (existingWorld.userId !== session.user.email) {
      return NextResponse.json({
        success: false,
        error: '无权修改此世界'
      }, { status: 403 });
    }

    // 更新数据库中的世界数据
    const updatedWorld = await prisma.world.update({
      where: { id },
      data: {
        name,
        description,
        geography: geography ? JSON.stringify(geography) : null,
        cultures: culture ? JSON.stringify(culture) : null,
        magicSystem: magicSystem ? JSON.stringify(magicSystem) : null,
        technology: technology ? JSON.stringify(technology) : null,
        background: history ? JSON.stringify(history) : null,
        conflicts: conflicts ? JSON.stringify(conflicts) : null,
        updatedAt: new Date(),
      },
    });

    console.log('世界数据更新成功:', {
      id: updatedWorld.id,
      name: updatedWorld.name,
    });

    // 将更新后的数据转换回前端需要的格式
    const parsedWorld = {
      ...updatedWorld,
      geography: geography || {
        terrain: [],
        climate: [],
        locations: []
      },
      culture: culture || {
        societies: [],
        customs: [],
        religions: [],
        politics: []
      },
      magicSystem,
      technology,
      history: history || [],
      conflicts: conflicts || []
    };

    return NextResponse.json({
      success: true,
      data: parsedWorld
    });
  } catch (error) {
    console.error('更新世界数据失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '更新世界数据时发生未知错误'
    }, { status: 500 });
  }
} 