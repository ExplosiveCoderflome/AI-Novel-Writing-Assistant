import { NextRequest } from 'next/server';
import { prisma } from '../../../../../../lib/prisma';
import { LLMFactory } from '../../../../../../lib/llm/factory';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../auth/[...nextauth]/route';
import { NovelOutline } from '../../../../../types/novel';

interface RouteContext {
  params: {
    id: string;
  };
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: '请先登录' }),
      { status: 401 }
    );
  }

  try {
    const { provider, model, developmentDirection } = await request.json();
    console.log('请求数据:', { provider, model, contentLength: developmentDirection?.length });

    if (!provider || !model || !developmentDirection) {
      throw new Error('缺少必要参数');
    }

    const { id: novelId } = context.params;

    // 检查小说是否存在且属于当前用户
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return new Response(
        JSON.stringify({ error: '未找到小说或无权限访问' }),
        { status: 404 }
      );
    }

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

    // 构建系统提示词
    const systemPrompt = `你是一位专业的小说大纲策划师。请根据提供的发展走向内容，生成一个结构化的小说大纲。

你的任务是将发展走向转换为结构化的大纲数据，必须严格按照以下 JSON 格式返回，不要包含任何其他内容：

{
  "core": {
    "theme": "核心主题",
    "emotionalTone": "情感基调",
    "mainConflict": "核心矛盾"
  },
  "characters": {
    "main": [
      {
        "name": "主要角色名称",
        "role": "角色定位",
        "arc": "人物成长弧",
        "relationships": [
          {
            "target": "关系对象",
            "type": "关系类型",
            "development": "关系发展"
          }
        ]
      }
    ],
    "supporting": [
      {
        "name": "配角名称",
        "role": "角色定位",
        "purpose": "角色作用"
      }
    ]
  },
  "plotStructure": {
    "setup": {
      "events": ["起始事件1", "起始事件2"],
      "goals": ["目标1", "目标2"]
    },
    "development": {
      "mainPlot": {
        "events": ["主要事件1", "主要事件2"],
        "conflicts": ["冲突1", "冲突2"]
      },
      "subplots": [
        {
          "title": "支线标题",
          "events": ["支线事件1", "支线事件2"],
          "connection": "与主线的关联"
        }
      ]
    },
    "climax": {
      "events": ["高潮事件1", "高潮事件2"],
      "resolution": "结局解决方式"
    }
  },
  "worldBuilding": {
    "background": "世界背景",
    "rules": ["规则1", "规则2"],
    "elements": [
      {
        "name": "元素名称",
        "description": "元素描述",
        "significance": "重要性"
      }
    ]
  },
  "pacing": {
    "turning_points": [
      {
        "position": "转折点位置",
        "event": "事件描述",
        "impact": "影响"
      }
    ],
    "tension_curve": [
      {
        "phase": "阶段",
        "tension_level": 5,
        "description": "阶段描述"
      }
    ]
  }
}

注意事项：
1. 必须严格按照给定的 JSON 格式返回
2. 所有字段都必须填写，不能为空
3. 内容要与发展走向保持一致
4. 结构要完整且合理
5. 各个部分要互相呼应
6. 确保生成的 JSON 是有效的，可以被解析`;

    // 生成结构化大纲
    const response = await llm.generateRecommendation({
      systemPrompt,
      userPrompt: developmentDirection
    });

    if (response.error) {
      throw new Error(response.error);
    }

    let outlineData: NovelOutline;
    try {
      // 清理内容中的特殊字符和格式
      const cleanContent = (response.content || '{}')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
        .replace(/\n/g, ' ')  // 将换行符替换为空格
        .replace(/\r/g, ' ')  // 将回车符替换为空格
        .replace(/\s+/g, ' ') // 将多个空格合并为一个
        .trim();

      // 尝试提取 JSON 部分
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('未找到有效的 JSON 内容');
      }

      const jsonContent = jsonMatch[0];
      outlineData = JSON.parse(jsonContent);

      // 更新小说的结构化大纲
      await prisma.novel.update({
        where: { id: novelId },
        data: {
          structuredOutline: jsonContent
        }
      });

      return new Response(
        JSON.stringify(outlineData),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      console.error('解析大纲数据失败:', error);
      throw new Error('生成的大纲数据格式无效');
    }
  } catch (error) {
    console.error('生成结构化大纲失败:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '生成结构化大纲失败'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 