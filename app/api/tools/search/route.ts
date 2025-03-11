import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSearchTool, performSearch, SearchAPIConfig, SearchProvider, DEFAULT_SEARCH_CONFIG } from '../../../lib/tools/searchTools';

// 请求体验证schema
const searchRequestSchema = z.object({
  query: z.string().min(1, "搜索查询不能为空"),
  config: z.object({
    provider: z.enum(['serpapi', 'googlecse', 'bingapi']),
    apiKey: z.string().optional(),
    engineId: z.string().optional()
  }).optional()
});

export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const body = await req.json();
    const validationResult = searchRequestSchema.safeParse(body);

    // 验证失败返回错误信息
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.message },
        { status: 400 }
      );
    }

    const { query, config: requestConfig } = validationResult.data;
    
    // 创建搜索工具
    let searchConfig: SearchAPIConfig;
    
    if (requestConfig) {
      searchConfig = {
        provider: requestConfig.provider as SearchProvider,
        apiKey: requestConfig.apiKey || DEFAULT_SEARCH_CONFIG.apiKey,
        engineId: requestConfig.engineId
      };
    } else {
      searchConfig = DEFAULT_SEARCH_CONFIG;
    }
    
    const searchTool = createSearchTool(searchConfig);
    
    // 执行搜索
    const searchResult = await performSearch(searchTool, query);
    
    // 返回搜索结果
    return NextResponse.json({ result: searchResult });
  } catch (error) {
    console.error("搜索API处理出错:", error);
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : "处理搜索请求时发生未知错误";
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 