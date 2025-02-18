import { NextRequest } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

interface RouteContext {
  params: {
    id: string;
  };
}

// 获取单个基础角色
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;

    const character = await prisma.baseCharacter.findUnique({
      where: { id },
      include: {
        characters: true // 包含使用此基础角色的所有小说角色
      }
    });

    if (!character) {
      return new Response(
        JSON.stringify({ error: '未找到角色' }),
        { status: 404 }
      );
    }

    return new Response(
      JSON.stringify(character),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('获取基础角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '获取基础角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// 更新基础角色
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;
    const data = await request.json();

    // 验证必要字段
    const requiredFields = ['name', 'role', 'personality', 'background', 'development', 'category'];
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`缺少必要字段: ${field}`);
      }
    }

    const character = await prisma.baseCharacter.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        personality: data.personality,
        background: data.background,
        development: data.development,
        category: data.category,
        tags: data.tags || ''
      }
    });

    return new Response(
      JSON.stringify(character),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('更新基础角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '更新基础角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// 删除基础角色
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id } = await context.params;

    // 检查是否有小说角色在使用此基础角色
    const usageCount = await prisma.character.count({
      where: {
        baseCharacterId: id
      }
    });

    if (usageCount > 0) {
      return new Response(
        JSON.stringify({ error: '此基础角色正在被使用，无法删除' }),
        { status: 400 }
      );
    }

    await prisma.baseCharacter.delete({
      where: { id }
    });

    return new Response(
      JSON.stringify({ message: '基础角色已删除' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('删除基础角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '删除基础角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 