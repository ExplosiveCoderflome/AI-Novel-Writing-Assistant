import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Chapter } from '@/api/novel/types';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const novelId = params.id;
    const chapters: Chapter[] = await request.json();

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

    // 使用事务批量创建章节
    const newChapters = await prisma.$transaction(async (tx) => {
      // 创建所有章节
      const createdChapters = await Promise.all(
        chapters.map(chapter => 
          tx.chapter.create({
            data: {
              novelId,
              title: chapter.title,
              content: chapter.content || '',
              order: chapter.order,
            }
          })
        )
      );

      return createdChapters;
    });

    return NextResponse.json(newChapters);
  } catch (error) {
    console.error('批量创建章节失败:', error);
    return NextResponse.json(
      { error: '批量创建章节失败' },
      { status: 500 }
    );
  }
} 