import { NextRequest } from 'next/server';
import { LLMFactory } from '../../../../../lib/llm/factory';
import { WorldGenerationParamsV2 } from '../../../../../app/types/worldV2';
import { getApiKey } from '../../../../../lib/api-key';
import { LLMDBConfig } from '../../../../../lib/types/llm';
import { StreamChunk } from '../../../../../app/types/llm';

export const maxDuration = 300; // 5分钟超时
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const params = await req.json() as WorldGenerationParamsV2;
    
    // 验证必要参数
    if (!params.selectedProperties || params.selectedProperties.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: '未选择任何世界属性'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    if (!params.provider || !params.model) {
      return new Response(JSON.stringify({
        success: false,
        error: '缺少必要参数: provider 或 model'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    // 获取API Key
    const apiKey = await getApiKey(params.provider);
    if (!apiKey) {
      return new Response(JSON.stringify({
        success: false,
        error: `未找到有效的 ${params.provider} API Key`
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    // 构建提示词
    const promptText = generatePrompt(params);
    
    // 系统提示词
    const systemPrompt = `你是一个卓越的小说世界策划师，根据用户提供的世界属性创建详尽、连贯的世界设定。请使用Markdown格式输出，确保内容丰富而有条理。`;
    
    console.log('开始调用LLM生成世界设定...');
    
    // 创建流式响应
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          // 初始化 LLM Factory
          const llmFactory = LLMFactory.getInstance();
          
          // 设置配置
          llmFactory.setConfig({
            defaultProvider: params.provider,
            providers: {
              [params.provider]: {
                getApiKey: async () => apiKey,
                model: params.model,
                temperature: params.temperature,
                maxTokens: params.maxTokens
              }
            }
          });

          // 特殊处理：直接调用Deepseek API而不是通过LLMFactory
          if (params.provider === 'deepseek') {
            try {
              console.log('使用直接调用Deepseek API流式方式');
              const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`,
                  'Accept': 'application/json'
                },
                body: JSON.stringify({
                  model: params.model || 'deepseek-chat',
                  messages: [{ 
                    role: 'user', 
                    content: `${systemPrompt}\n\n${promptText}` 
                  }],
                  temperature: params.temperature || 0.7,
                  max_tokens: params.maxTokens || 4000,
                  stream: true // 使用流式处理
                })
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                console.error('Deepseek API 调用失败:', errorText);
                const errorMessage = {
                  type: 'error',
                  choices: [{
                    delta: { content: `调用Deepseek API失败: ${response.status}` },
                    index: 0,
                    finish_reason: 'error'
                  }]
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
                controller.close();
                return;
              }
              
              const reader = response.body?.getReader();
              if (!reader) {
                throw new Error('无法获取响应流');
              }
              
              let accumulatedContent = '';
              const decoder = new TextDecoder();
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                  if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                      const jsonData = JSON.parse(line.substring(6));
                      if (jsonData.choices && jsonData.choices[0]?.delta?.content) {
                        const content = jsonData.choices[0].delta.content;
                        accumulatedContent += content;
                        
                        // 发送消息
                        const message = {
                          type: 'content',
                          choices: [{
                            delta: { content },
                            index: 0,
                            finish_reason: null
                          }]
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
                      }
                    } catch (e) {
                      console.error('解析Deepseek流式响应时出错:', e);
                    }
                  }
                }
              }
              
              console.log('成功获取Deepseek流式响应，内容长度:', accumulatedContent.length);
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              
            } catch (error) {
              console.error('直接调用Deepseek API失败:', error);
              const errorMessage = {
                type: 'error',
                choices: [{
                  delta: { content: `调用Deepseek API时发生错误: ${error instanceof Error ? error.message : '未知错误'}` },
                  index: 0,
                  finish_reason: 'error'
                }]
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
              controller.close();
            }
          } else {
            // 对于其他提供商，使用LLMFactory生成
            try {
              console.log(`开始使用 ${params.provider} 进行流式生成`);
              
              // 获取LLM实例
              const llm = await llmFactory.getLLMInstance({
                provider: params.provider,
                apiKey,
                model: params.model
              });
              
              // 使用流式生成API
              const stream = await llm.generateRecommendationStream({
                systemPrompt,
                userPrompt: promptText
              });
              
              // 处理流式响应
              for await (const chunk of stream) {
                const message = {
                  type: chunk.type,
                  choices: [{
                    delta: { content: chunk.content },
                    index: 0,
                    finish_reason: null
                  }]
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
              }
              
              // 发送完成信号
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
              
            } catch (error) {
              console.error('使用LLMFactory生成失败:', error);
              const errorMessage = {
                type: 'error',
                choices: [{
                  delta: { content: `生成失败: ${error instanceof Error ? error.message : '未知错误'}` },
                  index: 0,
                  finish_reason: 'error'
                }]
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
              controller.close();
            }
          }
        } catch (error) {
          console.error('生成世界设定时出错:', error);
          try {
            const errorMessage = {
              type: 'error',
              choices: [{
                delta: { content: error instanceof Error ? error.message : '未知错误' },
                index: 0,
                finish_reason: 'error'
              }]
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
          } catch (e: unknown) {
            if (e instanceof TypeError && e.message.includes('Controller is already closed')) {
              console.log('消息发送时控制器已关闭');
            } else {
              throw e;
            }
          }
        } finally {
          try {
            controller.close();
          } catch (e: unknown) {
            if (e instanceof TypeError && e.message.includes('Controller is already closed')) {
              console.log('控制器已关闭');
            }
          }
        }
      }
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('世界生成请求处理失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 生成提示词
function generatePrompt(params: WorldGenerationParamsV2): string {
  // 创建属性列表文本
  let propertiesText = '';
  
  params.selectedProperties.forEach(propId => {
    propertiesText += `- ${propId}`;
    
    // 如果有详细描述，添加到属性下
    if (params.propertyDetails && params.propertyDetails[propId]) {
      propertiesText += `\n  详情: ${params.propertyDetails[propId]}`;
    }
    
    propertiesText += '\n';
  });

  // 基础提示词
  let promptText = `
请根据以下选定的世界属性，创建一个详尽、连贯的小说世界设定。

## 选定的世界属性:
${propertiesText}

${params.prompt ? `## 用户补充说明:
${params.prompt}\n` : ''}

## 要求:
1. 请使用Markdown格式创建世界设定，包括标题、副标题、列表等元素
2. 确保所有选定的属性都被整合到世界设定中
3. 为世界创建一个引人入胜的名称
4. 提供世界的总体描述，概述其主要特点
5. 按照逻辑顺序组织内容，从基本设定到复杂元素
6. 每个部分都应该详细且具体，提供足够的细节以支持小说创作
7. 确保世界设定内部一致，没有逻辑矛盾
8. 添加一些独特的元素，使世界具有特色和记忆点

请直接开始创建世界设定，无需解释你的过程。
  `;

  return promptText;
}