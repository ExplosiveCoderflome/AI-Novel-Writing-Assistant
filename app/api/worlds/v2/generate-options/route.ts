import { NextRequest, NextResponse } from 'next/server';
import { 
  WorldOptionsGenerationParams, 
  WorldOptionsResponse, 
  WorldPropertyOption,
  WorldOptionRefinementLevel
} from '../../../../types/worldV2';
import LLMFactory from '../../../llm/factory';
import { getApiKey } from '../../../../lib/api-key';
import { LLMProviderConfig, LLMDBConfig } from '../../../../types/llm';
import { log } from 'console';

export const maxDuration = 300; // 5分钟超时

export async function POST(req: NextRequest) {
  try {
    const params = await req.json() as WorldOptionsGenerationParams;

    // 验证必要参数
    if (!params.worldType) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数: worldType'
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

    // 设置LLM配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey,
      model: params.model,
      temperature: params.temperature || 0.7,
      maxTokens: params.maxTokens || 2000
    };

    const config = {
      defaultProvider: params.provider,
      [params.provider]: providerConfig,
      // 添加 deepseek 特定配置，确保非流式生成
      deepseek: {
        model: params.model,
        temperature: params.temperature || 0.7,
        maxTokens: params.maxTokens || 2000,
        useStream: false // 明确设置为非流式模式
      }
    } as any; // 使用any绕过类型检查
    
    // 获取LLM工厂实例
    const llmFactory = LLMFactory.getInstance();
    llmFactory.setConfig(config);
    
    // 构建系统提示词
    const systemPrompt = `你是一个专业的小说世界规划师。请根据用户提供的世界类型，生成5-8个最相关的世界属性选项，帮助用户创建有深度的小说世界。`;
    
    // 构建用户提示词
    const userPrompt = generatePrompt(params);
    
    console.log('开始调用LLM生成世界属性选项...');
    
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
            max_tokens: params.maxTokens || 2000,
            stream: false // 明确指定不使用流式处理
          })
        });
        console.log('Deepseek API 调用成功',response);
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
        
        // 处理响应
        const result = processResponse(content, params.refinementLevel);
        return NextResponse.json(result);
      } catch (error) {
        console.error('直接调用Deepseek API失败:', error);
        return NextResponse.json({
          success: false,
          error: `调用Deepseek API时发生错误: ${error instanceof Error ? error.message : '未知错误'}`
        }, { status: 500 });
      }
    } else {
      // 对于其他提供商，使用之前的方法
      // 调用LLM生成选项
      const response = await llmFactory.generateRecommendation({
        prompt: `${systemPrompt}\n\n${userPrompt}`
      }, params.provider);
      
      if (!response || !response.content) {
        console.warn('生成的内容为空');
        return NextResponse.json({
          success: false,
          error: '生成的回复为空，请重试'
        }, { status: 500 });
      }
      
      // 处理响应
      const result = processResponse(response.content, params.refinementLevel);
      return NextResponse.json(result);
    }

  } catch (error) {
    console.error('生成世界属性选项时出错:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// 处理LLM响应
function processResponse(content: string, refinementLevel: WorldOptionRefinementLevel = 'standard'): WorldOptionsResponse {
  try {
    console.log('处理LLM响应...');
    console.log('响应内容:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
    
    // 尝试解析JSON响应
    let options: WorldPropertyOption[] = [];
    
    try {
      // 提取JSON部分
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/{[\s\S]*}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        
        if (Array.isArray(parsed)) {
          options = parsed.map((opt: Partial<WorldPropertyOption>) => ({
            id: opt.id || `option_${options.length + 1}`,
            name: opt.name || '未命名选项',
            description: opt.description || '无描述',
            category: 'general',
            subcategories: opt.subcategories
          }));
        } else if (parsed.options && Array.isArray(parsed.options)) {
          options = parsed.options.map((opt: Partial<WorldPropertyOption>) => ({
            id: opt.id || `option_${options.length + 1}`,
            name: opt.name || '未命名选项',
            description: opt.description || '无描述',
            category: 'general',
            subcategories: opt.subcategories
          }));
        } else if (parsed.properties && Array.isArray(parsed.properties)) {
          options = parsed.properties.map((opt: Partial<WorldPropertyOption>) => ({
            id: opt.id || `option_${options.length + 1}`,
            name: opt.name || '未命名选项',
            description: opt.description || '无描述',
            category: 'general',
            subcategories: opt.subcategories
          }));
        } else {
          // 尝试从对象中提取数组
          const possibleArrays = Object.values(parsed).filter(v => Array.isArray(v));
          if (possibleArrays.length > 0) {
            options = possibleArrays[0].map((opt: Partial<WorldPropertyOption>) => ({
              id: opt.id || `option_${options.length + 1}`,
              name: opt.name || '未命名选项',
              description: opt.description || '无描述',
              category: 'general',
              subcategories: opt.subcategories
            }));
          }
        }
      } else {
        console.warn('未找到JSON格式响应，将尝试直接解析内容');
        options = extractOptionsFromText(content);
      }
    } catch (e) {
      console.warn('JSON解析失败，将尝试从文本中提取:', e);
      options = extractOptionsFromText(content);
    }
    
    // 根据细化级别调整选项数量
    let finalOptions = options;
    if (refinementLevel === 'basic' && options.length > 5) {
      finalOptions = options.slice(0, 5);
    } else if (refinementLevel === 'detailed' && options.length < 8) {
      // 对于detailed级别，如果选项少于8个，尝试扩展现有选项
      const existingIds = new Set(options.map(o => o.id));
      
      // 为某些选项添加变体
      for (const option of options) {
        if (finalOptions.length >= 8) break;
        
        const variantId = option.id + '_variant';
        if (!existingIds.has(variantId)) {
          finalOptions.push({
            id: variantId,
            name: option.name + '（变体）',
            description: '这是' + option.name + '的一个变体: ' + option.description,
            category: 'general'
          });
          existingIds.add(variantId);
        }
      }
    }
    
    return {
      success: true,
      data: finalOptions
    };
  } catch (error) {
    console.error('处理响应时出错:', error);
    throw new Error('处理LLM响应时出错: ' + (error instanceof Error ? error.message : '未知错误'));
  }
}

// 从文本中提取选项
function extractOptionsFromText(text: string): WorldPropertyOption[] {
  const options: WorldPropertyOption[] = [];
  
  // 按行分割
  const lines = text.split('\n');
  
  let currentOption: Partial<WorldPropertyOption> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 跳过空行
    if (!line) continue;
    
    // 检查是否是新选项的开始
    const optionMatch = line.match(/^[0-9]+[\.\)]\s*(.*?)(?::(.*))?$/);
    if (optionMatch) {
      // 保存之前的选项
      if (currentOption?.name) {
        options.push({
          id: currentOption.id || `option_${options.length + 1}`,
          name: currentOption.name,
          description: currentOption.description || '无描述',
          category: 'general'
        });
      }
      
      // 开始新选项
      currentOption = {
        id: `option_${options.length + 1}`,
        name: optionMatch[1].trim(),
        description: optionMatch[2] ? optionMatch[2].trim() : ''
      };
      
      // 如果没有描述，检查下一行
      if (!currentOption.description && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.match(/^[0-9]+[\.\)]/)) {
          currentOption.description = nextLine;
          i++; // 跳过下一行
        }
      }
    } 
    // 检查是否以破折号开头的选项
    else if (line.startsWith('-') || line.startsWith('•')) {
      const optionText = line.substring(1).trim();
      const parts = optionText.split(':', 2);
      
      // 保存之前的选项
      if (currentOption?.name) {
        options.push({
          id: currentOption.id || `option_${options.length + 1}`,
          name: currentOption.name,
          description: currentOption.description || '无描述',
          category: 'general'
        });
      }
      
      // 创建新选项
      if (parts.length > 1) {
        currentOption = {
          id: `option_${options.length + 1}`,
          name: parts[0].trim(),
          description: parts[1].trim()
        };
      } else {
        currentOption = {
          id: `option_${options.length + 1}`,
          name: optionText,
          description: ''
        };
        
        // 检查下一行是否为描述
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.match(/^[-•]/) && !nextLine.match(/^[0-9]+[\.\)]/)) {
            currentOption.description = nextLine;
            i++; // 跳过下一行
          }
        }
      }
    }
    // 如果有当前选项但没有描述，添加这一行作为描述
    else if (currentOption && !currentOption.description) {
      currentOption.description = line;
    }
    // 如果这一行看起来像是选项名而不是描述
    else if (line.length < 50 && (line.endsWith(':') || line.endsWith('：'))) {
      // 保存之前的选项
      if (currentOption?.name) {
        options.push({
          id: currentOption.id || `option_${options.length + 1}`,
          name: currentOption.name,
          description: currentOption.description || '无描述',
          category: 'general'
        });
      }
      
      // 开始新选项
      currentOption = {
        id: `option_${options.length + 1}`,
        name: line.replace(/[:：]$/, '').trim(),
        description: ''
      };
    }
  }
  
  // 添加最后一个选项
  if (currentOption?.name) {
    options.push({
      id: currentOption.id || `option_${options.length + 1}`,
      name: currentOption.name,
      description: currentOption.description || '无描述',
      category: 'general'
    });
  }
  
  return options;
}

