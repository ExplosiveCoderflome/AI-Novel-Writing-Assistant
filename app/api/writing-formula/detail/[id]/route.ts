import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 直接创建一个新的Prisma客户端实例
const prisma = new PrismaClient();

/**
 * 处理 BigInt 序列化问题的辅助函数
 * 将查询结果中的 BigInt 转换为字符串或数字
 */
function processBigIntValues(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data === 'bigint') {
    // 将 BigInt 转换为字符串或数字
    return data.toString();
  }
  
  if (Array.isArray(data)) {
    return data.map(item => processBigIntValues(item));
  }
  
  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = processBigIntValues(data[key]);
      }
    }
    return result;
  }
  
  return data;
}

/**
 * 获取写作公式详情API端点
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // 查询写作公式详情
    const formulasResult = await prisma.$queryRaw`
      SELECT * FROM writing_formulas WHERE id = ${id} LIMIT 1
    `;
    
    // 将结果转换为数组并获取第一个元素
    const formula = Array.isArray(formulasResult) && formulasResult.length > 0 
      ? formulasResult[0] 
      : null;

    // 关闭Prisma客户端连接
    await prisma.$disconnect();

    if (!formula) {
      return NextResponse.json(
        {
          success: false,
          error: '写作公式不存在',
        },
        { status: 404 }
      );
    }

    // 处理 BigInt 值
    const processedFormula = processBigIntValues(formula);

    return NextResponse.json({
      success: true,
      data: processedFormula,
    });
  } catch (error) {
    // 修正错误处理以避免null参数
    const errorMessage = error instanceof Error 
      ? error.message 
      : "未知错误";
    console.error('获取写作公式详情失败:', { error: errorMessage });
    
    // 关闭Prisma客户端连接
    await prisma.$disconnect();
    
    return NextResponse.json(
      {
        success: false,
        error: '获取写作公式详情失败',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
} 