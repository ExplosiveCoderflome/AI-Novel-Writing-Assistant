import { NextRequest } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/options';
import { NovelOutline } from '../../../../types/novel';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { structuredOutline } = await request.json();
    const { id: novelId } = params;

    console.log('准备保存结构化大纲:', {
      novelId,
      userId: session.user.id,
      structuredOutlineReceived: !!structuredOutline
    });

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

    // 验证结构化大纲数据
    if (!structuredOutline || 
        !structuredOutline.core || 
        !structuredOutline.characters || 
        !structuredOutline.plotStructure) {
      return new Response(
        JSON.stringify({ error: '结构化大纲数据不完整' }),
        { status: 400 }
      );
    }

    console.log('结构化大纲数据验证成功，准备保存');

    // 更新结构化大纲
    const updatedNovel = await prisma.novel.update({
      where: {
        id: novelId
      },    
      data: {
        structuredOutline: JSON.stringify(structuredOutline)
      }
    });

    console.log('结构化大纲保存成功');

    return new Response(
      JSON.stringify({
        success: true,
        message: '结构化大纲已保存'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('保存结构化大纲失败:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : '保存结构化大纲失败',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// 获取结构化大纲
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId } = params;
    console.log('获取结构化大纲，小说ID:', novelId);

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

    console.log('找到小说:', {
      id: novel.id,
      title: novel.title,
      hasStructuredOutline: !!novel.structuredOutline
    });

    let structuredOutline: NovelOutline | null = null;

    // 解析结构化大纲
    if (novel.structuredOutline) {
      try {
        console.log('解析结构化大纲数据，类型:', typeof novel.structuredOutline);
        structuredOutline = JSON.parse(novel.structuredOutline as string);
        console.log('解析成功，包含核心设定:', !!structuredOutline?.core);
      } catch (e) {
        console.warn('解析结构化大纲失败:', e);
      }
    } else {
      console.log('小说没有结构化大纲数据');
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: structuredOutline
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('获取结构化大纲失败:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : '获取结构化大纲失败',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { id: novelId } = params;
    const data = await request.json();
    
    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }
    
    // 这里处理POST请求的逻辑
    
    return new Response(
      JSON.stringify({
        success: true,
        message: '操作成功'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    
  } catch (error) {
    console.error('处理请求失败:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : '处理请求失败',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
} 