// 生成提示词
function generatePrompt(params: WorldOptionsGenerationParams): string {
  const { worldType, prompt } = params;
  
  // 根据世界类型构建基本提示词
  let promptText = '';
  
  // 修正类型名称显示
  const formattedWorldType = worldType.replace(/_/g, ' ');
  
  // 基本提示词
  promptText = `我正在创建一个${formattedWorldType}类型的小说世界。`;
  
  // 添加用户补充内容
  if (prompt) {
    promptText += `\n\n用户补充说明: ${prompt}`;
  }
  
  // 具体需求
  promptText += `\n\n请为我生成5-8个最相关的世界属性选项，这些属性将帮助我构建一个完整的${formattedWorldType}小说世界。

每个世界属性都应该包含:
1. 属性名称 - 简洁明了的标题
2. 属性描述 - 对这个世界特性的简要解释，约50-100字

请确保:
- 属性之间相互独立但能够组合形成连贯的世界
- 属性符合${formattedWorldType}类型的经典特征
- 使用JSON格式返回结果

返回格式示例:
\`\`\`json
[
  {
    "id": "magic_system",
    "name": "魔法系统",
    "description": "这个世界的魔法体系如何运作，有什么规则和限制。"
  },
  {
    "id": "social_structure",
    "name": "社会结构",
    "description": "这个世界的社会组织方式，包括阶级、政治体系等。"
  }
]
\`\`\``;
  
  return promptText;
} 