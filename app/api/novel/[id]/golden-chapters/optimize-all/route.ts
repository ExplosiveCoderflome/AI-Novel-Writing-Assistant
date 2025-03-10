import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/options";
import { prisma } from "@/lib/prisma";

// 定义优化后章节的接口
interface OptimizedChapter {
  id: string;
  title: string;
  originalContent: string;
  optimizedContent: string;
  order: number;
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

    // 获取需要优化的章节
    const chapters = novel.chapters;
    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ error: "没有找到章节内容" }, { status: 404 });
    }
    
    // 优化所有三章
    const optimizedChapters: OptimizedChapter[] = chapters.map(chapter => {
      // 根据章节顺序应用不同的优化策略
      const chapterType = chapter.order === 1 ? 'introduction' : 
                          chapter.order === 2 ? 'development' : 'climax';
      
      return {
        id: chapter.id,
        title: optimizeTitle(chapter.title, chapterType),
        originalContent: chapter.content,
        optimizedContent: optimizeChapterContent(chapter.content, chapterType),
        order: chapter.order
      };
    });
    
    // 在实际应用中，可以选择将优化后的内容保存到数据库
    // 这里只返回优化结果

    return NextResponse.json({ 
      optimizedChapters,
      message: "黄金三章优化完成",
      success: true
    });
  } catch (error) {
    console.error("章节优化出错:", error);
    return NextResponse.json(
      { error: "优化过程中发生错误" },
      { status: 500 }
    );
  }
}

// 优化章节标题
function optimizeTitle(originalTitle: string, chapterType: string): string {
  // 实际应用中应使用AI服务优化标题
  // 这里使用简单规则模拟
  
  const prefixes = {
    introduction: ["序章：", "开端：", "初始："],
    development: ["转折：", "变化：", "进展："],
    climax: ["高潮：", "危机：", "震撼："]
  };
  
  const prefix = prefixes[chapterType as keyof typeof prefixes][Math.floor(Math.random() * 3)];
  
  if (originalTitle.includes('：') || originalTitle.includes(':')) {
    return originalTitle; // 已经有前缀，保持不变
  }
  
  return prefix + originalTitle;
}

// 优化章节内容
function optimizeChapterContent(content: string, chapterType: string): string {
  // 实际应用中应使用AI服务优化内容
  // 这里使用简单规则模拟
  
  let optimizedContent = content;
  
  switch (chapterType) {
    case 'introduction':
      // 第一章：增强角色介绍和情感连接
      optimizedContent = `[优化提示：这是经过黄金三章优化的第一章，强化了角色介绍和读者情感连接]\n\n` +
                         `他站在高处，俯瞰着这座即将改变他命运的城市。风吹乱了他的头发，也吹不散他心中的迷茫与期待。\n\n` +
                         optimizedContent.replace(
                           /。(?=.{20,})/g, 
                           match => `。${generateInnerThoughts()}`
                         );
      break;
      
    case 'development':
      // 第二章：增强冲突和情节发展
      optimizedContent = `[优化提示：这是经过黄金三章优化的第二章，强化了冲突展开和情节推进]\n\n` +
                         optimizedContent + 
                         `\n\n他的每一步都走得小心翼翼，却不知道命运早已为他设下陷阱。在前方等待他的，将是一场足以改变一切的风暴。`;
      break;
      
    case 'climax':
      // 第三章：增强高潮和悬念
      optimizedContent = `[优化提示：这是经过黄金三章优化的第三章，强化了阶段性高潮和读者留存]\n\n` +
                         `心跳加速，呼吸紧促，他知道此刻的选择将决定一切。\n\n` +
                         optimizedContent + 
                         `\n\n当尘埃落定，他终于明白这只是更大挑战的开始。远方的地平线上，一个更加庞大的阴影正在缓缓逼近，而他已别无选择......`;
      break;
  }
  
  return optimizedContent;
}

// 生成内心独白（模拟）
function generateInnerThoughts(): string {
  const thoughts = [
    "他心中暗自思忖，这一切究竟是巧合还是命运的安排？",
    "内心深处，一个声音不断地提醒他要保持警惕。",
    "回想起师父的告诫，他不禁陷入了短暂的沉思。",
    "这种感觉似曾相识，却又难以捉摸，就像记忆中模糊的片段。",
    "一股莫名的悸动在心头蔓延，仿佛预示着什么。"
  ];
  
  return thoughts[Math.floor(Math.random() * thoughts.length)];
} 