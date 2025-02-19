import { PrismaClient } from '@prisma/client';
import { TemplateGenerator } from '../lib/services/template-generator';

const prisma = new PrismaClient();

async function createGenreWithChildren(
  name: string,
  description: string | null,
  children: Array<{
    name: string;
    description: string | null;
    children?: Array<{
      name: string;
      description: string | null;
    }>;
  }>
) {
  // 为当前类型生成模板
  const template = await TemplateGenerator.generateTemplate({
    name,
    description
  });

  const parent = await prisma.novelGenre.create({
    data: {
      name,
      description,
      template
    },
  });

  for (const child of children) {
    // 为子类型生成模板
    const childTemplate = await TemplateGenerator.generateTemplate({
      name: child.name,
      description: child.description
    });

    const childGenre = await prisma.novelGenre.create({
      data: {
        name: child.name,
        description: child.description,
        template: childTemplate,
        parentId: parent.id,
      },
    });

    if (child.children) {
      for (const grandChild of child.children) {
        // 为孙子类型生成模板
        const grandChildTemplate = await TemplateGenerator.generateTemplate({
          name: grandChild.name,
          description: grandChild.description
        });

        await prisma.novelGenre.create({
          data: {
            name: grandChild.name,
            description: grandChild.description,
            template: grandChildTemplate,
            parentId: childGenre.id,
          },
        });
      }
    }
  }
}

async function main() {
  // 清除现有数据
  await prisma.novelGenre.deleteMany();

  // 主流经典类型
  await createGenreWithChildren('主流经典类型', '网络小说中最受欢迎的传统类型', [
    {
      name: '玄幻',
      description: '超越现实的幻想世界，包含修炼、法术等元素',
      children: [
        {
          name: '东方玄幻',
          description: '以东方文化为背景，修炼体系复杂，主角逆天改命',
        },
        {
          name: '西方奇幻',
          description: '以西方神话或魔幻世界为背景，魔法与剑术并存',
        },
      ],
    },
    {
      name: '仙侠',
      description: '修真、飞剑、道法等中国传统仙侠元素',
      children: [
        {
          name: '修真文明',
          description: '传统修仙体系，注重境界突破与资源争夺',
        },
        {
          name: '现代修真',
          description: '将修仙元素融入现代社会，如灵气复苏',
        },
      ],
    },
    {
      name: '都市',
      description: '现代都市背景下的各类故事',
      children: [
        {
          name: '异能',
          description: '现代背景，主角拥有超能力或系统，打脸逆袭',
        },
        {
          name: '神豪流',
          description: '主角突然获得巨额财富，开启奢华人生',
        },
      ],
    },
    {
      name: '历史',
      description: '以历史为背景的故事',
      children: [
        {
          name: '架空历史',
          description: '虚构历史背景，权谋争霸、科技兴国',
        },
        {
          name: '种田文',
          description: '主角通过发展基建、农业等改变世界',
        },
      ],
    },
    {
      name: '科幻',
      description: '以科学幻想为主题',
      children: [
        {
          name: '星际战争',
          description: '以星际文明为背景，战争与探索并存',
        },
        {
          name: '赛博朋克',
          description: '高科技与低生活的结合，探讨人性与科技',
        },
      ],
    },
    {
      name: '言情',
      description: '以情感为主线的故事',
      children: [
        {
          name: '甜宠',
          description: '女性向为主，注重情感线，甜蜜治愈',
        },
        {
          name: '穿书攻略反派',
          description: '主角穿越到书中世界，攻略反派角色',
        },
      ],
    },
  ]);

  // 新兴热门类型
  await createGenreWithChildren('新兴热门类型', '近年来兴起的新型网文类型', [
    {
      name: '无限流',
      description: '主角穿梭多个世界完成任务，副本模式自由',
    },
    {
      name: '克苏鲁',
      description: '融合克苏鲁神话，强调不可名状的恐惧',
    },
    {
      name: '第四天灾',
      description: '玩家或异界生物入侵现实/异界，主角操控"玩家"搞事',
    },
    {
      name: '反派流',
      description: '主角反套路，成为反派或幕后黑手，智商在线',
    },
    {
      name: '轻松日常',
      description: '弱化打斗，主打搞笑、治愈、生活流',
    },
  ]);

  // 小众垂直类型
  await createGenreWithChildren('小众垂直类型', '独特性强、受众相对小众的类型', [
    {
      name: '规则怪谈',
      description: '以"规则"为核心，破解诡异逻辑',
    },
    {
      name: '女频大女主',
      description: '独立事业线，拒绝恋爱脑，如女尊、女帝文',
    },
    {
      name: '赛博修仙',
      description: '科技与修仙结合，如用代码画符、AI炼丹',
    },
    {
      name: '动物视角',
      description: '主角非人类，如猫、龙、史莱姆',
    },
  ]);

  // 跨界融合趋势
  await createGenreWithChildren('跨界融合趋势', '与其他领域结合的新型创作方向', [
    {
      name: 'IP联动',
      description: '小说与影视、游戏、动漫联动开发',
    },
    {
      name: '互动小说',
      description: '读者选择剧情分支，影响故事走向',
    },
    {
      name: '短篇付费',
      description: '抖音、快手等平台的微短剧改编热潮',
    },
  ]);

  console.log('数据库初始化完成');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 