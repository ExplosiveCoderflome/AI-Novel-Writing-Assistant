/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const { id: novelId } = context.params;
  
  try {
    const chapters = await prisma.chapter.findMany({
      where: { novelId },
      select: {
        id: true,
        title: true,
        content: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        novelId: true,
      },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json(chapters);
  } catch (error) {
    console.error('Failed to fetch chapters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chapters' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const { id: novelId } = context.params;
  
  try {
    const chapterData = await request.json();
    
    // 验证必要字段
    if (!chapterData.title) {
      return NextResponse.json(
        { error: 'Chapter title is required' },
        { status: 400 }
      );
    }

    const lastChapter = await prisma.chapter.findFirst({
      where: { novelId },
      orderBy: { order: 'desc' },
    });

    const chapter = await prisma.chapter.create({
      data: {
        title: chapterData.title,
        content: chapterData.content || '',
        novelId,
        order: lastChapter ? lastChapter.order + 1 : 1,
      },
    });

    return NextResponse.json(chapter);
  } catch (error) {
    console.error('Failed to create chapter:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create chapter' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id: novelId } = context.params;
    const chapterData = await request.json();
    
    // 验证必要字段
    if (!chapterData.id) {
      return NextResponse.json(
        { error: 'Chapter ID is required' },
        { status: 400 }
      );
    }

    // 验证章节是否属于当前小说
    const existingChapter = await prisma.chapter.findUnique({
      where: { id: chapterData.id },
    });

    if (!existingChapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    if (existingChapter.novelId !== novelId) {
      return NextResponse.json(
        { error: 'Chapter does not belong to this novel' },
        { status: 403 }
      );
    }

    const chapter = await prisma.chapter.update({
      where: { id: chapterData.id },
      data: {
        title: chapterData.title,
        content: chapterData.content,
        order: chapterData.order,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(chapter);
  } catch (error) {
    console.error('Failed to update chapter:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update chapter' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: chapterId } = await request.json();
    
    // 验证章节是否属于当前小说
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    if (chapter.novelId !== params.id) {
      return NextResponse.json(
        { error: 'Chapter does not belong to this novel' },
        { status: 403 }
      );
    }

    await prisma.chapter.delete({
      where: { id: chapterId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete chapter:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: 'Database error', details: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete chapter' },
      { status: 500 }
    );
  }
} 