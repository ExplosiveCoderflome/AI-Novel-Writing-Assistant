import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Chapter } from '@prisma/client';

interface RequestData {
  id: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  currentContent: string;
  provider: string;
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export async function POST(request: NextRequest) {
  try {
    const data: RequestData = await request.json();

    // 验证必要参数
    if (!data.id || !data.chapterId || !data.provider || !data.model) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 获取小说信息
    const novel = await prisma.novel.findUnique({
      where: {
        id: data.id
      },
      include: {
        chapters: true
      }
    });

    if (!novel) {
      return NextResponse.json(
        { error: '小说不存在' },
        { status: 404 }
      );
    }

    // 获取章节信息
    const chapter = await prisma.chapter.findUnique({
      where: {
        id: data.chapterId,
        novelId: data.id
      }
    });

    if (!chapter) {
      return NextResponse.json(
        { error: '章节不存在' },
        { status: 404 }
      );
    }

    // 获取小说的其他信息
    const outline = novel.outline || '';

    // 构建章节前后文关系
    const surroundingChapters = await prisma.chapter.findMany({
      where: {
        novelId: data.id,
        order: {
          in: [data.chapterOrder - 1, data.chapterOrder + 1]
        }
      }
    });

    const prevChapter = surroundingChapters.find((c: Chapter) => c.order === data.chapterOrder - 1);
    const nextChapter = surroundingChapters.find((c: Chapter) => c.order === data.chapterOrder + 1);
    
    // 构建提示词
    let systemPrompt = `你是一位专业的小说内容创作助手，负责帮助作者生成小说章节内容。`;
    systemPrompt += `\n\n你需要生成第 ${data.chapterOrder} 章《${data.chapterTitle}》的详细内容。`;
    
    // 添加小说基础信息
    systemPrompt += `\n\n小说标题: ${novel.title}`;
    systemPrompt += `\n小说描述: ${novel.description || ''}`;
    
    // 添加大纲信息
    if (outline) {
      systemPrompt += `\n\n小说大纲:\n${outline}`;
    }
    
    // 添加章节上下文
    if (prevChapter) {
      systemPrompt += `\n\n前一章 (第 ${prevChapter.order} 章《${prevChapter.title}》) 内容概要:`;
      systemPrompt += `\n${prevChapter.content.substring(0, 500)}${prevChapter.content.length > 500 ? '...' : ''}`;
    }
    
    if (nextChapter) {
      systemPrompt += `\n\n后一章 (第 ${nextChapter.order} 章《${nextChapter.title}》) 内容概要:`;
      systemPrompt += `\n${nextChapter.content.substring(0, 500)}${nextChapter.content.length > 500 ? '...' : ''}`;
    }
    
    // 当前章节已有内容
    if (data.currentContent) {
      systemPrompt += `\n\n当前章节已有内容:\n${data.currentContent}`;
      systemPrompt += `\n\n请在已有内容的基础上进行扩展、优化或重写，保持小说风格一致。`;
    } else {
      systemPrompt += `\n\n请根据章节标题和上下文，创作完整的章节内容。`;
    }
    
    // 创作要求
    systemPrompt += `\n\n创作要求:
1. 内容要符合章节标题的主题
2. 保持人物性格和情节的连贯性
3. 使用生动的描写和对话，避免过多内心独白
4. 注意场景描写的细节和节奏感
5. 每章至少3000字以上，确保内容充实
6. 在章节末尾设置适当的悬念，引导读者继续阅读`;

    // 用户提供的额外提示
    const userPrompt = data.prompt || "请根据上述信息，创作这一章的内容。";
    
    // 调用LLM API
    const llmResponse = await fetch('/api/llm/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: data.provider,
        model: data.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: data.temperature || 0.7,
        max_tokens: data.maxTokens || 8000,
      }),
    });
    
    if (!llmResponse.ok) {
      const errorData = await llmResponse.json();
      console.error('LLM API错误:', errorData);
      return NextResponse.json(
        { error: 'LLM生成失败' },
        { status: 500 }
      );
    }
    
    const llmData = await llmResponse.json();
    let generatedContent = "";
    
    if (llmData.choices && llmData.choices.length > 0) {
      generatedContent = llmData.choices[0].message.content;
    } else {
      throw new Error('无效的LLM响应');
    }
    
    return NextResponse.json({ content: generatedContent });
  } catch (error) {
    console.error('生成章节内容失败:', error);
    return NextResponse.json(
      { error: '生成章节内容失败' },
      { status: 500 }
    );
  }
} 