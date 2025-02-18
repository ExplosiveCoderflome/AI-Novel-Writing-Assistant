import { NextRequest } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function GET() {
  try {
    const genres = await prisma.novelGenre.findMany({
      include: {
        parent: true,
        children: true,
      },
      orderBy: {
        name: 'asc'
      }
    });

    return new Response(JSON.stringify(genres), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取类型列表失败:', error);
    return new Response(
      JSON.stringify({
        error: '获取类型列表失败',
        details: error instanceof Error ? error.message : '未知错误'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description, parentId } = await req.json();

    if (!name) {
      return new Response(
        JSON.stringify({
          error: '类型名称不能为空'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 如果指定了父级，先检查父级是否存在
    if (parentId) {
      const parent = await prisma.novelGenre.findUnique({
        where: { id: parentId }
      });

      if (!parent) {
        return new Response(
          JSON.stringify({
            error: '父级类型不存在'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // 检查同级下是否已存在相同名称
    const existingGenre = await prisma.novelGenre.findFirst({
      where: {
        name,
        parentId: parentId || null
      }
    });

    if (existingGenre) {
      return new Response(
        JSON.stringify({
          error: '同一父级下已存在相同名称的类型'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const genre = await prisma.novelGenre.create({
      data: {
        name,
        description,
        parentId
      },
      include: {
        parent: true,
        children: true
      }
    });

    return new Response(JSON.stringify(genre), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('创建类型失败:', error);
    return new Response(
      JSON.stringify({
        error: '创建类型失败',
        details: error instanceof Error ? error.message : '未知错误'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 