import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

/**
 * 获取写作公式详情API端点
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 查询写作公式详情
    const formula = await prisma.writingFormula.findUnique({
      where: { id },
    });

    if (!formula) {
      return NextResponse.json(
        {
          success: false,
          error: '写作公式不存在',
        },
        { status: 404 }
      );
    }

    // 解析JSON字符串字段
    const parsedFormula = {
      ...formula,
      rhetoricalDevices: JSON.parse(formula.rhetoricalDevices || '[]'),
      themes: JSON.parse(formula.themes || '[]'),
      motifs: JSON.parse(formula.motifs || '[]'),
      uniqueFeatures: JSON.parse(formula.uniqueFeatures || '[]'),
      formulaSteps: JSON.parse(formula.formulaSteps || '[]'),
      applicationTips: JSON.parse(formula.applicationTips || '[]'),
    };

    return NextResponse.json({
      success: true,
      data: parsedFormula,
    });
  } catch (error) {
    console.error('获取写作公式详情失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取写作公式详情失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除写作公式API端点
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // 检查写作公式是否存在
    const formula = await prisma.writingFormula.findUnique({
      where: { id },
    });

    if (!formula) {
      return NextResponse.json(
        {
          success: false,
          error: '写作公式不存在',
        },
        { status: 404 }
      );
    }

    // 删除写作公式
    await prisma.writingFormula.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: '写作公式已删除',
    });
  } catch (error) {
    console.error('删除写作公式失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '删除写作公式失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
} 