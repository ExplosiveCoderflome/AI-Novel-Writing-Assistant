import { NextRequest, NextResponse } from 'next/server';
import { LLMFactory } from '../../../llm/factory';
import { LLMProviderConfig } from '../../../types/llm';
import { getApiKey } from '../../../../lib/api-key';

const SUPPORTED_MODEL_PROVIDERS = new Set(['deepseek', 'siliconflow']);

function validateApiKeyFormat(provider: string, apiKey: string): string | null {
  if (provider === 'deepseek' && !apiKey.startsWith('sk-')) {
    return 'Deepseek API Key 格式错误，必须以 sk- 开头';
  }

  if (provider === 'siliconflow' && !apiKey.startsWith('sf-')) {
    return 'SiliconFlow API Key 格式错误，必须以 sf- 开头';
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');

  if (!provider) {
    return NextResponse.json(
      { success: false, error: '缺少 provider 参数' },
      { status: 400 }
    );
  }

  if (!SUPPORTED_MODEL_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { success: false, error: `不支持的provider: ${provider}` },
      { status: 400 }
    );
  }

  try {
    const apiKey = await getApiKey(provider);
    const keyFormatError = validateApiKeyFormat(provider, apiKey);

    if (keyFormatError) {
      return NextResponse.json(
        { success: false, error: keyFormatError },
        { status: 400 }
      );
    }

    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey,
    };

    const llmFactory = LLMFactory.getInstance();
    llmFactory.setConfig({
      defaultProvider: provider,
      providers: {
        [provider]: providerConfig,
      },
    });

    const models = await llmFactory.getAvailableModels(provider);

    return NextResponse.json({
      success: true,
      data: {
        models,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取模型列表失败';
    const status = message.includes('API Key') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
