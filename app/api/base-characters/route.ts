import { NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/options';

// 获取基础角色列表
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const tags = searchParams.get('tags');
    const search = searchParams.get('search');

    // 构建查询条件
    const where: any = {};
    
    if (category) {
      where.category = category;
    }
    
    if (tags) {
      where.tags = {
        contains: tags
      };
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { role: { contains: search } },
        { personality: { contains: search } },
        { background: { contains: search } },
      ];
    }

    const characters = await prisma.baseCharacter.findMany({
      where,
      orderBy: {
        updatedAt: 'desc'
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
    console.error('获取基础角色列表失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '获取基础角色列表失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// 创建基础角色
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const data = await request.json();
    
    // 验证必要字段
    const requiredFields = ['name', 'role', 'personality', 'background', 'development', 'category'];
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`缺少必要字段: ${field}`);
      }
    }

    // 创建基础角色
    const character = await prisma.baseCharacter.create({
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
    console.error('创建基础角色失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '创建基础角色失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 