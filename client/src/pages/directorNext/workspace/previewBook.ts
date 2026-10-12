import type { CharacterTimeline } from "@ai-novel/shared/types/novel";
import type { WorkspaceBook } from "./model";

export const previewBook: WorkspaceBook = {
  novel: { id: "preview", title: "移动之城", creationExperience: "simple", estimatedChapterCount: 30 },
  materials: {
    description: "失去记忆的守门人林渡，要守护一座每逢黎明就会移动的城。他必须辨认靠近城门的人，也逐渐发现这座城与自己的过去有关。",
    characterCount: 3, volumeCount: 1, openQualityDebtCount: 0,
    story: {
      coreSellingPoint: "会移动的城、失忆的守门人，以及每次开门都要付出的代价。",
      readingPromise: "跟随林渡辨认来客，在一次次选择中揭开城市移动的真相。",
      first30ChapterPromise: "从守住第一扇门，到主动追寻城市的来处。",
      protagonistFantasy: "一个被遗忘的人，凭自己的判断成为整座城的依靠。",
    },
    world: { name: "雾原与移动之城", summary: "城外是一片没有固定道路的雾原。城在黎明移动，钟声决定开门的时间；持有旧城印记的旅人可以申请入城。" },
    characters: [
      { id: "lin", name: "林渡", role: "主角", storyFunction: "以守门人的选择串起城内外的秘密。", currentGoal: "查清旧城印记的来历", personality: "谨慎、敏锐，在压力下仍愿意承担责任。" },
      { id: "shen", name: "沈知", role: "同行者", storyFunction: "带来关于雾原的线索，也迫使林渡重新审视开门规则。", currentGoal: "寻找失踪的哥哥", personality: "直率、有行动力，不轻易交出信任。" },
      { id: "elder", name: "钟楼老人", role: "引路人", storyFunction: "保管城市规则，知道林渡失去的过去。", currentGoal: null, personality: "沉默而克制。" },
    ],
    volumes: [{ id: "v1", order: 1, title: "第一卷 · 雾中来客", summary: "陌生旅人的到来打破守门人的日常。林渡在守城与追寻记忆之间作出第一次选择。", mainPromise: "揭开旧城印记与守门人的联系。", chapterCount: 3 }],
  },
  chapters: [
    { id: "c1", order: 1, title: "移动的城", status: "completed", wordCount: 328, updatedAt: "2026-10-02T08:00:00Z", qualityDebt: null,
      content: "林渡醒来时，脚下的地板正在轻轻震动。\n\n窗外的钟楼偏向一边，又缓缓回到原处。城在移动。街上的人照常收起晾晒的衣物，卖饼的妇人用木楔固定炉子，仿佛这只是再普通不过的一个清晨。\n\n只有他不记得这是哪里。\n\n桌上压着一张泛黄的纸，最后一行被人用力描过：钟声落下之前，不得开门。\n\n林渡摸到腰间的钥匙。金属冰凉，掌心却浮起一种熟悉的刺痛。城门外响起三下敲击，他抬起头，看见雾里站着一个人。\n\n那个人举起右手。手背上，印着与钥匙相同的纹路。" },
    { id: "c2", order: 2, title: "门外的旅人", status: "completed", wordCount: 245, updatedAt: "2026-10-02T08:10:00Z", qualityDebt: null,
      content: "“我叫沈知。”门外的人说，“我不是来躲雾的。”\n\n林渡隔着门上的窄窗看她。她的衣袖磨破了，鞋边沾着灰白的泥，右手却始终举着，像是知道他一定会认得那个印记。\n\n“那你来做什么？”\n\n“找一个人。一个三年前进了这座城的人。”\n\n钟楼传来第一声响。林渡回头，楼顶的老人正望向这里。他没有摇头，也没有点头，只把手搭在钟绳上。\n\n林渡将钥匙插进锁孔。\n\n“进来以后，”他说，“先告诉我，你从哪里得到这个印记。”" },
    { id: "c3", order: 3, title: "钟声之后", status: "waiting_writing", wordCount: 0, content: null, updatedAt: "2026-10-02T08:10:00Z", qualityDebt: null },
  ],
};

export const previewCharacterHistory: Record<string, CharacterTimeline[]> = {
  lin: [
    { id: "h1", novelId: "preview", characterId: "lin", chapterId: "c1", chapterOrder: 1, title: "接下守门职责", content: "醒来后失去记忆，凭纸上的规则守住城门；对钥匙上的印记产生熟悉感。", source: "chapter", createdAt: "2026-10-02T08:00:00Z", updatedAt: "2026-10-02T08:00:00Z" },
    { id: "h2", novelId: "preview", characterId: "lin", chapterId: "c2", chapterOrder: 2, title: "从戒备到主动追问", content: "决定让沈知入城，要求她解释印记的来历。行动目标从守门转向调查自身与印记的联系。", source: "chapter", createdAt: "2026-10-02T08:10:00Z", updatedAt: "2026-10-02T08:10:00Z" },
  ],
  shen: [{ id: "h3", novelId: "preview", characterId: "shen", chapterId: "c2", chapterOrder: 2, title: "进入移动之城", content: "向林渡表明寻找失踪者的目的，凭手背上的印记获准进城。", source: "chapter", createdAt: "2026-10-02T08:10:00Z", updatedAt: "2026-10-02T08:10:00Z" }],
  elder: [],
};
