import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { prisma } from '../../../../lib/prisma';

// 获取特定标题详情
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  try {
    const { id } = params;

    const title = await prisma.titleLibrary.findUnique({
      where: {
        id,
      },
    });

    if (!title) {
      return NextResponse.json(
        { success: false, error: '标题不存在' },
        { status: 404 }
      );
    }

    if (title.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: '无权访问此标题' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      title,
    });
  } catch (error) {
    console.error('获取标题详情失败:', error);
    return NextResponse.json(
      { success: false, error: '获取标题详情失败' },
      { status: 500 }
    );
  }
}

// 更新标题信息，包括使用次数
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  try {
    const { id } = params;
    const { usedCount, description } = await request.json();

    // 检查标题是否存在
    const title = await prisma.titleLibrary.findUnique({
      where: {
        id,
      },
    });

    if (!title) {
      return NextResponse.json(
        { success: false, error: '标题不存在' },
        { status: 404 }
      );
    }

    if (title.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: '无权修改此标题' },
        { status: 403 }
      );
    }

    // 更新标题
    const updatedTitle = await prisma.titleLibrary.update({
      where: {
        id,
      },
      data: {
        usedCount: usedCount !== undefined ? usedCount : title.usedCount,
        description: description !== undefined ? description : title.description,
      },
    });

    return NextResponse.json({
      success: true,
      title: updatedTitle,
    });
  } catch (error) {
    console.error('更新标题失败:', error);
    return NextResponse.json(
      { success: false, error: '更新标题失败' },
      { status: 500 }
    );
  }
}

// 删除标题
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '请先登录' },
      { status: 401 }
    );
  }

  try {
    const { id } = params;

    // 检查标题是否存在
    const title = await prisma.titleLibrary.findUnique({
      where: {
        id,
      },
    });

    if (!title) {
      return NextResponse.json(
        { success: false, error: '标题不存在' },
        { status: 404 }
      );
    }

    if (title.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: '无权删除此标题' },
        { status: 403 }
      );
    }

    // 删除标题
    await prisma.titleLibrary.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
      message: '标题已删除',
    });
  } catch (error) {
    console.error('删除标题失败:', error);
    return NextResponse.json(
      { success: false, error: '删除标题失败' },
      { status: 500 }
    );
  }
} 