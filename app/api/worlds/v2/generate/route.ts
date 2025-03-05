import { NextRequest, NextResponse } from 'next/server';
import LLMFactory from '../../../llm/factory';
import { WorldGenerationParamsV2 } from '../../../../types/worldV2';
import { getApiKey } from '../../../../lib/api-key';
import { LLMProviderConfig, LLMDBConfig } from '../../../../types/llm';

export const maxDuration = 300; // 5分钟超时
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const params = await req.json() as WorldGenerationParamsV2;
    
    // 验证必要参数
    if (!params.selectedProperties || params.selectedProperties.length === 0) {
      return NextResponse.json({
        success: false,
        error: '未选择任何世界属性'
      }, { status: 400 });
    }
    
    if (!params.provider || !params.model) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数: provider 或 model'
      }, { status: 400 });
    }
    
    // 获取API Key
    const apiKey = await getApiKey(params.provider);
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: `未找到有效的 ${params.provider} API Key`
      }, { status: 400 });
    }
    
    // 构建提示词
    const promptText = generatePrompt(params);
    
    // 系统提示词
    const systemPrompt = `你是一个卓越的小说世界策划师，根据用户提供的世界属性创建详尽、连贯的世界设定。请使用Markdown格式输出，确保内容丰富而有条理。`;
    
    // 用户提示词
    const userPrompt = promptText;
    
    // 初始化 LLM Factory
    const llmFactory = LLMFactory.getInstance();
    
    console.log('开始调用LLM生成世界设定...');
    
    // 特殊处理：直接调用Deepseek API而不是通过LLMFactory
    if (params.provider === 'deepseek') {
      try {
        console.log('使用直接调用Deepseek API方式');
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
              content: `${systemPrompt}\n\n${userPrompt}` 
            }],
            temperature: params.temperature || 0.7,
            max_tokens: params.maxTokens || 4000,
            stream: false // 明确指定不使用流式处理
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Deepseek API 调用失败:', errorText);
          return NextResponse.json({
            success: false,
            error: `调用Deepseek API失败: ${response.status}`
          }, { status: 500 });
        }
        
        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
          return NextResponse.json({
            success: false,
            error: 'Deepseek API 返回了空内容'
          }, { status: 500 });
        }
        
        const content = data.choices[0].message.content;
        console.log('成功获取Deepseek响应，内容长度:', content.length);
        
        // 返回结果
        return NextResponse.json({
          success: true,
          data: content
        });
      } catch (error) {
        console.error('直接调用Deepseek API失败:', error);
        return NextResponse.json({
          success: false,
          error: `调用Deepseek API时发生错误: ${error instanceof Error ? error.message : '未知错误'}`
        }, { status: 500 });
      }
    } else {
      // 对于其他提供商，使用之前的方法
      // 使用非流式生成
      const response = await llmFactory.generateRecommendation({
        prompt: `${systemPrompt}\n\n${userPrompt}`
      }, params.provider);
      
      console.log('LLM响应完成，检查响应内容...');
      
      if (!response || !response.content) {
        console.warn('生成的内容为空');
        return NextResponse.json({
          success: false,
          error: '生成的回复为空，请重试'
        }, { status: 500 });
      }
      
      // 返回结果
      return NextResponse.json({
        success: true,
        data: response.content
      });
    }
  } catch (error) {
    console.error('生成世界设定时出错:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
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