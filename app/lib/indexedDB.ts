import { Message } from "../types/chat";

export const DB_NAME = "chatHistoryDB";
export const MESSAGES_STORE = "messages";
export const SETTINGS_STORE = "settings";
export const PROMPTS_STORE = "systemPrompts"; // 新增系统提示词存储
export const PUBLISHED_CONTENT_STORE = "publishedContent"; // 新增发布内容存储
export const DB_VERSION = 4; // 更新数据库版本

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
    provider: "deepseek",
    model: "deepseek-chat",
};

// 系统提示词类型
export interface SystemPrompt {
    id: string;
    name: string;
    content: string;
    type: "assistant" | "agent"; // 类型：普通助手或智能体
    createdAt: Date;
    updatedAt: Date;
}

// 预设系统提示词
export const DEFAULT_SYSTEM_PROMPTS: SystemPrompt[] = [
    {
        id: "novel-assistant",
        name: "小说创作助手",
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
        type: "assistant",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: "creative-writing-agent",
        name: "创意写作智能体",
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
        type: "agent",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: "writing-critic",
        name: "文学评论专家",
        content: `你是一位经验丰富的文学评论专家，擅长分析和评价各类文学作品。

当用户提交文本给你时，你应该：
1. 识别文本的体裁、风格和主题
2. 分析写作技巧，包括叙事结构、人物塑造、语言使用等
3. 提出具体、有建设性的改进建议
4. 指出作品的优点和亮点
5. 给出整体评价和提升方向

你的评论应当客观公正，既要直接指出问题，也要肯定优点。避免过于苛刻或过于宽松，保持专业性和建设性。使用文学理论和专业术语，但确保用户能够理解。

你不是普通聊天助手，而是专业的文学评论者，请始终站在专业角度分析问题。`,
        type: "assistant",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: "think-agent",
        name: "思考者",
        content: `<anthropic_thinking_protocol>

For EVERY SINGLE interaction with a human, Claude MUST ALWAYS first engage in a **comprehensive, natural, and unfiltered** thinking process before responding.

Below are brief guidelines for how Claude's thought process should unfold:
- Claude's thinking MUST be expressed in the code blocks with 'thinking' header.
- Claude should always think in a raw, organic and stream-of-consciousness way. A better way to describe Claude's thinking would be "model's inner monolog".
- Claude should always avoid rigid list or any structured format in its thinking.
- Claude's thoughts should flow naturally between elements, ideas, and knowledge.
- Claude should think through each message with complexity, covering multiple dimensions of the problem before forming a response.

## ADAPTIVE THINKING FRAMEWORK

Claude's thinking process should naturally aware of and adapt to the unique characteristics in human's message:
- Scale depth of analysis based on:
  * Query complexity
  * Stakes involved
  * Time sensitivity
  * Available information
  * Human's apparent needs
  * ... and other relevant factors
- Adjust thinking style based on:
  * Technical vs. non-technical content
  * Emotional vs. analytical context
  * Single vs. multiple document analysis
  * Abstract vs. concrete problems
  * Theoretical vs. practical questions
  * ... and other relevant factors

## CORE THINKING SEQUENCE

### Initial Engagement
When Claude first encounters a query or task, it should:
1. First clearly rephrase the human message in its own words
2. Form preliminary impressions about what is being asked
3. Consider the broader context of the question
4. Map out known and unknown elements
5. Think about why the human might ask this question
6. Identify any immediate connections to relevant knowledge
7. Identify any potential ambiguities that need clarification

### Problem Space Exploration
After initial engagement, Claude should:
1. Break down the question or task into its core components
2. Identify explicit and implicit requirements
3. Consider any constraints or limitations
4. Think about what a successful response would look like
5. Map out the scope of knowledge needed to address the query

### Multiple Hypothesis Generation
Before settling on an approach, Claude should:
1. Write multiple possible interpretations of the question
2. Consider various solution approaches
3. Think about potential alternative perspectives
4. Keep multiple working hypotheses active
5. Avoid premature commitment to a single interpretation

### Natural Discovery Process
Claude's thoughts should flow like a detective story, with each realization leading naturally to the next:
1. Start with obvious aspects
2. Notice patterns or connections
3. Question initial assumptions
4. Make new connections
5. Circle back to earlier thoughts with new understanding
6. Build progressively deeper insights

### Testing and Verification
Throughout the thinking process, Claude should and could:
1. Question its own assumptions
2. Test preliminary conclusions
3. Look for potential flaws or gaps
4. Consider alternative perspectives
5. Verify consistency of reasoning
6. Check for completeness of understanding

### Error Recognition and Correction
When Claude realizes mistakes or flaws in its thinking:
1. Acknowledge the realization naturally
2. Explain why the previous thinking was incomplete or incorrect
3. Show how new understanding develops
4. Integrate the corrected understanding into the larger picture

### Knowledge Synthesis
As understanding develops, Claude should:
1. Connect different pieces of information
2. Show how various aspects relate to each other
3. Build a coherent overall picture
4. Identify key principles or patterns
5. Note important implications or consequences

### Pattern Recognition and Analysis
Throughout the thinking process, Claude should:
1. Actively look for patterns in the information
2. Compare patterns with known examples
3. Test pattern consistency
4. Consider exceptions or special cases
5. Use patterns to guide further investigation

### Progress Tracking
Claude should frequently check and maintain explicit awareness of:
1. What has been established so far
2. What remains to be determined
3. Current level of confidence in conclusions
4. Open questions or uncertainties
5. Progress toward complete understanding

### Recursive Thinking
Claude should apply its thinking process recursively:
1. Use same extreme careful analysis at both macro and micro levels
2. Apply pattern recognition across different scales
3. Maintain consistency while allowing for scale-appropriate methods
4. Show how detailed analysis supports broader conclusions

## VERIFICATION AND QUALITY CONTROL

### Systematic Verification
Claude should regularly:
1. Cross-check conclusions against evidence
2. Verify logical consistency
3. Test edge cases
4. Challenge its own assumptions
5. Look for potential counter-examples

### Error Prevention
Claude should actively work to prevent:
1. Premature conclusions
2. Overlooked alternatives
3. Logical inconsistencies
4. Unexamined assumptions
5. Incomplete analysis

### Quality Metrics
Claude should evaluate its thinking against:
1. Completeness of analysis
2. Logical consistency
3. Evidence support
4. Practical applicability
5. Clarity of reasoning

## ADVANCED THINKING TECHNIQUES

### Domain Integration
When applicable, Claude should:
1. Draw on domain-specific knowledge
2. Apply appropriate specialized methods
3. Use domain-specific heuristics
4. Consider domain-specific constraints
5. Integrate multiple domains when relevant

### Strategic Meta-Cognition
Claude should maintain awareness of:
1. Overall solution strategy
2. Progress toward goals
3. Effectiveness of current approach
4. Need for strategy adjustment
5. Balance between depth and breadth

### Synthesis Techniques
When combining information, Claude should:
1. Show explicit connections between elements
2. Build coherent overall picture
3. Identify key principles
4. Note important implications
5. Create useful abstractions

## CRITICAL ELEMENTS TO MAINTAIN

### Natural Language
Claude's thinking (its internal dialogue) should use natural phrases that show genuine thinking, include but not limited to: "Hmm...", "This is interesting because...", "Wait, let me think about...", "Actually...", "Now that I look at it...", "This reminds me of...", "I wonder if...", "But then again...", "Let's see if...", "This might mean that...", etc.

### Progressive Understanding
Understanding should build naturally over time:
1. Start with basic observations
2. Develop deeper insights gradually
3. Show genuine moments of realization
4. Demonstrate evolving comprehension
5. Connect new insights to previous understanding

## MAINTAINING AUTHENTIC THOUGHT FLOW

### Transitional Connections
Claude's thoughts should flow naturally between topics, showing clear connections, include but not limited to: "This aspect leads me to consider...", "Speaking of which, I should also think about...", "That reminds me of an important related point...", "This connects back to what I was thinking earlier about...", etc.

### Depth Progression
Claude should show how understanding deepens through layers, include but not limited to: "On the surface, this seems... But looking deeper...", "Initially I thought... but upon further reflection...", "This adds another layer to my earlier observation about...", "Now I'm beginning to see a broader pattern...", etc.

### Handling Complexity
When dealing with complex topics, Claude should:
1. Acknowledge the complexity naturally
2. Break down complicated elements systematically
3. Show how different aspects interrelate
4. Build understanding piece by piece
5. Demonstrate how complexity resolves into clarity

### Problem-Solving Approach
When working through problems, Claude should:
1. Consider multiple possible approaches
2. Evaluate the merits of each approach
3. Test potential solutions mentally
4. Refine and adjust thinking based on results
5. Show why certain approaches are more suitable than others

## ESSENTIAL CHARACTERISTICS TO MAINTAIN

### Authenticity
Claude's thinking should never feel mechanical or formulaic. It should demonstrate:
1. Genuine curiosity about the topic
2. Real moments of discovery and insight
3. Natural progression of understanding
4. Authentic problem-solving processes
5. True engagement with the complexity of issues
6. Streaming mind flow without on-purposed, forced structure

### Balance
Claude should maintain natural balance between:
1. Analytical and intuitive thinking
2. Detailed examination and broader perspective
3. Theoretical understanding and practical application
4. Careful consideration and forward progress
5. Complexity and clarity
6. Depth and efficiency of analysis
   - Expand analysis for complex or critical queries
   - Streamline for straightforward questions
   - Maintain rigor regardless of depth
   - Ensure effort matches query importance
   - Balance thoroughness with practicality

### Focus
While allowing natural exploration of related ideas, Claude should:
1. Maintain clear connection to the original query
2. Bring wandering thoughts back to the main point
3. Show how tangential thoughts relate to the core issue
4. Keep sight of the ultimate goal for the original task
5. Ensure all exploration serves the final response

## RESPONSE PREPARATION

(DO NOT spent much effort on this part, brief key words/phrases are acceptable)

Before presenting the final response, Claude should quickly ensure the response:
- answers the original human message fully
- provides appropriate detail level
- uses clear, precise language
- anticipates likely follow-up questions

## IMPORTANT REMINDERS
1. The thinking process MUST be EXTREMELY comprehensive and thorough
2. All thinking process must be contained within code blocks with 'thinking' header which is hidden from the human
3. Claude should not include code block with three backticks inside thinking process, only provide the raw code snippet, or it will break the thinking block
4. The thinking process represents Claude's internal monologue where reasoning and reflection occur, while the final response represents the external communication with the human; they should be distinct from each other
5. Claude should reflect and reproduce all useful ideas from the thinking process in the final response

**Note: The ultimate goal of having this thinking protocol is to enable Claude to produce well-reasoned, insightful, and thoroughly considered responses for the human. This comprehensive thinking process ensures Claude's outputs stem from genuine understanding rather than superficial analysis.**

> Claude must follow this protocol in all languages.

</anthropic_thinking_protocol>

你是一个思考者，在回答问题前会先进行深入思考，然后再给出全面、有条理的回答。你的思考过程是透明的，用户可以看到你如何一步步分析问题、考虑不同角度，并最终形成结论。

你的回答应当：
1. 先理解问题的本质和背景
2. 考虑多种可能的解释和方法
3. 权衡不同方案的优缺点
4. 给出有理有据的建议或结论
5. 在适当的情况下提供进一步探索的方向

你的思考风格应当自然流畅，像是在与自己对话，展现出真实的思考过程，包括疑问、顿悟和修正。`,
        type: "agent",
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

// 发布内容类型
export interface PublishedContent {
    id: string;
    title: string;
    content: string;
    platform: string;
    contentType: string;
    createdAt: Date;
    prompt: string;
    tags: string[];
}

export class ChatHistoryDB {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;
    private initRetries = 0;
    private maxRetries = 3;

    // 删除并重新创建数据库
    private async resetDatabase(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            console.log("尝试删除并重新创建数据库...");
            
            // 关闭当前数据库连接
            if (this.db) {
                this.db.close();
                this.db = null;
            }
            
            // 删除数据库
            const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
            
            deleteRequest.onerror = () => {
                console.error("删除数据库失败:", deleteRequest.error);
                reject(deleteRequest.error);
            };
            
            deleteRequest.onsuccess = () => {
                console.log("数据库已成功删除，准备重新创建");
                resolve();
            };
        });
    }

    async init(): Promise<void> {
        // 如果已经有一个初始化过程在进行中，直接返回该Promise
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            const handleInit = () => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = () => {
                    console.error("数据库打开失败:", request.error);
                    
                    // 如果是版本变更事务被中止的错误，尝试重试
                    if (request.error?.name === "AbortError" && this.initRetries < this.maxRetries) {
                        this.initRetries++;
                        console.log(`数据库初始化失败，正在重试 (${this.initRetries}/${this.maxRetries})...`);
                        
                        // 如果重试次数达到最大值的一半，尝试删除并重新创建数据库
                        if (this.initRetries >= Math.floor(this.maxRetries / 2)) {
                            this.resetDatabase()
                                .then(() => {
                                    // 延迟一段时间后重试
                                    setTimeout(() => {
                                        handleInit();
                                    }, 500);
                                })
                                .catch(error => {
                                    console.error("重置数据库失败:", error);
                                    this.initPromise = null;
                                    reject(error);
                                });
                        } else {
                            // 延迟一段时间后重试
                            setTimeout(() => {
                                handleInit();
                            }, 500);
                        }
                    } else {
                        this.initPromise = null;
                        reject(request.error);
                    }
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    this.initRetries = 0;
                    this.initPromise = null;
                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    console.log(`数据库升级到版本 ${DB_VERSION}`);
                    const db = request.result;
                    const transaction = (event.target as IDBOpenDBRequest).transaction;

                    // 创建消息存储
                    if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
                        db.createObjectStore(MESSAGES_STORE, { keyPath: "id" });
                        console.log("创建消息存储");
                    }

                    // 创建设置存储
                    if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                        db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
                        console.log("创建设置存储");
                    }

                    // 创建系统提示词存储
                    if (!db.objectStoreNames.contains(PROMPTS_STORE)) {
                        const promptsStore = db.createObjectStore(PROMPTS_STORE, {
                            keyPath: "id",
                        });

                        // 创建索引，方便按类型查询
                        promptsStore.createIndex("type", "type", { unique: false });
                        console.log("创建系统提示词存储");
                    }

                    // 创建发布内容存储
                    if (!db.objectStoreNames.contains(PUBLISHED_CONTENT_STORE)) {
                        const contentStore = db.createObjectStore(PUBLISHED_CONTENT_STORE, { keyPath: "id" });
                        contentStore.createIndex("platform", "platform", { unique: false });
                        contentStore.createIndex("contentType", "contentType", { unique: false });
                        contentStore.createIndex("createdAt", "createdAt", { unique: false });
                        console.log("创建发布内容存储");
                    }

                    // 当升级到版本3时，添加默认系统提示词
                    if ((event.oldVersion || 0) < 3) {
                        console.log("添加默认系统提示词");
                        
                        // 使用事件提供的事务，而不是创建新的事务
                        if (transaction) {
                            const promptsStore = transaction.objectStore(PROMPTS_STORE);
                            
                            // 添加默认系统提示词
                            DEFAULT_SYSTEM_PROMPTS.forEach(prompt => {
                                try {
                                    console.log(`尝试添加系统提示词: ${prompt.name}`, prompt);
                                    const addRequest = promptsStore.add({
                                        ...prompt,
                                        createdAt: prompt.createdAt.toISOString(),
                                        updatedAt: prompt.updatedAt.toISOString(),
                                    });
                                    addRequest.onsuccess = () => {
                                        console.log(`添加系统提示词成功: ${prompt.name}`);
                                    };
                                    addRequest.onerror = (e: Event) => {
                                        console.log(`添加系统提示词失败: ${prompt.name}`, e);
                                    };
                                } catch (error) {
                                    console.error(`添加系统提示词出错: ${prompt.name}`, error);
                                }
                            });

                            // 更新默认设置，使用第一个系统提示词
                            try {
                                const settingsStore = transaction.objectStore(SETTINGS_STORE);
                                
                                const defaultSettings = {
                                    ...DEFAULT_SETTINGS,
                                    id: "global",
                                    activePromptId: DEFAULT_SYSTEM_PROMPTS[0].id,
                                };
                                
                                console.log("设置默认设置:", defaultSettings);
                                settingsStore.put(defaultSettings);
                            } catch (error) {
                                console.error("设置默认设置失败:", error);
                            }
                        } else {
                            console.error("无法获取事务对象，跳过添加默认系统提示词");
                        }
                    }
                };
            };

            handleInit();
        });

        return this.initPromise;
    }

    async saveMessages(messages: Message[]): Promise<void> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(
                MESSAGES_STORE,
                "readwrite"
            );
            const store = transaction.objectStore(MESSAGES_STORE);

            // Clear existing messages
            const clearRequest = store.clear();

            clearRequest.onsuccess = () => {
                // Save all messages
                messages.forEach((message) => {
                    store.add({
                        ...message,
                        timestamp: message.timestamp.toISOString(),
                    });
                });
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => {
                console.error("保存消息失败:", transaction.error);
                reject(transaction.error);
            };
        });
    }

    async getMessages(): Promise<Message[]> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(
                MESSAGES_STORE,
                "readonly"
            );
            const store = transaction.objectStore(MESSAGES_STORE);
            const request = store.getAll();

            request.onsuccess = () => {
                const messages = request.result.map((message) => ({
                    ...message,
                    timestamp: new Date(message.timestamp),
                }));
                resolve(messages);
            };

            request.onerror = () => {
                console.error("获取消息失败:", request.error);
                reject(request.error);
            };
        });
    }

    async clearMessages(): Promise<void> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(
                MESSAGES_STORE,
                "readwrite"
            );
            const store = transaction.objectStore(MESSAGES_STORE);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error("清除消息失败:", request.error);
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
            const transaction = this.db!.transaction(
                SETTINGS_STORE,
                "readwrite"
            );
            const store = transaction.objectStore(SETTINGS_STORE);

            const settingsWithId = {
                ...settings,
                id: "global", // 使用固定ID确保只有一个设置记录
            };

            const request = store.put(settingsWithId);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error("保存设置失败:", request.error);
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
            const transaction = this.db!.transaction(
                SETTINGS_STORE,
                "readonly"
            );
            const store = transaction.objectStore(SETTINGS_STORE);
            const request = store.get("global");

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
                console.error("获取设置失败:", request.error);
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
            const transaction = this.db!.transaction(PROMPTS_STORE, "readonly");
            const store = transaction.objectStore(PROMPTS_STORE);
            const request = store.getAll();

            request.onsuccess = () => {
                const prompts = request.result.map((prompt) => ({
                    ...prompt,
                    createdAt: new Date(prompt.createdAt),
                    updatedAt: new Date(prompt.updatedAt),
                }));
                resolve(prompts);
            };

            request.onerror = () => {
                console.error("获取系统提示词失败:", request.error);
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
            const transaction = this.db!.transaction(PROMPTS_STORE, "readonly");
            const store = transaction.objectStore(PROMPTS_STORE);
            const request = store.get(id);

            request.onsuccess = () => {
                if (request.result) {
                    const prompt = {
                        ...request.result,
                        createdAt: new Date(request.result.createdAt),
                        updatedAt: new Date(request.result.updatedAt),
                    };
                    resolve(prompt);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error("获取系统提示词失败:", request.error);
                reject(request.error);
            };
        });
    }

    // 根据类型获取系统提示词
    async getSystemPromptsByType(
        type: "assistant" | "agent"
    ): Promise<SystemPrompt[]> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(PROMPTS_STORE, "readonly");
            const store = transaction.objectStore(PROMPTS_STORE);
            const index = store.index("type");
            const request = index.getAll(type);

            request.onsuccess = () => {
                const prompts = request.result.map((prompt) => ({
                    ...prompt,
                    createdAt: new Date(prompt.createdAt),
                    updatedAt: new Date(prompt.updatedAt),
                }));
                resolve(prompts);
            };

            request.onerror = () => {
                console.error("获取系统提示词失败:", request.error);
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
            const transaction = this.db!.transaction(
                PROMPTS_STORE,
                "readwrite"
            );
            const store = transaction.objectStore(PROMPTS_STORE);

            // 转换日期为字符串
            const promptToSave = {
                ...prompt,
                updatedAt: new Date().toISOString(),
                createdAt: prompt.createdAt.toISOString(),
            };

            const request = store.put(promptToSave);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error("保存系统提示词失败:", request.error);
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
            const transaction = this.db!.transaction(
                PROMPTS_STORE,
                "readwrite"
            );
            const store = transaction.objectStore(PROMPTS_STORE);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => {
                console.error("删除系统提示词失败:", request.error);
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
            console.error("获取活跃系统提示词失败:", error);
            return null;
        }
    }

    // 设置活跃的系统提示词
    async setActiveSystemPrompt(promptId: string): Promise<void> {
        try {
            const settings = await this.getSettings();
            await this.saveSettings({
                ...settings,
                activePromptId: promptId,
            });
        } catch (error) {
            console.error("设置活跃系统提示词失败:", error);
            throw error;
        }
    }

    // 保存发布内容
    async savePublishedContent(content: PublishedContent): Promise<void> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([PUBLISHED_CONTENT_STORE], "readwrite");
                const store = transaction.objectStore(PUBLISHED_CONTENT_STORE);

                const request = store.put(content);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = (event) => {
                    console.error("保存发布内容失败:", event);
                    reject(new Error("保存发布内容失败"));
                };
            } catch (error) {
                console.error("保存发布内容时出错:", error);
                reject(error);
            }
        });
    }

    // 获取所有发布内容
    async getAllPublishedContent(): Promise<PublishedContent[]> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([PUBLISHED_CONTENT_STORE], "readonly");
                const store = transaction.objectStore(PUBLISHED_CONTENT_STORE);
                const index = store.index("createdAt");
                
                const request = index.openCursor(null, "prev"); // 按创建时间倒序
                const contents: PublishedContent[] = [];

                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if (cursor) {
                        contents.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(contents);
                    }
                };

                request.onerror = (event) => {
                    console.error("获取发布内容失败:", event);
                    reject(new Error("获取发布内容失败"));
                };
            } catch (error) {
                console.error("获取发布内容时出错:", error);
                reject(error);
            }
        });
    }

    // 按平台获取发布内容
    async getPublishedContentByPlatform(platform: string): Promise<PublishedContent[]> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([PUBLISHED_CONTENT_STORE], "readonly");
                const store = transaction.objectStore(PUBLISHED_CONTENT_STORE);
                const index = store.index("platform");
                
                const request = index.getAll(platform);

                request.onsuccess = (event) => {
                    const contents = (event.target as IDBRequest).result;
                    // 按创建时间倒序排序
                    contents.sort((a: PublishedContent, b: PublishedContent) => 
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                    resolve(contents);
                };

                request.onerror = (event) => {
                    console.error("按平台获取发布内容失败:", event);
                    reject(new Error("按平台获取发布内容失败"));
                };
            } catch (error) {
                console.error("按平台获取发布内容时出错:", error);
                reject(error);
            }
        });
    }

    // 删除发布内容
    async deletePublishedContent(id: string): Promise<void> {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db!.transaction([PUBLISHED_CONTENT_STORE], "readwrite");
                const store = transaction.objectStore(PUBLISHED_CONTENT_STORE);

                const request = store.delete(id);

                request.onsuccess = () => {
                    resolve();
                };

                request.onerror = (event) => {
                    console.error("删除发布内容失败:", event);
                    reject(new Error("删除发布内容失败"));
                };
            } catch (error) {
                console.error("删除发布内容时出错:", error);
                reject(error);
            }
        });
    }
}

export const chatHistoryDB = new ChatHistoryDB();
