import "dotenv/config";
import { prisma } from "./prisma";

async function main(): Promise<void> {
  const fantasy = await prisma.novelGenre.upsert({
    where: { id: "genre_fantasy_root" },
    update: {
      name: "奇幻",
      description: "包含东方玄幻、西方魔幻等奇幻类型。",
    },
    create: {
      id: "genre_fantasy_root",
      name: "奇幻",
      description: "包含东方玄幻、西方魔幻等奇幻类型。",
      template: "突出世界观设定与成长线冲突。",
    },
  });

  await prisma.novelGenre.upsert({
    where: { id: "genre_urban_root" },
    update: {
      name: "都市",
      description: "以现代城市为主要舞台，强调现实冲突与人物关系。",
    },
    create: {
      id: "genre_urban_root",
      name: "都市",
      description: "以现代城市为主要舞台，强调现实冲突与人物关系。",
      template: "突出节奏感与生活化细节。",
    },
  });

  await prisma.novelGenre.upsert({
    where: { id: "genre_fantasy_eastern" },
    update: {
      name: "东方玄幻",
      parentId: fantasy.id,
    },
    create: {
      id: "genre_fantasy_eastern",
      name: "东方玄幻",
      description: "修炼体系、宗门势力与家国叙事并重。",
      parentId: fantasy.id,
      template: "强调境界突破与势力博弈。",
    },
  });

  await prisma.novelGenre.upsert({
    where: { id: "genre_fantasy_western" },
    update: {
      name: "西方魔幻",
      parentId: fantasy.id,
    },
    create: {
      id: "genre_fantasy_western",
      name: "西方魔幻",
      description: "骑士、法师、神话生物等经典元素。",
      parentId: fantasy.id,
      template: "强调冒险任务与史诗冲突。",
    },
  });

  console.log("基础小说类型初始化完成。");
}

main()
  .catch((error) => {
    console.error("种子数据写入失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
