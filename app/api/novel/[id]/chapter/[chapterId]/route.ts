import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  const { id: novelId, chapterId } = params;

  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        title: true,
        content: true,
        order: true,
        novelId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: 'Chapter not found' },
        { status: 404 }
      );
    }

    if (chapter.novelId !== novelId) {
      return NextResponse.json(
        { error: 'Chapter does not belong to this novel' },
        { status: 403 }
      );
    }

    return NextResponse.json(chapter);
  } catch (error) {
    console.error('Failed to fetch chapter:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chapter' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; chapterId: string } }
) {
  const { id: novelId, chapterId } = params;

  try {
    const chapterData = await request.json();

    // 验证章节是否属于当前小说
    const existingChapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
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
      where: { id: chapterId },
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
  { params }: { params: { id: string; chapterId: string } }
) {
  const { id: novelId, chapterId } = params;

  try {
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

    if (chapter.novelId !== novelId) {
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