import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ChatDeepSeek } from "@langchain/deepseek";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import { Message } from '../../../types/chat';
import { processMessageWithWebSearch } from '../../../lib/services/webSearchService';

// API超时设置 - 5分钟
export const maxDuration = 300; // 单位：秒

// 请求体验证schema
const chatRequestSchema = z.object({
  provider: z.string(),
  model: z.string(),
  prompt: z.string(),
  temperature: z.number().optional().default(0.7),
  maxTokens: z.number().optional(),
  systemPrompt: z.string().optional(), // 添加系统提示词字段
  agentMode: z.boolean().optional().default(false), // 添加智能体模式字段
  autoWebSearch: z.boolean().optional().default(true), // 添加自动联网搜索字段
  searchProvider: z.enum(['serpapi', 'exa']).optional().default('serpapi'), // 添加搜索提供商字段
  contextHistory: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string().or(z.date()).transform(val => 
      typeof val === 'string' ? new Date(val) : val
    )
  })).optional(),
});

// 默认系统提示词（如果请求中未提供）
const DEFAULT_SYSTEM_PROMPT = `你是一位专业的小说创作助手，可以帮助用户进行小说创作、世界设定、角色设计等工作。
在回答时，请遵循以下原则：
1. 保持友好和专业的态度
2. 给出详细和有见地的回答
3. 结合文学创作理论和实践经验
4. 鼓励用户的创意，并给出建设性的建议
5. 如果用户的问题不够清晰，主动询问更多细节
6. 在合适的时候使用例子来说明观点
7. 避免生成有害或不当的内容
8. 使用Markdown格式来组织你的回答，包括标题、列表、代码块等

你擅长：
- 小说写作技巧指导
- 情节构思和发展建议
- 角色设计和发展
- 世界观构建
- 文风和语言风格建议
- 创作瓶颈突破
- 写作计划制定

请根据用户的具体需求提供相应的帮助。

## Markdown格式指南
- 使用 # ## ### 等标记标题层级
- 使用 * 或 - 创建无序列表
- 使用 1. 2. 3. 创建有序列表
- 使用 **文本** 标记粗体
- 使用 *文本* 标记斜体
- 使用 > 创建引用块
- 使用 \`\`\`语言\n代码\n\`\`\` 创建代码块
- 使用 \`代码\` 标记行内代码
- 使用 --- 创建分隔线
- 使用 [文本](链接) 创建链接

请充分利用Markdown格式，使你的回答更加结构化和易于阅读。`;

// DeepSeek模型名称常量 - 使用官方支持的名称
const DEEPSEEK_MODELS: Record<string, string> = {
  // 对话模型
  "deepseek-chat": "deepseek-chat",
  "deepseek/deepseek-chat": "deepseek-chat",
  // 编码模型
  "deepseek-coder": "deepseek-coder", 
  "deepseek/deepseek-coder": "deepseek-coder",
  // 推理模型 
  "deepseek-reasoner": "deepseek-reasoner", // 修正：使用真正的推理模型而不是替代
  "deepseek/deepseek-reasoner": "deepseek-reasoner", // 修正：使用真正的推理模型而不是替代
  // 回退默认
  "default": "deepseek-chat"
};

/**
 * 聊天API端点
 */
