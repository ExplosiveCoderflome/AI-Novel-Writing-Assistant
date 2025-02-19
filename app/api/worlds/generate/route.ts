import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { LLMFactory } from '../../../../lib/llm/factory';
import { genreFeatures, NovelGenre } from '../../../../app/types/novel';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { genre, prompt, complexity, emphasis, provider, model, temperature, maxTokens } = await request.json();

    // 获取 API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider,
        isActive: true,
        OR: [
          { userId: session.user.id },
          { userId: 'default' }
        ]
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!apiKey) {
      throw new Error('未找到有效的 API Key，请先在设置中配置');
    }

    // 使用 LLM Factory 创建实例
    const llmFactory = LLMFactory.getInstance();
    const llm = await llmFactory.getLLMInstance({
      provider,
      apiKey: apiKey.key,
      model
    });

    // 获取类型特征
    const features = genreFeatures[genre as NovelGenre];

    // 构建系统提示词
    const systemPrompt = `你是一位专业的小说世界设定设计师。请根据用户的要求，设计一个完全独特的世界设定。在构建世界时，你需要考虑以下五个核心维度：

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
  ${features.hasFantasyElements ? `
  "magicSystem": {
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
  ${features.hasTechnologyFocus ? `
  "technology": {
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
3. 世界设定要符合${genre.replace('_', ' ')}类型的特点
4. 复杂度要求：${complexity}
5. ${emphasis.geography ? '重点描述地理环境特征\n' : ''}${emphasis.culture ? '重点描述文化社会特征\n' : ''}${emphasis.magic ? '重点描述魔法系统特征\n' : ''}${emphasis.technology ? '重点描述科技发展特征\n' : ''}
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

    // 构建用户提示词
    const userPrompt = `请根据以下要求设计世界：
${prompt}

要求：
1. 严格遵循系统提示词中的格式要求
2. 确保生成的内容符合${genre.replace('_', ' ')}类型的特点
3. 保持世界设定的完整性和连贯性
4. 根据用户的具体要求调整细节`;

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    try {
      const streamGenerator = llm.generateRecommendationStream({
        systemPrompt,
        userPrompt
      });

      let accumulatedContent = '';
      
      // 处理流式响应
      for await (const chunk of streamGenerator) {
        if (!chunk) continue;

        accumulatedContent += chunk;
        
        // 构建消息对象
        const message = {
          type: 'content',
          choices: [{
            delta: { content: chunk },
            index: 0,
            finish_reason: null
          }]
        };

        // 发送数据块
        await writer.write(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      }

      // 尝试解析完整的 JSON
      try {
        const cleanContent = accumulatedContent
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
          .replace(/\n/g, ' ')
          .replace(/\r/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('未找到有效的 JSON 内容');
        }

        const jsonContent = jsonMatch[0];
        const worldData = JSON.parse(jsonContent);

        // 发送解析后的 JSON 数据
        const finalMessage = {
          type: 'json',
          data: worldData
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(finalMessage)}\n\n`));
      } catch (error) {
        console.error('JSON 解析失败:', error);
        const errorMessage = {
          type: 'error',
          error: '生成的内容无法解析为有效的 JSON 格式'
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
      }

      // 发送完成标记
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    } catch (error) {
      console.error('生成过程出错:', error);
      const errorMessage = {
        type: 'error',
        error: error instanceof Error ? error.message : '生成失败'
      };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
      await writer.close();
    }

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error("生成世界失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成世界失败" },
      { status: 500 }
    );
  }
} 