/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { z } from 'zod';

// 验证请求数据的 schema
const createNovelSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100, '标题最多100个字符'),
  description: z.string().min(1, '简介不能为空').max(500, '简介最多500个字符'),
  genreId: z.string().min(1, '请选择小说类型'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // 验证请求数据
    const result = createNovelSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: '输入数据无效', errors: result.error.errors },
        { status: 400 }
      );
    }

    const { title, description, genreId } = result.data;

    // 检查类型是否存在
    const genre = await prisma.novelGenre.findUnique({
      where: { id: genreId },
    });

    if (!genre) {
      return NextResponse.json(
        { error: '选择的小说类型不存在' },
        { status: 400 }
      );
    }

    // 创建小说
    const novel = await prisma.novel.create({
      data: {
        title,
        description,
        genreId,
        authorId: session.user.id,
        status: 'draft',
      },
    });

    return NextResponse.json(novel, { status: 201 });
  } catch (error) {
    console.error('创建小说失败:', error);
    return NextResponse.json(
      { error: '创建小说失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: '请先登录' },
        { status: 401 }
      );
    }

    const novels = await prisma.novel.findMany({
      where: {
        authorId: session.user.id,
      },
      include: {
        genre: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return NextResponse.json(novels);
  } catch (error) {
    console.error('获取小说列表失败:', error);
    return NextResponse.json(
      { error: '获取小说列表失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
} 