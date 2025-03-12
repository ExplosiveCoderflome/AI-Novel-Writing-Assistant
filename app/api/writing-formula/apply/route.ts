import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';
import { ChatDeepSeek } from '@langchain/deepseek';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { CallbackManager } from "@langchain/core/callbacks/manager";

// 直接创建一个新的Prisma客户端实例
const prisma = new PrismaClient();

// 请求验证模式
const applyFormulaSchema = z.object({
  formulaId: z.string().min(1, '公式ID不能为空'),
  inputText: z.string().min(1, '输入文本不能为空'),
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().optional().default(0.7),
  maxTokens: z.number().optional().default(4000),
  systemPrompt: z.string().optional(),
});

// 默认写作公式应用提示词
const DEFAULT_FORMULA_APPLICATION_PROMPT = `你是一位专业的写作助手，能够按照特定的写作风格改写文本。
请按照以下写作公式，改写用户提供的文本：

写作风格概述：
{summary}

写作技巧：
{techniques}

风格指南：
{styleGuide}

应用提示：
{applicationTips}

请确保改写后的文本保持原文的核心意思，但风格应该符合上述写作公式的特点。
不要简单地复制原文，而是要真正按照指定的风格进行创造性改写。`;

/**
 * 写作公式应用API端点
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // 验证请求数据
    const validatedData = applyFormulaSchema.parse(body);
    
    // 查询写作公式
    const formulaResult = await prisma.$queryRaw`
      SELECT * FROM writing_formulas WHERE id = ${validatedData.formulaId}
    `;
    
    const formula = Array.isArray(formulaResult) && formulaResult.length > 0 
      ? formulaResult[0] 
      : null;
    
    if (!formula) {
      await prisma.$disconnect();
      return NextResponse.json(
        { success: false, error: '找不到指定的写作公式' },
        { status: 404 }
      );
    }
    
    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // 声明 writerClosed 变量
    let writerClosed = false;
    
    // 创建回调管理器
    const callbacks = CallbackManager.fromHandlers({
      async handleLLMNewToken(token) {
        if (!writerClosed) {
          try {
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "content",
                  choices: [{ delta: { content: token } }]
                })}\n\n`
              )
            );
          } catch (error) {
            console.error("写入令牌失败:", error);
            writerClosed = true;
          }
        }
      },
      async handleLLMEnd() {
        if (!writerClosed) {
          try {
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            writerClosed = true;
            await writer.close();
          } catch (error) {
            console.error("关闭流失败:", error);
            writerClosed = true;
          }
        }
      },
      async handleLLMError(error: Error) {
        console.error("LLM错误:", error);
        if (!writerClosed) {
          try {
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: error.message || "模型处理出错"
                })}\n\n`
              )
            );
            writerClosed = true;
            await writer.close();
          } catch (writeError) {
            console.error("写入错误信息失败:", writeError);
            writerClosed = true;
          }
        }
      }
    });
    
    // 根据提供商选择模型
    let model;
    const provider = validatedData.provider || 'openai';
    const modelName = validatedData.model || 'gpt-3.5-turbo';
    const temperature = validatedData.temperature || 0.7;
    const maxTokens = validatedData.maxTokens || 4000;
    
    if (provider === 'deepseek') {
      model = new ChatDeepSeek({
        modelName: modelName,
        temperature: temperature,
        maxTokens: maxTokens,
        apiKey: process.env.DEEPSEEK_API_KEY,
        streaming: true,
        verbose: true,
        timeout: 300000, // 5分钟超时
      });
      console.log(`使用 DeepSeek 模型: ${modelName}`);
    } else {
      // 默认使用 OpenAI
      model = new ChatOpenAI({
        modelName: modelName,
        temperature: temperature,
        maxTokens: maxTokens,
        apiKey: process.env.OPENAI_API_KEY,
        streaming: true,
        verbose: true,
        timeout: 300000, // 5分钟超时
      });
      console.log(`使用 OpenAI 模型: ${modelName}`);
    }
    
    // 构建提示
    let systemPromptContent = validatedData.systemPrompt;
    
    if (!systemPromptContent) {
      // 检查是否有新格式的content字段
      if (formula.content) {
        // 使用新格式的Markdown内容
        systemPromptContent = `你是一位专业的写作助手，能够按照特定的写作风格改写文本。
请按照以下写作公式，改写用户提供的文本：

写作公式：
${formula.content}

请确保改写后的文本保持原文的核心意思，但风格应该符合上述写作公式的特点。
不要简单地复制原文，而是要真正按照指定的风格进行创造性改写。`;
      } else if (formula.analysis) {
        // 兼容旧格式，使用analysis字段
        const analysis = formula.analysis;
        
        // 构建默认系统提示词
        systemPromptContent = DEFAULT_FORMULA_APPLICATION_PROMPT;
        
        // 替换占位符
        systemPromptContent = systemPromptContent.replace('{summary}', analysis.summary || '未提供');
        systemPromptContent = systemPromptContent.replace('{techniques}', JSON.stringify(analysis.techniques || [], null, 2));
        systemPromptContent = systemPromptContent.replace('{styleGuide}', JSON.stringify(analysis.styleGuide || {}, null, 2));
        systemPromptContent = systemPromptContent.replace('{applicationTips}', JSON.stringify(analysis.applicationTips || [], null, 2));
      } else {
        // 如果两种格式都没有，返回错误
        await prisma.$disconnect();
        return NextResponse.json(
          { success: false, error: '写作公式格式不正确或缺少内容' },
          { status: 400 }
        );
      }
    }

    const messages = [
      new SystemMessage(systemPromptContent),
      new HumanMessage(`请按照上述写作公式改写以下文本：\n\n${validatedData.inputText}`),
    ];
    
    // 异步调用模型
    (async () => {
      try {
        console.log(`开始调用 ${provider.toUpperCase()} API，应用写作公式`);
        
        // 调用模型
        await model.call(messages, { callbacks });
        
        console.log('写作公式应用完成');
      } catch (error: unknown) {
        // 修正错误处理以避免null参数
        const errorMessage = error instanceof Error 
          ? error.message 
          : "未知错误";
        console.error('应用写作公式失败:', { error: errorMessage });
        
        // 只有在 writer 未关闭时才尝试写入错误信息
        if (!writerClosed) {
          try {
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: `应用写作公式失败: ${errorMessage}`
                })}\n\n`
              )
            );
            writerClosed = true;
            await writer.close();
          } catch (writeError) {
            const writeErrorMsg = writeError instanceof Error 
              ? writeError.message 
              : '未知错误';
            console.error('写入错误信息到流失败:', { error: writeErrorMsg });
          }
        }
      } finally {
        // 确保断开Prisma连接
        await prisma.$disconnect();
        
        // 确保流被关闭
        if (!writerClosed) {
          try {
            await writer.close();
          } catch (closeError) {
            console.error('关闭流失败:', closeError);
          }
        }
      }
    })();
    
    // 返回流式响应
    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    // 修正错误处理以避免null参数
    const errorMessage = error instanceof Error 
      ? error.message 
      : "未知错误";
    console.error('处理请求失败:', { error: errorMessage });
    
    // 确保断开Prisma连接
    await prisma.$disconnect();
    
    return NextResponse.json(
      { success: false, error: '应用写作公式失败', details: errorMessage },
      { status: 500 }
    );
  }
} 