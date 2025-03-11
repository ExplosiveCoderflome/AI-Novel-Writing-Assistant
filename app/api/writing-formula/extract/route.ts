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
const extractFormulaSchema = z.object({
  sourceText: z.string().min(1, '源文本不能为空'),
  name: z.string().min(1, '公式名称不能为空'),
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().optional().default(0.7),
  maxTokens: z.number().optional().default(4000),
  systemPrompt: z.string().optional(),
});

// 默认写作公式提取提示词
const DEFAULT_FORMULA_EXTRACTION_PROMPT = `你是一个专业的写作风格分析专家，擅长分析文本中的写作技巧和风格特点。
请分析以下文本，提取其中的写作公式，包括但不限于：

1. 语言风格特点（如：华丽、简洁、幽默、正式等）
2. 句式结构特点（如：长短句搭配、排比、设问等）
3. 修辞手法（如：比喻、拟人、夸张等）
4. 叙事视角（如：第一人称、第三人称、全知视角等）
5. 情感表达方式（如：直接抒情、含蓄暗示等）
6. 节奏控制（如：快慢节奏变化、停顿等）
7. 特殊词汇选择（如：专业术语、方言、古语等）
8. 意象和符号运用
9. 其他独特的写作技巧

请以JSON格式返回分析结果，格式如下：
{
  "summary": "对整体写作风格的简要总结（100-200字）",
  "techniques": [
    {
      "name": "技巧名称",
      "description": "技巧详细描述",
      "examples": ["文本中的例子1", "文本中的例子2"]
    }
  ],
  "styleGuide": {
    "vocabulary": "词汇选择特点",
    "sentenceStructure": "句式结构特点",
    "tone": "语气特点",
    "rhythm": "节奏特点"
  },
  "applicationTips": [
    "如何应用这种写作风格的建议1",
    "如何应用这种写作风格的建议2"
  ]
}

请确保分析深入、专业，并提供具体的文本例证。`;

/**
 * 写作公式提取API端点
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // 验证请求数据
    const validatedData = extractFormulaSchema.parse(body);
    
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
    
    // 使用自定义系统提示词或默认提示词
    const systemPromptContent = validatedData.systemPrompt || DEFAULT_FORMULA_EXTRACTION_PROMPT;
    
    // 构建提示
    const messages = [
      new SystemMessage(systemPromptContent),
      new HumanMessage(validatedData.sourceText),
    ];
    
    // 异步调用模型
    (async () => {
      try {
        console.log(`开始调用 ${provider.toUpperCase()} API，提取写作公式`);
        
        // 调用模型
        const response = await model.call(messages, { callbacks });
        
        // 解析响应
        let analysis;
        try {
          // 将 response.content 转换为字符串
          const contentStr = typeof response.content === 'string' 
            ? response.content 
            : JSON.stringify(response.content);
          
          analysis = JSON.parse(contentStr);
        } catch (error: unknown) {
          console.error('解析模型响应失败:', error);
          throw new Error('解析模型响应失败');
        }
        
        // 保存到数据库
        await prisma.$executeRaw`
          INSERT INTO writing_formulas (name, source_text, analysis, created_at, updated_at)
          VALUES (${validatedData.name}, ${validatedData.sourceText}, ${JSON.stringify(analysis)}, NOW(), NOW())
        `;
        
        console.log('写作公式提取完成并保存到数据库');
      } catch (error: unknown) {
        console.error('提取写作公式失败:', error);
        
        // 只有在 writer 未关闭时才尝试写入错误信息
        if (!writerClosed) {
          try {
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: `提取写作公式失败: ${error instanceof Error ? error.message : "未知错误"}`
                })}\n\n`
              )
            );
            writerClosed = true;
            await writer.close();
          } catch (writeError) {
            console.error('写入错误信息到流失败:', writeError);
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
    console.error('处理请求失败:', error);
    
    // 确保断开Prisma连接
    await prisma.$disconnect();
    
    return NextResponse.json(
      { success: false, error: '提取写作公式失败', details: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
} 