/*
 * @LastEditors: biz
 */
/*
 * @LastEditors: biz
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../types/llm';
import { z } from 'zod';
import { getApiKey } from '../../../../lib/api-key';

const testSchema = z.object({
  provider: z.enum(['deepseek', 'siliconflow', 'openai', 'anthropic', 'cohere', 'volc']),
  type: z.enum(['connection', 'speed']).default('connection'),
  model: z.string().optional(),
});

const testRequestSchema = z.object({
  provider: z.enum(['deepseek', 'siliconflow', 'openai', 'anthropic', 'cohere', 'volc']).optional()
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    const result = testRequestSchema.safeParse({ provider });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的provider参数'
      }, { status: 400 });
    }

    const providers = provider ? [provider] : ['deepseek', 'siliconflow', 'openai', 'anthropic', 'cohere', 'volc'];
    const testResults = [];

    for (const p of providers) {
      try {
        const apiKey = await getApiKey(p);
        
        // 验证API Key格式
        let isValidFormat = true;
        if (p === 'deepseek' && !apiKey.startsWith('sk-')) {
          isValidFormat = false;
        } else if (p === 'siliconflow' && !apiKey.startsWith('sf-')) {
          isValidFormat = false;
        }

        testResults.push({
          provider: p,
          hasKey: true,
          isValidFormat,
          key: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : null
        });
      } catch (error) {
        testResults.push({
          provider: p,
          hasKey: false,
          isValidFormat: false,
          error: error instanceof Error ? error.message : '未找到有效的 API Key'
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: testResults
    });
  } catch (error) {
    console.error('测试API Key时发生错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '测试API Key时发生未知错误'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = testSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求参数',
        details: result.error.format()
      });
    }

    const { provider, type, model } = result.data;

    // 获取 API Key
    try {
      const apiKey = await getApiKey(provider);

      // 验证API Key格式
      if (provider === 'deepseek' && !apiKey.startsWith('sk-')) {
        return NextResponse.json({
          success: false,
          error: 'API Key格式无效：Deepseek API Key必须以sk-开头'
        }, { status: 400 });
      }
      
      if (provider === 'siliconflow' && !apiKey.startsWith('sf-')) {
        return NextResponse.json({
          success: false,
          error: 'API Key格式无效：SiliconFlow API Key必须以sf-开头'
        }, { status: 400 });
      }

      // 创建配置
      const providerConfig: LLMProviderConfig = {
        getApiKey: async () => apiKey,
        model: model || 'default-model',
        temperature: 0.7,
        maxTokens: 100
      };

      const config = {
        defaultProvider: provider,
        [provider]: providerConfig
      } as LLMDBConfig;

      const factory = LLMFactory.getInstance();
      factory.setConfig(config);

      if (type === 'speed') {
        if (!model) {
          return NextResponse.json({
            success: false,
            error: '速度测试需要指定model参数'
          }, { status: 400 });
        }

        console.log('开始速度测试:', { 
          provider, 
          model,
          hasKey: Boolean(apiKey)
        });

        const result = await factory.testSpeed(provider, model);
        console.log('速度测试结果:', result);

        if (!result.success) {
          return NextResponse.json({
            success: false,
            error: result.data.error || '速度测试失败'
          });
        }

        return NextResponse.json({
          success: true,
          data: {
            duration: result.data.duration,
            response: result.data.response,
            model: result.data.model
          }
        });
      } else if (type === 'connection') {
        const result = await factory.testConnection(provider);
        return NextResponse.json(result);
      } else {
        return NextResponse.json({
          success: false,
          error: '不支持的测试类型'
        });
      }
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : '未找到有效的 API Key'
      }, { status: 404 });
    }
  } catch (error) {
    console.error('测试失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    });
  }
}

export async function POST_old(request: NextRequest) {
  try {
    const body = await request.json();
    const result = testSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求参数',
        details: result.error.format()
      });
    }

    const { provider, type, model } = result.data;

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
      });
    }

    // 创建配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey.key,
      model,
      temperature: 0.7,
      maxTokens: 100
    };

    const config = {
      defaultProvider: provider,
      [provider]: providerConfig
    } as LLMDBConfig;

    const factory = LLMFactory.getInstance();
    factory.setConfig(config);

    if (type === 'speed') {
      console.log('开始速度测试:', { 
        provider, 
        model,
        apiKey: {
          id: apiKey.id,
          provider: apiKey.provider,
          isActive: apiKey.isActive,
          keyLength: apiKey.key.length
        }
      });

      const result = await factory.testSpeed(provider, model);
      console.log('速度测试结果:', result);

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.data.error || '速度测试失败'
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          duration: result.data.duration,
          response: result.data.response,
          model: result.data.model
        }
      });
    } else if (type === 'connection') {
      const result = await factory.testConnection(provider);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({
        success: false,
        error: '不支持的测试类型'
      });
    }
  } catch (error) {
    console.error('测试失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    });
  }
} 