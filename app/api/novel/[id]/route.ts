/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/options';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }
    
    const novel = await prisma.novel.findUnique({
      where: { 
        id,
        authorId: session.user.id 
      },
      include: {
        chapters: {
          select: {
            id: true,
            title: true,
            content: true,
            order: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
        genre: {
          select: {
            id: true,
            name: true,
          }
        }
      },
    });

    if (!novel) {
      return NextResponse.json(
        { error: '未找到小说' },
        { status: 404 }
      );
    }

    // 确保返回structuredOutline字段
    console.log('返回小说数据，包含structuredOutline:', !!novel.structuredOutline);

    return NextResponse.json(novel);
  } catch (error) {
    console.error('获取小说失败:', error);
    return NextResponse.json(
      { error: '获取小说失败' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }
    
    const novelData = await request.json();
    console.log('更新小说数据:', novelData);

    // 确保必要字段存在
    if (!novelData.title || !novelData.description || !novelData.genreId) {
      console.error('缺少必要字段:', {
        title: !novelData.title,
        description: !novelData.description,
        genreId: !novelData.genreId,
      });
      return NextResponse.json(
        { error: '请填写所有必要信息' },
        { status: 400 }
      );
    }

    // 检查小说是否存在且属于当前用户
    const existingNovel = await prisma.novel.findUnique({
      where: { 
        id,
        authorId: session.user.id 
      },
    });

    if (!existingNovel) {
      return NextResponse.json(
        { error: '未找到小说或无权限修改' },
        { status: 404 }
      );
    }

    // 检查类型是否存在
    const genre = await prisma.novelGenre.findUnique({
      where: { id: novelData.genreId },
    });

    if (!genre) {
      return NextResponse.json(
        { error: '无效的小说类型' },
        { status: 400 }
      );
    }

    const novel = await prisma.novel.update({
      where: { id },
      data: {
        title: novelData.title,
        description: novelData.description,
        genreId: novelData.genreId,
        updatedAt: new Date(),
      },
      include: {
        genre: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    console.log('小说更新成功:', novel);
    return NextResponse.json(novel);
  } catch (error) {
    console.error('更新小说失败:', error);
    return NextResponse.json(
      { 
        error: '更新小说失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return NextResponse.json(
        { error: '未找到小说或无权限删除' },
        { status: 404 }
      );
    }

    // 删除小说及其关联数据
    await prisma.$transaction([
      // 删除小说的章节
      prisma.chapter.deleteMany({
        where: { novelId: id }
      }),
      // 删除小说的角色
      prisma.character.deleteMany({
        where: { novelId: id }
      }),
      // 删除小说本身
      prisma.novel.delete({
        where: { id }
      })
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除小说失败:', error);
    return NextResponse.json(
      { error: '删除小说失败' },
      { status: 500 }
    );
  }
} 