import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 获取单个章节
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const { id: novelId, chapterId } = params;

    const chapter = await prisma.chapter.findUnique({
      where: {
        id: chapterId,
        novelId,
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: '章节不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json(chapter);
  } catch (error) {
    console.error('获取章节详情失败:', error);
    return NextResponse.json(
      { error: '获取章节详情失败' },
      { status: 500 }
    );
  }
}

// 更新章节
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const { id: novelId, chapterId } = params;
    const data = await request.json();

    // 验证数据
    if (!data.title) {
      return NextResponse.json(
        { error: '章节标题不能为空' },
        { status: 400 }
      );
    }

    // 确认章节存在
    const existingChapter = await prisma.chapter.findUnique({
      where: {
        id: chapterId,
        novelId,
      },
    });

    if (!existingChapter) {
      return NextResponse.json(
        { error: '章节不存在' },
        { status: 404 }
      );
    }

    // 更新章节
    const updatedChapter = await prisma.chapter.update({
      where: {
        id: chapterId,
      },
      data: {
        title: data.title,
        content: data.content || '',
        order: data.order || existingChapter.order,
      },
    });

    return NextResponse.json(updatedChapter);
  } catch (error) {
    console.error('更新章节失败:', error);
    return NextResponse.json(
      { error: '更新章节失败' },
      { status: 500 }
    );
  }
}

// 部分更新章节（如顺序）
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const { id: novelId, chapterId } = params;
    const data = await request.json();

    // 确认章节存在
    const existingChapter = await prisma.chapter.findUnique({
      where: {
        id: chapterId,
        novelId,
      },
    });

    if (!existingChapter) {
      return NextResponse.json(
        { error: '章节不存在' },
        { status: 404 }
      );
    }

    // 更新章节
    const updatedChapter = await prisma.chapter.update({
      where: {
        id: chapterId,
      },
      data: {
        title: data.title || existingChapter.title,
        content: data.content !== undefined ? data.content : existingChapter.content,
        order: data.order !== undefined ? data.order : existingChapter.order,
      },
    });

    return NextResponse.json(updatedChapter);
  } catch (error) {
    console.error('更新章节失败:', error);
    return NextResponse.json(
      { error: '更新章节失败' },
      { status: 500 }
    );
  }
}

// 删除章节
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  try {
    const { id: novelId, chapterId } = params;

    // 确认章节存在
    const existingChapter = await prisma.chapter.findUnique({
      where: {
        id: chapterId,
        novelId,
      },
    });

    if (!existingChapter) {
      return NextResponse.json(
        { error: '章节不存在' },
        { status: 404 }
      );
    }

    // 删除章节
    await prisma.chapter.delete({
      where: {
        id: chapterId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除章节失败:', error);
    return NextResponse.json(
      { error: '删除章节失败' },
      { status: 500 }
    );
  }
} 