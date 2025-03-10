import { initLangChainConfig } from '../../lib/config/langchain';

/**
 * 初始化LangChain配置
 * 这个文件会在API路由第一次加载时执行
 */
(async () => {
  try {
    console.log('正在初始化LangChain配置...');
    await initLangChainConfig();
    console.log('LangChain配置初始化完成');
  } catch (error) {
    console.error('LangChain配置初始化失败:', error);
  }
})(); 