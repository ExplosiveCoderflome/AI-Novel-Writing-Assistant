const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // 查找用户
        const userId = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.error('找不到用户，请先运行 create-user.js');
            return;
        }

        // 查找流派
        const fantasyGenre = await prisma.novelGenre.findFirst({
            where: { name: '奇幻' }
        });

        const sciFiGenre = await prisma.novelGenre.findFirst({
            where: { name: '科幻' }
        });

        const urbanFantasyGenre = await prisma.novelGenre.findFirst({
            where: { name: '都市奇幻' }
        });

        if (!fantasyGenre || !sciFiGenre || !urbanFantasyGenre) {
            console.error('找不到必要的流派，请先运行 create-genres.js');
            return;
        }

        // 创建第一部小说
        const fantasyNovel = await prisma.novel.create({
            data: {
                title: '水晶龙的传说',
                description: '这是一个关于年轻魔法师寻找传说中水晶龙的故事。',
                authorId: userId,
                genreId: fantasyGenre.id,
                status: 'draft',
                outline: '年轻魔法师艾伦踏上寻找传说中水晶龙的旅程，希望通过获得龙的祝福来拯救生病的家乡。在旅途中，他结识了各种伙伴，面临各种挑战，最终发现真正的水晶龙其实是...'
            }
        });

        // 为第一部小说创建角色
        await prisma.character.create({
            data: {
                name: '艾伦',
                role: '主角',
                personality: '勇敢、善良、有时冲动',
                background: '来自一个小村庄的年轻魔法学徒，有着非凡的天赋。',
                development: '从一个鲁莽的学徒成长为一个成熟的魔法师。',
                novelId: fantasyNovel.id
            }
        });

        await prisma.character.create({
            data: {
                name: '莉娜',
                role: '女主角',
                personality: '聪明、谨慎、有智慧',
                background: '神秘森林的守护者，拥有与自然沟通的能力。',
                development: '逐渐放下对人类的偏见，与艾伦建立深厚友谊。',
                novelId: fantasyNovel.id
            }
        });

        // 为第一部小说创建章节
        await prisma.chapter.create({
            data: {
                title: '魔法学徒',
                content: `# 魔法学徒

艾伦站在魔法学院的大门前，紧张地握着录取通知书。这是他梦寐以求的机会，离开小村庄，成为一名真正的魔法师。

远处，传来村庄的呼唤，那是他的过去。而魔法学院高耸的尖塔，则代表着他的未来。`,
                order: 1,
                novelId: fantasyNovel.id
            }
        });

        await prisma.chapter.create({
            data: {
                title: '神秘预言',
                content: `# 神秘预言

"水晶龙的祝福将拯救被诅咒的土地，但只有纯洁之心的人才能找到它。"

艾伦反复读着古老羊皮纸上的预言。当他听说家乡陷入瘟疫时，这个传说成了他唯一的希望。`,
                order: 2,
                novelId: fantasyNovel.id
            }
        });

        // 创建第二部小说
        const sciFiNovel = await prisma.novel.create({
            data: {
                title: '星际迷航者',
                description: '一位宇航员在一次任务中被困在遥远星球，必须想办法生存并返回地球。',
                authorId: userId,
                genreId: sciFiGenre.id,
                status: 'in-progress',
                outline: '宇航员马克在一次任务中被困在火星，被认为已经死亡而被放弃。他必须利用有限的资源和自己的科学知识生存，同时想办法与地球取得联系。'
            }
        });

        // 为第二部小说创建角色
        await prisma.character.create({
            data: {
                name: '马克',
                role: '主角',
                personality: '乐观、聪明、富有创造力',
                background: '一位经验丰富的宇航员和植物学家。',
                development: '从绝望到自救，最终重新找到生活的意义。',
                novelId: sciFiNovel.id
            }
        });

        // 为第二部小说创建章节
        await prisma.chapter.create({
            data: {
                title: '被遗弃',
                content: `# 被遗弃

马克睁开眼睛，剧烈的疼痛让他瞬间清醒。他环顾四周，发现自己仍在火星基地内。

"他们走了，"他自言自语，"他们以为我死了，所以他们离开了。"

红色的火星尘土拍打着基地的窗户，似乎在嘲笑他的处境。`,
                order: 1,
                novelId: sciFiNovel.id
            }
        });

        console.log('样本数据创建成功');
    } catch (error) {
        console.error('创建样本数据失败:', error);
    }
}

main()
    .catch(e => {
        console.error('执行错误:', e);
        process.exit(1);
    })
    .finally(async() => {
        await prisma.$disconnect();
    });