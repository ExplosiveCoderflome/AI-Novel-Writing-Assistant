/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../types/llm';
import { getApiKey, APIKeyError } from '../../../../lib/api-key';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');

  try {
    if (!provider) {
      return NextResponse.json(
        { success: false, error: '缺少 provider 参数' },
        { status: 400 }
      );
    }

    console.log(`[Models API] 开始获取 ${provider} 的模型列表`);

    // 使用封装好的方法获取 API Key
    let finalApiKey;
    try {
      finalApiKey = await getApiKey(provider);
      console.log(`[Models API] 成功获取 ${provider} 的API Key`);
    } catch (error) {
      console.error(`[Models API] 获取 ${provider} 的API Key失败:`, error);
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : '未找到有效的 API Key，请在设置中配置或在环境变量中设置'
        },
        { status: 404 }
      );
    }

    // 验证API Key格式
    if (provider === 'deepseek' && !finalApiKey.startsWith('sk-')) {
      return NextResponse.json(
        { success: false, error: 'Deepseek API Key 格式错误，必须以 sk- 开头' },
        { status: 400 }
      );
    }
    if (provider === 'siliconflow' && !finalApiKey.startsWith('sf-')) {
      return NextResponse.json(
        { success: false, error: 'SiliconFlow API Key 格式错误，必须以 sf- 开头' },
        { status: 400 }
      );
    }

    // 创建 LLM 实例
    console.log(`[Models API] 开始创建 ${provider} 的LLM实例`);
    const llmFactory = LLMFactory.getInstance();

    // 直接创建对应的Provider实例
    let llmProvider;
    try {
      switch (provider) {
        case 'deepseek':
          const DeepseekProvider = (await import('../../../llm/providers/deepseek')).DeepseekProvider;
          llmProvider = new DeepseekProvider(finalApiKey);
          break;
        case 'siliconflow':
          const SiliconFlowProvider = (await import('../../../llm/providers/siliconflow')).SiliconFlowProvider;
          llmProvider = new SiliconFlowProvider(finalApiKey);
          break;
        default:
          return NextResponse.json(
            { success: false, error: `不支持的provider: ${provider}` },
            { status: 400 }
          );
      }
    } catch (error) {
      console.error(`[Models API] 创建Provider实例失败:`, error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : '创建Provider实例失败' },
        { status: 400 }
      );
    }

    // 获取可用模型列表
    console.log(`[Models API] 开始请求 ${provider} 的可用模型列表，使用的API Key:`, finalApiKey ? '已设置' : '未设置');
    const models = await llmProvider.getAvailableModels();
    console.log(`[Models API] 成功获取到 ${provider} 的模型列表:`, models);

    return NextResponse.json({
      success: true,
      data: {
        models
      }
    });
  } catch (error) {
    console.error(`[Models API] 获取 ${provider} 模型列表失败:`, error);
    console.error('[Models API] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');

    // 根据错误类型返回不同的状态码
    let statusCode = 500;
    if (error instanceof Error) {
      if (error.message.includes('API Key')) {
        statusCode = 401;
      } else if (error.message.includes('不支持的provider')) {
        statusCode = 400;
      }
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '获取模型列表失败',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: statusCode }
    );
  }
} 