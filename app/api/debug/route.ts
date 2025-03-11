import { NextResponse } from 'next/server';
import { prisma } from '../../lib/prisma';

export async function GET() {
  try {
    // 查询指定ID的写作公式
    const formula = await prisma.writingFormula.findUnique({
      where: { id: 'cd80acdc-849d-480d-a616-b0bb8906efe0' }
    });
    
    // 如果没有找到，查询所有写作公式
    if (!formula) {
      const allFormulas = await prisma.writingFormula.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true
        },
        take: 10
      });
      
      return NextResponse.json({
        message: '未找到指定ID的写作公式',
        allFormulas
      });
    }
    
    return NextResponse.json({
      formula
    });
  } catch (error) {
    console.error('查询出错:', error);
    return NextResponse.json(
      {
        error: '查询失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
} 