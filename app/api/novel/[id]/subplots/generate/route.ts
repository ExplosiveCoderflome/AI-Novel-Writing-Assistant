import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { LLMFactory } from "../../../../../../lib/llm/factory";

// 定义支线任务接口
interface SubplotTask {
  id: string;
  title: string;
  type: 'romance' | 'powerup' | 'world' | 'character';
  description: string;
  position: string;
}

// 接收前端请求参数
interface RequestBody {
  provider: string;
  model: string;
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
    const { provider, model, outline, temperature, maxTokens } = body;

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
    
    // 构建系统提示词
    const systemPrompt = `作为小说支线设计专家，请根据提供的小说大纲，设计多条支线任务。
    
你的任务是分析小说主线剧情，设计丰富且与主线有互动的支线任务，提升小说整体厚度。

支线类型包括：
- romance: 情感关系发展支线
- powerup: 能力进阶成长支线
- world: 世界观拓展支线
- character: 角色关系发展支线

请按照以下JSON格式返回，不要包含其他内容：

[
  {
    "id": "唯一ID",
    "title": "支线标题",
    "type": "支线类型",
    "description": "详细描述",
    "position": "出现位置（例如：第10-30章、贯穿全文）"
  }
]

请遵循以下要求：
1. 生成6-10个不同类型的支线任务
2. 每个支线都应当与主线有机结合
3. 支线内容要丰富且能引发读者共鸣
4. 确保type字段只能是这四种类型之一: romance, powerup, world, character
5. 支线位置分布要合理，不能过于集中
6. 始终保持JSON格式有效`;

    // 调用LLM生成支线任务
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
      const subplots: SubplotTask[] = JSON.parse(jsonContent);

      // 验证type字段是否合法
      const validTypes = ['romance', 'powerup', 'world', 'character'];
      const isValid = subplots.every(subplot => validTypes.includes(subplot.type));
      
      if (!isValid) {
        throw new Error('生成的支线任务包含无效类型');
      }

      // 返回结果
      return NextResponse.json(subplots);
    } catch (error) {
      console.error('解析结果失败:', error);
      return NextResponse.json(
        { error: "解析AI响应失败，请重试" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('生成支线任务失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成支线任务失败" },
      { status: 500 }
    );
  }
} 