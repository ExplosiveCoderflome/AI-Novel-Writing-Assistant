import { SearchAPIConfig } from '../tools/searchTools';

/**
 * 执行网络搜索
 * @param query 搜索查询
 * @param config 搜索API配置（可选）
 * @returns 搜索结果
 */
export async function searchWeb(query: string, config?: Partial<SearchAPIConfig>): Promise<string> {
  try {
    const response = await fetch('/api/tools/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        config
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `请求失败，状态码: ${response.status}` 
      }));
      throw new Error(errorData.error || `请求失败，状态码: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('搜索服务错误:', error);
    return `搜索失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * 格式化搜索结果为Markdown格式
 * @param query 搜索查询
 * @param result 搜索结果
 * @returns 格式化后的Markdown文本
 */
export function formatSearchResult(query: string, result: string): string {
  return `## 搜索结果: "${query}"

${result}

---
*数据来源: 网络搜索*`;
} 