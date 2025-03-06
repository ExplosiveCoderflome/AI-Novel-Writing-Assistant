import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// 定义CliffhangerSample接口
interface CliffhangerSample {
  id: string;
  content: string;
  type: 'crisis' | 'twist' | 'mystery' | 'emotional';
  chapter: number;
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
    });

    if (!novel) {
      return NextResponse.json({ error: "小说不存在" }, { status: 404 });
    }

    if (novel.authorId !== session.user.id) {
      return NextResponse.json({ error: "无权访问该小说" }, { status: 403 });
    }

    // 获取请求数据
    const { type, chapter = 1 } = await req.json();
    
    if (!type || !['crisis', 'twist', 'mystery', 'emotional'].includes(type)) {
      return NextResponse.json({ error: "卡点类型无效" }, { status: 400 });
    }
    
    // 生成卡点内容
    // 在实际应用中，这里应使用AI服务来生成
    const cliffhanger = generateCliffhanger(type, chapter);

    return NextResponse.json(cliffhanger);
  } catch (error) {
    console.error("卡点生成出错:", error);
    return NextResponse.json(
      { error: "生成过程中发生错误" },
      { status: 500 }
    );
  }
}

// 生成卡点内容（模拟AI服务）
function generateCliffhanger(type: string, chapter: number): CliffhangerSample {
  // 不同类型的卡点模板
  const templates: Record<string, string[]> = {
    crisis: [
      "就在他以为一切安全之时，一阵刺骨的寒意从脊背窜起。背后的脚步声越来越近，他猛然回头，却只看到一双在黑暗中闪烁的眼睛...",
      "地面突然剧烈震动，墙壁开始龟裂，碎石不断掉落。他绝望地发现，唯一的出口已经被彻底堵死...",
      "伤口的疼痛让他几乎昏厥，鲜血不断涌出。正当他视线模糊之际，远处出现了几个模糊的身影，朝着他的方向快速接近..."
    ],
    twist: [
      "他颤抖着打开信封，读完最后一行字时，整个人如遭雷击。多年来信任的导师，竟然正是害他家破人亡的幕后黑手...",
      "她微笑着转过身，脸上的表情却在瞬间冷却。匕首在她手中闪着寒光，一切都在瞬间变得明朗...",
      "当所有谜团似乎都解开之时，他发现口袋中的古老符咒散发出奇异的光芒。历史的真相似乎完全被颠覆了..."
    ],
    mystery: [
      "石壁上的古老壁画逐渐显现出完整图案，他惊讶地发现，上面描绘的预言场景与当下发生的一切惊人地吻合。而下一幅画面，则是一片血红...",
      "她突然意识到手中文件的页码不连续，似乎有人刻意撕去了关键的几页。而留下的部分却隐含着一个可怕的真相...",
      "随着谜题最后一块拼图落位，机关启动的声音清晰可闻。但出乎所有人意料的是，露出的不是宝藏，而是一具千年不腐的尸体..."
    ],
    emotional: [
      "她的笑容在月光下显得格外美丽，她问他如果明天是世界末日会做什么。还没等他回答，远处的天空突然亮起刺目的光芒...",
      "他终于鼓起勇气说出了埋藏已久的心意，然而对方的反应却让他完全没有预料到。她含泪表示一切都太迟了，明天就是她的婚礼...",
      "重逢的喜悦还未散去，她却递给了他一封信。信中写道如果有一天她不再记得他，请把这个交给她...她的声音里带着难以察觉的颤抖..."
    ]
  };
  
  // 根据类型选择模板
  const typeTemplates = templates[type] || templates.mystery;
  const randomIndex = Math.floor(Math.random() * typeTemplates.length);
  const content = typeTemplates[randomIndex];
  
  return {
    id: Date.now().toString(),
    content,
    type: type as 'crisis' | 'twist' | 'mystery' | 'emotional',
    chapter
  };
} 