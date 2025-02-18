import { NextResponse } from 'next/server';
import { getApiKey } from '../../../lib/api-key';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const volcApiKey = await getApiKey('volc');
    const baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${volcApiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Volc API proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '调用 Volc API 失败' },
      { status: 500 }
    );
  }
} 