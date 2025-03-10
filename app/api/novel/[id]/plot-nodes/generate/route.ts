import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/options";
import { prisma } from "@/lib/prisma";
import { LLMFactory } from "../../../../../../lib/llm/factory";

// 定义关键节点接口
interface PlotNode {
  id: string;
  chapter: number;
  title: string;
  description: string;
  phase: string;
  importance: 1 | 2 | 3; // 1-普通 2-重要 3-关键
}

// 接收前端请求参数
interface RequestBody {
  provider: string;
  model: string;
  totalChapters: number;
  nodeDensity: 'low' | 'medium' | 'high';
  outline: any;
  temperature?: number;
  maxTokens?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 验证用户会话
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    // 获取请求参数
    const body: RequestBody = await req.json();
    const { provider, model, totalChapters, nodeDensity, outline, temperature, maxTokens } = body;

    // 参数校验
    if (!provider || !model || !outline) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 验证小说归属
    const novelId = params.id;
    const novel = await prisma.novel.findUnique({
      where: {
        id: novelId,
        authorId: session.user.id
      }
    });

    if (!novel) {
      return NextResponse.json(
        { error: "小说不存在或无权限访问" },
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
      return NextResponse.json(
        { error: "未找到有效的 API Key" },
        { status: 400 }
      );
    }

    // 创建 LLM 实例
    const llmFactory = LLMFactory.getInstance();
    const llm = await llmFactory.getLLMInstance({
      provider,
      apiKey: apiKey.key,
      model
    });

    // 根据密度确定生成节点数量
    const nodeCount = 
      nodeDensity === 'low' ? Math.floor(totalChapters * 0.05) : 
      nodeDensity === 'medium' ? Math.floor(totalChapters * 0.1) : 
      Math.floor(totalChapters * 0.15);
    
    // 构建系统提示词
    const systemPrompt = `作为小说结构专家，请根据提供的小说大纲和总章节数，生成${nodeCount}个关键情节节点。
    
你的任务是分析小说整体结构，在不同章节位置规划关键剧情节点，确保情节推进合理，节奏张弛有度。

请按照以下JSON格式返回，不要包含其他内容：

[
  {
    "id": "唯一ID",
    "chapter": 章节数字,
    "title": "节点标题",
    "description": "节点详细描述",
    "phase": "所处阶段(引入期/发展期/高潮期/结局期)",
    "importance": 重要性(1-普通 2-重要 3-关键)
  }
]

请遵循以下要求：
1. 生成${nodeCount}个节点，均匀分布在1到${totalChapters}章
2. 每个节点都应当符合大纲整体方向和主题
3. 重要转折点应分配更高的importance值
4. 节点描述要具体，不可笼统
5. 确保前后节点存在因果关系
6. 始终保持JSON格式有效`;

    // 调用LLM生成节点
    const response = await llm.generateRecommendation({
      systemPrompt,
      userPrompt: JSON.stringify(outline),
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 4000
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // 解析LLM返回的内容
    try {
      // 清理响应内容并提取JSON
      const cleanContent = (response.content || '[]')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 提取JSON部分
      const jsonMatch = cleanContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('未找到有效的JSON内容');
      }

      const jsonContent = jsonMatch[0];
      const plotNodes: PlotNode[] = JSON.parse(jsonContent);

      // 返回结果
      return NextResponse.json(plotNodes);
    } catch (error) {
      console.error('解析结果失败:', error);
      return NextResponse.json(
        { error: "解析AI响应失败，请重试" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('生成关键节点失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成关键节点失败" },
      { status: 500 }
    );
  }
} 