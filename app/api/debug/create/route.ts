import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// 直接创建一个新的Prisma客户端实例
const prisma = new PrismaClient();

export async function GET() {
  try {
    // 创建一个测试写作公式记录
    const formula = await prisma.writingFormula.create({
      data: {
        name: '测试写作公式',
        sourceText: '这是一个测试文本，用于创建写作公式记录。',
        genre: '测试',
        style: '简洁',
        toneVoice: '正式',
        structure: '线性',
        pacing: '平稳',
        paragraphPattern: '短段落',
        sentenceStructure: '简单句为主',
        vocabularyLevel: '基础',
        rhetoricalDevices: JSON.stringify(['比喻', '排比']),
        narrativeMode: '第三人称',
        perspectivePoint: '全知视角',
        characterVoice: '客观',
        themes: JSON.stringify(['测试', '示例']),
        motifs: JSON.stringify(['循环', '重复']),
        emotionalTone: '中性',
        uniqueFeatures: JSON.stringify(['简单', '清晰']),
        formulaDescription: '这是一个用于测试的写作公式',
        formulaSteps: JSON.stringify(['步骤1', '步骤2']),
        applicationTips: JSON.stringify(['提示1', '提示2']),
        userId: 'system',
      },
    });
    
    return NextResponse.json({
      success: true,
      message: '创建成功',
      formula
    });
  } catch (error) {
    console.error('创建失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '创建失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
} 