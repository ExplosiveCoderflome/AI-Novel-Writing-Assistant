/*
 * @LastEditors: biz
 */
import { NextRequest } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/options';

// 获取小说角色列表
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId } = params;

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

    // 获取角色列表
    const characters = await prisma.character.findMany({
      where: {
        novelId
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return new Response(
      JSON.stringify(characters),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('获取角色列表失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '获取角色列表失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 