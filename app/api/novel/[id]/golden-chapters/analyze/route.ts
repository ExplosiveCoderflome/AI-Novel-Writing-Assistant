import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { LLMFactory } from "../../../../llm/factory";
import { LLMProviderType } from "../../../../llm/providers/factory";
import { LLMDBConfig, LLMProviderConfig } from "../../../../types/llm";

// 手动定义GoldenChaptersAnalysis类型，避免循环依赖
interface GoldenChaptersAnalysis {
  qidian: {
    worldBuilding: { score: number; level: string };
    characterDepth: { score: number; level: string };
    suspense: { score: number; level: string };
    suggestions: string[];
  };
  fanqie: {
    conflictIntensity: { score: number; level: string };
    pacingDensity: { score: number; level: string };
    hookEffect: { score: number; level: string };
    suggestions: string[];
  };
  overall: {
    suspenseIndex: number;
    immersionScore: number;
    detailedScores: {
      plotTwist: number;
      unknownElements: number;
      crisisForeshadowing: number;
      characterization: number;
      emotionalResonance: number;
      perspectiveImmersion: number;
    };
    suggestions: string[];
  };
}

// 构建分析黄金三章的提示词
const generateAnalysisPrompt = (chapters: Array<{ title: string; content: string }>) => {
  return `
请你作为一名资深网络小说编辑和评论家，分析以下小说的前三章（"黄金三章"）并提供评估和建议。这些章节会直接影响读者的留存率和付费转化。请从不同平台的读者心理出发，提供专业分析。

以下是要分析的小说章节：

${chapters.map((chapter, index) => `
第${index + 1}章：${chapter.title}
${chapter.content.substring(0, 1000)}...(内容省略)
`).join('\n')}

请严格按照以下JSON格式返回你的分析结果（不要包含任何格式之外的文本）：

{
  "qidian": {
    "worldBuilding": { "score": 0-100之间的数字, "level": "很强/较强/适中/偏弱/很弱" },
    "characterDepth": { "score": 0-100之间的数字, "level": "很强/较强/适中/偏弱/很弱" },
    "suspense": { "score": 0-100之间的数字, "level": "很强/较强/适中/偏弱/很弱" },
    "suggestions": [
      "针对起点读者的具体改进建议1",
      "针对起点读者的具体改进建议2",
      "针对起点读者的具体改进建议3"
    ]
  },
  "fanqie": {
    "conflictIntensity": { "score": 0-100之间的数字, "level": "很强/较强/适中/偏弱/很弱" },
    "pacingDensity": { "score": 0-100之间的数字, "level": "很强/较强/适中/偏弱/很弱" },
    "hookEffect": { "score": 0-100之间的数字, "level": "很强/较强/适中/偏弱/很弱" },
    "suggestions": [
      "针对番茄读者的具体改进建议1",
      "针对番茄读者的具体改进建议2", 
      "针对番茄读者的具体改进建议3"
    ]
  },
  "overall": {
    "suspenseIndex": 1-10之间的小数,
    "immersionScore": 1-10之间的小数,
    "detailedScores": {
      "plotTwist": 1-10之间的小数,
      "unknownElements": 1-10之间的小数,
      "crisisForeshadowing": 1-10之间的小数,
      "characterization": 1-10之间的小数,
      "emotionalResonance": 1-10之间的小数,
      "perspectiveImmersion": 1-10之间的小数
    },
    "suggestions": [
      "整体改进建议1",
      "整体改进建议2",
      "整体改进建议3"
    ]
  }
}

注意：
1. 你必须返回合法的JSON格式
2. 不要添加任何额外的说明或评论
3. score必须在指定的0-100区间内
4. level必须是以下之一：很强/较强/适中/偏弱/很弱
5. 评分标准须考虑商业网文特点，不要以文学性为主要评判标准
6. suggestions需要给出针对性的、可操作的建议，不要泛泛而谈
`;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 确保params已经就绪
    const novelId = await params.id;
    console.log('正在查询小说ID:', novelId);
    
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        chapters: {
          where: { 
            order: { lte: 3 } // 只获取前三章
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!novel) {
      console.log('未找到小说，ID:', novelId);
      return NextResponse.json({ error: "小说不存在" }, { status: 404 });
    }

    console.log('找到小说:', novel.title, '章节数量:', novel.chapters?.length || 0);

    if (novel.authorId !== session.user.id) {
      console.log('用户无权访问，用户ID:', session.user.id, '作者ID:', novel.authorId);
      return NextResponse.json({ error: "无权访问该小说" }, { status: 403 });
    }

    // 获取请求数据，如果有的话
    const body = await req.json().catch(() => {
      console.log('请求体解析失败或为空');
      return {};
    });

    // 检查是否有前三章内容
    if (!novel.chapters || novel.chapters.length === 0) {
      console.log('未找到章节内容，小说ID:', novelId);
      return NextResponse.json({ error: "找不到章节内容" }, { status: 404 });
    }

    // 准备章节数据
    const chaptersForAnalysis = novel.chapters.map(chapter => ({
      title: chapter.title,
      content: chapter.content || '章节内容为空'
    }));

    // 创建LLM工厂实例
    const llmFactory = LLMFactory.getInstance();
    
    // 获取默认API Key
    const apiKey = await prisma.aPIKey.findFirst({
      where: {
        provider: 'deepseek', // 使用deepseek作为默认提供商
        isActive: true
      }
    });

    if (!apiKey) {
      return NextResponse.json({ error: "未找到可用的API密钥" }, { status: 500 });
    }

    // 创建LLM配置
    const providerConfig: LLMProviderConfig = {
      getApiKey: async () => apiKey.key,
      temperature: 0.3, // 保持分析结果的稳定性
      maxTokens: 2000, // 足够的token来生成完整的分析
      model: 'deepseek-chat' // 使用deepseek的chat模型
    };

    const config: LLMDBConfig = {
      defaultProvider: 'deepseek',
      deepseek: providerConfig
    };
    
    llmFactory.setConfig(config);

    // 生成分析提示词
    const prompt = generateAnalysisPrompt(chaptersForAnalysis);

    // 调用LLM进行分析
    console.log('开始调用LLM API分析黄金三章');
    const response = await llmFactory.generateRecommendation({
      userPrompt: prompt,
      systemPrompt: '你是一个专业的小说分析助手，擅长分析网络小说的结构和质量，并给出改进建议。',
      model: 'deepseek-chat',
      temperature: 0.3,
      maxTokens: 2000
    }, 'deepseek' as LLMProviderType);

    if (response.error) {
      console.error('LLM分析失败:', response.error);
      return NextResponse.json({ error: response.error }, { status: 500 });
    }

    // 解析LLM返回的JSON结果
    try {
      const analysisResult: GoldenChaptersAnalysis = JSON.parse(response.content || '{}');
      
      // 验证返回结果的基本结构
      if (!analysisResult.qidian || !analysisResult.fanqie || !analysisResult.overall) {
        throw new Error('分析结果格式不正确');
      }
      
      console.log('黄金三章分析完成:', analysisResult);
      return NextResponse.json(analysisResult);
    } catch (error) {
      console.error('解析LLM返回结果失败:', error, response.content);
      return NextResponse.json(
        { error: "解析分析结果失败" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("黄金三章分析出错:", error);
    return NextResponse.json(
      { error: "分析过程中发生错误" },
      { status: 500 }
    );
  }
}

// 根据分数获取对应的级别描述
function getLevel(score: number): string {
  if (score >= 75) return '很强';
  if (score >= 65) return '较强';
  if (score >= 50) return '适中';
  if (score >= 35) return '偏弱';
  return '很弱';
}