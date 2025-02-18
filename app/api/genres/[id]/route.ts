import { NextRequest } from 'next/server';
import { prisma } from '../../../../lib/prisma';

// 获取单个类型
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const genre = await prisma.novelGenre.findUnique({
      where: {
        id: params.id
      },
      include: {
        parent: true,
        children: true
      }
    });

    if (!genre) {
      return new Response(
        JSON.stringify({
          error: '未找到该类型'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(JSON.stringify(genre), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: '获取类型失败',
        details: error instanceof Error ? error.message : '未知错误'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// 更新类型
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // 检查是否存在循环依赖
    if (parentId) {
      let currentParent = await prisma.novelGenre.findUnique({
        where: { id: parentId }
      });

      while (currentParent) {
        if (currentParent.id === params.id) {
          return new Response(
            JSON.stringify({
              error: '不能将类型设置为自己的子类型'
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        if (!currentParent.parentId) break;
        currentParent = await prisma.novelGenre.findUnique({
          where: { id: currentParent.parentId }
        });
      }
    }

    // 检查同级下是否已存在相同名称（排除自己）
    const existingGenre = await prisma.novelGenre.findFirst({
      where: {
        name,
        parentId: parentId || null,
        NOT: {
          id: params.id
        }
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

    const genre = await prisma.novelGenre.update({
      where: {
        id: params.id
      },
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
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: '更新类型失败',
        details: error instanceof Error ? error.message : '未知错误'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// 删除类型
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 检查是否有子类型
    const hasChildren = await prisma.novelGenre.findFirst({
      where: {
        parentId: params.id
      }
    });

    if (hasChildren) {
      return new Response(
        JSON.stringify({
          error: '无法删除含有子类型的分类，请先删除或移动子类型'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 检查是否有关联的小说
    const hasNovels = await prisma.novel.findFirst({
      where: {
        genreId: params.id
      }
    });

    if (hasNovels) {
      return new Response(
        JSON.stringify({
          error: '无法删除已被小说使用的类型，请先修改相关小说的类型'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    await prisma.novelGenre.delete({
      where: {
        id: params.id
      }
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: '删除类型失败',
        details: error instanceof Error ? error.message : '未知错误'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 