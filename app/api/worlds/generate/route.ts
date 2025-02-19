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
    const systemPrompt = `你是一位专业的小说世界设定设计师。请根据用户的要求，设计一个完全独特的世界设定。

你必须严格按照以下 JSON 格式返回世界设定，不要包含任何其他内容：

{
  "name": "世界名称（30字以内）",
  "description": "世界总体描述（500字以内）",
  "geography": {
    "terrain": [
      {
        "name": "地形名称",
        "description": "地形描述",
        "significance": "地形意义",
        "attributes": {
          "climate": "气候特征",
          "resources": "资源特点",
          "habitability": "宜居程度"
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
    ]
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
6. 所有描述要具体、生动、富有细节
7. 各个系统之间要相互关联、逻辑自洽
8. 要体现世界的独特性和创新性`;

    // 构建用户提示词
    const userPrompt = `请根据以下要求设计世界：
${prompt}

要求：
1. 严格遵循系统提示词中的格式要求
2. 确保生成的内容符合${genre.replace('_', ' ')}类型的特点
3. 保持世界设定的完整性和连贯性
4. 根据用户的具体要求调整细节`;

    const response = await llm.generateRecommendation({
      systemPrompt,
      userPrompt,
      temperature: temperature ?? 0.8,
      maxTokens: maxTokens ?? 3000
    });

    if (!response || !response.content) {
      throw new Error('AI 未返回有效的响应内容');
    }

    try {
      // 清理内容中的特殊字符和格式
      const cleanContent = response.content
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 尝试提取 JSON 部分
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('未找到有效的 JSON 内容');
      }

      const jsonContent = jsonMatch[0];
      const worldData = JSON.parse(jsonContent);

      // TODO: 添加世界数据的持久化存储逻辑

      return NextResponse.json(worldData);
    } catch (error) {
      console.error('处理 AI 响应失败:', error);
      throw new Error('生成世界数据处理失败');
    }
  } catch (error) {
    console.error("生成世界失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成世界失败" },
      { status: 500 }
    );
  }
} 