import { LLMDBConfig } from '../../app/types/llm';
import { getApiKey } from '../api-key';

/**
 * LangChain配置
 * 管理所有支持的LLM提供商配置
 */
export const langChainConfig: LLMDBConfig = {
  defaultProvider: 'openai',
  
  // OpenAI配置
  openai: {
    getApiKey: async () => {
      try {
        return await getApiKey('openai');
      } catch (error) {
        console.error('获取OpenAI API密钥失败:', error);
        return null;
      }
    },
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2048
  },
  
  // Deepseek配置
  deepseek: {
    getApiKey: async () => {
      try {
        return await getApiKey('deepseek');
      } catch (error) {
        console.error('获取Deepseek API密钥失败:', error);
        return null;
      }
    },
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 4096
  }
};

/**
 * 从数据库获取LLM配置
 */
export async function llmConfigFromDB(): Promise<LLMDBConfig> {
  try {
    // 这里可以替换为从数据库加载配置的逻辑
    // 目前使用静态配置
    return langChainConfig;
  } catch (error) {
    console.error('获取LLM配置失败:', error);
    return langChainConfig; // 失败时返回默认配置
  }
}

/**
 * 初始化LangChain配置
 */
export async function initLangChainConfig() {
  try {
    // 从数据库加载配置
    const config = await llmConfigFromDB();
    
    // 引入LangChain工厂类
    const { LangChainFactory } = await import('../langchain/factory');
    
    // 应用配置
    const factory = LangChainFactory.getInstance();
    factory.setConfig(config);
    
    console.log('LangChain配置已初始化:', {
      defaultProvider: config.defaultProvider,
      providers: Object.keys(config).filter(key => key !== 'defaultProvider')
    });
    
    return true;
  } catch (error) {
    console.error('初始化LangChain配置失败:', error);
    return false;
  }
} 