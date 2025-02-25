/*
 * @LastEditors: biz
 */
import { LLMResponse, StreamChunk, GenerateParams, LLMModel, ConnectionTestResult, SpeedTestResult } from '../../types/llm';

export interface LLMProviderInterface {
  generateRecommendation(params: GenerateParams): Promise<LLMResponse>;
  generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown>;
  testConnection(): Promise<ConnectionTestResult>;
  testSpeed(model: string): Promise<SpeedTestResult>;
  getAvailableModels(): Promise<LLMModel[]>;
}

export abstract class BaseLLMProvider implements LLMProviderInterface {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * 解析API错误响应
   * @param response 响应对象
   * @param provider 提供商名称
   * @returns 格式化的错误信息
   */
  protected async parseErrorResponse(response: Response, provider: string = 'unknown'): Promise<string> {
    let errorMessage = `请求失败: ${response.status} ${response.statusText}`;
    let errorDetails = '';
    
    try {
      // 尝试读取响应文本
      const errorText = await response.text();
      
      // 记录原始错误响应
      console.error(`${provider} API错误响应(${response.status})内容:`, errorText);
      
      // 尝试解析为JSON
      try {
        const errorData = JSON.parse(errorText);
        
        // 根据不同提供商解析错误信息
        if (provider === 'deepseek') {
          // DeepSeek错误格式
          errorDetails = this.parseDeepSeekError(response.status, errorData);
        } else if (provider === 'siliconflow') {
          // SiliconFlow错误格式
          errorDetails = errorData.error?.message || errorData.message || errorText;
        } else {
          // 通用错误格式
          errorDetails = errorData.error?.message || 
                        errorData.message || 
                        errorData.error || 
                        errorText;
        }
      } catch (e) {
        // 如果不是JSON，使用原始文本
        errorDetails = errorText;
      }
    } catch (e) {
      console.error('读取错误响应失败:', e);
      errorDetails = '无法读取错误详情';
    }
    
    return errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage;
  }
  
  /**
   * 解析DeepSeek特定的错误码
   * @param statusCode HTTP状态码
   * @param errorData 错误数据对象
   * @returns 格式化的错误信息和建议
   */
  private parseDeepSeekError(statusCode: number, errorData: any): string {
    const errorMessage = errorData.error?.message || errorData.message || '未知错误';
    let suggestion = '';
    
    // 根据DeepSeek的错误码提供具体建议
    switch (statusCode) {
      case 400:
        suggestion = '请求格式错误，请检查请求体格式是否正确';
        break;
      case 401:
        suggestion = 'API密钥认证失败，请检查API密钥是否正确有效';
        break;
      case 402:
        suggestion = '账号余额不足，请前往DeepSeek官网充值';
        break;
      case 422:
        suggestion = '请求参数错误，请根据错误信息修改相关参数';
        break;
      case 429:
        suggestion = '请求速率达到上限(TPM或RPM)，请降低请求频率或稍后重试';
        break;
      case 500:
        suggestion = '服务器内部故障，请稍后重试';
        break;
      case 503:
        suggestion = '服务器负载过高，请稍后重试';
        break;
      default:
        suggestion = '请检查请求参数或稍后重试';
    }
    
    return `${errorMessage}。${suggestion}`;
  }

  abstract generateRecommendation(params: GenerateParams): Promise<LLMResponse>;
  abstract generateRecommendationStream(params: GenerateParams): AsyncGenerator<StreamChunk, void, unknown>;
  abstract getAvailableModels(): Promise<LLMModel[]>;

  protected validateGeneratedContent(content: string | undefined): boolean {
    if (!content) return false;
    // 检查内容是否为空或只包含空白字符
    if (content.trim().length === 0) return false;
    // 检查内容是否包含有意义的文本（至少包含一些中文字符）
    const hasChinese = /[\u4e00-\u9fa5]/.test(content);
    return hasChinese;
  }

