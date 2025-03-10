import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/options';
import { prisma } from '../../../lib/prisma';

// 获取用户保存的所有标题
export async function GET(request: NextRequest) {
  // 获取会话信息
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  try {
    // 获取查询参数
    const url = new URL(request.url);
    const genreId = url.searchParams.get('genreId');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
    const skip = (page - 1) * pageSize;

    // 构建查询条件
    const where: any = {
      userId: session.user.id,
    };

    if (genreId) {
      where.genreId = genreId;
    }

    if (search) {
      where.title = {
        contains: search,
      };
    }

    // 查询数据
    const [titles, total] = await Promise.all([
      prisma.titleLibrary.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: pageSize,
      }),
      prisma.titleLibrary.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      titles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('获取标题库失败:', error);
    return NextResponse.json(
      { success: false, error: '获取标题库失败' },
      { status: 500 }
    );
  }
}

// 添加标题到标题库
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  try {
    const { title, description, clickRate, keywords, genreId } = await request.json();

    // 标题不能为空
    if (!title) {
      return NextResponse.json(
        { success: false, error: '标题不能为空' },
        { status: 400 }
      );
    }

    // 检查是否已存在相同标题
    const existingTitle = await prisma.titleLibrary.findFirst({
      where: {
        userId: session.user.id,
        title,
      },
    });

    if (existingTitle) {
      return NextResponse.json(
        { success: false, error: '该标题已存在于您的标题库中' },
        { status: 400 }
      );
    }

    // 创建新标题
    const newTitle = await prisma.titleLibrary.create({
      data: {
        title,
        description,
        clickRate,
        keywords,
        genreId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      success: true,
      title: newTitle,
    });
  } catch (error) {
    console.error('添加标题失败:', error);
    return NextResponse.json(
      { success: false, error: '添加标题失败' },
      { status: 500 }
    );
  }
} 