import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../types/llm';
import { LLMProviderType } from '../../../llm/providers/factory';
import { z } from 'zod';

// 验证请求体的 schema
const refineAttributeSchema = z.object({
  provider: z.enum(['deepseek', 'siliconflow'] as const),
  model: z.string(),
  prompt: z.string(),
  elementType: z.string(),
  element: z.object({
    name: z.string(),
    description: z.string(),
    significance: z.string().optional(),
    attributes: z.record(z.string(), z.string()).optional(),
  }),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

const getSystemPrompt = (elementType: string, element: any) => {
  return `你是一位专业的世界设定设计师。现在需要你对世界设定中的一个${elementType}元素进行深入细化和扩写。

当前元素信息：
名称：${element.name}
描述：${element.description}
重要性：${element.significance || '未指定'}
${element.attributes ? `现有属性：\n${Object.entries(element.attributes)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}` : ''}

请基于以上信息，生成更加详细和丰富的描述。要求：
1. 保持原有设定的核心特征不变
2. 在原有基础上进行合理的扩展和深化
3. 增加更多细节和具体描述
4. 确保新增内容与原有设定保持一致性
5. 考虑该元素与世界其他部分的联系

请按照以下JSON格式返回细化后的内容：

{
  "name": "元素名称（保持不变）",
  "description": "扩展后的详细描述",
  "significance": "深化后的重要性说明",
  "attributes": {
    "现有属性key": "深化后的属性值",
    "新增属性key": "新属性值"
  }
}`;
};

export async function POST(request: NextRequest) {
  try {
    // 解析并验证请求体
    const body = await request.json();
    const result = refineAttributeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求参数',
        details: result.error.format()
      }, { status: 400 });
    }

    const { provider, model, prompt, elementType, element, temperature, maxTokens } = result.data;

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: '未找到有效的 API Key'
      }, { status: 404 });
    }

    // 创建配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey.key,
      model,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 2000
    };

    const config = {
      defaultProvider: provider,
      [provider]: providerConfig
    } as LLMDBConfig;

    // 初始化 LLM Factory
    const factory = LLMFactory.getInstance();
    factory.setConfig(config);

    // 构建系统提示词
    const systemPrompt = getSystemPrompt(elementType, element);

    // 构建用户提示词
    const userPrompt = `请根据以下要求细化该${elementType}的描述：
${prompt}

要求：
1. 保持与原有设定的一致性
2. 重点关注用户提出的具体要求
3. 确保生成的内容符合JSON格式要求`;

    console.log('开始细化属性，参数:', {
      provider,
      model,
      elementType,
      element: element.name,
      temperature,
      maxTokens
    });

    // 生成细化内容
    const response = await factory.generateRecommendation({
      userPrompt,
      systemPrompt,
      model,
      temperature,
      maxTokens: Math.min(maxTokens || 2000, 4000)
    }, provider as LLMProviderType);

    if (!response || !response.content) {
      console.warn('生成的内容为空');
      return NextResponse.json({
        success: false,
        error: '生成的回复为空，请重试'
      }, { status: 500 });
    }

    try {
      // 清理并解析 JSON
      const cleanJson = response.content.replace(/[\r\n\t]/g, '').trim();
      const refinedElement = JSON.parse(cleanJson);

      console.log('细化完成，数据长度:', cleanJson.length);

      return NextResponse.json({
        success: true,
        data: refinedElement
      });
    } catch (error) {
      console.error('解析细化数据失败:', error);
      return NextResponse.json({
        success: false,
        error: '解析细化数据失败'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('处理请求时发生错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '处理请求时发生未知错误'
    }, { status: 500 });
  }
} 