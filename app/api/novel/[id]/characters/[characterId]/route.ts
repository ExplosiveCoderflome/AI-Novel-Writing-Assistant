import { NextRequest } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../auth/options';

// 获取单个角色
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; characterId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId, characterId } = params;

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

    // 获取角色
    const character = await prisma.character.findUnique({
      where: {
        id: characterId,
        novelId
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
    console.error('获取角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '获取角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// 更新角色
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; characterId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId, characterId } = params;
    const characterData = await request.json();

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

    // 更新角色
    const character = await prisma.character.update({
      where: {
        id: characterId,
        novelId
      },
      data: {
        name: characterData.name,
        role: characterData.role,
        personality: characterData.personality,
        background: characterData.background,
        development: characterData.development
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
    console.error('更新角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '更新角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// 删除角色
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; characterId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId, characterId } = params;

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

    // 删除角色
    await prisma.character.delete({
      where: {
        id: characterId,
        novelId
      }
    });

    return new Response(
      JSON.stringify({ message: '角色已删除' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('删除角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '删除角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 