import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { LLMFactory } from '../../../llm/factory';
import { LLMDBConfig, LLMProviderConfig } from '../../../types/llm';
import { LLMProviderType } from '../../../llm/providers/factory';
import { z } from 'zod';

// 验证请求体的 schema
const worldGenerateSchema = z.object({
  provider: z.enum(['deepseek', 'siliconflow'] as const),
  model: z.string(),
  prompt: z.string(),
  genre: z.string(),
  complexity: z.string(),
  emphasis: z.object({
    geography: z.boolean(),
    culture: z.boolean(),
    magic: z.boolean(),
    technology: z.boolean(),
  }),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

// 系统提示词模板
const getSystemPrompt = (genre: string, complexity: string, emphasis: any) => {
  const emphasisPoints = [
    emphasis.geography ? '重点描述地理环境特征' : '',
    emphasis.culture ? '重点描述文化社会特征' : '',
    emphasis.magic ? '重点描述魔法系统特征' : '',
    emphasis.technology ? '重点描述科技发展特征' : '',
  ].filter(Boolean).join('\n');

  return `你是一位专业的小说世界设定设计师。请根据用户的要求，设计一个完全独特的世界设定。在构建世界时，你需要考虑以下五个核心维度：

1. 物理维度（世界的"骨架"）：
   - 空间广度：地理环境、地形特征、气候变化
   - 时间纵深：历史跨度、文明演变、时间规则
   - 自然法则：基础规则、魔法/科技系统、因果关系

2. 社会维度（世界的"血肉"）：
   - 权力结构：阶级制度、种族关系、组织架构
   - 文化符号：语言系统、宗教信仰、风俗习惯
   - 经济系统：资源分配、贸易关系、生存法则

3. 心理维度（世界的"灵魂"）：
   - 角色视角：群体认知、个体感受、价值观念
   - 情感共鸣：集体情绪、心理状态、情感纽带
   - 集体潜意识：神话原型、群体记忆、共同信念

4. 哲学维度（世界的"本质"）：
   - 存在命题：世界观、价值体系、命运规律
   - 伦理困境：道德准则、价值冲突、选择难题
   - 虚实边界：现实与幻想、真相与谎言、梦境与觉醒

5. 叙事维度（世界的"节奏"）：
   - 多线交织：故事线索、时空交错、群像展现
   - 信息释放：悬念设置、伏笔埋藏、真相揭示
   - 视角切换：叙事角度、场景转换、尺度变化

你必须严格按照以下 JSON 格式返回世界设定，不要包含任何其他内容：

{
  "name": "世界名称（30字以内）",
  "description": "世界总体描述（500字以内，需要体现多维度的交织）",
  "geography": {
    "terrain": [
      {
        "name": "地形名称",
        "description": "地形描述",
        "significance": "地形意义（需要体现物理、社会、心理等多个维度的影响）",
        "attributes": {
          "climate": "气候特征",
          "resources": "资源特点",
          "habitability": "宜居程度",
          "spatial_type": "空间类型（连续/异质可连接/异质隔离）",
          "spatial_connection": "与其他空间的连接方式",
          "spatial_boundary": "空间边界特征",
          "spatial_flow": "空间内的流动性",
          "spatial_perception": "空间的感知方式（心理维度）",
          "spatial_symbolism": "空间的象征意义（哲学维度）",
          "cultural_impact": "对文化的影响（社会维度）",
          "narrative_role": "在故事中的作用（叙事维度）"
        }
      }
    ],
    "climate": [
      {
        "name": "气候区域",
        "description": "气候描述",
        "significance": "气候影响",
        "attributes": {
          "seasons": "季节变化",
          "extremes": "极端天气",
          "effects": "对生活的影响"
        }
      }
    ],
    "locations": [
      {
        "name": "重要地点",
        "description": "地点描述",
        "significance": "地点意义",
        "attributes": {
          "type": "地点类型",
          "population": "人口情况",
          "features": "特色"
        }
      }
    ],
    "spatialStructure": {
      "type": "空间结构类型",
      "description": "空间结构描述（需要体现多维度的统一性）",
      "physicalLayer": {
        "topology": "空间拓扑结构",
        "dynamics": "空间动态特性",
        "boundaries": "物理边界"
      },
      "socialLayer": {
        "territories": "社会区域划分",
        "interactions": "区域间互动",
        "hierarchies": "空间等级制度"
      },
      "psychologicalLayer": {
        "perceptions": "空间感知模式",
        "emotions": "情感地理",
        "memories": "集体记忆场所"
      },
      "philosophicalLayer": {
        "symbolism": "空间象征系统",
        "metaphysics": "空间形而上学",
        "ethics": "空间伦理"
      },
      "narrativeLayer": {
        "plotPoints": "关键剧情节点",
        "transitions": "场景转换机制",
        "perspectives": "叙事视角变化"
      }
    }
  },
  "culture": {
    "societies": [
      {
        "name": "社会群体",
        "description": "群体描述",
        "significance": "群体地位",
        "attributes": {
          "structure": "社会结构",
          "values": "价值观",
          "customs": "习俗"
        }
      }
    ],
    "customs": [
      {
        "name": "习俗名称",
        "description": "习俗描述",
        "significance": "习俗意义",
        "attributes": {
          "origin": "起源",
          "practice": "实践方式",
          "impact": "影响"
        }
      }
    ],
    "religions": [
      {
        "name": "宗教信仰",
        "description": "信仰描述",
        "significance": "信仰影响",
        "attributes": {
          "beliefs": "核心信条",
          "practices": "宗教活动",
          "influence": "社会影响"
        }
      }
    ],
    "politics": [
      {
        "name": "政治体系",
        "description": "体系描述",
        "significance": "政治影响",
        "attributes": {
          "structure": "权力结构",
          "leadership": "领导方式",
          "laws": "法律制度"
        }
      }
    ]
  },
  ${emphasis.magic ? `"magicSystem": {
    "rules": [
      {
        "name": "魔法规则",
        "description": "规则描述",
        "significance": "规则重要性",
        "attributes": {
          "mechanics": "运作机制",
          "limitations": "限制条件",
          "consequences": "使用后果"
        }
      }
    ],
    "elements": [
      {
        "name": "魔法元素",
        "description": "元素描述",
        "significance": "元素作用",
        "attributes": {
          "properties": "特性",
          "interactions": "相互作用",
          "applications": "应用"
        }
      }
    ],
    "practitioners": [
      {
        "name": "施法者类型",
        "description": "类型描述",
        "significance": "社会地位",
        "attributes": {
          "abilities": "能力",
          "training": "训练方式",
          "restrictions": "限制"
        }
      }
    ],
    "limitations": [
      {
        "name": "限制条件",
        "description": "限制描述",
        "significance": "限制意义",
        "attributes": {
          "scope": "影响范围",
          "consequences": "违反后果",
          "workarounds": "应对方法"
        }
      }
    ]
  },` : ''}
  ${emphasis.technology ? `"technology": {
    "level": "技术水平描述",
    "innovations": [
      {
        "name": "技术创新",
        "description": "创新描述",
        "significance": "创新影响",
        "attributes": {
          "function": "功能",
          "availability": "普及程度",
          "limitations": "局限性"
        }
      }
    ],
    "impact": [
      {
        "name": "影响领域",
        "description": "影响描述",
        "significance": "影响程度",
        "attributes": {
          "social": "社会影响",
          "economic": "经济影响",
          "environmental": "环境影响"
        }
      }
    ]
  },` : ''}
  "history": [
    {
      "name": "历史事件",
      "description": "事件描述",
      "significance": "历史意义",
      "attributes": {
        "period": "时期",
        "impact": "影响",
        "legacy": "遗留问题"
      }
    }
  ],
  "conflicts": [
    {
      "name": "冲突",
      "description": "冲突描述",
      "significance": "冲突影响",
      "attributes": {
        "parties": "冲突方",
        "causes": "起因",
        "status": "现状"
      }
    }
  ]
}

注意事项：
1. 必须严格按照给定的 JSON 格式返回
2. 所有字段都必须填写，不能为空
3. 世界设定要符合${genre}类型的特点
4. 复杂度要求：${complexity}
${emphasisPoints ? `5. 重点关注：\n${emphasisPoints}` : ''}
6. 多维度整合要求：
   - 确保物理、社会、心理、哲学、叙事五个维度相互支撑
   - 每个设定元素都应该在多个维度上产生影响
   - 维度之间的关系要符合逻辑，相互呼应
   - 避免单一维度的孤立设定
   - 通过维度交织增强世界的真实感和深度

7. 世界构建核心原则：
   - 可信度：通过多维度细节的合理叠加
   - 沉浸感：强调感官体验和情感投射
   - 延展性：预留发展空间和未解之谜
   - 主题承载：世界设定要服务于核心主题
   - 内在一致：保持设定的自洽性

8. 特别注意：
   - 物理维度要为其他维度提供基础支撑
   - 社会维度要反映群体互动和文化积淀
   - 心理维度要体现角色和读者的情感联结
   - 哲学维度要深化世界的思想内涵
   - 叙事维度要管理信息流动和节奏把控`;
};

export async function POST(request: NextRequest) {
  try {
    // 解析并验证请求体
    const body = await request.json();
    const result = worldGenerateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: '无效的请求参数',
        details: result.error.format()
      }, { status: 400 });
    }

    const { provider, model, prompt, genre, complexity, emphasis, temperature, maxTokens } = result.data;

    // 验证和调整参数
    const adjustedMaxTokens = Math.min(maxTokens || 2000, 2000); // 限制最大token数为2000
    const adjustedTemperature = Math.min(Math.max(temperature || 0.7, 0.1), 1.0); // 确保温度在0.1-1.0之间
    
    console.log('调整后的参数:', {
      maxTokens: `${maxTokens} -> ${adjustedMaxTokens}`,
      temperature: `${temperature} -> ${adjustedTemperature}`
    });

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
      },
    });

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: '未找到有效的 API Key'
      }, { status: 404 });
    }

    // 验证API密钥格式
    if (!apiKey.key || apiKey.key.trim().length < 10) {
      return NextResponse.json({
        success: false,
        error: 'API密钥格式无效或长度不足',
        details: '请检查API密钥设置'
      }, { status: 400 });
    }

    console.log(`使用${provider}的API密钥，长度: ${apiKey.key.length}`);

    // 创建配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey.key,
      model,
      temperature: adjustedTemperature,
      maxTokens: adjustedMaxTokens
    };

    const config = {
      defaultProvider: provider,
      [provider]: providerConfig
    } as LLMDBConfig;

    // 初始化 LLM Factory
    const factory = LLMFactory.getInstance();
    factory.setConfig(config);

    // 构建系统提示词
    const systemPrompt = getSystemPrompt(genre, complexity, emphasis);
    console.log('系统提示词长度:', systemPrompt.length);

    // 构建用户提示词
    const userPrompt = `请根据以下要求设计世界：
${prompt}

要求：
1. 严格遵循系统提示词中的格式要求
2. 确保生成的内容符合${genre.replace('_', ' ')}类型的特点
3. 保持世界设定的完整性和连贯性
4. 根据用户的具体要求调整细节`;

    console.log('用户提示词长度:', userPrompt.length);
    console.log('总提示词长度:', systemPrompt.length + userPrompt.length);

    // 如果提示词太长，可能导致API失败
    if (systemPrompt.length + userPrompt.length > 10000) {
      console.warn('提示词总长度超过10000，可能导致API调用失败');
      return NextResponse.json({
        success: false,
        error: '提示词过长',
        details: '系统提示词和用户提示词的总长度超过了API限制',
        suggestion: '请减少输入内容或简化要求'
      }, { status: 400 });
    }

    console.log('开始生成世界，参数:', {
      provider,
      model,
      genre,
      complexity,
      emphasis,
      temperature: adjustedTemperature,
      maxTokens: adjustedMaxTokens
    });

    // 尝试减小token数量，避免超出限制
    const safeMaxTokens = Math.min(adjustedMaxTokens, 1500);
    console.log(`为安全起见，将maxTokens从${adjustedMaxTokens}减小到${safeMaxTokens}`);
    
    console.log('开始请求LLM生成世界...');
    const response = await factory.generateRecommendation({
      userPrompt,
      systemPrompt,
      model,
      temperature: adjustedTemperature,
      maxTokens: safeMaxTokens
    }, provider as LLMProviderType);

    // 检查响应是否包含错误
    if (response.error) {
      console.error('LLM生成世界失败:', response.error);
      return NextResponse.json({
        success: false,
        error: '生成世界失败',
        details: response.error,
        provider,
        model,
        suggestion: '请尝试使用不同的模型、减小maxTokens值或检查API密钥状态'
      }, { status: 500 });
    }

    if (!response || !response.content) {
      console.warn('生成的内容为空');
      return NextResponse.json({
        success: false,
        error: '生成的回复为空，请重试',
        details: response?.error || '未知错误',
        provider,
        model,
        suggestion: '请尝试使用不同的模型或减小maxTokens值'
      }, { status: 500 });
    }

    try {
      // 清理并解析 JSON
      console.log('原始响应内容:', response.content.substring(0, 200) + '...');
      
      // 检查响应是否为空
      if (!response.content || response.content.trim().length === 0) {
        return NextResponse.json({
          success: false,
          error: '生成的内容为空',
          details: '模型未返回任何内容',
          suggestion: '请尝试减小maxTokens值或使用不同的模型'
        }, { status: 500 });
      }
      
      // 尝试找到并提取JSON部分
      let jsonContent = response.content;
      let worldData;
      
      // 记录原始响应内容的长度
      console.log('原始响应内容长度:', response.content.length);
      
      // 检查是否包含Markdown代码块
      const jsonBlockMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        console.log('从Markdown代码块中提取JSON');
        jsonContent = jsonBlockMatch[1].trim();
      }
      
      // 查找可能的JSON开始位置
      const jsonStartIndex = jsonContent.indexOf('{');
      if (jsonStartIndex > 0) {
        console.log(`JSON似乎不在开头，从位置${jsonStartIndex}开始提取`);
        jsonContent = jsonContent.substring(jsonStartIndex);
      }
      
      // 查找可能的JSON结束位置
      const lastBraceIndex = jsonContent.lastIndexOf('}');
      if (lastBraceIndex > 0 && lastBraceIndex < jsonContent.length - 1) {
        console.log(`JSON似乎不在末尾，截取到位置${lastBraceIndex + 1}`);
        jsonContent = jsonContent.substring(0, lastBraceIndex + 1);
      }
      
      // 检查是否是DeepSeek API响应中的嵌套JSON
      if (jsonContent.includes('"content":"{')) {
        try {
          // 先解析外层JSON
          const outerData = JSON.parse(jsonContent);
          // 提取内层JSON字符串并处理转义
          if (outerData.choices?.[0]?.message?.content) {
            const innerJsonStr = outerData.choices[0].message.content;
            console.log('检测到DeepSeek嵌套JSON响应，提取内层JSON');
            jsonContent = innerJsonStr;
          }
        } catch (e) {
          console.log('尝试解析嵌套JSON失败，继续使用原始内容');
        }
      }
      
      // 清理JSON字符串
      const cleanJson = jsonContent.replace(/[\r\n\t]/g, ' ').trim();
      console.log('清理后的JSON:', cleanJson.substring(0, 200) + '...');
      
      try {
        worldData = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error('JSON解析失败，尝试修复格式问题:', parseError);
        
        // 检查是否是截断的JSON问题
        const errorMessage = parseError instanceof Error ? parseError.message : '未知错误';
        const positionMatch = errorMessage.match(/position (\d+)/);
        const errorPosition = positionMatch ? parseInt(positionMatch[1]) : -1;
        
        if (errorPosition > 0) {
          console.log(`JSON解析在位置 ${errorPosition} 失败，尝试修复或截断`);
          
          // 如果错误位置接近JSON末尾，可能是截断问题
          if (errorPosition > cleanJson.length * 0.9) {
            console.log('错误位置接近JSON末尾，尝试截断修复');
            try {
              // 尝试在错误位置前找到最后一个完整的属性结束位置
              let truncatedJson = cleanJson.substring(0, errorPosition);
              // 找到最后一个完整的属性（以逗号结尾）
              const lastValidPos = Math.max(
                truncatedJson.lastIndexOf(','),
                truncatedJson.lastIndexOf('}')
              );
              
              if (lastValidPos > 0) {
                truncatedJson = truncatedJson.substring(0, lastValidPos) + '}';
                console.log('截断修复后的JSON:', truncatedJson.substring(0, 200) + '...');
                worldData = JSON.parse(truncatedJson);
                console.log('截断修复成功!');
              }
            } catch (truncateError) {
              console.error('截断修复失败:', truncateError);
            }
          }
        }
        
        // 如果截断修复失败，尝试更全面的修复
        if (!worldData) {
          try {
            // 更全面的JSON修复
            let fixedJson = cleanJson
              .replace(/,\s*}/g, '}')  // 移除对象末尾多余的逗号
              .replace(/,\s*]/g, ']')  // 移除数组末尾多余的逗号
              .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // 确保属性名有引号
              .replace(/\\"/g, '"')    // 处理转义引号
              .replace(/"{/g, '{')     // 修复错误的字符串开始
              .replace(/}"/g, '}')     // 修复错误的字符串结束
              .replace(/\\n/g, ' ')    // 替换换行符
              .replace(/\\t/g, ' ');   // 替换制表符
              
            // 检查并修复未闭合的字符串
            const matches = fixedJson.match(/"(?:[^"\\]|\\.)*"/g) || [];
            for (const match of matches) {
              if (!match.endsWith('"')) {
                fixedJson = fixedJson.replace(match, match + '"');
              }
            }
            
            // 处理未闭合的字符串问题
            let inString = false;
            let result = '';
            for (let i = 0; i < fixedJson.length; i++) {
              const char = fixedJson[i];
              const prevChar = i > 0 ? fixedJson[i-1] : '';
              
              // 处理字符串开始/结束
              if (char === '"' && prevChar !== '\\') {
                inString = !inString;
              }
              
              // 如果到达字符串末尾但仍在字符串内，添加闭合引号
              if (i === fixedJson.length - 1 && inString) {
                result += char + '"';
              } else {
                result += char;
              }
            }
            
            // 确保JSON对象正确闭合
            let braceCount = 0;
            for (const char of result) {
              if (char === '{') braceCount++;
              if (char === '}') braceCount--;
            }
            
            // 如果左大括号多于右大括号，添加缺少的右大括号
            if (braceCount > 0) {
              console.log(`检测到未闭合的JSON对象，添加 ${braceCount} 个右大括号`);
              result += '}'.repeat(braceCount);
            }
            
            // 尝试解析修复后的JSON
            console.log('修复后的JSON:', result.substring(0, 200) + '...');
            worldData = JSON.parse(result);
          } catch (fixError) {
            console.error('修复JSON格式后仍然解析失败，尝试将文本转换为结构化数据:', fixError);
            
            // 如果JSON解析失败，尝试将文本转换为结构化数据
            worldData = convertTextToWorldData(response.content, genre);
            console.log('文本转换为结构化数据完成，提取的字段:', Object.keys(worldData).join(', '));
          }
        }
      }

      // 验证世界数据的完整性
      if (!worldData || typeof worldData !== 'object') {
        console.error('生成的世界数据无效');
        return NextResponse.json({
          success: false,
          error: '生成的世界数据无效',
          details: '无法从模型响应中提取有效的世界数据',
          rawContentPreview: response.content.substring(0, 200) + '...',
          suggestion: '请尝试减小maxTokens值或使用不同的模型'
        }, { status: 500 });
      }

      // 确保必要的字段存在
      if (!worldData.name) worldData.name = "生成的世界";
      if (!worldData.description) worldData.description = "一个神秘的世界";
      if (!worldData.genre) worldData.genre = genre;
      
      // 确保地理信息存在
      if (!worldData.geography) {
        worldData.geography = {
          terrain: [],
          climate: [],
          locations: []
        };
      }
      
      // 确保文化信息存在
      if (!worldData.culture) {
        worldData.culture = {
          societies: [],
          customs: [],
          religions: [],
          politics: []
        };
      }
      
      // 根据强调项确保魔法系统存在
      if (emphasis.magic && !worldData.magicSystem) {
        worldData.magicSystem = {
          rules: [],
          elements: [],
          practitioners: [],
          limitations: []
        };
      }
      
      // 根据强调项确保技术存在
      if (emphasis.technology && !worldData.technology) {
        worldData.technology = {
          level: "基础",
          innovations: [],
          impact: []
        };
      }
      
      // 确保历史和冲突存在
      if (!worldData.history) worldData.history = [];
      if (!worldData.conflicts) worldData.conflicts = [];

      console.log('生成完成，数据结构:', Object.keys(worldData).join(', '));

      return NextResponse.json({
        success: true,
        data: worldData
      });
    } catch (error) {
      console.error('解析世界数据失败:', error);
      console.error('原始内容:', response.content.substring(0, 500) + '...');
      return NextResponse.json({
        success: false,
        error: '解析世界数据失败',
        details: error instanceof Error ? error.message : '未知错误',
        rawContentPreview: response.content.substring(0, 200) + '...'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('处理请求时发生错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '处理请求时发生未知错误'
    }, { status: 500 });
  }
}

