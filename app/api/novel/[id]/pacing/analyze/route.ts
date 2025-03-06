import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// 定义PacingAnalysis接口
interface PacingAnalysis {
  tensionCurve: Array<{chapter: number; tension: number}>;
  climaxFrequency: number;
  fatigueRisk: 'low' | 'medium' | 'high';
  averageInterval: number;
  suggestions: string[];
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

    // 获取请求数据
    const body = await req.json().catch(() => ({}));
    const { structuredOutline } = body;

    // 分析节奏
    // 在实际应用中，这里应该使用AI服务分析大纲和章节内容
    // 这里使用模拟数据
    
    // 生成200章的张力曲线
    const tensionCurve = Array(200).fill(0).map((_, i) => {
      let baseValue = 0;
      
      // 生成一些随机波动
      const randomFactor = Math.random() * 2 - 1;
      
      // 为每30章设置一个高潮
      if ((i + 1) % 30 < 3) {
        baseValue = 8 + randomFactor;
      } 
      // 高潮前的铺垫
      else if ((i + 1) % 30 < 8) {
        baseValue = 5 + randomFactor;
      }
      // 高潮后的缓和
      else if ((i + 1) % 30 < 12) {
        baseValue = 6 + randomFactor;
      }
      // 平缓发展期
      else {
        baseValue = 4 + randomFactor;
      }
      
      // 确保值在合理范围内
      const tension = Math.max(1, Math.min(10, baseValue));
      
      return {
        chapter: i + 1,
        tension
      };
    });
    
    // 计算高潮频率 (张力值>7的章节比例)
    const highTensionChapters = tensionCurve.filter(point => point.tension > 7).length;
    const climaxFrequency = (highTensionChapters / tensionCurve.length) * 100;
    
    // 计算平均高潮间隔
    let lastHighTensionIndex = -1;
    const intervals: number[] = [];
    
    tensionCurve.forEach((point, index) => {
      if (point.tension > 7) {
        if (lastHighTensionIndex >= 0) {
          intervals.push(index - lastHighTensionIndex);
        }
        lastHighTensionIndex = index;
      }
    });
    
    const averageInterval = intervals.length > 0 
      ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length 
      : 0;
    
    // 计算疲劳风险
    // 检查是否有过长的无高潮区间
    const longestInterval = Math.max(...intervals, 0);
    const fatigueRisk = longestInterval > 50 ? 'high' : longestInterval > 35 ? 'medium' : 'low';
    
    // 提供优化建议
    const suggestions = [];
    
    if (climaxFrequency < 7) {
      suggestions.push('高潮频率偏低，建议增加冲突和转折点');
    }
    
    if (fatigueRisk === 'high') {
      suggestions.push('存在过长无高潮区间，读者可能感到疲劳，建议在第40-80章间添加中型高潮');
    }
    
    if (averageInterval > 40) {
      suggestions.push('高潮间隔过长，建议适当缩短高潮间的章节数');
    }
    
    // 检查前期高潮是否足够
    const earlyChapters = tensionCurve.slice(0, 50);
    const earlyHighTensions = earlyChapters.filter(point => point.tension > 7).length;
    
    if (earlyHighTensions < 2) {
      suggestions.push('前期高潮不足，建议在50章内增加1-2处高潮点以维持读者兴趣');
    }
    
    // 检查结局前的铺垫
    const finalChapters = tensionCurve.slice(tensionCurve.length - 30);
    const finalBuildupChapters = finalChapters.filter(point => point.tension >= 6 && point.tension < 8).length;
    
    if (finalBuildupChapters < 5) {
      suggestions.push('结局前的高潮铺垫不足，建议提前10章布局最终高潮');
    }
    
    // 检查情感线高潮
    suggestions.push('建议增加1-2处情感线高潮，平衡战斗/冒险高潮');
    
    const pacingAnalysis: PacingAnalysis = {
      tensionCurve,
      climaxFrequency,
      fatigueRisk,
      averageInterval,
      suggestions
    };

    return NextResponse.json(pacingAnalysis);
  } catch (error) {
    console.error("节奏分析出错:", error);
    return NextResponse.json(
      { error: "分析过程中发生错误" },
      { status: 500 }
    );
  }
} 