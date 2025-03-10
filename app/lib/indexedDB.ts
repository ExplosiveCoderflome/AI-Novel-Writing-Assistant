import { Message } from '../types/chat';

const DB_NAME = 'chatHistoryDB';
const MESSAGES_STORE = 'messages';
const SETTINGS_STORE = 'settings';
const PROMPTS_STORE = 'systemPrompts'; // 新增系统提示词存储
const DB_VERSION = 3; // 更新数据库版本

export interface ChatSettings {
  contextWindowSize: number; // 保留的历史轮数
  temperature: number;
  provider: string;
  model: string;
  maxTokens?: number;
  activePromptId?: string; // 当前使用的系统提示词ID
}

// 默认设置
export const DEFAULT_SETTINGS: ChatSettings = {
  contextWindowSize: 10, // 默认保留10轮对话
  temperature: 0.7,
  provider: 'deepseek',
  model: 'deepseek-chat',
};

// 系统提示词类型
export interface SystemPrompt {
  id: string;
  name: string;
  content: string;
  type: 'assistant' | 'agent'; // 类型：普通助手或智能体
  createdAt: Date;
  updatedAt: Date;
}

// 预设系统提示词
export const DEFAULT_SYSTEM_PROMPTS: SystemPrompt[] = [
  {
    id: 'novel-assistant',
    name: '小说创作助手',
    content: `你是一位专业的小说创作助手，可以帮助用户进行小说创作、世界设定、角色设计等工作。
在回答时，请遵循以下原则：
1. 保持友好和专业的态度
2. 给出详细和有见地的回答
3. 结合文学创作理论和实践经验
4. 鼓励用户的创意，并给出建设性的建议
5. 如果用户的问题不够清晰，主动询问更多细节
6. 在合适的时候使用例子来说明观点
7. 避免生成有害或不当的内容

你擅长：
- 小说写作技巧指导
- 情节构思和发展建议
- 角色设计和发展
- 世界观构建
- 文风和语言风格建议
- 创作瓶颈突破
- 写作计划制定

请根据用户的具体需求提供相应的帮助。`,
    type: 'assistant',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: 'creative-writing-agent',
    name: '创意写作智能体',
    content: `你是一个专注于创意写作的智能体，拥有以下能力：

1. 分析与规划：你可以分析写作需求，提出合理的创作计划和结构建议
2. 角色构建：你能够帮助用户构建丰满、多维度的人物形象
3. 情节发展：你善于提供情节构思，包括冲突设计和转折点建议
4. 情感表达：你懂得如何通过文字表达细腻的情感变化
5. 环境描写：你可以提供生动的环境和氛围描述方法
6. 创意激发：当用户遇到瓶颈时，你会提供创新的思路和灵感

作为智能体，你会主动思考用户可能遇到的问题，并提前给出建议。每次回答都应包含：
- 对当前问题的直接回应
- 相关的拓展思路（至少2点）
- 一个具体的实践建议

始终保持专业、友好的态度，并尊重用户的创作风格和意图。`,
    type: 'agent',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: 'writing-critic',
    name: '文学评论专家',
    content: `你是一位经验丰富的文学评论专家，擅长分析和评价各类文学作品。

当用户提交文本给你时，你应该：
1. 识别文本的体裁、风格和主题
2. 分析写作技巧，包括叙事结构、人物塑造、语言使用等
3. 提出具体、有建设性的改进建议
4. 指出作品的优点和亮点
5. 给出整体评价和提升方向

你的评论应当客观公正，既要直接指出问题，也要肯定优点。避免过于苛刻或过于宽松，保持专业性和建设性。使用文学理论和专业术语，但确保用户能够理解。

你不是普通聊天助手，而是专业的文学评论者，请始终站在专业角度分析问题。`,
    type: 'assistant',
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

export class ChatHistoryDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('数据库打开失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建消息存储
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        }
        
        // 创建设置存储
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
        }
        
        // 创建系统提示词存储
        if (!db.objectStoreNames.contains(PROMPTS_STORE)) {
          const promptsStore = db.createObjectStore(PROMPTS_STORE, { keyPath: 'id' });
          
          // 创建索引，方便按类型查询
          promptsStore.createIndex('type', 'type', { unique: false });
          
          // 添加默认系统提示词
          DEFAULT_SYSTEM_PROMPTS.forEach(prompt => {
            promptsStore.add({
              ...prompt,
              createdAt: prompt.createdAt.toISOString(),
              updatedAt: prompt.updatedAt.toISOString()
            });
          });
          
          // 更新默认设置，使用第一个系统提示词
          const transaction = event.target?.transaction;
          if (transaction) {
            const settingsStore = transaction.objectStore(SETTINGS_STORE);
            settingsStore.put({
              ...DEFAULT_SETTINGS,
              id: 'global',
              activePromptId: DEFAULT_SYSTEM_PROMPTS[0].id
            });
          }
        }
      };
    });
  }

  async saveMessages(messages: Message[]): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);

      // Clear existing messages
      const clearRequest = store.clear();

      clearRequest.onsuccess = () => {
        // Save all messages
        messages.forEach(message => {
          store.add({
            ...message,
            timestamp: message.timestamp.toISOString()
          });
        });
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error('保存消息失败:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  async getMessages(): Promise<Message[]> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const messages = request.result.map(message => ({
          ...message,
          timestamp: new Date(message.timestamp)
        }));
        resolve(messages);
      };

      request.onerror = () => {
        console.error('获取消息失败:', request.error);
        reject(request.error);
      };
    });
  }

  async clearMessages(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('清除消息失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 保存设置
  async saveSettings(settings: ChatSettings): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(SETTINGS_STORE, 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);

      const settingsWithId = {
        ...settings,
        id: 'global' // 使用固定ID确保只有一个设置记录
      };

      const request = store.put(settingsWithId);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('保存设置失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 获取设置
  async getSettings(): Promise<ChatSettings> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(SETTINGS_STORE, 'readonly');
      const store = transaction.objectStore(SETTINGS_STORE);
      const request = store.get('global');

      request.onsuccess = () => {
        if (request.result) {
          const { id, ...settings } = request.result;
          resolve(settings as ChatSettings);
        } else {
          // 如果没有设置，返回默认设置
          resolve(DEFAULT_SETTINGS);
        }
      };

      request.onerror = () => {
        console.error('获取设置失败:', request.error);
        reject(request.error);
      };
    });
  }

  // 获取有限的上下文历史 (截取指定轮数的聊天历史)
  async getContextHistory(contextWindowSize?: number): Promise<Message[]> {
    const allMessages = await this.getMessages();
    
    if (!contextWindowSize) {
      // 如果未指定上下文窗口大小，获取设置中的值
      const settings = await this.getSettings();
      contextWindowSize = settings.contextWindowSize;
    }
    
    // 计算轮数 (一轮 = 用户消息 + AI回复)
    const rounds = Math.max(1, contextWindowSize);
    const messagesPerRound = 2;
    const maxMessages = rounds * messagesPerRound;
    
    // 返回最后N轮对话，优先保留最新的
    return allMessages.slice(-maxMessages);
  }
  
  // 系统提示词相关方法
  
  // 获取所有系统提示词
  async getAllSystemPrompts(): Promise<SystemPrompt[]> {
    if (!this.db) {
      await this.init();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROMPTS_STORE, 'readonly');
      const store = transaction.objectStore(PROMPTS_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const prompts = request.result.map(prompt => ({
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        }));
        resolve(prompts);
      };
      
      request.onerror = () => {
        console.error('获取系统提示词失败:', request.error);
        reject(request.error);
      };
    });
  }
  
  // 根据ID获取系统提示词
  async getSystemPromptById(id: string): Promise<SystemPrompt | null> {
    if (!this.db) {
      await this.init();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROMPTS_STORE, 'readonly');
      const store = transaction.objectStore(PROMPTS_STORE);
      const request = store.get(id);
      
      request.onsuccess = () => {
        if (request.result) {
          const prompt = {
            ...request.result,
            createdAt: new Date(request.result.createdAt),
            updatedAt: new Date(request.result.updatedAt)
          };
          resolve(prompt);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        console.error('获取系统提示词失败:', request.error);
        reject(request.error);
      };
    });
  }
  
  // 根据类型获取系统提示词
  async getSystemPromptsByType(type: 'assistant' | 'agent'): Promise<SystemPrompt[]> {
    if (!this.db) {
      await this.init();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROMPTS_STORE, 'readonly');
      const store = transaction.objectStore(PROMPTS_STORE);
      const index = store.index('type');
      const request = index.getAll(type);
      
      request.onsuccess = () => {
        const prompts = request.result.map(prompt => ({
          ...prompt,
          createdAt: new Date(prompt.createdAt),
          updatedAt: new Date(prompt.updatedAt)
        }));
        resolve(prompts);
      };
      
      request.onerror = () => {
        console.error('获取系统提示词失败:', request.error);
        reject(request.error);
      };
    });
  }
  
  // 保存系统提示词
  async saveSystemPrompt(prompt: SystemPrompt): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROMPTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROMPTS_STORE);
      
      // 转换日期为字符串
      const promptToSave = {
        ...prompt,
        updatedAt: new Date().toISOString(),
        createdAt: prompt.createdAt.toISOString()
      };
      
      const request = store.put(promptToSave);
      
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('保存系统提示词失败:', request.error);
        reject(request.error);
      };
    });
  }
  
  // 删除系统提示词
  async deleteSystemPrompt(id: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROMPTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROMPTS_STORE);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('删除系统提示词失败:', request.error);
        reject(request.error);
      };
    });
  }
  
  // 获取活跃的系统提示词
  async getActiveSystemPrompt(): Promise<SystemPrompt | null> {
    try {
      const settings = await this.getSettings();
      if (settings.activePromptId) {
        return await this.getSystemPromptById(settings.activePromptId);
      }
      
      // 如果没有活跃提示词ID，返回第一个提示词
      const allPrompts = await this.getAllSystemPrompts();
      return allPrompts.length > 0 ? allPrompts[0] : null;
    } catch (error) {
      console.error('获取活跃系统提示词失败:', error);
      return null;
    }
  }
  
  // 设置活跃的系统提示词
  async setActiveSystemPrompt(promptId: string): Promise<void> {
    try {
      const settings = await this.getSettings();
      await this.saveSettings({
        ...settings,
        activePromptId: promptId
      });
    } catch (error) {
      console.error('设置活跃系统提示词失败:', error);
      throw error;
    }
  }
}

export const chatHistoryDB = new ChatHistoryDB(); 