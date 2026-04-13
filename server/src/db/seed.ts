import "dotenv/config";
import { serializeStoryModeProfile } from "../services/storyMode/storyModeProfile";
import { BUILT_IN_STORY_MODE_SEEDS } from "./storyModeSeeds";
import { prisma } from "./prisma";

async function seedGenres(): Promise<void> {
  const fantasy = await prisma.novelGenre.upsert({
    where: { id: "genre_fantasy_root" },
    update: {
      name: "奇幻",
      description: "包含东方玄幻、西方魔幻等奇幻类型。",
      template: "突出世界观设定与成长线冲突。",
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
      template: "突出节奏感与生活化细节。",
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
      description: "修炼体系、宗门势力与家国叙事并重。",
      template: "强调境界突破与势力博弈。",
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
      description: "骑士、法师、神话生物等经典元素。",
      template: "强调冒险任务与史诗冲突。",
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
}

async function seedStoryModes(): Promise<void> {
  for (const root of BUILT_IN_STORY_MODE_SEEDS) {
    const createdRoot = await prisma.novelStoryMode.upsert({
      where: { id: root.id },
      update: {
        name: root.name,
        description: root.description,
        template: root.template,
        profileJson: serializeStoryModeProfile(root.profile),
        parentId: null,
      },
      create: {
        id: root.id,
        name: root.name,
        description: root.description,
        template: root.template,
        profileJson: serializeStoryModeProfile(root.profile),
        parentId: null,
      },
    });

    for (const child of root.children) {
      await prisma.novelStoryMode.upsert({
        where: { id: child.id },
        update: {
          name: child.name,
          description: child.description,
          template: child.template,
          profileJson: serializeStoryModeProfile(child.profile),
          parentId: createdRoot.id,
        },
        create: {
          id: child.id,
          name: child.name,
          description: child.description,
          template: child.template,
          profileJson: serializeStoryModeProfile(child.profile),
          parentId: createdRoot.id,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  await seedGenres();
  await seedStoryModes();
  console.log("基础小说类型与流派模式初始化完成。");
}

main()
  .catch((error) => {
    console.error("种子数据写入失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
