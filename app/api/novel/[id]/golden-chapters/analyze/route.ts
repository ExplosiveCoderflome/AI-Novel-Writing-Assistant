import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const novelId = params.id;
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
      return NextResponse.json({ error: "小说不存在" }, { status: 404 });
    }

    if (novel.authorId !== session.user.id) {
      return NextResponse.json({ error: "无权访问该小说" }, { status: 403 });
    }

    // 获取请求数据，如果有的话
    const body = await req.json().catch(() => ({}));

    // 通过AI对黄金三章进行分析
    // 这里模拟AI分析结果，实际项目中应调用对应的AI服务
    const analysisResult: GoldenChaptersAnalysis = {
      qidian: {
        worldBuilding: { score: Math.floor(Math.random() * 30) + 50, level: '适中' },
        characterDepth: { score: Math.floor(Math.random() * 30) + 35, level: '偏浅' },
        suspense: { score: Math.floor(Math.random() * 20) + 65, level: '较强' },
        suggestions: [
          '增加主角背景与内心活动描写',
          '适当减少世界观铺垫，突出人物塑造',
          '在第二章末增加关键冲突引导'
        ]
      },
      fanqie: {
        conflictIntensity: { score: Math.floor(Math.random() * 20) + 30, level: '偏弱' },
        pacingDensity: { score: Math.floor(Math.random() * 30) + 40, level: '一般' },
        hookEffect: { score: Math.floor(Math.random() * 20) + 25, level: '待加强' },
        suggestions: [
          '首章前300字引入核心冲突',
          '删减过多的环境描写，突出事件冲突',
          '第一章末尾增加强烈悬念或转折'
        ]
      },
      overall: {
        suspenseIndex: parseFloat((Math.random() * 2 + 6).toFixed(1)),
        immersionScore: parseFloat((Math.random() * 2 + 5.8).toFixed(1)),
        detailedScores: {
          plotTwist: parseFloat((Math.random() * 2 + 6.5).toFixed(1)),
          unknownElements: parseFloat((Math.random() * 1.5 + 6).toFixed(1)),
          crisisForeshadowing: parseFloat((Math.random() * 2 + 6).toFixed(1)),
          characterization: parseFloat((Math.random() * 1.5 + 5.5).toFixed(1)),
          emotionalResonance: parseFloat((Math.random() * 2 + 6).toFixed(1)),
          perspectiveImmersion: parseFloat((Math.random() * 2 + 6).toFixed(1))
        },
        suggestions: [
          '黄金三章重点调整：强化首章冲突、提升主角魅力、增加情感连接点',
          '建议增加2-3处主角内心独白，展现核心价值观或内心矛盾',
          '第三章结尾应形成阶段性小高潮，巩固读者留存'
        ]
      }
    };

    // 动态调整评级等级
    analysisResult.qidian.worldBuilding.level = getLevel(analysisResult.qidian.worldBuilding.score);
    analysisResult.qidian.characterDepth.level = getLevel(analysisResult.qidian.characterDepth.score);
    analysisResult.qidian.suspense.level = getLevel(analysisResult.qidian.suspense.score);
    
    analysisResult.fanqie.conflictIntensity.level = getLevel(analysisResult.fanqie.conflictIntensity.score);
    analysisResult.fanqie.pacingDensity.level = getLevel(analysisResult.fanqie.pacingDensity.score);
    analysisResult.fanqie.hookEffect.level = getLevel(analysisResult.fanqie.hookEffect.score);

    return NextResponse.json(analysisResult);
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