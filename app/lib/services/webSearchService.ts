import { WebSearchEnhancedConversation } from '../tools/webSearchChain';
import { SearchAPIConfig, DEFAULT_SEARCH_CONFIG, EXA_SEARCH_CONFIG, SearchProvider } from '../tools/searchTools';

// 缓存WebSearchEnhancedConversation实例
let webSearchConversation: WebSearchEnhancedConversation | null = null;
let lastConfig: SearchAPIConfig | null = null;

/**
 * 获取或创建WebSearchEnhancedConversation实例
 * @param openAIApiKey OpenAI API密钥
 * @param searchConfig 搜索API配置
 * @returns WebSearchEnhancedConversation实例
 */
export function getWebSearchConversation(
  openAIApiKey: string,
  searchConfig: SearchAPIConfig = DEFAULT_SEARCH_CONFIG
): WebSearchEnhancedConversation {
  // 如果配置变了，需要重新创建实例
  if (!webSearchConversation || !lastConfig || 
      lastConfig.provider !== searchConfig.provider || 
      lastConfig.apiKey !== searchConfig.apiKey) {
    webSearchConversation = new WebSearchEnhancedConversation(openAIApiKey, searchConfig);
    lastConfig = { ...searchConfig };
  }
  return webSearchConversation;
}

/**
 * 获取搜索配置
 * @param provider 搜索提供商
 * @returns 搜索API配置
 */
export function getSearchConfig(provider?: SearchProvider): SearchAPIConfig {
  switch (provider) {
    case 'exa':
      return EXA_SEARCH_CONFIG;
    case 'serpapi':
      return DEFAULT_SEARCH_CONFIG;
    default:
      return DEFAULT_SEARCH_CONFIG;
  }
}

/**
 * 处理用户消息，检测是否需要联网搜索并处理
 * @param userMessage 用户消息
 * @param chatHistory 聊天历史
 * @param openAIApiKey OpenAI API密钥
 * @param provider 搜索提供商
 * @returns 处理结果
 */
export async function processMessageWithWebSearch(
  userMessage: string,
  chatHistory: Array<{ role: string; content: string }>,
  openAIApiKey: string,
  provider: SearchProvider = 'serpapi'
) {
  try {
    const searchConfig = getSearchConfig(provider);
    const conversation = getWebSearchConversation(openAIApiKey, searchConfig);
    return await conversation.processMessage(userMessage, chatHistory);
  } catch (error) {
    console.error('处理消息出错:', error);
    throw error;
  }
}

/**
 * 格式化搜索信息为Markdown格式
 * @param searchInfo 搜索信息
 * @returns 格式化后的Markdown文本
 */
export function formatSearchInfo(searchInfo: {
  performed: boolean;
  query?: string;
  result?: string;
  reasoning?: string;
  provider?: SearchProvider;
}): string | null {
  if (!searchInfo.performed) {
    return null;
  }

  const providerName = searchInfo.provider === 'exa' ? 'Exa搜索' : 'SerpAPI';

  return `## 网络搜索信息

**搜索查询**: ${searchInfo.query}
**搜索提供商**: ${providerName}

**搜索结果**:
${searchInfo.result}

---
*数据来源: 网络搜索*`;
} 