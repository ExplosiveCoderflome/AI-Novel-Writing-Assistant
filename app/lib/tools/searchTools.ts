import { SerpAPI } from "@langchain/community/tools/serpapi";
import { Tool } from "@langchain/core/tools";

// 搜索API提供商类型
export type SearchProvider = 'serpapi' | 'googlecse' | 'bingapi' | 'exa';

// 搜索API配置接口
export interface SearchAPIConfig {
  provider: SearchProvider;
  apiKey: string;
  engineId?: string; // 用于Google Custom Search
  numberOfResults?: number; // 用于控制返回结果数量
}

// 默认配置
export const DEFAULT_SEARCH_CONFIG: SearchAPIConfig = {
  provider: 'serpapi',
  apiKey: 'cca76c786d6a6db3634fcef70d6ea5c1e7ec3b185fe3caf44b4753950f71f134'
};

// Exa配置
export const EXA_SEARCH_CONFIG: SearchAPIConfig = {
  provider: 'exa',
  apiKey: 'c4e14679-23cd-45df-aa49-4bc6f9a79520',
  numberOfResults: 5
};

// Exa搜索工具类
class ExaSearchTool extends Tool {
  name = "exa_search";
  description = "使用Exa搜索引擎查找最新的网络信息";
  apiKey: string;
  numberOfResults: number;

  constructor(apiKey: string, numberOfResults: number = 5) {
    super();
    this.apiKey = apiKey;
    this.numberOfResults = numberOfResults;
  }

  async _call(query: string): Promise<string> {
    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          query,
          numResults: this.numberOfResults,
          useAutoprompt: true // 启用智能查询增强
        })
      });

      if (!response.ok) {
        throw new Error(`Exa API请求失败: ${response.status}`);
      }

      const data = await response.json();
      
      // 格式化搜索结果
      let formattedResults = '搜索结果:\n\n';
      
      if (data.results && data.results.length > 0) {
        data.results.forEach((result: any, index: number) => {
          formattedResults += `${index + 1}. ${result.title || '无标题'}\n`;
          formattedResults += `   链接: ${result.url || '无链接'}\n`;
          formattedResults += `   摘要: ${result.snippet || '无摘要'}\n\n`;
        });
      } else {
        formattedResults += '未找到相关结果。';
      }

      return formattedResults;
    } catch (error) {
      return `搜索出错: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * 创建搜索工具
 * @param config 搜索API配置
 * @returns 搜索工具实例
 */
export function createSearchTool(config: SearchAPIConfig = DEFAULT_SEARCH_CONFIG): Tool {
  switch (config.provider) {
    case 'serpapi':
      return new SerpAPI(config.apiKey, {
        location: 'China',
        hl: 'zh-cn',
        gl: 'cn'
      });
    
    case 'exa':
      return new ExaSearchTool(config.apiKey, config.numberOfResults || 5);
    
    // 可以在这里添加更多搜索API提供商的支持
    
    default:
      return new SerpAPI(config.apiKey, {
        location: 'China',
        hl: 'zh-cn',
        gl: 'cn'
      });
  }
}

/**
 * 使用搜索工具进行搜索
 * @param searchTool 搜索工具实例
 * @param query 搜索查询
 * @returns 搜索结果
 */
export async function performSearch(searchTool: Tool, query: string): Promise<string> {
  try {
    const searchResult = await searchTool.invoke(query);
    return typeof searchResult === 'string' ? searchResult : JSON.stringify(searchResult);
  } catch (error) {
    console.error('搜索失败:', error);
    return `搜索失败: ${error instanceof Error ? error.message : String(error)}`;
  }
} 