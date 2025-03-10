import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 获取章节列表
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const novelId = params.id;

    // 验证小说是否存在
    const novel = await prisma.novel.findUnique({
      where: { id: novelId }
    });

    if (!novel) {
      return NextResponse.json(
        { error: '小说不存在' },
        { status: 404 }
      );
    }

    // 获取所有章节，按照order排序
    const chapters = await prisma.chapter.findMany({
      where: {
        novelId
      },
      orderBy: {
        order: 'asc'
      }
    });

    return NextResponse.json(chapters);
  } catch (error) {
    console.error('获取章节列表失败:', error);
    return NextResponse.json(
      { error: '获取章节列表失败' },
      { status: 500 }
    );
  }
}

// 创建新章节
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const novelId = params.id;
    const data = await request.json();

    // 验证必要的字段
    if (!data.title) {
      return NextResponse.json(
        { error: '章节标题不能为空' },
        { status: 400 }
      );
    }

    // 验证小说是否存在
    const novel = await prisma.novel.findUnique({
      where: { id: novelId }
    });

    if (!novel) {
      return NextResponse.json(
        { error: '小说不存在' },
        { status: 404 }
      );
    }

    // 创建新章节
    const newChapter = await prisma.chapter.create({
      data: {
        novelId,
        title: data.title,
        content: data.content || '',
        order: data.order || 1,
      }
    });

    return NextResponse.json(newChapter);
  } catch (error) {
    console.error('创建章节失败:', error);
    return NextResponse.json(
      { error: '创建章节失败' },
      { status: 500 }
    );
  }
}

// 可选：添加删除所有章节的功能
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const novelId = params.id;

    // 验证小说是否存在
    const novel = await prisma.novel.findUnique({
      where: { id: novelId }
    });

    if (!novel) {
      return NextResponse.json(
        { error: '小说不存在' },
        { status: 404 }
      );
    }

    // 删除所有章节
    await prisma.chapter.deleteMany({
      where: {
        novelId
      }
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