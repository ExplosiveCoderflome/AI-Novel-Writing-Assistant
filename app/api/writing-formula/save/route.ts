import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

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

// 请求验证模式
const saveFormulaSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, '名称不能为空'),
  sourceText: z.string().min(1, '源文本不能为空'),
  genre: z.string().optional(),
  style: z.string().optional(),
  toneVoice: z.string().optional(),
  structure: z.string().optional(),
  pacing: z.string().optional(),
  paragraphPattern: z.string().optional(),
  sentenceStructure: z.string().optional(),
  vocabularyLevel: z.string().optional(),
  rhetoricalDevices: z.string().optional(),
  narrativeMode: z.string().optional(),
  perspectivePoint: z.string().optional(),
  characterVoice: z.string().optional(),
  themes: z.string().optional(),
  motifs: z.string().optional(),
  emotionalTone: z.string().optional(),
  uniqueFeatures: z.string().optional(),
  formulaDescription: z.string().optional(),
  formulaSteps: z.string().optional(),
  applicationTips: z.string().optional(),
  userId: z.string().optional(),
});

/**
 * 保存写作公式API端点
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // 验证请求数据
    const validatedData = saveFormulaSchema.parse(body);
    
    let result;
    
    if (validatedData.id) {
      // 更新现有公式
      await prisma.$executeRaw`
        UPDATE writing_formulas
        SET 
          name = ${validatedData.name},
          sourceText = ${validatedData.sourceText},
          genre = ${validatedData.genre || ''},
          style = ${validatedData.style || ''},
          toneVoice = ${validatedData.toneVoice || ''},
          structure = ${validatedData.structure || ''},
          pacing = ${validatedData.pacing || ''},
          paragraphPattern = ${validatedData.paragraphPattern || ''},
          sentenceStructure = ${validatedData.sentenceStructure || ''},
          vocabularyLevel = ${validatedData.vocabularyLevel || ''},
          rhetoricalDevices = ${validatedData.rhetoricalDevices || ''},
          narrativeMode = ${validatedData.narrativeMode || ''},
          perspectivePoint = ${validatedData.perspectivePoint || ''},
          characterVoice = ${validatedData.characterVoice || ''},
          themes = ${validatedData.themes || ''},
          motifs = ${validatedData.motifs || ''},
          emotionalTone = ${validatedData.emotionalTone || ''},
          uniqueFeatures = ${validatedData.uniqueFeatures || ''},
          formulaDescription = ${validatedData.formulaDescription || ''},
          formulaSteps = ${validatedData.formulaSteps || ''},
          applicationTips = ${validatedData.applicationTips || ''},
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${validatedData.id}
      `;
      
      // 获取更新后的记录
      const resultsData = await prisma.$queryRaw`
        SELECT * FROM writing_formulas WHERE id = ${validatedData.id} LIMIT 1
      `;
      result = Array.isArray(resultsData) && resultsData.length > 0 
        ? resultsData[0] 
        : null;
    } else {
      // 生成新ID
      const id = uuidv4();
      
      // 创建新公式
      await prisma.$executeRaw`
        INSERT INTO writing_formulas (
          id, name, sourceText, genre, style, toneVoice, structure, pacing, 
          paragraphPattern, sentenceStructure, vocabularyLevel, rhetoricalDevices, 
          narrativeMode, perspectivePoint, characterVoice, themes, motifs, 
          emotionalTone, uniqueFeatures, formulaDescription, formulaSteps, 
          applicationTips, userId, createdAt, updatedAt
        ) VALUES (
          ${id}, ${validatedData.name}, ${validatedData.sourceText}, 
          ${validatedData.genre || ''}, ${validatedData.style || ''}, ${validatedData.toneVoice || ''}, 
          ${validatedData.structure || ''}, ${validatedData.pacing || ''}, ${validatedData.paragraphPattern || ''}, 
          ${validatedData.sentenceStructure || ''}, ${validatedData.vocabularyLevel || ''}, 
          ${validatedData.rhetoricalDevices || ''}, ${validatedData.narrativeMode || ''}, 
          ${validatedData.perspectivePoint || ''}, ${validatedData.characterVoice || ''}, 
          ${validatedData.themes || ''}, ${validatedData.motifs || ''}, ${validatedData.emotionalTone || ''}, 
          ${validatedData.uniqueFeatures || ''}, ${validatedData.formulaDescription || ''}, 
          ${validatedData.formulaSteps || ''}, ${validatedData.applicationTips || ''}, 
          ${validatedData.userId || ''}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;
      
      // 获取新创建的记录
      const resultsData = await prisma.$queryRaw`
        SELECT * FROM writing_formulas WHERE id = ${id} LIMIT 1
      `;
      result = Array.isArray(resultsData) && resultsData.length > 0 
        ? resultsData[0] 
        : null;
    }

    // 处理 BigInt 值
    const processedResult = processBigIntValues(result);

    // 关闭Prisma客户端连接
    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      data: processedResult,
      message: validatedData.id ? '写作公式更新成功' : '写作公式创建成功',
    });
  } catch (error) {
    console.error('保存写作公式失败:', error);
    
    // 关闭Prisma客户端连接
    await prisma.$disconnect();
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: '数据验证失败',
          details: error.errors,
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      {
        success: false,
        error: '保存写作公式失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
} 