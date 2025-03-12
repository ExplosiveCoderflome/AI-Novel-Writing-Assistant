import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 直接创建一个新的Prisma客户端实例
const prisma = new PrismaClient();

/**
 * 删除写作公式API端点
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // 查询写作公式是否存在
    const formulasResult = await prisma.$queryRaw`
      SELECT id FROM writing_formulas WHERE id = ${id} LIMIT 1
    `;
    
    // 将结果转换为数组并获取第一个元素
    const formula = Array.isArray(formulasResult) && formulasResult.length > 0 
      ? formulasResult[0] 
      : null;

    if (!formula) {
      // 关闭Prisma客户端连接
      await prisma.$disconnect();
      
      return NextResponse.json(
        {
          success: false,
          error: '写作公式不存在',
        },
        { status: 404 }
      );
    }

    // 删除写作公式
    await prisma.$executeRaw`
      DELETE FROM writing_formulas WHERE id = ${id}
    `;

    // 关闭Prisma客户端连接
    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      message: '写作公式删除成功',
    });
  } catch (error) {
    // 修正错误处理以避免null参数
    const errorMessage = error instanceof Error 
      ? error.message 
      : "未知错误";
    console.error('删除写作公式失败:', { error: errorMessage });
    
    // 关闭Prisma客户端连接
    await prisma.$disconnect();
    
    return NextResponse.json(
      {
        success: false,
        error: '删除写作公式失败',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
} 