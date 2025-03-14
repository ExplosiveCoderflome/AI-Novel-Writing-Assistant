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
  isGenerationMode: z.boolean().optional().default(false),
  wordCount: z.number().optional(),
  wordCountRange: z.array(z.number()).length(2).optional(),
});

// 默认写作公式应用提示词 - 修改为更简洁的指令
const DEFAULT_FORMULA_APPLICATION_PROMPT = `你是一位专业的写作助手，能够按照特定的写作风格改写文本。
请按照以下写作公式，直接改写用户提供的文本：

写作风格概述：
{summary}

写作技巧：
{techniques}

风格指南：
{styleGuide}

应用提示：
{applicationTips}

请直接输出改写后的文本，保持原文的核心意思，但风格应符合上述写作公式的特点。
不要解释你的改写过程，只需要提供最终改写结果。
不要简单地复制原文，而是要真正按照指定的风格进行创造性改写。`;

// 新增的生成模式提示词模板
const DEFAULT_GENERATION_PROMPT = `你是一位专业的写作助手，能够按照特定的写作风格创作新内容。
请按照以下写作公式，根据用户提供的主题/想法创作新内容：

写作风格概述：
{summary}

写作技巧：
{techniques}

风格指南：
{styleGuide}

应用提示：
{applicationTips}

请根据用户提供的主题/想法，创作一篇符合上述写作风格的新文本。
生成的内容应该具有创意性、连贯性和可读性，同时完全符合指定的写作风格。
请严格控制文本长度在用户指定的字数范围内。`;

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
    const isGenerationMode = validatedData.isGenerationMode || false;
    const wordCount = validatedData.wordCount || 500;
    const wordCountRange = validatedData.wordCountRange || [wordCount - 50, wordCount + 50];
    
    // 处理不同模型类型的钩子
    const modelOptions: any = {
      modelName: modelName,
      temperature: temperature,
      maxTokens: maxTokens,
      streaming: true,
      verbose: true,
      timeout: 300000, // 5分钟超时
    };
    
    if (provider === 'deepseek') {
      // DeepSeek模型特有配置
      modelOptions.apiKey = process.env.DEEPSEEK_API_KEY;
      
      // 如果是reasoner模型，添加特殊处理
      if (modelName === "deepseek-reasoner") {
        console.log("检测到推理模型，启用思考过程处理");
        
        // 添加推理模型特定钩子
        // @ts-ignore - 钩子API类型定义暂不完整，但这是DeepSeek API支持的功能
        modelOptions.hooks = {
          async beforeRequestStream(options: any) {
            console.log("准备发送推理模型请求");
            return options;
          },
          
          async handleLLMStream(chunk: any) {
            try {
              // 解析流数据
              if (chunk?.choices?.[0]?.delta) {
                const delta = chunk.choices[0].delta;
                
                // 处理思考内容
                if (delta.reasoning_content) {
                  // 确保在发送思考内容前先清空一个空的content，以避免客户端卡住
                  if (!writerClosed) {
                    try {
                      // 然后发送实际的思考内容，直接使用reasoning类型
                      await writer.write(
                        encoder.encode(
                          `data: ${JSON.stringify({
                            type: "reasoning",
                            reasoning: delta.reasoning_content,
                            timestamp: Date.now()
                          })}\n\n`
                        )
                      );
                    } catch (error) {
                      console.error("写入思考内容失败:", error);
                    }
                  }
                }
                
                // 处理最终内容，只有当内容非空时才发送
                if (delta.content && delta.content.trim() !== '') {
                  if (!writerClosed) {
                    try {
                      await writer.write(
                        encoder.encode(
                          `data: ${JSON.stringify({
                            type: "content",
                            choices: [{ delta: { content: delta.content } }]
                          })}\n\n`
                        )
                      );
                    } catch (error) {
                      console.error("写入内容失败:", error);
                    }
                  }
                }
              }
              return true; // 继续处理流
            } catch (error) {
              console.error("处理推理模型流数据时出错:", error);
              return true; // 继续处理，不中断
            }
          }
        };
      }
      
      model = new ChatDeepSeek(modelOptions);
      console.log(`使用 DeepSeek 模型: ${modelName}`);
    } else {
      // OpenAI模型
      modelOptions.apiKey = process.env.OPENAI_API_KEY;
      model = new ChatOpenAI(modelOptions);
      console.log(`使用 OpenAI 模型: ${modelName}`);
    }
    
    // 构建系统提示词
    let systemPromptContent = validatedData.systemPrompt;
    
    if (!systemPromptContent) {
      // 选择适当的模板
      const templatePrompt = isGenerationMode ? DEFAULT_GENERATION_PROMPT : DEFAULT_FORMULA_APPLICATION_PROMPT;
      
      // 检查是否有新格式的content字段
      if (formula.content) {
        // 使用新格式的Markdown内容
        systemPromptContent = isGenerationMode
          ? `你是一位专业的写作助手，能够按照特定的写作风格创作新内容。
请按照以下写作公式，根据用户提供的主题/想法创作新内容：

写作公式：
${formula.content}

请根据用户提供的主题/想法，创作一篇符合上述写作风格的新文本。
生成的内容应该具有创意性、连贯性和可读性，同时完全符合指定的写作风格。
请严格控制文本长度在用户指定的字数范围内。`
          : `你是一位专业的写作助手，能够按照特定的写作风格改写文本。
请按照以下写作公式，直接改写用户提供的文本：

写作公式：
${formula.content}

请直接输出改写后的文本，保持原文的核心意思，但风格应符合上述写作公式的特点。
不要解释你的改写过程，只需要提供最终改写结果。
不要简单地复制原文，而是要真正按照指定的风格进行创造性改写。`;
      } else if (formula.analysis) {
        // 兼容旧格式，使用analysis字段
        const analysis = formula.analysis;
        
        // 构建默认系统提示词
        systemPromptContent = templatePrompt;
        
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

    // 构建用户提示，根据模式不同
    let userPrompt = '';
    if (isGenerationMode) {
      userPrompt = `请根据以下主题/想法，创作一篇符合上述写作风格的新文本：\n\n${validatedData.inputText}\n\n`;
      
      // 添加字数要求
      userPrompt += `要求：\n1. 内容字数控制在${wordCountRange[0]}-${wordCountRange[1]}字之间，尽量接近${wordCount}字\n`;
      userPrompt += `2. 完全符合上述写作公式的风格特点\n3. 内容应具有连贯性、可读性和创意性`;
    } else {
      userPrompt = `请按照上述写作公式改写以下文本：\n\n${validatedData.inputText}`;
    }

    // 如果是推理模型，添加额外的指导
    if (provider === 'deepseek' && modelName === 'deepseek-reasoner') {
      // 为推理模型添加额外指导，确保它先思考再生成内容
      userPrompt += `\n\n请先详细分析这个${isGenerationMode ? '创作' : '改写'}任务：
1. 分析写作公式的关键特点和风格要求
2. 思考如何将这些特点应用到${isGenerationMode ? '新内容创作中' : '改写中'}
3. 详细构思${isGenerationMode ? '创作内容的结构和关键点' : '如何调整原文以符合目标风格'}
4. 最后生成符合要求的${isGenerationMode ? '新内容' : '改写文本'}

请在thinking阶段详细思考，但最终只输出结果文本，不要包含你的思考过程。`;
    }

    const messages = [
      new SystemMessage(systemPromptContent),
      new HumanMessage(userPrompt),
    ];
    
    // 记录请求信息
    console.log(`开始处理${isGenerationMode ? '内容生成' : '文本改写'}请求:`);
    console.log(`- 使用${provider.toUpperCase()}的${modelName}模型`);
    if (isGenerationMode) {
      console.log(`- 目标字数: ${wordCount}字 (${wordCountRange[0]}-${wordCountRange[1]})`);
    }
    console.log(`- 输入文本长度: ${validatedData.inputText.length}字符`);
    
    // 打印完整的API参数
    console.log('\n============ LLM API 调用参数 ============');
    console.log('提供商:', provider);
    console.log('模型名称:', modelName);
    console.log('温度:', temperature);
    console.log('最大Token数:', maxTokens);
    console.log('模式:', isGenerationMode ? '内容生成' : '文本改写');
    
    // 打印模型选项
    console.log('\n模型选项:');
    console.log(JSON.stringify(modelOptions, null, 2));
    
    // 打印消息内容
    console.log('\n系统提示词 (截取前500字符):');
    console.log(systemPromptContent.substring(0, 500) + (systemPromptContent.length > 500 ? '...' : ''));
    
    console.log('\n用户提示词 (截取前500字符):');
    console.log(userPrompt.substring(0, 500) + (userPrompt.length > 500 ? '...' : ''));
    
    // 打印完整的消息数组结构
    console.log('\n消息数组结构:');
    console.log(JSON.stringify(messages.map(msg => ({
      role: msg._getType(),
      contentLength: msg.content.length
    })), null, 2));
    
    // 如果是生成模式，打印字数要求
    if (isGenerationMode) {
      console.log('\n字数要求:');
      console.log(`- 目标字数: ${wordCount}`);
      console.log(`- 允许范围: ${wordCountRange[0]}-${wordCountRange[1]}`);
    }
    
    // 如果是deepseek-reasoner，打印钩子信息
    if (provider === 'deepseek' && modelName === 'deepseek-reasoner') {
      console.log('\n推理模型钩子已启用:');
      console.log('- 支持思考过程(reasoning_content)流式输出');
    }
    
    console.log('==========================================\n');
    
    // 异步调用模型
    (async () => {
      try {
        console.log(`开始调用 ${provider.toUpperCase()} API，${isGenerationMode ? '生成内容' : '应用写作公式'}`);
        
        // 特殊处理reasoner模型
        if (provider === 'deepseek' && modelName === 'deepseek-reasoner') {
          // 首先向客户端发送一个思考开始信号
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "reasoning",
                reasoning: "开始进行任务分析...\n",
                timestamp: Date.now()
              })}\n\n`
            )
          );
          
          // 每10秒发送一个思考状态更新，告知用户AI仍在思考
          const thinkingInterval = setInterval(async () => {
            if (!writerClosed) {
              const thinkingMessages = [
                "正在分析写作公式的关键特点...",
                "正在思考如何应用写作风格...",
                "正在构思内容结构和表达方式...",
                "正在优化语言表达以符合风格要求...",
                "正在进行最终调整，即将完成..."
              ];
              const randomIndex = Math.floor(Math.random() * thinkingMessages.length);
              
              try {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "reasoning",
                      reasoning: thinkingMessages[randomIndex] + "\n",
                      timestamp: Date.now()
                    })}\n\n`
                  )
                );
              } catch (error) {
                clearInterval(thinkingInterval);
              }
            } else {
              clearInterval(thinkingInterval);
            }
          }, 10000);
          
          // 确保在最终响应完成后清除定时器
          setTimeout(() => clearInterval(thinkingInterval), 300000); // 最长5分钟后强制清除
        }
        
        // 调用模型
        await model.call(messages, { callbacks });
        
        console.log(isGenerationMode ? '内容生成完成' : '写作公式应用完成');
      } catch (error: unknown) {
        // 修正错误处理以避免null参数
        const errorMessage = error instanceof Error 
          ? error.message 
          : "未知错误";
        console.error(isGenerationMode ? '生成内容失败:' : '应用写作公式失败:', { error: errorMessage });
        
        // 只有在 writer 未关闭时才尝试写入错误信息
        if (!writerClosed) {
          try {
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  error: `${isGenerationMode ? '生成内容' : '应用写作公式'}失败: ${errorMessage}`
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
      { success: false, error: '处理请求失败', details: errorMessage },
      { status: 500 }
    );
  }
} 