export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const body = await req.json();
    const validationResult = chatRequestSchema.safeParse(body);

    // 验证失败返回错误信息
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.message },
        { status: 400 }
      );
    }

    const { 
      provider, 
      model, 
      prompt, 
      temperature, 
      maxTokens, 
      contextHistory,
      systemPrompt,
      agentMode = false,
      autoWebSearch = true,
      searchProvider = 'serpapi'
    } = validationResult.data;

    // 在请求处理部分，打印接收到的系统提示词
    console.log(`接收到系统提示词: ${systemPrompt ? '是' : '否'}, 长度: ${systemPrompt?.length || 0}`);

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // 记录请求信息
    console.log(`开始处理DeepSeek请求, 模型: ${provider}/${model}, 温度: ${temperature}, 提示长度: ${prompt.length}, 历史消息数: ${contextHistory?.length || 0}, 智能体模式: ${agentMode}, 自动联网搜索: ${autoWebSearch}, 搜索提供商: ${searchProvider}`);

    // 如果启用了自动联网搜索，先尝试使用联网搜索处理
    if (autoWebSearch) {
      try {
        // 获取OpenAI API密钥
        const openAIApiKey = process.env.OPENAI_API_KEY;
        
        if (!openAIApiKey) {
          console.warn("未找到OpenAI API密钥，无法使用自动联网搜索功能");
        } else {
          console.log(`尝试使用联网搜索处理用户消息，搜索提供商: ${searchProvider}`);
          
          // 转换聊天历史格式
          const formattedHistory = contextHistory?.map(msg => ({
            role: msg.role,
            content: msg.content
          })) || [];
          
          // 处理用户消息
          const webSearchResult = await processMessageWithWebSearch(
            prompt,
            formattedHistory,
            openAIApiKey,
            searchProvider
          );
          
          // 如果联网搜索成功处理了消息
          if (webSearchResult.response) {
            console.log("联网搜索成功处理了消息");
            
            // 发送搜索信息
            if (webSearchResult.searchInfo.performed) {
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "search_info",
                    searchInfo: webSearchResult.searchInfo
                  })}\n\n`
                )
              );
            }
            
            // 发送响应内容
            const responseChunks = webSearchResult.response.split(/(?<=\n)/);
            for (const chunk of responseChunks) {
              if (chunk) {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "content",
                      choices: [{ delta: { content: chunk } }]
                    })}\n\n`
                  )
                );
                // 添加小延迟，模拟流式输出
                await new Promise(resolve => setTimeout(resolve, 10));
              }
            }
            
            await writer.write(encoder.encode("data: [DONE]\n\n"));
            await writer.close();
            
            return new Response(stream.readable, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
              },
            });
          }
          
          console.log("联网搜索未处理消息，回退到常规LLM处理");
        }
      } catch (error) {
        console.error("联网搜索处理失败，回退到常规LLM处理:", error);
      }
    }

    // 获取正确的模型名称 - 使用我们定义的常量映射
    const requestedModel = model.includes('/') ? model.split('/')[1] : model;
    const requestKey = requestedModel.toLowerCase();
    
    // 查找模型名称，如果找不到则使用默认值
    // 使用类型安全的访问方式
    const modelKey = requestKey in DEEPSEEK_MODELS ? requestKey : 
                   `deepseek/${requestKey}` in DEEPSEEK_MODELS ? `deepseek/${requestKey}` : 
                   "default";
    const modelName = DEEPSEEK_MODELS[modelKey];
    
    console.log(`使用标准化DeepSeek模型名称: ${modelName}`);
    
    // 创建回调管理器
    const callbacks = CallbackManager.fromHandlers({
      async handleLLMNewToken(token) {
        // 简单处理token输出
        if (token) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "content",
                choices: [{ delta: { content: token } }]
              })}\n\n`
            )
          );
        }
      },
      async handleLLMEnd() {
        await writer.write(encoder.encode("data: [DONE]\n\n"));
        await writer.close();
      },
      async handleLLMError(error) {
        console.error("LLM错误:", error);
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error.message || "模型处理出错"
            })}\n\n`
          )
        );
        await writer.close();
      }
    });
    
    // DeepSeek模型实例选项
    const modelOptions = {
      modelName: modelName,
      temperature: temperature,
      maxTokens: maxTokens,
      streaming: true,
      apiKey: process.env.DEEPSEEK_API_KEY,
      verbose: true, // 启用详细日志
      timeout: 300000, // 5分钟超时
    };
    
    // 如果是推理模型，添加特殊处理
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
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "reasoning",
                      choices: [{ delta: { reasoning_content: delta.reasoning_content } }]
                    })}\n\n`
                  )
                );
              }
              
              // 处理最终内容
              if (delta.content) {
                await writer.write(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "content",
                      choices: [{ delta: { content: delta.content } }]
                    })}\n\n`
                  )
                );
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
    
    // 创建DeepSeek模型实例
    const deepseek = new ChatDeepSeek(modelOptions);
    
    console.log(`DeepSeek模型已初始化: ${modelName}`);
    
    // 创建消息数组，包含上下文历史
    const messages = [];
    
    // 添加系统提示
    let systemPromptContent = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    
    // 如果是智能体模式，增强系统提示词
    if (agentMode) {
      systemPromptContent = `${systemPromptContent}\n\n你现在是一个主动的智能体，不仅要回答用户的问题，还要：
1. 主动思考用户可能遇到的问题，并提前给出建议
2. 提供额外的相关信息和拓展思路
3. 推荐具体的实践步骤
4. 在合适的情况下，提供多个可能的解决方案
5. 使用Markdown格式组织你的回答，使其更加结构化

请确保你的回答全面、主动且有实践价值。使用Markdown的标题、列表、代码块等功能，使你的回答更加清晰易读。`;
    }
    
    messages.push(new SystemMessage(systemPromptContent));
    
    // 添加历史消息
    if (contextHistory && contextHistory.length > 0) {
      for (const message of contextHistory) {
        if (message.role === 'user') {
          messages.push(new HumanMessage(message.content));
        } else if (message.role === 'assistant') {
          messages.push(new AIMessage(message.content));
        }
      }
    }
    
    // 添加当前用户提问
    messages.push(new HumanMessage(prompt));

    // 异步调用模型
    (async () => {
      try {
        console.log(`开始调用DeepSeek API，包含 ${messages.length} 条消息`);
        
        // 忽略Token计算错误，这不影响实际功能
        try {
          await deepseek.call(messages, { callbacks });
        } catch (err) {
          // 如果错误消息包含"calculate number of tokens"，说明是非致命错误
          if (err instanceof Error && err.message.includes('tokens')) {
            console.warn("Token计算错误 (非致命):", err.message);
            // 继续处理
          } else {
            // 其他错误需要重新抛出
            throw err;
          }
        }
        
      } catch (error) {
        console.error("DeepSeek调用错误:", error);
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error 
                ? error.message 
                : "DeepSeek API调用失败"
            })}\n\n`
          )
        );
        await writer.close();
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
  } catch (error) {
    console.error("API处理出错:", error);
    
    // 记录更详细的错误信息
    const errorMessage = error instanceof Error 
      ? `${error.name}: ${error.message}\n${error.stack}` 
      : String(error);
    
    console.error("详细错误信息:", errorMessage);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "处理请求时发生未知错误",
        details: errorMessage 
      },
      { status: 500 }
    );
  }
} 