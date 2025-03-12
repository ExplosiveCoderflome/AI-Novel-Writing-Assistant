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
 * 获取写作公式列表API端点
 */
export async function GET(req: NextRequest) {
  try {
    // 获取查询参数
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';

    let formulas;
    let total;

    if (search) {
      // 带搜索条件的查询
      formulas = await prisma.$queryRaw`
        SELECT id, name, genre, style, toneVoice, content, createdAt, updatedAt
        FROM writing_formulas
        WHERE name LIKE ${'%' + search + '%'} 
           OR genre LIKE ${'%' + search + '%'} 
           OR style LIKE ${'%' + search + '%'}
           OR content LIKE ${'%' + search + '%'}
        ORDER BY createdAt DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 获取总数
      const totalResult = await prisma.$queryRaw`
        SELECT COUNT(*) as count
        FROM writing_formulas
        WHERE name LIKE ${'%' + search + '%'} 
           OR genre LIKE ${'%' + search + '%'} 
           OR style LIKE ${'%' + search + '%'}
           OR content LIKE ${'%' + search + '%'}
      `;
      total = Array.isArray(totalResult) && totalResult.length > 0 && typeof totalResult[0] === 'object' && totalResult[0] !== null
        ? (totalResult[0] as any).count
        : 0;
    } else {
      // 不带搜索条件的查询
      formulas = await prisma.$queryRaw`
        SELECT id, name, genre, style, toneVoice, content, createdAt, updatedAt
        FROM writing_formulas
        ORDER BY createdAt DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 获取总数
      const totalResult = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM writing_formulas
      `;
      total = Array.isArray(totalResult) && totalResult.length > 0 && typeof totalResult[0] === 'object' && totalResult[0] !== null
        ? (totalResult[0] as any).count
        : 0;
    }

    // 处理 BigInt 值
    const processedFormulas = processBigIntValues(formulas);
    const processedTotal = processBigIntValues(total);

    // 关闭Prisma客户端连接
    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      data: {
        formulas: processedFormulas,
        total: processedTotal,
        limit,
        offset,
      },
    });
  } catch (error) {
    // 修正错误处理以避免null参数
    const errorMessage = error instanceof Error 
      ? error.message 
      : "未知错误";
    console.error('获取写作公式列表失败:', { error: errorMessage });
    
    // 关闭Prisma客户端连接
    await prisma.$disconnect();
    
    return NextResponse.json(
      {
        success: false,
        error: '获取写作公式列表失败',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
} 