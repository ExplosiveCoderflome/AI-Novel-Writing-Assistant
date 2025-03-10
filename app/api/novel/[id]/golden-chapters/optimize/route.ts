import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../auth/options";
import { prisma } from "@/lib/prisma";

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

    // 获取请求数据
    const { platform } = await req.json();
    
    if (!platform || (platform !== 'qidian' && platform !== 'fanqie' && platform !== 'all')) {
      return NextResponse.json({ error: "平台参数无效" }, { status: 400 });
    }
    
    // 获取需要优化的章节
    const chapters = novel.chapters;
    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ error: "没有找到章节内容" }, { status: 404 });
    }
    
    // 根据不同平台生成优化后的章节内容
    let optimizedChapters: Array<{
      id: string;
      title: string;
      originalContent: string;
      optimizedContent: string;
      order: number;
    }> = [];
    
    if (platform === 'all') {
      // 优化全部三章
      optimizedChapters = chapters.map(chapter => {
        return {
          id: chapter.id,
          title: chapter.title,
          originalContent: chapter.content,
          optimizedContent: generateOptimizedContent(chapter.content, 'all', chapter.order),
          order: chapter.order
        };
      });
    } else {
      // 只优化第一章
      const firstChapter = chapters[0];
      if (firstChapter) {
        optimizedChapters = [{
          id: firstChapter.id,
          title: firstChapter.title,
          originalContent: firstChapter.content,
          optimizedContent: generateOptimizedContent(firstChapter.content, platform, 1),
          order: firstChapter.order
        }];
      }
    }

    return NextResponse.json({ optimizedChapters });
  } catch (error) {
    console.error("章节优化出错:", error);
    return NextResponse.json(
      { error: "优化过程中发生错误" },
      { status: 500 }
    );
  }
}

// 生成优化后的章节内容（模拟AI生成）
function generateOptimizedContent(originalContent: string, platform: string, chapterOrder: number): string {
  // 这里应该调用AI服务来优化内容
  // 现在使用简单的规则来模拟优化效果
  
  let optimizedContent = originalContent;
  
  if (platform === 'qidian' || platform === 'all') {
    // 起点风格优化
    const qidianIntro = `[优化提示：这是按照起点平台风格优化的版本，增强了人物刻画和内心独白]\n\n`;
    
    // 模拟添加更丰富的内心独白和人物描写
    if (chapterOrder === 1) {
      optimizedContent = qidianIntro + optimizedContent.replace(
        /。(?=.{20,})/g, 
        match => `。${generateInnerThoughts()}`
      );
    }
  }
  
  if (platform === 'fanqie' || platform === 'all') {
    // 番茄风格优化
    const fanqieIntro = `[优化提示：这是按照番茄平台风格优化的版本，增强了冲突和悬念]\n\n`;
    
    // 模拟增加冲突和悬念
    if (chapterOrder === 1) {
      const conflictStart = "突然，一道寒光闪过，空气中弥漫着一股难以言表的危险气息。\n\n";
      const cliffhanger = "\n\n就在这时，他察觉到背后有一双眼睛正在注视着自己，那种被猎物锁定的感觉让他汗毛直立...";
      
      optimizedContent = fanqieIntro + conflictStart + optimizedContent + cliffhanger;
    }
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