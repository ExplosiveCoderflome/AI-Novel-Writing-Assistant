import { Tool } from "@langchain/core/tools";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { createSearchTool, SearchAPIConfig, DEFAULT_SEARCH_CONFIG } from "./searchTools";

// 定义需要联网搜索的检测结果接口
interface WebSearchNeedDetectionResult {
  needsWebSearch: boolean;
  reasoning: string;
  searchQuery?: string;
}

/**
 * 创建检测是否需要联网搜索的链
 * @param apiKey OpenAI API密钥
 * @returns 检测链
 */
export function createWebSearchDetectionChain(apiKey: string) {
  // 创建一个轻量级模型用于检测
  const detectionModel = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0,
    apiKey,
    timeout: 60000, // 60秒超时
  });

  // 创建检测提示模板
  const detectionPrompt = ChatPromptTemplate.fromMessages([
    ["system", `你是一个专门判断用户问题是否需要联网搜索的助手。
你的任务是分析用户的问题，判断是否需要最新的互联网信息来回答。

请考虑以下因素：
1. 问题是否涉及最新的新闻、事件或数据
2. 问题是否涉及可能在你的知识截止日期后发生变化的信息
3. 问题是否需要特定的、可能需要在网上查询的事实信息
4. 问题是否涉及当前趋势、价格或统计数据

请以JSON格式返回你的判断结果，包含以下字段：
- needsWebSearch: 布尔值，表示是否需要联网搜索
- reasoning: 字符串，简要解释你的判断理由
- searchQuery: 字符串，如果需要搜索，提供一个优化过的搜索查询词

只返回JSON对象，不要有其他文本。`],
    new MessagesPlaceholder("messages"),
  ]);

  // 创建检测链
  return RunnableSequence.from([
    detectionPrompt,
    detectionModel,
    new StringOutputParser(),
    (output: string) => {
      try {
        return JSON.parse(output) as WebSearchNeedDetectionResult;
      } catch (error) {
        console.error("解析检测结果失败:", error);
        return {
          needsWebSearch: false,
          reasoning: "解析检测结果失败",
        } as WebSearchNeedDetectionResult;
      }
    },
  ]);
}

/**
 * 创建执行网络搜索的链
 * @param searchConfig 搜索API配置
 * @returns 搜索链
 */
export function createWebSearchChain(searchConfig: SearchAPIConfig = DEFAULT_SEARCH_CONFIG) {
  // 创建搜索工具
  const searchTool = createSearchTool(searchConfig);
  
  // 创建搜索链
  return async (query: string): Promise<string> => {
    try {
      const searchResult = await searchTool.invoke(query);
      return typeof searchResult === 'string' ? searchResult : JSON.stringify(searchResult);
    } catch (error) {
      console.error('搜索失败:', error);
      return `搜索失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
}

/**
 * 创建结合搜索结果的增强链
 * @param apiKey OpenAI API密钥
 * @returns 增强链
 */
export function createSearchEnhancementChain(apiKey: string) {
  // 创建一个模型用于增强回答
  const enhancementModel = new ChatOpenAI({
    modelName: "gpt-3.5-turbo-16k",
    temperature: 0.7,
    apiKey,
    timeout: 120000, // 120秒超时
  });

  // 创建增强提示模板
  const enhancementPrompt = ChatPromptTemplate.fromMessages([
    ["system", `你是一个专业的AI助手，现在你获得了来自互联网的最新信息。
请使用这些信息来增强你的回答，但要注意以下几点：
1. 将搜索结果与你已有的知识结合起来
2. 确保回答准确、全面且有帮助
3. 清晰地区分哪些信息来自搜索结果，哪些是你的分析
4. 如果搜索结果不相关或不足以回答问题，请诚实说明
5. 使用Markdown格式组织你的回答，使其更加结构化和易读

搜索结果可能包含HTML标记或特殊格式，请适当处理这些内容。`],
    new MessagesPlaceholder("history"),
    ["human", "{question}"],
    ["system", "以下是来自互联网的搜索结果:\n\n{search_result}"],
  ]);

  // 创建增强链
  return RunnableSequence.from([
    enhancementPrompt,
    enhancementModel,
    new StringOutputParser(),
  ]);
}

/**
 * 完整的网络搜索增强对话链
 */
export class WebSearchEnhancedConversation {
  private detectionChain;
  private searchChain;
  private enhancementChain;
  private searchConfig: SearchAPIConfig;
  private openAIApiKey: string;

  constructor(
    openAIApiKey: string,
    searchConfig: SearchAPIConfig = DEFAULT_SEARCH_CONFIG
  ) {
    this.openAIApiKey = openAIApiKey;
    this.searchConfig = searchConfig;
    this.detectionChain = createWebSearchDetectionChain(openAIApiKey);
    this.searchChain = createWebSearchChain(searchConfig);
    this.enhancementChain = createSearchEnhancementChain(openAIApiKey);
  }
  
  // 添加方法以切换搜索配置
  public setSearchConfig(newConfig: Partial<SearchAPIConfig>) {
    this.searchConfig = { ...this.searchConfig, ...newConfig };
    // 重新创建搜索链
    this.searchChain = createWebSearchChain(this.searchConfig);
  }

  /**
   * 处理用户消息
   * @param userMessage 用户消息
   * @param chatHistory 聊天历史
   * @returns 处理结果
   */
  async processMessage(userMessage: string, chatHistory: Array<{ role: string; content: string }>) {
    try {
      // 转换聊天历史为Langchain消息格式
      const formattedHistory = chatHistory.map(msg => ({
        type: msg.role,
        content: msg.content,
      }));

      // 检测是否需要联网搜索
      const detectionResult = await this.detectionChain.invoke({
        messages: [{ type: "human", content: userMessage }],
      });

      console.log("联网需求检测结果:", detectionResult);

      // 如果需要联网搜索
      if (detectionResult.needsWebSearch && detectionResult.searchQuery) {
        // 执行搜索
        const searchQuery = detectionResult.searchQuery;
        console.log(`执行网络搜索，查询词: "${searchQuery}"，提供商: ${this.searchConfig.provider}`);
        const searchResult = await this.searchChain(searchQuery);

        // 使用搜索结果增强回答
        const enhancedResponse = await this.enhancementChain.invoke({
          history: formattedHistory,
          question: userMessage,
          search_result: searchResult,
        });

        return {
          response: enhancedResponse,
          searchInfo: {
            performed: true,
            query: searchQuery,
            result: searchResult,
            provider: this.searchConfig.provider
          },
        };
      }

      // 如果不需要联网搜索，返回null表示应该使用常规LLM处理
      return {
        response: null,
        searchInfo: {
          performed: false,
          reasoning: detectionResult.reasoning,
        },
      };
    } catch (error) {
      console.error("处理消息出错:", error);
      throw error;
    }
  }
} 