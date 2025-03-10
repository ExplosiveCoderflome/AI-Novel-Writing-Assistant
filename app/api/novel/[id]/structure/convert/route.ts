import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/options";
import { prisma } from "@/lib/prisma";
import { LLMFactory } from "../../../../../../lib/llm/factory";
import { NovelOutline } from "../../../../../types/novel";

// 接收前端请求参数
interface RequestBody {
  provider: string;
  model: string;
  structureType: 'three_act' | 'web_novel';
  outline: NovelOutline;
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
    const { provider, model, structureType, outline, temperature, maxTokens } = body;

    // 参数校验
    if (!provider || !model || !structureType || !outline) {
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
    
    // 确定目标结构类型
    const targetStructure = structureType;
    
    // 构建系统提示词
    const systemPrompt = `作为小说结构专家，请将提供的小说大纲转换为${targetStructure === 'three_act' ? '三幕式' : '网文流'}结构。

三幕式结构特点：
- 第一幕：设定、背景介绍和冲突引入
- 第二幕：冲突发展、角色成长和情节复杂化
- 第三幕：高潮和解决方案

网文流结构特点：
- 引入期：引入主角和世界观，设定初始冲突
- 发展期：能力提升、关系发展和矛盾深化
- 高潮期：关键战斗、核心秘密揭示
- 收尾期：最终对决和各线索收束

请保持原始大纲的主题、角色和情节核心，仅调整结构以符合目标格式。

请按照原始JSON格式返回转换后的大纲，保持原始键名不变。不要包含任何其他内容。`;

    // 调用LLM转换结构
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
      const cleanContent = (response.content || '{}')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // 提取JSON部分
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('未找到有效的JSON内容');
      }

      const jsonContent = jsonMatch[0];
      const convertedOutline: NovelOutline = JSON.parse(jsonContent);

      // 更新小说结构化大纲
      await prisma.novel.update({
        where: { id: novelId },
        data: {
          structuredOutline: jsonContent
        }
      });

      // 返回结果
      return NextResponse.json(convertedOutline);
    } catch (error) {
      console.error('解析结果失败:', error);
      return NextResponse.json(
        { error: "解析AI响应失败，请重试" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('转换结构失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "转换结构失败" },
      { status: 500 }
    );
  }
} 