// 将文本转换为结构化的世界数据
function convertTextToWorldData(text: string, genre: string): any {
  console.log('尝试将文本转换为结构化数据');
  
  // 提取世界名称
  const nameMatch = text.match(/(?:世界名称|名称|标题)[:：]\s*([^\n]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : "生成的世界";
  
  // 提取描述
  const descMatch = text.match(/(?:描述|概述|简介)[:：]\s*([^\n]+)/i);
  const description = descMatch ? descMatch[1].trim() : text.split('\n')[0];
  
  // 提取地理信息
  const geographySection = extractSection(text, ['地理', '环境', '地形']);
  const geography = {
    terrain: extractElements(geographySection, ['地形', '地貌', '地势']),
    climate: extractElements(geographySection, ['气候', '天气']),
    locations: extractElements(geographySection, ['地点', '位置', '区域'])
  };
  
  // 提取文化信息
  const cultureSection = extractSection(text, ['文化', '社会', '种族']);
  const culture = {
    societies: extractElements(cultureSection, ['社会', '组织', '结构']),
    customs: extractElements(cultureSection, ['习俗', '传统', '礼仪']),
    religions: extractElements(cultureSection, ['宗教', '信仰', '崇拜']),
    politics: extractElements(cultureSection, ['政治', '政府', '统治'])
  };
  
  // 提取魔法系统
  const magicSection = extractSection(text, ['魔法', '法术', '超能力']);
  const magicSystem = {
    rules: extractElements(magicSection, ['规则', '法则', '原理']),
    elements: extractElements(magicSection, ['元素', '能量', '源泉']),
    practitioners: extractElements(magicSection, ['施法者', '法师', '使用者']),
    limitations: extractElements(magicSection, ['限制', '代价', '弱点'])
  };
  
  // 提取技术
  const techSection = extractSection(text, ['技术', '科技', '发明']);
  const technology = {
    level: extractTechLevel(techSection),
    innovations: extractElements(techSection, ['创新', '发明', '技术']),
    impact: extractElements(techSection, ['影响', '作用', '效果'])
  };
  
  // 提取历史
  const historySection = extractSection(text, ['历史', '背景', '过去']);
  const history = extractElements(historySection, ['事件', '时期', '时代']);
  
  // 提取冲突
  const conflictSection = extractSection(text, ['冲突', '矛盾', '战争']);
  const conflicts = extractElements(conflictSection, ['战争', '争端', '斗争']);
  
  return {
    name,
    description,
    genre,
    geography,
    culture,
    magicSystem: Object.values(magicSystem).some(arr => arr.length > 0) ? magicSystem : null,
    technology: Object.values(technology).some(arr => arr.length > 0 || technology.level) ? technology : null,
    history,
    conflicts
  };
}

// 从文本中提取特定部分
function extractSection(text: string, keywords: string[]): string {
  const regex = new RegExp(`(?:${keywords.join('|')})(?:[：:][^\\n]*|[^\\n]*[：:]|\\s*\\n)([\\s\\S]*?)(?:\\n\\s*\\n|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

// 从文本中提取元素列表
function extractElements(text: string, keywords: string[]): any[] {
  if (!text) return [];
  
  const elements = [];
  const regex = new RegExp(`(?:${keywords.join('|')})(?:[：:][^\\n]*|[^\\n]*[：:]|\\s*\\n)([\\s\\S]*?)(?:\\n\\s*\\n|$)`, 'i');
  const match = text.match(regex);
  
  if (match && match[1]) {
    const content = match[1].trim();
    
    // 尝试提取列表项
    const listItems = content.split(/\n(?:-|\d+\.|\*)\s+/).filter(Boolean);
    
    if (listItems.length > 1) {
      // 如果找到列表项，为每个项创建一个元素
      listItems.forEach(item => {
        if (item.trim()) {
          elements.push({
            name: item.split(/[：:]/)[0]?.trim() || '元素',
            description: item.trim(),
            significance: '世界的重要组成部分',
            attributes: {}
          });
        }
      });
    } else {
      // 如果没有找到列表项，创建一个包含整个内容的元素
      elements.push({
        name: keywords[0],
        description: content,
        significance: '世界的重要组成部分',
        attributes: {}
      });
    }
  }
  
  return elements;
}

// 提取技术水平
function extractTechLevel(text: string): string {
  if (!text) return '';
  
  if (text.match(/(?:高级|先进|未来|科幻)/i)) return 'Advanced';
  if (text.match(/(?:现代|当代|工业)/i)) return 'Modern';
  if (text.match(/(?:中世纪|古代|原始)/i)) return 'Medieval';
  
  return 'Basic';
} 