  async testSpeed(model: string): Promise<SpeedTestResult> {
    const startTime = Date.now();
    try {
      console.log(`开始测试模型 ${model} 的生成速度...`);
      
      const testPrompt =`你是 一位专业的小说世界设定设计师。请根据用户的要求，设计一个完全独特的世界设定。在构建世界时， 你需要考虑以下五个核心维度：\\n\\n1. 物理维度（世界的\\"骨架\\"）：\\n   - 空间广度：地理环境、地形特征、气候变化\\n   - 时间纵深：历史跨度、文明演变、时间规则\\n   - 自然法则：基础 规则、魔法/科技系统、因果关系\\n\\n2. 社会维度（世界的\\"血肉\\"）：\\n   - 权力结构：阶级 制度、种族关系、组织架构\\n   - 文化符号：语言系统、宗教信仰、风俗习惯\\n   - 经济系统：资 源分配、贸易关系、生存法则\\n\\n3. 心理维度（世界的\\"灵魂\\"）：\\n   - 角色视角：群体认知、个体感受、价值观念\\n   - 情感共鸣：集体情绪、心理状态、情感纽带\\n   - 集体潜意识：神话 原型、群体记忆、共同信念\\n\\n4. 哲学维度（世界的\\"本质\\"）：\\n   - 存在命题：世界观、价值体系、命运规律\\n   - 伦理困境：道德准则、价值冲突、选择难题\\n   - 虚实边界：现实与幻想 、真相与谎言、梦境与觉醒\\n\\n5. 叙事维度（世界的\\"节奏\\"）：\\n   - 多线交织：故事线索、时空交错、群像展现\\n   - 信息释放：悬念设置、伏笔埋藏、真相揭示\\n   - 视角切换：叙事角度 、场景转换、尺度变化\\n\\n你必须严格按照以下 JSON 格式返回世界设定，不要包含任何其他内容：\\n\\n{\\n  \\"name\\": \\"世界名称（30字以内）\\",\\n  \\"description\\": \\"世界总体描述（500字以内，需要体现多维度的交织）\\",\\n  \\"geography\\": {\\n    \\"terrain\\": [\\n      {\\n        \\"name\\": \\"地形名称\\",\\n        \\"description\\": \\"地形描述\\",\\n        \\"significance\\": \\"地形意义（需要体现物理、社会、心理等多个维度的影响）\\",\\n        \\"attributes\\": {\\n          \\"climate\\": \\"气候特征\\",\\n          \\"resources\\": \\"资源特点\\",\\n          \\"habitability\\": \\"宜居程度\\",\\n          \\"spatial_type\\": \\"空间类型（连续/异质可连接/异质隔离）\\",\\n          \\"spatial_connection\\": \\"与其他空间的连接方式\\",\\n          \\"spatial_boundary\\": \\"空间边界特征\\",\\n          \\"spatial_flow\\": \\"空间内的流动性\\",\\n          \\"spatial_perception\\": \\"空间的感知方式（心理维度）\\",\\n          \\"spatial_symbolism\\": \\"空间的象征意义（哲学维度）\\",\\n          \\"cultural_impact\\": \\"对文化的影响（社会维度）\\",\\n          \\"narrative_role\\": \\"在故事中的作用（叙事维度）\\"\\n        }\\n      }\\n    ],\\n    \\"climate\\": [\\n      {\\n        \\"name\\": \\"气候区域\\",\\n        \\"description\\": \\"气候描述\\",\\n        \\"significance\\": \\"气候影响\\",\\n        \\"attributes\\": {\\n          \\"seasons\\": \\"季节变化\\",\\n          \\"extremes\\": \\"极端天气\\",\\n          \\"effects\\": \\"对生活的影响\\"\\n        }\\n      }\\n    ],\\n    \\"locations\\": [\\n      {\\n        \\"name\\": \\"重要地点\\",\\n        \\"description\\": \\"地点描述\\",\\n        \\"significance\\": \\"地点意义\\",\\n        \\"attributes\\": {\\n          \\"type\\": \\"地点类型\\",\\n          \\"population\\": \\"人口情况\\",\\n          \\"features\\": \\"特色\\"\\n        }\\n      }\\n    ],\\n    \\"spatialStructure\\": {\\n      \\"type\\": \\"空间结构类型\\",\\n      \\"description\\": \\"空间结构描述（需要 体现多维度的统一性）\\",\\n      \\"physicalLayer\\": {\\n        \\"topology\\": \\"空间拓扑结构\\",\\n        \\"dynamics\\": \\"空间动态特性\\",\\n        \\"boundaries\\": \\"物 理边界\\"\\n      },\\n      \\"socialLayer\\": {\\n        \\"territories\\": \\"社会区域 划分\\",\\n        \\"interactions\\": \\"区域间互动\\",\\n        \\"hierarchies\\": \\"空间等级制度\\"\\n      },\\n      \\"psychologicalLayer\\": {\\n        \\"perceptions\\": \\"空间感知模式\\",\\n        \\"emotions\\": \\"情感地理\\",\\n        \\"memories\\": \\" 集体记忆场所\\"\\n      },\\n      \\"philosophicalLayer\\": {\\n        \\"symbolism\\": \\"空间象征系统\\",\\n        \\"metaphysics\\": \\"空间形而上学\\",\\n        \\"ethics\\": \\"空间伦理\\"\\n      },\\n      \\"narrativeLayer\\": {\\n        \\"plotPoints\\": \\" 关键剧情节点\\",\\n        \\"transitions\\": \\"场景转换机制\\",\\n        \\"perspectives\\": \\"叙事视角变化\\"\\n      }\\n    }\\n  },\\n  \\"culture\\": {\\n    \\"societies\\": [\\n      {\\n        \\"name\\": \\"社会群体\\",\\n        \\"description\\": \\"群体描 述\\",\\n        \\"significance\\": \\"群体地位\\",\\n        \\"attributes\\": {\\n          \\"structure\\": \\"社会结构\\",\\n          \\"values\\": \\"价值观\\",\\n          \\"customs\\": \\"习俗\\"\\n        }\\n      }\\n    ],\\n    \\"customs\\": [\\n      {\\n        \\"name\\": \\"习俗名称\\",\\n        \\"description\\": \\"习俗描述\\",\\n        \\"significance\\": \\"习俗意义\\",\\n        \\"attributes\\": {\\n          \\"origin\\": \\"起源\\",\\n          \\"practice\\": \\"实践方式\\",\\n          \\"impact\\": \\"影响\\"\\n        }\\n      }\\n    ],\\n    \\"religions\\": [\\n      {\\n        \\"name\\": \\"宗教信仰\\",\\n        \\"description\\": \\"信仰描述\\",\\n        \\"significance\\": \\"信仰影响\\",\\n        \\"attributes\\": {\\n          \\"beliefs\\": \\"核心信条\\",\\n          \\"practices\\": \\"宗教活动\\",\\n          \\"influence\\": \\"社会影响\\"\\n        }\\n      }\\n    ],\\n    \\"politics\\": [\\n      {\\n        \\"name\\": \\"政治体系\\",\\n        \\"description\\": \\"体系描述\\",\\n        \\"significance\\": \\"政治影响\\",\\n        \\"attributes\\": {\\n          \\"structure\\": \\"权力结构\\",\\n          \\"leadership\\": \\"领导方式\\",\\n          \\"laws\\": \\"法律制度\\"\\n        }\\n      }\\n    ]\\n  },\\n  \\n  \\"magicSystem\\": {\\n    \\"rules\\": [\\n      {\\n        \\"name\\": \\"魔法规则\\",\\n        \\"description\\": \\"规则描述\\",\\n        \\"significance\\": \\"规则重要性\\",\\n        \\"attributes\\": {\\n          \\"mechanics\\": \\"运作机制\\",\\n          \\"limitations\\": \\"限制条件\\",\\n          \\"consequences\\": \\"使用后果\\"\\n        }\\n      }\\n    ],\\n    \\"elements\\": [\\n      {\\n        \\"name\\": \\"魔法元素\\",\\n        \\"description\\": \\"元素描述\\",\\n        \\"significance\\": \\"元素作用\\",\\n        \\"attributes\\": {\\n          \\"properties\\": \\"特性\\",\\n          \\"interactions\\": \\"相互作用\\",\\n          \\"applications\\": \\"应用\\"\\n        }\\n      }\\n    ],\\n    \\"practitioners\\": [\\n      {\\n        \\"name\\": \\"施法者类型\\",\\n        \\"description\\": \\"类型描述\\",\\n        \\"significance\\": \\"社会地位\\",\\n        \\"attributes\\": {\\n          \\"abilities\\": \\"能力\\",\\n          \\"training\\": \\"训练方式\\",\\n          \\"restrictions\\": \\" 限制\\"\\n        }\\n      }\\n    ],\\n    \\"limitations\\": [\\n      {\\n        \\"name\\": \\"限制条件\\",\\n        \\"description\\": \\"限制描述\\",\\n        \\"significance\\": \\"限制意义\\",\\n        \\"attributes\\": {\\n          \\"scope\\": \\"影响范围\\",\\n          \\"consequences\\": \\"违反后果\\",\\n          \\"workarounds\\": \\"应对方法\\"\\n        }\\n      }\\n    ]\\n  },\\n  \\n  \\"history\\": [\\n    {\\n      \\"name\\": \\"历史事件\\",\\n      \\"description\\": \\"事件描述\\",\\n      \\"significance\\": \\"历史意义\\",\\n      \\"attributes\\": {\\n        \\"period\\": \\"时期\\",\\n        \\"impact\\": \\"影响\\",\\n        \\"legacy\\": \\"遗留问题\\"\\n      }\\n    }\\n  ],\\n  \\"conflicts\\": [\\n    {\\n      \\"name\\": \\"冲突\\",\\n      \\"description\\": \\"冲突描述\\",\\n      \\"significance\\": \\"冲突影响\\",\\n      \\"attributes\\": {\\n        \\"parties\\": \\"冲突方\\",\\n        \\"causes\\": \\"起因\\",\\n        \\"status\\": \\"现状\\"\\n      }\\n    }\\n  ]\\n}\\n\\n注意事项：\\n1. 必须严格按照给定的 JSON 格 式返回\\n2. 所有字段都必须填写，不能为空\\n3. 世界设定要符合fantasy类型的特点\\n4. 复杂度要求：moderate\\n5. \\n6. 多维度整合要求：\\n   - 确保物理、社会、心理、哲学、叙事五个维度相 互支撑\\n   - 每个设定元素都应该在多个维度上产生影响\\n   - 维度之间的关系要符合逻辑，相互 呼应\\n   - 避免单一维度的孤立设定\\n   - 通过维度交织增强世界的真实感和深度\\n\\n7. 世界构建核心原则：\\n   - 可信度：通过多维度细节的合理叠加\\n   - 沉浸感：强调感官体验和情感投射\\n   - 延展性：预留发展空间和未解之谜\\n   - 主题承载：世界设定要服务于核心主题\\n   - 内在一致：保持设定的自洽性\\n\\n8. 特别注意：\\n   - 物理维度要为其他维度提供基础支撑\\n   - 社会维度要反映群体互动和文化积淀\\n   - 心理维度要体现角色和读者的情感联结\\n   - 哲学维度要 深化世界的思想内涵\\n   - 叙事维度要管理信息流动和节奏把控"},{"role":"user","content":"请根据以下要求设计世界：\\n4355353\\n\\n要求：\\n1. 严格遵循系统提示词中的格式要求\\n2. 确保生 成的内容符合fantasy类型的特点\\n3. 保持世界设定的完整性和连贯性\\n4. 根据用户的具体要求调整细节`;
      console.log(`发送测试提示: ${testPrompt}`);

      const result = await this.generateRecommendation({
        userPrompt: testPrompt,
        model: model,
        temperature: 0.7,
        maxTokens: 100
      });

      const duration = Date.now() - startTime;
      console.log(`收到响应，耗时: ${duration}ms`);
      console.log(`响应内容: ${result.content}`);

      // 验证生成的内容
      const isValidContent = this.validateGeneratedContent(result.content);
      console.log(`内容验证: ${isValidContent ? '有效' : '无效'}`);

      if (result.error || !isValidContent) {
        const errorMessage = result.error || '生成的内容无效';
        console.error(`测试失败: ${errorMessage}`);
        return {
          success: false,
          data: {
            duration,
            response: result.content || '',
            model,
            error: errorMessage
          }
        };
      }

      console.log('测试成功完成');
      return {
        success: true,
        data: {
          duration,
          response: result.content || '',
          model
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`测试发生错误:`, error);
      return {
        success: false,
        data: {
          duration,
          response: '',
          model,
          error: error instanceof Error ? error.message : '未知错误'
        }
      };
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    try {
      // 1. 测试获取模型列表的延迟
      const models = await this.getAvailableModels();
      const latency = Date.now() - startTime;

      // 2. 测试生成速度
      const generationStartTime = Date.now();
      const testPrompt = "请用一句话介绍你自己。";
      const generationResult = await this.generateRecommendation({
        userPrompt: testPrompt,
        model: models[0]?.id, // 使用第一个可用的模型
        temperature: 0.7,
        maxTokens: 100
      });

      const generationTime = Date.now() - generationStartTime;

      // 3. 返回完整的测试结果
      return {
        success: true,
        latency,
        availableModels: models,
        modelCount: models.length,
        apiEndpoint: this.baseUrl,
        generationTest: {
          success: !generationResult.error,
          content: generationResult.content,
          generationTime,
          error: generationResult.error,
        }
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latency,
        error: error instanceof Error ? error.message : '未知错误',
        apiEndpoint: this.baseUrl,
        generationTest: {
          success: false,
          generationTime: 0,
          error: error instanceof Error ? error.message : '未知错误'
        }
      };
    }
  }

  protected async handleStreamResponse(
    response: Response,
    onContent: (content: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API 错误: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        errorMessage = errorText;
      }
      onError(errorMessage);
      return;
    }

    if (!response.body) {
      onError('API 返回空响应');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = this.extractContentFromChunk(parsed);
              if (content) {
                onContent(content);
              }
            } catch (e) {
              console.error('解析数据块失败:', e);
            }
          }
        }
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : '未知错误');
    }
  }

  protected abstract extractContentFromChunk(chunk: any): string | null;
} 