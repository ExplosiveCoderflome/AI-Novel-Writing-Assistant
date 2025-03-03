const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 一些示例章节内容
const chapterTemplates = {
    urban: [{
            title: "初入都市",
            content: `# 初入都市

都市的霓虹灯闪烁，高楼林立，人流如织。主角初来乍到，对这座城市充满了好奇与期待。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

城市的每一个角落都有故事，每一个人都有各自的梦想。在这个钢铁森林中，将会发生怎样的故事？`
        },
        {
            title: "初见",
            content: `# 初见

在一次偶然的机会下，主角遇见了对故事发展至关重要的人物。这次相遇会改变主角的命运轨迹。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

命运的齿轮开始转动，故事的序幕已经拉开。`
        },
        {
            title: "意外发现",
            content: `# 意外发现

主角无意中发现了一个秘密，这个秘密或许与整个城市的命运息息相关。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

真相往往隐藏在看似平常的表象之下，而发现真相的过程充满了危险与挑战。`
        }
    ],
    fantasy: [{
            title: "踏入修行",
            content: `# 踏入修行

主角偶然获得了一本古老的功法秘籍，从此踏上了修行之路。修行世界的大门在眼前缓缓打开。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

仙途漫漫，充满荆棘与机遇，每一步都需要坚定的信念与无畏的勇气。`
        },
        {
            title: "奇遇",
            content: `# 奇遇

在一次探索中，主角遇到了一位神秘的老者，老者传授了主角独特的修炼方法。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

机缘巧合之下，命运的齿轮开始向着不可预知的方向转动。`
        },
        {
            title: "初战",
            content: `# 初战

主角第一次面对强大的敌人，这场战斗将成为主角修行路上的重要转折点。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

真正的战斗不仅是力量的对决，更是意志与智慧的较量。`
        }
    ],
    adventure: [{
            title: "启程",
            content: `# 启程

主角决定离开家乡，踏上一段未知的旅程。未知的世界在前方等待着探索。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

每一次启程都是一次成长的机会，而旅途中的每一个选择都将影响未来的道路。`
        },
        {
            title: "相遇",
            content: `# 相遇

在旅途中，主角结识了各种各样的人，其中一些人将成为主角重要的伙伴。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

人与人之间的羁绊或许是这个世界上最珍贵的财富。`
        },
        {
            title: "挑战",
            content: `# 挑战

旅途中总会遇到各种各样的挑战，这些挑战将考验主角的勇气与智慧。

此处只是章节占位内容，原始内容在数据库迁移中丢失。请在编辑器中添加真实的章节内容。

克服挑战不仅需要力量，更需要智慧与决心。`
        }
    ]
};

async function main() {
    console.log('====== 开始恢复章节数据 ======');

    // 获取所有小说
    const novels = await prisma.novel.findMany();
    console.log(`找到 ${novels.length} 个小说`);

    for (const novel of novels) {
        console.log(`\n处理小说: ${novel.title} (ID: ${novel.id})`);

        // 检查小说是否已有章节
        const existingChapters = await prisma.chapter.findMany({
            where: { novelId: novel.id }
        });

        if (existingChapters.length > 0) {
            console.log(`小说已有 ${existingChapters.length} 个章节，跳过创建`);
            continue;
        }

        // 决定使用哪个模板
        let templateKey = 'urban'; // 默认使用都市模板

        if (novel.title.includes('修仙')) {
            templateKey = 'fantasy';
        } else if (novel.title.includes('冒险')) {
            templateKey = 'adventure';
        }

        const template = chapterTemplates[templateKey];
        console.log(`将使用 ${templateKey} 模板创建章节`);

        // 创建章节
        for (let i = 0; i < template.length; i++) {
            const chapterTemplate = template[i];

            try {
                const chapter = await prisma.chapter.create({
                    data: {
                        title: chapterTemplate.title,
                        content: chapterTemplate.content,
                        order: i + 1,
                        novelId: novel.id,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                });

                console.log(`创建章节: ${chapter.title} (顺序: ${chapter.order})`);
            } catch (e) {
                console.error(`创建章节 ${chapterTemplate.title} 失败:`, e);
            }
        }

        console.log(`小说 ${novel.title} 的章节创建完成`);
    }

    console.log('\n====== 章节恢复完成 ======');
}

main()
    .catch(e => {
        console.error('恢复错误:', e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });